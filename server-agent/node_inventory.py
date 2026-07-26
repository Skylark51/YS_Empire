#!/usr/bin/env python3
"""Canonical JBNU Lion inventory used to expand a minimal local config."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

OWNED_LION_NUMBERS = (28, 29, 30, 38, 39, 40, 48, 49, 50, 51)
BORROWED_LION_NUMBERS = (
    4, 5, 7, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27,
    31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 46, 47, 52, 53,
)
OWNED_TLION_NUMBERS = (3,)
BORROWED_TLION_NUMBERS = (1, 2, 4)


def _node(node_id: str, pool: str, node_type: str) -> dict[str, Any]:
    return {
        "id": node_id,
        "ssh_alias": node_id,
        "default_directory": "/home/skylark",
        "institution": "jbnu",
        "pool": pool,
        "node_type": node_type,
        "borrowable": pool in {"borrowed", "hpc_support"},
    }


JBNU_NODES = tuple(
    [_node(f"lion{number}", "owned", "lion") for number in OWNED_LION_NUMBERS]
    + [_node(f"tlion{number}", "owned", "tlion") for number in OWNED_TLION_NUMBERS]
    + [_node(f"lion{number}", "borrowed", "lion") for number in BORROWED_LION_NUMBERS]
    + [_node(f"tlion{number}", "hpc_support", "tlion") for number in BORROWED_TLION_NUMBERS]
)


def expand_jbnu_nodes(config: dict[str, Any]) -> dict[str, Any]:
    """Merge the canonical 47-node inventory while preserving local overrides."""
    expanded = deepcopy(config)
    configured = {
        item.get("id"): item
        for item in config.get("nodes", [])
        if isinstance(item, dict) and item.get("id")
    }
    excluded = {
        str(node_id) for node_id in config.get("exclude_node_ids", [])
        if isinstance(node_id, str)
    }
    nodes: list[dict[str, Any]] = []
    for inventory_node in JBNU_NODES:
        node_id = inventory_node["id"]
        if node_id in excluded:
            continue
        merged = dict(inventory_node)
        merged.update(configured.pop(node_id, {}))
        nodes.append(merged)

    # Explicit non-JBNU additions remain possible, but are never added automatically.
    nodes.extend(
        value for node_id, value in configured.items()
        if node_id not in excluded
    )
    expanded["nodes"] = nodes
    return expanded
