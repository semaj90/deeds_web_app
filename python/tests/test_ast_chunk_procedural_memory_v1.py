#!/usr/bin/env python3
"""Unit tests for AST procedural memory, domain classification routing dict, linked lists, and tensor creations."""

import unittest
import sys
from pathlib import Path

# Add repo root and python/ to sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_compute.ast_chunk_procedural_memory_v1 import (
    EXPERIMENTAL_FEATURE_DOMAINS,
    canonicalize_domain,
    classify_ast_chunk_domain,
    build_procedural_chain,
    procedural_chain_to_array,
    PROCEDURAL_FEATURE_DIM,
    AstProceduralNode,
    HAVE_TORCH,
    HAVE_NUMPY,
)


class TestAstChunkProceduralMemory(unittest.TestCase):

    def test_experimental_feature_domain_slots(self):
        self.assertEqual(len(EXPERIMENTAL_FEATURE_DOMAINS), 9)
        self.assertIn("ui", EXPERIMENTAL_FEATURE_DOMAINS)
        self.assertIn("retrieval", EXPERIMENTAL_FEATURE_DOMAINS)
        self.assertIn("database", EXPERIMENTAL_FEATURE_DOMAINS)
        self.assertIn("ml", EXPERIMENTAL_FEATURE_DOMAINS)

    def test_domain_canonicalization_does_not_infer_crosswalks(self):
        self.assertEqual(canonicalize_domain("api"), "unresolved")
        self.assertEqual(canonicalize_domain("ui"), "ui")
        self.assertEqual(canonicalize_domain("billing"), "unresolved")
        self.assertEqual(canonicalize_domain("Graph"), "graph")
        self.assertEqual(canonicalize_domain("documentation"), "unresolved")
        self.assertEqual(canonicalize_domain("backend"), "unresolved")
        self.assertEqual(canonicalize_domain("frontend"), "unresolved")
        self.assertEqual(canonicalize_domain("retrieval"), "retrieval")
        self.assertEqual(canonicalize_domain(""), "unresolved")

    def test_ast_domain_routing_rules(self):
        # Svelte 5 runes
        svelte_code = "let count = $state(0); let double = $derived(count * 2);"
        self.assertEqual(classify_ast_chunk_domain("src/Counter.svelte", "script", svelte_code), "ui")

        # SQL / Drizzle
        sql_code = "export const users = pgTable('users', { id: serial('id').primaryKey() });"
        self.assertEqual(classify_ast_chunk_domain("src/schema.ts", "declaration", sql_code), "database")

        # PyTorch / CUDA
        ml_code = "import torch\nt = torch.zeros((10, 768), dtype=torch.float32).cuda()"
        self.assertEqual(classify_ast_chunk_domain("python/train.py", "function", ml_code), "ml")

        # Network / gRPC route
        net_code = "export const POST: RequestHandler = async ({ request }) => { return json({}); };"
        self.assertEqual(classify_ast_chunk_domain("src/routes/api/users/+server.ts", "arrow_function", net_code), "network")
        self.assertEqual(classify_ast_chunk_domain("src/unknown.ts", "function", "no distinctive cues"), "unresolved")

    def test_procedural_memory_linked_list_and_tuples(self):
        raw_chunks = [
            {
                "id": "chk-01",
                "start_byte": 0,
                "end_byte": 120,
                "node_type": "function_declaration",
                "symbol_name": "loginUser",
                "calls": ["hashPassword", "generateJwt"],
                "dependencies": ["bcrypt", "jsonwebtoken"],
                "text": "async function loginUser(u, p) { await hashPassword(p); return generateJwt(u); }",
            },
            {
                "id": "chk-02",
                "start_byte": 125,
                "end_byte": 250,
                "node_type": "export_statement",
                "symbol_name": "renderDashboard",
                "calls": ["fetchData"],
                "dependencies": ["$state"],
                "text": "export function renderDashboard() { const s = $state([]); }",
            },
        ]

        head = build_procedural_chain(raw_chunks, file_path="src/lib/auth.ts")
        self.assertIsNotNone(head)
        self.assertEqual(head.chunk_id, "chk-01")
        self.assertEqual(head.domain, "unresolved")
        self.assertEqual(head.domain_proposal, "auth")
        self.assertEqual(head.call_targets, ("hashPassword", "generateJwt"))

        # Verify O(1) linked-list traversal
        nxt = head.next_node
        self.assertIsNotNone(nxt)
        self.assertEqual(nxt.chunk_id, "chk-02")
        self.assertEqual(nxt.domain, "unresolved")
        self.assertEqual(nxt.domain_proposal, "ui")
        self.assertIsNone(nxt.next_node)

        # Verify tuple and kv-pairs
        tup = head.to_tuple()
        self.assertEqual(tup[0], "chk-01")
        self.assertEqual(tup[1], "unresolved")
        self.assertEqual(tup[8], "auth")

        kv = dict(head.to_kv_pairs())
        self.assertEqual(kv["domain"], "unresolved")
        self.assertEqual(kv["domain_proposal"], "auth")
        self.assertEqual(kv["span_start"], 0)
        self.assertEqual(kv["span_end"], 120)

    def test_procedural_tensor_array_creation(self):
        raw_chunks = [
            {"id": "c1", "start_byte": 0, "end_byte": 500, "resolved_domain": "retrieval", "calls": ["annSearch"], "dependencies": ["qdrant"]},
            {"id": "c2", "start_byte": 500, "end_byte": 1000, "resolved_domain": "database", "calls": ["query"], "dependencies": ["pg"]},
        ]
        head = build_procedural_chain(raw_chunks)
        tensor_or_array = procedural_chain_to_array(head, as_tensor=True)

        if HAVE_TORCH:
            import torch
            self.assertIsInstance(tensor_or_array, torch.Tensor)
            self.assertEqual(tensor_or_array.shape, (2, PROCEDURAL_FEATURE_DIM))
            self.assertEqual(tensor_or_array.dtype, torch.float32)
            # Row 0 domain is 'retrieval' (idx 2)
            self.assertEqual(tensor_or_array[0, 2].item(), 1.0)
            # Row 1 domain is 'database' (idx 3)
            self.assertEqual(tensor_or_array[1, 3].item(), 1.0)

        unknown_head = build_procedural_chain([{"id": "unknown", "start_byte": 0, "end_byte": 1}])
        unknown_features = procedural_chain_to_array(unknown_head, as_tensor=False)
        if HAVE_NUMPY:
            self.assertEqual(float(unknown_features[0, :9].sum()), 0.0)
        elif HAVE_NUMPY:
            import numpy as np
            self.assertIsInstance(tensor_or_array, np.ndarray)
            self.assertEqual(tensor_or_array.shape, (2, PROCEDURAL_FEATURE_DIM))
            self.assertEqual(tensor_or_array.dtype, np.float32)
        else:
            self.assertIsInstance(tensor_or_array, list)
            self.assertEqual(len(tensor_or_array), 2)


if __name__ == "__main__":
    unittest.main()
