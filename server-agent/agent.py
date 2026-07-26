#!/usr/bin/env python3
"""YS Empire read-only backend for Lion node and Gaussian status."""
from __future__ import annotations

import json
import os
import secrets
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from node_collector import collect_node, offline_node
from node_inventory import expand_jbnu_nodes
from storage import JsonStore

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("YS_AGENT_CONFIG", ROOT / "config.json"))
DATA_DIR = ROOT / "data"
CACHE: dict[str, Any] = {"schema_version": "2.0", "generated_at": None,
                         "summary": {}, "nodes": []}
CACHE_LOCK = threading.RLock()
STOP_EVENT = threading.Event()
STORE: JsonStore | None = None

# 1. config.json is read, never written.
def load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    token = str(config.get("api_token", "")).strip()
    if not token or token == "CHANGE_ME_TO_A_LONG_RANDOM_TOKEN":
        raise RuntimeError("config.json의 api_token을 임의의 긴 문자열로 변경하세요.")
    if config.get("include_jbnu_pool", True):
        config = expand_jbnu_nodes(config)
    if not isinstance(config.get("nodes"), list) or not config["nodes"]:
        raise RuntimeError("config.json에 수집할 nodes 목록이 필요합니다.")
    return config

def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

# 2. Collection is parallel, while each node failure stays isolated.
def previous_nodes(store: JsonStore) -> dict[str, dict[str, Any]]:
    cached = store.read("cache")
    nodes = cached.get("nodes", []) if isinstance(cached, dict) else []
    return {item["id"]: item for item in nodes
            if isinstance(item, dict) and isinstance(item.get("id"), str)}

def history_event(node: dict[str, Any]) -> dict[str, Any]:
    job = node["gaussian"]
    identity = "|".join(str(value or "") for value in
                        (node["id"], job.get("pid"), job.get("started_at"),
                         job.get("output_file"), job.get("status")))
    return {"event_key": identity, "recorded_at": iso_now(),
            "node_id": node["id"], "status": job.get("status"), "job": job}

def collect(config: dict[str, Any], store: JsonStore | None = None) -> dict[str, Any]:
    store = store or JsonStore(DATA_DIR, int(config.get("history_limit", 2000)))
    store.initialise()
    previous = previous_nodes(store)
    notes = store.notes_by_node()
    configured_nodes = config.get("nodes", [])
    workers = min(max(1, int(config.get("max_parallel_nodes", 6))), len(configured_nodes))
    results: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="lion-node") as pool:
        futures = {pool.submit(collect_node, node, config, previous.get(node["id"])): node
                   for node in configured_nodes}
        for future in as_completed(futures):
            node = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                result = offline_node(node, f"collector error: {exc}")
            note = notes.get(node["id"])
            result["note"] = note
            result["memo"] = note.get("text") if isinstance(note, dict) else note
            results[node["id"]] = result
    nodes = [results[node["id"]] for node in configured_nodes]
    for node in nodes:
        if node["state"] in {"finished", "failed"} and node["state"] != previous.get(node["id"], {}).get("state"):
            store.append_history(history_event(node))
    summary = {
        "nodes_total": len(nodes),
        "online": sum(1 for node in nodes if node["online"]),
        "offline": sum(1 for node in nodes if not node["online"]),
        "running": sum(1 for node in nodes if node["state"] == "running"),
        "finished": sum(1 for node in nodes if node["state"] == "finished"),
        "failed": sum(1 for node in nodes if node["state"] == "failed"),
        "idle": sum(1 for node in nodes if node["state"] == "idle"),
    }
    snapshot = {
        "schema_version": "2.0", "generated_at": iso_now(),
        "source": {"connection_mode": config.get("connection_mode", "direct"),
                   "gateway": config.get("gateway"), "live": True},
        "summary": summary, "nodes": nodes,
    }
    store.write_cache(snapshot)
    return snapshot

def collector_loop(config: dict[str, Any], store: JsonStore) -> None:
    interval = max(5, int(config.get("collect_interval_seconds", 10)))
    while not STOP_EVENT.is_set():
        snapshot = collect(config, store)
        with CACHE_LOCK:
            CACHE.clear()
            CACHE.update(snapshot)
        STOP_EVENT.wait(interval)

