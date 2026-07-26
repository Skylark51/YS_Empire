from __future__ import annotations

import base64
import tempfile
import unittest
from pathlib import Path

from collector import build_remote_script, job_from_values, parse_output
from node_collector import node_from_values, offline_node
from storage import JsonStore


def b64(value: str) -> str:
    return base64.b64encode(value.encode()).decode()


class CollectorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.node = {"id": "lion28", "ssh_alias": "lion28",
                     "default_directory": "/home/skylark"}

    def test_parse_and_running_contract(self) -> None:
        raw = "\n".join([
            f"HOSTNAME_B64={b64('lion28.cluster')}", "UPTIME_SECONDS=90061",
            "LOAD_1=1.25", "LOAD_5=1.00", "LOAD_15=0.75",
            "CPU_CORES=16", "CPU_PERCENT=47.5",
            "MEMORY_TOTAL=68719476736", "MEMORY_AVAILABLE=34359738368",
            "SWAP_TOTAL=8589934592", "SWAP_FREE=6442450944",
            "DISK_TOTAL=100000", "DISK_USED=25000", "DISK_AVAILABLE=75000",
            "DISK_PERCENT=25", f"DISK_PATH_B64={b64('/')}",
            "JOB_DETECTED=1", "PID=1234", f"JOB_USER_B64={b64('skylark')}",
            f"START_TEXT_B64={b64('Sun Jul 26 10:00:00 2026')}",
            "ELAPSED_SECONDS=120", f"INPUT_FILE_B64={b64('/work/test.gjf')}",
            f"OUTPUT_FILE_B64={b64('/work/test.out')}",
            f"CHECKPOINT_FILE_B64={b64('/work/test.chk')}",
            f"WORKING_DIRECTORY_B64={b64('/work')}",
            "STAGE=optimization", "LAST_ENERGY=-123.456789",
            "NORMAL_TERMINATION=0", "ERROR_TERMINATION=0",
        ])
        node = node_from_values(self.node, parse_output(raw), None, 25)
        self.assertTrue(node["online"])
        self.assertEqual(node["state"], "running")
        self.assertEqual(node["status"], "running")
        self.assertEqual(node["gaussian"]["stage"], "optimization")
        self.assertEqual(node["gaussian"]["checkpoint_file"], "/work/test.chk")
        self.assertEqual(node["system"]["cpu"]["cores"], 16)
        self.assertEqual(node["system"]["memory"]["used_percent"], 50.0)

    def test_finished_and_failed_classification(self) -> None:
        finished = job_from_values({"JOB_DETECTED": "1", "NORMAL_TERMINATION": "1",
                                    "ERROR_TERMINATION": "0", "STAGE": "completed"}, None)
        failed = job_from_values({"JOB_DETECTED": "1", "NORMAL_TERMINATION": "0",
                                  "ERROR_TERMINATION": "1", "STAGE": "error"}, None)
        self.assertEqual(finished["status"], "finished")
        self.assertEqual(failed["status"], "failed")

    def test_completed_job_survives_process_exit_from_previous_output(self) -> None:
        previous = {"gaussian": {"pid": 99, "output_file": "/work/a.out",
                                 "working_directory": "/work", "user": "skylark"}}
        job = job_from_values({"JOB_DETECTED": "0", "PREVIOUS_OUTPUT_READABLE": "1",
                               "OUTPUT_FILE": "/work/a.out", "NORMAL_TERMINATION": "1",
                               "ERROR_TERMINATION": "0", "STAGE": "completed"}, previous)
        self.assertEqual(job["status"], "finished")
        self.assertEqual(job["pid"], 99)

    def test_offline_contract_uses_nulls(self) -> None:
        node = offline_node(self.node, "timeout")
        self.assertEqual(node["state"], "offline")
        self.assertIsNone(node["system"]["hostname"])
        self.assertEqual(node["error"], "timeout")

    def test_remote_script_is_bounded_and_read_only(self) -> None:
        script = build_remote_script(None)
        self.assertIn('tail -c "$TAIL_BYTES"', script)
        for destructive in ("rm -", "kill ", "pkill", "mv ", "truncate "):
            self.assertNotIn(destructive, script)

    def test_store_initialises_and_deduplicates_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = JsonStore(Path(directory))
            store.initialise()
            event = {"event_key": "lion28|1|finished", "status": "finished"}
            self.assertTrue(store.append_history(event))
            self.assertFalse(store.append_history(event))
            self.assertEqual(len(store.read("history")["events"]), 1)


if __name__ == "__main__":
    unittest.main()
