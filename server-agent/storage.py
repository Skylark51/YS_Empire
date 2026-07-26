#!/usr/bin/env python3
"""Small, crash-safe JSON storage for the server agent."""
from __future__ import annotations

import json
import threading
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


class JsonStore:
    """Own the three runtime files without ever touching config.json."""

    def __init__(self, data_dir: Path, history_limit: int = 2000) -> None:
        self.data_dir = data_dir
        self.history_limit = max(10, history_limit)
        self.lock = threading.RLock()
        self.paths = {
            "notes": data_dir / "notes.json",
            "history": data_dir / "history.json",
            "cache": data_dir / "cache.json",
        }
        self.defaults: dict[str, Any] = {
            "notes": {"schema_version": "1.0", "updated_at": None, "notes": {}},
            "history": {"schema_version": "1.0", "updated_at": None, "events": []},
            "cache": {
                "schema_version": "2.0", "generated_at": None,
                "summary": {}, "nodes": [],
            },
        }

    def initialise(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        for name, path in self.paths.items():
            if not path.exists():
                self._write(path, deepcopy(self.defaults[name]))

    def read(self, name: str) -> Any:
        path = self.paths[name]
        with self.lock:
            try:
                with path.open("r", encoding="utf-8") as handle:
                    return json.load(handle)
            except (FileNotFoundError, json.JSONDecodeError, OSError):
                return deepcopy(self.defaults[name])

    def write_cache(self, snapshot: dict[str, Any]) -> None:
        with self.lock:
            self._write(self.paths["cache"], snapshot)

    def notes_by_node(self) -> dict[str, Any]:
        payload = self.read("notes")
        notes = payload.get("notes", {}) if isinstance(payload, dict) else {}
        return notes if isinstance(notes, dict) else {}

    def append_history(self, event: dict[str, Any]) -> bool:
        """Append once; returns False when the event key is already recorded."""
        with self.lock:
            payload = self.read("history")
            events = payload.get("events", [])
            if not isinstance(events, list):
                events = []
            event_key = event.get("event_key")
            if event_key and any(item.get("event_key") == event_key for item in events):
                return False
            events.append(event)
            payload = {
                "schema_version": "1.0", "updated_at": iso_now(),
                "events": events[-self.history_limit :],
            }
            self._write(self.paths["history"], payload)
            return True

    @staticmethod
    def _write(path: Path, payload: Any) -> None:
        temporary = path.with_suffix(path.suffix + ".tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
        temporary.replace(path)
