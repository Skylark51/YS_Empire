#!/usr/bin/env python3
"""Turn raw collector values into the public node contract."""
from __future__ import annotations
import subprocess
import time
from pathlib import PurePosixPath
from typing import Any
from collector import (as_float, as_int, build_remote_script, iso_now,
                       job_from_values, parse_output, percent, storage_metrics)

def compatible_node(*, node: dict[str, Any], online: bool, state: str,
                    system: dict[str, Any], gaussian: dict[str, Any],
                    checked_at: str, latency_ms: int | None,
                    error: str | None) -> dict[str, Any]:
    ui_status = {"running": "running", "finished": "done", "failed": "warning",
                 "idle": "waiting", "offline": "warning"}.get(state, "warning")
    cores = system["cpu"]["cores"]
    total = system["memory"]["total_bytes"]
    output, input_name = gaussian.get("output_file"), gaussian.get("input_name")
    job_name = (PurePosixPath(output).name if output else input_name if input_name
                else "할당된 계산 없음" if state == "idle" else "서버 연결 확인 필요")
    return {
        "id": node["id"], "ssh_alias": node["ssh_alias"], "online": online,
        "institution": node.get("institution", "jbnu"),
        "pool": node.get("pool"), "node_type": node.get("node_type"),
        "borrowable": bool(node.get("borrowable", False)),
        "state": state, "system": system, "gaussian": gaussian,
        "checked_at": checked_at, "latency_ms": latency_ms, "error": error,
        "host": node["ssh_alias"], "status": ui_status,
        "progress": 100 if state == "finished" else 10 if state == "running" else 0,
        "job": job_name,
        "directory": gaussian.get("working_directory") or node.get("default_directory", "/home/skylark"),
        "started": gaussian.get("started_at") or "-",
        "eta": ("계산 중" if state == "running" else "완료" if state == "finished"
                else "실패" if state == "failed" else "즉시 사용 가능"
                if state == "idle" else "연결 확인 필요"),
        "cpu": f"{cores} cores" if cores is not None else "-",
        "memory": f"{total / 1024**3:.1f} GB" if total else "-",
        "load1": system["load_average"]["one"], "pid": gaussian.get("pid"),
    }

def node_from_values(node: dict[str, Any], values: dict[str, str],
                     previous: dict[str, Any] | None, latency_ms: int) -> dict[str, Any]:
    mt, ma = as_int(values.get("MEMORY_TOTAL")), as_int(values.get("MEMORY_AVAILABLE"))
    mu = mt - ma if mt is not None and ma is not None else None
    st, sf = as_int(values.get("SWAP_TOTAL")), as_int(values.get("SWAP_FREE"))
    su = st - sf if st is not None and sf is not None else None
    job = job_from_values(values, previous)
    system = {
        "hostname": values.get("HOSTNAME") or None,
        "uptime_seconds": as_int(values.get("UPTIME_SECONDS")),
        "load_average": {"one": as_float(values.get("LOAD_1")),
                         "five": as_float(values.get("LOAD_5")),
                         "fifteen": as_float(values.get("LOAD_15"))},
        "cpu": {"usage_percent": as_float(values.get("CPU_PERCENT")),
                "cores": as_int(values.get("CPU_CORES"))},
        "memory": {"total_bytes": mt, "used_bytes": mu, "available_bytes": ma,
                   "used_percent": percent(mu, mt)},
        "swap": {"total_bytes": st, "used_bytes": su, "free_bytes": sf,
                 "used_percent": percent(su, st)},
        "disk": storage_metrics(values, "DISK"),
        "scratch": storage_metrics(values, "SCRATCH"),
    }
    return compatible_node(node=node, online=True, state=job["status"], system=system,
                           gaussian=job, checked_at=iso_now(), latency_ms=latency_ms, error=None)

def offline_node(node: dict[str, Any], error: str, latency_ms: int | None = None) -> dict[str, Any]:
    system = {
        "hostname": None, "uptime_seconds": None,
        "load_average": {"one": None, "five": None, "fifteen": None},
        "cpu": {"usage_percent": None, "cores": None},
        "memory": {"total_bytes": None, "used_bytes": None,
                   "available_bytes": None, "used_percent": None},
        "swap": {"total_bytes": None, "used_bytes": None,
                 "free_bytes": None, "used_percent": None},
        "disk": None, "scratch": None,
    }
    job = {
        "detected": False, "status": "idle", "pid": None, "user": None,
        "started_at": None, "elapsed_seconds": None, "input_name": None,
        "input_file": None, "checkpoint_file": None, "output_file": None,
        "working_directory": None, "stage": None, "last_energy_hartree": None,
        "normal_termination": False, "error_termination": False,
        "output_size_bytes": None,
    }
    return compatible_node(node=node, online=False, state="offline", system=system,
                           gaussian=job, checked_at=iso_now(), latency_ms=latency_ms,
                           error=error[:500])

def collect_node(node: dict[str, Any], config: dict[str, Any],
                 previous: dict[str, Any] | None) -> dict[str, Any]:
    timeout = max(2, int(config.get("ssh_timeout_seconds", 7)))
    script = build_remote_script(
        previous, int(config.get("gaussian_tail_bytes", 524288))
    ).replace("\r\n", "\n")
    command = ["ssh", "-T", "-o", "BatchMode=yes", "-o", f"ConnectTimeout={timeout}",
               "-o", "ServerAliveInterval=3", "-o", "ServerAliveCountMax=1",
               node["ssh_alias"], "bash", "-s"]
    started = time.monotonic()
    try:
        result = subprocess.run(command, input=script.encode("utf-8"), capture_output=True,
                                timeout=timeout + 8, check=False)
    except subprocess.TimeoutExpired:
        return offline_node(node, "SSH collection timed out")
    latency_ms = round((time.monotonic() - started) * 1000)
    stdout = result.stdout.decode("utf-8", errors="replace")
    stderr = result.stderr.decode("utf-8", errors="replace")
    if result.returncode != 0:
        message = (stderr or stdout or f"ssh exit {result.returncode}").strip()
        return offline_node(node, message.splitlines()[-1] if message else "SSH failed", latency_ms)
    return node_from_values(node, parse_output(stdout), previous, latency_ms)