# 3. /api/status carries full detail and the old UI compatibility fields.
class Handler(BaseHTTPRequestHandler):
    server_version = "YSLionAgent/2.0"

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        allowed = self.server.config.get("allowed_origins", [])
        if origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self.respond(200, {"ok": True, "service": "YS Lion Agent", "version": "2.1.0"})
            return
        if not self.authorised():
            self.respond(401, {"error": "invalid token"})
            return
        if path == "/api/status":
            with CACHE_LOCK:
                payload = json.loads(json.dumps(CACHE, ensure_ascii=False))
            self.respond(200, payload)
            return
        if path == "/api/notes":
            self.respond(200, {"notes": self.note_store().notes_by_node()})
            return
        self.respond(404, {"error": "not found"})

    def do_PUT(self) -> None:
        if not self.authorised():
            self.respond(401, {"error": "invalid token"})
            return
        node_id = self.note_node_id()
        if node_id is None:
            self.respond(404, {"error": "not found"})
            return
        payload = self.read_json_body()
        if payload is None:
            return
        text = payload.get("text")
        if not isinstance(text, str):
            self.respond(400, {"error": "text must be a string"})
            return
        if len(text) > 4000:
            self.respond(413, {"error": "note is longer than 4000 characters"})
            return
        note = self.note_store().set_note(node_id, text)
        self.update_cached_note(node_id, note)
        self.respond(200, {"node_id": node_id, "memo": note["text"],
                           "updated_at": note["updated_at"]})

    def do_DELETE(self) -> None:
        if not self.authorised():
            self.respond(401, {"error": "invalid token"})
            return
        node_id = self.note_node_id()
        if node_id is None:
            self.respond(404, {"error": "not found"})
            return
        deleted = self.note_store().delete_note(node_id)
        self.update_cached_note(node_id, None)
        self.respond(200, {"node_id": node_id, "deleted": deleted})

    def note_store(self) -> JsonStore:
        store = getattr(self.server, "store", None) or STORE
        if store is None:
            raise RuntimeError("note store is not initialised")
        return store

    def note_node_id(self) -> str | None:
        path = urlparse(self.path).path
        prefix = "/api/notes/"
        if not path.startswith(prefix):
            return None
        node_id = path[len(prefix):]
        if not node_id or len(node_id) > 64:
            return None
        if not all(character.isalnum() or character in "_-" for character in node_id):
            return None
        configured_ids = {node.get("id") for node in self.server.config.get("nodes", [])}
        return node_id if node_id in configured_ids else None

    def read_json_body(self) -> dict[str, Any] | None:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("application/json"):
            self.respond(415, {"error": "Content-Type must be application/json"})
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > 16384:
            self.respond(413, {"error": "request body is too large"})
            return None
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.respond(400, {"error": "invalid JSON"})
            return None
        if not isinstance(payload, dict):
            self.respond(400, {"error": "JSON object required"})
            return None
        return payload

    @staticmethod
    def update_cached_note(node_id: str, note: dict[str, Any] | None) -> None:
        with CACHE_LOCK:
            for node in CACHE.get("nodes", []):
                if node.get("id") == node_id:
                    node["note"] = note
                    node["memo"] = note.get("text") if isinstance(note, dict) else None
                    break

    def authorised(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        return supplied.startswith("Bearer ") and secrets.compare_digest(
            supplied[7:], self.server.config["api_token"])

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
    global STORE
    config = load_config()
    STORE = JsonStore(DATA_DIR, int(config.get("history_limit", 2000)))
    STORE.initialise()
    persisted = STORE.read("cache")
    if isinstance(persisted, dict):
        with CACHE_LOCK:
            CACHE.clear()
            CACHE.update(persisted)
    threading.Thread(target=collector_loop, args=(config, STORE),
                     daemon=True, name="collector").start()
    host, port = config.get("listen_host", "127.0.0.1"), int(config.get("listen_port", 8765))
    server = ThreadingHTTPServer((host, port), Handler)
    server.config = config
    server.store = STORE
    print(f"YS Lion Agent: http://{host}:{port}")
    print("읽기 전용 수집 모드 · 종료: Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STOP_EVENT.set()
        server.server_close()

if __name__ == "__main__":
    main()
