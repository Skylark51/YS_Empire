#!/usr/bin/env python3
"""Run YS Lion Agent through the JBNU login shell.

Connection path:
Windows -> lion.jbnu.ac.kr -> ssh lionXX
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import agent

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("YS_AGENT_CONFIG", ROOT / "config.json"))
ORIGINAL_RUN = agent.subprocess.run


def load_route() -> tuple[str, str]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config: dict[str, Any] = json.load(handle)
    return str(config.get("connection_mode", "gateway_shell")), str(config.get("gateway", "lion.jbnu.ac.kr"))


def routed_run(command: Any, *args: Any, **kwargs: Any):
    mode, gateway = load_route()
    if mode == "gateway_shell" and isinstance(command, list) and command and command[0] == "ssh":
        try:
            target_index = command.index("bash") - 1
        except ValueError:
            target_index = -1
        if target_index > 0 and command[target_index] != gateway:
            outer_options = command[1:target_index]
            command = ["ssh", *outer_options, gateway, "ssh", *command[1:]]
            if kwargs.get("timeout"):
                kwargs["timeout"] = int(kwargs["timeout"]) * 2
    return ORIGINAL_RUN(command, *args, **kwargs)


agent.subprocess.run = routed_run

if __name__ == "__main__":
    mode, gateway = load_route()
    print(f"접속 경로: {gateway} -> ssh lionXX ({mode})")
    agent.main()
