#!/usr/bin/env python3
"""Read-only system and Gaussian collection over SSH."""
from __future__ import annotations

import base64
import math
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any

NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[DEde][-+]?\d+)?"

def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

def as_float(value: Any) -> float | None:
    try:
        result = float(str(value).replace("D", "E").replace("d", "e"))
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None

def as_int(value: Any) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None

def percent(used: int | None, total: int | None) -> float | None:
    return round(used * 100.0 / total, 1) if used is not None and total not in (None, 0) else None

def started_iso(text: str | None) -> str | None:
    if not text:
        return None
    try:
        return datetime.strptime(text, "%a %b %d %H:%M:%S %Y").astimezone().isoformat(timespec="seconds")
    except ValueError:
        return None

def previous_output(previous: dict[str, Any] | None) -> str:
    gaussian = previous.get("gaussian", {}) if previous else {}
    output = gaussian.get("output_file") if isinstance(gaussian, dict) else None
    return output if isinstance(output, str) and output.startswith("/") and "\n" not in output else ""

def build_remote_script(previous: dict[str, Any] | None, output_tail_bytes: int = 524288) -> str:
    """Create a read-only script; prior remote paths are always shell-quoted."""
    prior_output = shlex.quote(previous_output(previous))
    tail_bytes = min(max(int(output_tail_bytes), 65536), 2 * 1024 * 1024)
    return rf'''
set -u
export LC_ALL=C
PREVIOUS_OUTPUT={prior_output}
TAIL_BYTES={tail_bytes}
emit() {{ printf '%s=%s\n' "$1" "$2"; }}
emit_b64() {{
  if command -v base64 >/dev/null 2>&1; then
    printf '%s_B64=' "$1"; printf '%s' "$2" | base64 | tr -d '\n'; printf '\n'
  else emit "$1" "$2"; fi
}}
bytes_from_kb() {{ awk -v n="${{1:-0}}" 'BEGIN {{ printf "%.0f", n * 1024 }}'; }}
disk_info() {{
  label="$1"; path="$2"
  line="$(df -Pk "$path" 2>/dev/null | awk 'NR==2 {{print $2, $3, $4, $5, $6}}')"
  [ -n "$line" ] || return 0
  set -- $line
  emit "${{label}}_TOTAL" "$(bytes_from_kb "$1")"
  emit "${{label}}_USED" "$(bytes_from_kb "$2")"
  emit "${{label}}_AVAILABLE" "$(bytes_from_kb "$3")"
  emit "${{label}}_PERCENT" "${{4%\%}}"
  emit_b64 "${{label}}_PATH" "$5"
}}

# System facts. CPU uses two /proc/stat samples for a real interval value.
emit_b64 HOSTNAME "$(hostname -f 2>/dev/null || hostname 2>/dev/null || true)"
emit UPTIME_SECONDS "$(awk '{{printf "%.0f", $1}}' /proc/uptime 2>/dev/null || true)"
set -- $(awk '{{print $1, $2, $3}}' /proc/loadavg 2>/dev/null || printf '  ')
emit LOAD_1 "${{1:-}}"; emit LOAD_5 "${{2:-}}"; emit LOAD_15 "${{3:-}}"
emit CPU_CORES "$(getconf _NPROCESSORS_ONLN 2>/dev/null || true)"
read_cpu() {{ awk '/^cpu / {{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print total, idle}}' /proc/stat; }}
set -- $(read_cpu); total_a="${{1:-0}}"; idle_a="${{2:-0}}"
sleep 0.20
set -- $(read_cpu); total_b="${{1:-0}}"; idle_b="${{2:-0}}"
total_delta=$((total_b-total_a)); idle_delta=$((idle_b-idle_a))
if [ "$total_delta" -gt 0 ]; then
  emit CPU_PERCENT "$(awk -v t="$total_delta" -v i="$idle_delta" 'BEGIN {{printf "%.1f", (t-i)*100/t}}')"
fi
mem_total_kb="$(awk '/^MemTotal:/ {{print $2}}' /proc/meminfo 2>/dev/null)"
mem_available_kb="$(awk '/^MemAvailable:/ {{print $2}}' /proc/meminfo 2>/dev/null)"
swap_total_kb="$(awk '/^SwapTotal:/ {{print $2}}' /proc/meminfo 2>/dev/null)"
swap_free_kb="$(awk '/^SwapFree:/ {{print $2}}' /proc/meminfo 2>/dev/null)"
emit MEMORY_TOTAL "$(bytes_from_kb "${{mem_total_kb:-0}}")"
emit MEMORY_AVAILABLE "$(bytes_from_kb "${{mem_available_kb:-0}}")"
emit SWAP_TOTAL "$(bytes_from_kb "${{swap_total_kb:-0}}")"
emit SWAP_FREE "$(bytes_from_kb "${{swap_free_kb:-0}}")"
disk_info DISK /
scratch=""
for candidate in "${{SCRATCH:-}}" "/scratch/$USER" "/scratch" "/scr/$USER" "/scr"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then scratch="$candidate"; break; fi
done
if [ -n "$scratch" ]; then disk_info SCRATCH "$scratch"; fi

# Prefer a g16/g09 driver. A Gaussian link process is only a fallback.
gaussian_line="$(
  ps -eo user=,pid=,lstart=,etimes=,args= -ww 2>/dev/null |
  awk '
    BEGIN {{ best=""; fallback="" }}
    /(^|[ \/])(g16|g09)([ ]|$)/ {{ if (best == "") best=$0; next }}
    /(^|[ \/])l[0-9]+\.exe([ ]|$)/ {{ if (fallback == "") fallback=$0 }}
    END {{ if (best != "") print best; else if (fallback != "") print fallback }}
  '
)"
gaussian_line="$(printf '%s\n' "$gaussian_line" | awk '{{$1=$1; print}}')"
output_file=""
if [ -n "$gaussian_line" ]; then
  user="$(printf '%s\n' "$gaussian_line" | awk '{{print $1}}')"
  pid="$(printf '%s\n' "$gaussian_line" | awk '{{print $2}}')"
  start_text="$(printf '%s\n' "$gaussian_line" | awk '{{print $3,$4,$5,$6,$7}}')"
  elapsed="$(printf '%s\n' "$gaussian_line" | awk '{{print $8}}')"
  args="$(printf '%s\n' "$gaussian_line" | cut -d' ' -f9-)"
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  stdin_path="$(readlink -f "/proc/$pid/fd/0" 2>/dev/null || true)"
  stdout_path="$(readlink -f "/proc/$pid/fd/1" 2>/dev/null || true)"
  input_file=""
  case "$stdin_path" in *.com|*.gjf|*.inp) input_file="$stdin_path";; esac
  if [ -z "$input_file" ]; then
    arg_input="$(printf '%s\n' "$args" | grep -oE '[^[:space:]]+\.(com|gjf|inp)' | head -n1 || true)"
    if [ -n "$arg_input" ]; then
      case "$arg_input" in /*) input_file="$arg_input";; *) input_file="$cwd/$arg_input";; esac
    fi
  fi
  case "$stdout_path" in *.out|*.log) output_file="$stdout_path";; esac
  if [ -z "$output_file" ]; then
    arg_output="$(printf '%s\n' "$args" | grep -oE '[^[:space:]]+\.(out|log)' | tail -n1 || true)"
    if [ -n "$arg_output" ]; then
      case "$arg_output" in /*) output_file="$arg_output";; *) output_file="$cwd/$arg_output";; esac
    fi
  fi
  if [ -z "$output_file" ] && [ -n "$input_file" ]; then
    stem="${{input_file%.*}}"
    [ -f "$stem.out" ] && output_file="$stem.out"
    [ -z "$output_file" ] && [ -f "$stem.log" ] && output_file="$stem.log"
  fi
  chk_file=""
  if [ -n "$input_file" ] && [ -r "$input_file" ]; then
    chk_file="$(head -n 60 "$input_file" 2>/dev/null | sed -n 's/^[[:space:]]*%[Cc][Hh][Kk][[:space:]]*=[[:space:]]*//p' | head -n1)"
    case "$chk_file" in "") :;; /*) :;; *) chk_file="$cwd/$chk_file";; esac
  fi
  if [ -z "$chk_file" ] && [ -n "$input_file" ]; then
    stem="${{input_file%.*}}"; [ -f "$stem.chk" ] && chk_file="$stem.chk"
  fi
  emit JOB_DETECTED 1
  emit PID "$pid"; emit_b64 JOB_USER "$user"; emit_b64 START_TEXT "$start_text"
  emit ELAPSED_SECONDS "$elapsed"; emit_b64 ARGS "$args"
  emit_b64 WORKING_DIRECTORY "$cwd"; emit_b64 INPUT_FILE "$input_file"
  emit_b64 OUTPUT_FILE "$output_file"; emit_b64 CHECKPOINT_FILE "$chk_file"
else
  emit JOB_DETECTED 0
  if [ -n "$PREVIOUS_OUTPUT" ] && [ -r "$PREVIOUS_OUTPUT" ]; then
    output_file="$PREVIOUS_OUTPUT"; emit PREVIOUS_OUTPUT_READABLE 1; emit_b64 OUTPUT_FILE "$output_file"
  fi
fi

# Only a bounded tail is inspected; large Gaussian logs are never read in full.
if [ -n "$output_file" ] && [ -r "$output_file" ]; then
  tail_text="$(tail -c "$TAIL_BYTES" "$output_file" 2>/dev/null || true)"
  recent_text="$(printf '%s\n' "$tail_text" | tail -n 120)"
  normal="$(printf '%s\n' "$recent_text" | grep -c 'Normal termination of Gaussian' || true)"
  error="$(printf '%s\n' "$recent_text" | grep -Ec 'Error termination|Convergence failure|Number of steps exceeded' || true)"
  route="$(printf '%s\n' "$tail_text" | grep -Ei '^[[:space:]]*#' | tail -n1 || true)"
  energy="$(printf '%s\n' "$tail_text" | sed -nE 's/.*SCF Done:[^=]*=[[:space:]]*({NUMBER}).*/\1/p' | tail -n1)"
  if [ -z "$energy" ]; then
    energy="$(printf '%s\n' "$tail_text" | sed -nE 's/.*(EUMP2|CCSD\(T\))[[:space:]]*=[[:space:]]*({NUMBER}).*/\2/p' | tail -n1)"
  fi
  stage=unknown
  if printf '%s\n' "$recent_text" | grep -Eqi 'Error termination|Convergence failure|Number of steps exceeded'; then stage=error
  elif printf '%s\n' "$recent_text" | grep -q 'Normal termination of Gaussian'; then stage=completed
  elif printf '%s\n%s\n' "$route" "$tail_text" | grep -Eqi '(^|[^a-z])irc([^a-z]|$)'; then stage=irc
  elif printf '%s\n%s\n' "$route" "$tail_text" | grep -Eqi 'opt[[:space:]]*=[[:space:]]*\([^)]*(ts|qst2|qst3)'; then stage=transition_state
  elif printf '%s\n%s\n' "$route" "$tail_text" | grep -Eqi '(^|[^a-z])freq([^a-z]|$)|Frequencies --'; then stage=frequency
  elif printf '%s\n%s\n' "$route" "$tail_text" | grep -Eqi '(^|[^a-z])scan([^a-z]|$)'; then stage=scan
  elif printf '%s\n%s\n' "$route" "$tail_text" | grep -Eqi '(^|[^a-z])opt([^a-z]|$)|Step number|Optimization completed|Stationary point found'; then stage=optimization
  elif printf '%s\n' "$tail_text" | grep -q 'SCF Done'; then stage=scf
  else stage=startup
  fi
  emit NORMAL_TERMINATION "$([ "$normal" -gt 0 ] && echo 1 || echo 0)"
  emit ERROR_TERMINATION "$([ "$error" -gt 0 ] && echo 1 || echo 0)"
  emit STAGE "$stage"; emit LAST_ENERGY "$energy"
  emit OUTPUT_SIZE "$(wc -c < "$output_file" 2>/dev/null | tr -d ' ')"
fi
'''

