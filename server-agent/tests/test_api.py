from __future__ import annotations

import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

import agent


class ApiTests(unittest.TestCase):
    def test_status_returns_authenticated_snapshot(self) -> None:
        server = ThreadingHTTPServer(("127.0.0.1", 0), agent.Handler)
        server.config = {"api_token": "fixture-token", "allowed_origins": []}
        with agent.CACHE_LOCK:
            agent.CACHE.clear()
            agent.CACHE.update({"schema_version": "2.0", "generated_at": "now",
                                "summary": {"nodes_total": 1},
                                "nodes": [{"id": "lion28", "state": "idle"}]})
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port)
            connection.request("GET", "/api/status",
                               headers={"Authorization": "Bearer fixture-token"})
            response = connection.getresponse()
            payload = json.loads(response.read())
            self.assertEqual(response.status, 200)
            self.assertEqual(payload["nodes"][0]["id"], "lion28")
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
