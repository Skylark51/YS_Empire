from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import agent
from node_collector import offline_node
from storage import JsonStore


class AgentTests(unittest.TestCase):
    def test_one_node_failure_does_not_drop_other_nodes(self) -> None:
        config = {
            "api_token": "test-token-long-enough",
            "max_parallel_nodes": 2,
            "nodes": [
                {"id": "lion28", "ssh_alias": "lion28"},
                {"id": "lion29", "ssh_alias": "lion29"},
            ],
        }
        def fake_collect(node, _config, _previous):
            if node["id"] == "lion28":
                raise RuntimeError("fixture failure")
            return offline_node(node, "fixture offline")
        with tempfile.TemporaryDirectory() as directory:
            store = JsonStore(Path(directory))
            with patch("agent.collect_node", side_effect=fake_collect):
                result = agent.collect(config, store)
        self.assertEqual([node["id"] for node in result["nodes"]], ["lion28", "lion29"])
        self.assertEqual(result["summary"]["nodes_total"], 2)
        self.assertEqual(result["summary"]["offline"], 2)

    def test_run_collection_recovers_after_failure(self) -> None:
        config = {
            "api_token": "test-token-long-enough",
            "nodes": [{"id": "lion28", "ssh_alias": "lion28"}],
        }
        with tempfile.TemporaryDirectory() as directory:
            store = JsonStore(Path(directory))
            with patch("agent.collect", side_effect=[RuntimeError("gateway down"), {
                "schema_version": "2.0",
                "generated_at": "recovered",
                "summary": {},
                "nodes": [],
            }]):
                self.assertFalse(agent.run_collection(config, store))
                self.assertTrue(agent.run_collection(config, store))
        status = agent.runtime_status(config)
        self.assertTrue(status["ready"])
        self.assertEqual(status["last_success_at"], "recovered")
        self.assertEqual(status["consecutive_failures"], 0)


if __name__ == "__main__":
    unittest.main()