def parse_output(stdout: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if key.endswith("_B64"):
            key = key[:-4]
            try:
                value = base64.b64decode(value, validate=True).decode("utf-8", errors="replace")
            except (ValueError, UnicodeError):
                continue
        values[key] = value
    return values

def storage_metrics(values: dict[str, str], prefix: str) -> dict[str, Any] | None:
    total, used = as_int(values.get(f"{prefix}_TOTAL")), as_int(values.get(f"{prefix}_USED"))
    available = as_int(values.get(f"{prefix}_AVAILABLE"))
    if total is None:
        return None
    return {"path": values.get(f"{prefix}_PATH") or None, "total_bytes": total,
            "used_bytes": used, "available_bytes": available,
            "used_percent": as_float(values.get(f"{prefix}_PERCENT"))
            if values.get(f"{prefix}_PERCENT") else percent(used, total)}

def job_from_values(values: dict[str, str], previous: dict[str, Any] | None) -> dict[str, Any]:
    detected = values.get("JOB_DETECTED") == "1"
    normal = values.get("NORMAL_TERMINATION") == "1"
    error = values.get("ERROR_TERMINATION") == "1"
    prior = previous.get("gaussian", {}) if previous else {}
    if not isinstance(prior, dict):
        prior = {}
    if detected:
        # A live Gaussian PID wins over stale Link1 termination text.
        status = "running"
    elif values.get("PREVIOUS_OUTPUT_READABLE") == "1" and (normal or error):
        status = "failed" if error else "finished"
    else:
        status = "idle"
    def value_or_prior(key: str, value: Any) -> Any:
        return value if value not in (None, "") else prior.get(key) if status in {"finished", "failed"} else None
    output_file = values.get("OUTPUT_FILE") or None
    input_file = values.get("INPUT_FILE") or None
    input_name = PurePosixPath(input_file or output_file).name if input_file or output_file else None
    return {
        "detected": detected, "status": status,
        "pid": value_or_prior("pid", as_int(values.get("PID"))),
        "user": value_or_prior("user", values.get("JOB_USER") or None),
        "started_at": value_or_prior("started_at", started_iso(values.get("START_TEXT"))),
        "elapsed_seconds": value_or_prior("elapsed_seconds", as_int(values.get("ELAPSED_SECONDS"))),
        "input_name": value_or_prior("input_name", input_name),
        "input_file": value_or_prior("input_file", input_file),
        "checkpoint_file": value_or_prior("checkpoint_file", values.get("CHECKPOINT_FILE") or None),
        "output_file": value_or_prior("output_file", output_file),
        "working_directory": value_or_prior("working_directory", values.get("WORKING_DIRECTORY") or None),
        "stage": values.get("STAGE") or ("completed" if status == "finished" else "error" if status == "failed" else None),
        "last_energy_hartree": as_float(values.get("LAST_ENERGY")) if values.get("LAST_ENERGY")
        else prior.get("last_energy_hartree") if status in {"finished", "failed"} else None,
        "normal_termination": normal, "error_termination": error,
        "output_size_bytes": as_int(values.get("OUTPUT_SIZE")),
    }
