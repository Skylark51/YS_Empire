#!/usr/bin/env python3
"""Read-only local bridge between YS Empire and Lion SSH nodes."""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("YS_AGENT_CONFIG", ROOT / "config.json"))
CACHE: dict[str, Any] = {"generated_at": None, "nodes": []}
CACHE_LOCK = threading.Lock()
STOP_EVENT = threading.Event()


def load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    token = str(config.get("api_token", "")).strip()
    if not token or token == "CHANGE_ME_TO_A_LONG_RANDOM_TOKEN":
        raise RuntimeError("config.json의 api_token을 긴 임의 문자열로 변경하세요.")
    return config


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def estimate_progress(values: dict[str, str]) -> int:
    if values.get("PROGRESS", "").isdigit():
        return max(0, min(100, int(values["PROGRESS"])))
    steps = int(values.get("STEPS", "0") or 0)
    if steps <= 0:
        return 8
    return min(95, 10 + steps * 2)


def elapsed_to_started(seconds: int) -> str:
    timestamp = datetime.now().astimezone().timestamp() - seconds
    return datetime.fromtimestamp(timestamp).astimezone().strftime("%Y-%m-%d %H:%M")


def run_ssh(node: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    alias = node["ssh_alias"]
    timeout = int(config.get("ssh_timeout_seconds", 5))
    remote_script = r'''
set -u
printf 'HOSTNAME=%s\n' "$(hostname 2>/dev/null || true)"
printf 'LOAD1=%s\n' "$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo '-')"
printf 'CPU=%s\n' "$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo '-')"
printf 'MEMORY=%s\n' "$(awk '/MemTotal/{printf "%.0f GB",$2/1024/1024}' /proc/meminfo 2>/dev/null || echo '-')"
line="$(ps -u "$USER" -eo pid=,etimes=,args= 2>/dev/null | grep -E '[g]16|[g]09|[G]aussian' | head -n 1 || true)"
if [ -n "$line" ]; then
  pid="$(printf '%s' "$line" | awk '{print $1}')"
  elapsed="$(printf '%s' "$line" | awk '{print $2}')"
  args="$(printf '%s' "$line" | cut -d' ' -f3-)"
  printf 'PID=%s\nELAPSED=%s\nARGS=%s\n' "$pid" "$elapsed" "$args"
  cwd="$(readlink -f /proc/$pid/cwd 2>/dev/null || true)"
  printf 'DIRECTORY=%s\n' "$cwd"
  job="$(printf '%s' "$args" | grep -oE '[^ ]+\.(out|log|inp|com)' | tail -n 1 || true)"
  if [ -z "$job" ] && [ -n "$cwd" ]; then
    job="$(find "$cwd" -maxdepth 1 -type f \( -name '*.out' -o -name '*.log' \) -printf '%T@ %f\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
  fi
  printf 'JOB=%s\n' "$job"
  if [ -n "$cwd" ] && [ -n "$job" ] && [ -f "$cwd/$job" ]; then
    if grep -q 'Normal termination of Gaussian' "$cwd/$job" 2>/dev/null; then
      printf 'GAUSSIAN_STATE=done\nPROGRESS=100\n'
    else
      steps="$(grep -c 'Step number' "$cwd/$job" 2>/dev/null || true)"
      printf 'GAUSSIAN_STATE=running\nSTEPS=%s\n' "$steps"
    fi
  else
    printf 'GAUSSIAN_STATE=running\n'
  fi
else
  printf 'GAUSSIAN_STATE=waiting\n'
fi
'''
    command = [
        "ssh", "-T", "-o", "BatchMode=yes", "-o", f"ConnectTimeout={timeout}",
        "-o", "ServerAliveInterval=3", "-o", "ServerAliveCountMax=1", alias, "bash", "-s"
    ]
    started = time.monotonic()
    result = subprocess.run(command, input=remote_script, text=True, capture_output=True, timeout=timeout + 4, check=False)
    duration_ms = round((time.monotonic() - started) * 1000)
    if result.returncode != 0:
        error = (result.stderr or result.stdout or f"ssh exit {result.returncode}").strip().splitlines()[-1]
        return {
            "id": node["id"], "host": alias, "status": "warning", "progress": 0,
            "job": "SSH 연결 확인 필요", "directory": "-", "checked_at": iso_now(),
            "load1": "-", "pid": "-", "latency_ms": duration_ms, "error": error[:240]
        }

    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()

    gaussian_state = values.get("GAUSSIAN_STATE", "waiting")
    status = "running" if gaussian_state == "running" else "done" if gaussian_state == "done" else "waiting"
    progress = 100 if status == "done" else estimate_progress(values)
    elapsed = int(values.get("ELAPSED", "0") or 0)
    return {
        "id": node["id"], "host": alias, "status": status, "progress": progress,
        "job": values.get("JOB") or ("Gaussian 프로세스 실행 중" if status == "running" else "할당된 계산 없음"),
        "directory": values.get("DIRECTORY") or node.get("default_directory", "/home/skylark"),
        "started": elapsed_to_started(elapsed) if elapsed else "-",
        "eta": "실시간 계산 중" if status == "running" else "완료" if status == "done" else "즉시 사용 가능",
        "cpu": f"{values.get('CPU', '-')} cores", "memory": values.get("MEMORY", "-"),
        "load1": values.get("LOAD1", "-"), "pid": values.get("PID", "-"),
        "checked_at": iso_now(), "latency_ms": duration_ms, "error": ""
    }


def collect(config: dict[str, Any]) -> dict[str, Any]:
    nodes = []
    for node in config.get("nodes", []):
        try:
            nodes.append(run_ssh(node, config))
        except subprocess.TimeoutExpired:
            nodes.append({"id": node["id"], "host": node["ssh_alias"], "status": "warning", "progress": 0, "job": "SSH 응답 시간 초과", "directory": "-", "checked_at": iso_now(), "load1": "-", "pid": "-", "error": "timeout"})
        except Exception as exc:
            nodes.append({"id": node.get("id", "unknown"), "host": node.get("ssh_alias", "-"), "status": "warning", "progress": 0, "job": "상태 수집 오류", "directory": "-", "checked_at": iso_now(), "load1": "-", "pid": "-", "error": str(exc)[:240]})
    return {"generated_at": iso_now(), "nodes": nodes}


def collector_loop(config: dict[str, Any]) -> None:
    interval = max(5, int(config.get("collect_interval_seconds", 10)))
    while not STOP_EVENT.is_set():
        snapshot = collect(config)
        with CACHE_LOCK:
            CACHE.clear()
            CACHE.update(snapshot)
        STOP_EVENT.wait(interval)


class Handler(BaseHTTPRequestHandler):
    server_version = "YSLionAgent/1.0"

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        allowed = self.server.config.get("allowed_origins", [])
        if origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self.respond(200, {"ok": True, "service": "YS Lion Agent", "version": "1.0.0"})
            return
        if path != "/api/status":
            self.respond(404, {"error": "not found"})
            return
        if not self.authorised():
            self.respond(401, {"error": "invalid token"})
            return
        with CACHE_LOCK:
            payload = dict(CACHE)
            payload["nodes"] = list(CACHE.get("nodes", []))
        self.respond(200, payload)

    def authorised(self) -> bool:
        configured = self.server.config["api_token"]
        supplied = self.headers.get("Authorization", "")
        return supplied.startswith("Bearer ") and secrets.compare_digest(supplied[7:], configured)

    def respond(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    config = load_config()
    threading.Thread(target=collector_loop, args=(config,), daemon=True).start()
    host = config.get("listen_host", "127.0.0.1")
    port = int(config.get("listen_port", 8765))
    server = ThreadingHTTPServer((host, port), Handler)
    server.config = config
    print(f"YS Lion Agent: http://{host}:{port}")
    print("읽기 전용 모드 · 종료: Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STOP_EVENT.set()
        server.server_close()


if __name__ == "__main__":
    main()
