from __future__ import annotations

import unittest

from node_inventory import (
    BORROWED_LION_NUMBERS,
    JBNU_NODES,
    expand_jbnu_nodes,
)


class InventoryTests(unittest.TestCase):
    def test_inventory_has_all_jbnu_cpu_nodes_only(self) -> None:
        ids = [node["id"] for node in JBNU_NODES]
        self.assertEqual(len(ids), 47)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(BORROWED_LION_NUMBERS), 33)
        self.assertNotIn("glion1", ids)
        self.assertNotIn("glion2", ids)
        self.assertFalse(any(node.startswith("ewha") for node in ids))
        self.assertFalse(any(node.startswith("unist") for node in ids))

    def test_minimal_config_is_expanded_and_overrides_are_preserved(self) -> None:
        config = {
            "nodes": [
                {"id": "lion28", "ssh_alias": "custom-lion28", "label": "local"},
            ]
        }
        expanded = expand_jbnu_nodes(config)
        self.assertEqual(len(expanded["nodes"]), 47)
        lion28 = next(node for node in expanded["nodes"] if node["id"] == "lion28")
        self.assertEqual(lion28["ssh_alias"], "custom-lion28")
        self.assertEqual(lion28["label"], "local")

    def test_exclusion_is_explicit_and_does_not_mutate_input(self) -> None:
        config = {"nodes": [], "exclude_node_ids": ["lion4"]}
        expanded = expand_jbnu_nodes(config)
        self.assertEqual(len(expanded["nodes"]), 46)
        self.assertNotIn("lion4", [node["id"] for node in expanded["nodes"]])
        self.assertEqual(config["nodes"], [])


if __name__ == "__main__":
    unittest.main()
