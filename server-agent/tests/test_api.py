from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
import unittest.mock
from http.server import ThreadingHTTPServer
from pathlib import Path

import agent
from storage import JsonStore


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.store = JsonStore(Path(self.temporary.name))
        self.store.initialise()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), agent.Handler)
        self.server.config = {
            "api_token": "fixture-token",
            "allowed_origins": [],
            "nodes": [{"id": "lion28"}],
        }
        self.server.store = self.store
        with agent.CACHE_LOCK:
            agent.CACHE.clear()
            agent.CACHE.update({
                "schema_version": "2.0",
                "generated_at": "now",
                "summary": {"nodes_total": 1},
                "nodes": [{"id": "lion28", "state": "idle", "memo": None, "note": None}],
            })
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.temporary.cleanup()

    def request(self, method: str, path: str, body=None, token=True, content_type=True):
        headers = {}
        if token:
            headers["Authorization"] = "Bearer fixture-token"
        encoded = None
        if body is not None:
            encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
            if content_type:
                headers["Content-Type"] = "application/json; charset=utf-8"
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        payload = json.loads(response.read())
        return response.status, payload

    def test_status_returns_authenticated_snapshot(self) -> None:
        status, payload = self.request("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(payload["nodes"][0]["id"], "lion28")

    def test_health_exposes_collector_without_authentication(self) -> None:
        status, payload = self.request("GET", "/api/health", token=False)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertIn("collector", payload)
        self.assertIn("ready", payload)

    def test_manual_refresh_is_authenticated_and_non_blocking(self) -> None:
        status, _ = self.request("POST", "/api/refresh", token=False)
        self.assertEqual(status, 401)
        with unittest.mock.patch("agent.run_collection", return_value=True):
            status, payload = self.request("POST", "/api/refresh")
        self.assertEqual(status, 202)
        self.assertTrue(payload["accepted"])

    def test_note_upsert_get_immediate_status_and_delete(self) -> None:
        status, payload = self.request(
            "PUT", "/api/notes/lion28", {"text": "한글 메모\n둘째 줄"}
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["memo"], "한글 메모\n둘째 줄")

        status, notes = self.request("GET", "/api/notes")
        self.assertEqual(status, 200)
        self.assertEqual(notes["notes"]["lion28"]["text"], "한글 메모\n둘째 줄")

        status, snapshot = self.request("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(snapshot["nodes"][0]["memo"], "한글 메모\n둘째 줄")

        status, deleted = self.request("DELETE", "/api/notes/lion28")
        self.assertEqual(status, 200)
        self.assertTrue(deleted["deleted"])
        self.assertNotIn("lion28", self.store.notes_by_node())

    def test_note_rejects_unauthorised_unknown_and_wrong_content_type(self) -> None:
        status, _ = self.request(
            "PUT", "/api/notes/lion28", {"text": "no"}, token=False
        )
        self.assertEqual(status, 401)
        status, _ = self.request(
            "PUT", "/api/notes/lion999", {"text": "no"}
        )
        self.assertEqual(status, 404)
        status, _ = self.request(
            "PUT", "/api/notes/lion28", {"text": "no"}, content_type=False
        )
        self.assertEqual(status, 415)

    def test_note_rejects_oversized_text(self) -> None:
        status, _ = self.request(
            "PUT", "/api/notes/lion28", {"text": "x" * 4001}
        )
        self.assertEqual(status, 413)


if __name__ == "__main__":
    unittest.main()
