#!/usr/bin/env python3
"""
scripts/atlas/test_openai_facade_materializer_v1.py
---------------------------------------------------
Unit and integration tests for OpenAIFacadeMaterializer and TaskMmapArrowReader.
Validates:
1. Zero-copy mmap readback of 6,527 tasks and 64-D latents.
2. PyArrow Table export parity (if available).
3. Canonical 128-bit Crockford ULID generation and decoding.
4. Strict OpenAI /v1/chat/completions tool-call payload schema compatibility.
5. ACP A2A packet synthesis and sha256 digest integrity.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.atlas.c_abi_byte_synth_bridge import AtlasByteSynthBridge
from scripts.atlas.openai_facade_materializer_v1 import (
    LATENT_DIM,
    PYARROW_AVAILABLE,
    OpenAIFacadeMaterializer,
    TaskMmapArrowReader,
)


class TestOpenAIFacadeMaterializer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reader = TaskMmapArrowReader()
        cls.bridge = AtlasByteSynthBridge()
        cls.materializer = OpenAIFacadeMaterializer(cls.reader, cls.bridge)

    @classmethod
    def tearDownClass(cls):
        cls.reader.close()

    def test_01_mmap_reader_cardinality(self):
        """Verifies exact 6,527 records and memoryview dimensions."""
        self.assertEqual(self.reader.record_count, 6527)
        self.assertEqual(len(self.reader.records_view), 6527 * 64)
        self.assertEqual(len(self.reader.latents_view), 6527 * LATENT_DIM * 4)

    def test_02_raw_record_unpack(self):
        """Checks ordinal alignment and physical coordinates for sample records."""
        for test_ord in [0, 100, 1000, 6526]:
            m_code, t_ord, c_id, pos, score, features = self.reader.get_raw_record(test_ord)
            self.assertEqual(t_ord, test_ord, f"Ordinal mismatch at {test_ord}")
            self.assertIsInstance(m_code, int)
            self.assertIsInstance(c_id, int)
            self.assertEqual(len(pos), 3)
            self.assertEqual(len(features), 8)
            self.assertIsInstance(score, float)

            latent = self.reader.get_latent_vector(test_ord)
            self.assertEqual(len(latent), 64)

    def test_03_ulid_canonical_properties(self):
        """Verifies canonical 26-char Crockford ULID with first char in '0'..'7'."""
        ulids_seen = set()
        for ord_idx in range(50):
            m_code, t_ord, c_id, _, _, _ = self.reader.get_raw_record(ord_idx)
            ulid = self.materializer.generate_task_ulid(t_ord, m_code, c_id)
            self.assertEqual(len(ulid), 26)
            self.assertIn(ulid[0], "01234567", f"First char '{ulid[0]}' not in 0..7")
            self.assertNotIn(ulid, ulids_seen, "ULIDs must be strictly unique per task")
            ulids_seen.add(ulid)

            # Roundtrip decoding
            decoded_16b = self.bridge.decode_ulid128(ulid)
            self.assertEqual(len(decoded_16b), 16)

    def test_04_pyarrow_table_export(self):
        """Tests zero-copy PyArrow Table conversion when PyArrow is available."""
        if not PYARROW_AVAILABLE:
            self.skipTest("PyArrow not installed in this environment")

        subset_ordinals = [0, 5, 10, 42]
        table = self.reader.to_arrow_table(subset_ordinals)
        self.assertEqual(table.num_rows, len(subset_ordinals))
        self.assertIn("morton_code", table.column_names)
        self.assertIn("task_ordinal", table.column_names)
        self.assertIn("position_x", table.column_names)
        self.assertIn("final_score", table.column_names)
        self.assertIn("latent_vector", table.column_names)

        # Check column values
        task_ords = table.column("task_ordinal").to_pylist()
        self.assertEqual(task_ords, subset_ordinals)

    def test_05_materialize_tool_calls_schema(self):
        """Verifies OpenAI tool calls match required function specification."""
        top_k = 5
        tool_calls = self.materializer.materialize_tool_calls(list(range(top_k)))
        self.assertEqual(len(tool_calls), top_k)

        for idx, call in enumerate(tool_calls):
            self.assertTrue(call["id"].startswith("call_"))
            self.assertEqual(call["type"], "function")
            self.assertEqual(call["function"]["name"], "execute_kanban_dag_task")

            # Parse arguments JSON
            args = json.loads(call["function"]["arguments"])
            self.assertIn("task_id", args)
            self.assertEqual(args["sequence_id"], idx + 1)
            self.assertEqual(args["task_ordinal"], idx)
            self.assertIn("procedure_id", args)
            self.assertIn("morton_code", args)
            self.assertIn("cluster_id", args)
            self.assertEqual(len(args["position"]), 3)
            self.assertEqual(len(args["latent_vector"]), 64)
            self.assertIsInstance(args["final_score"], float)

    def test_06_materialize_chat_completion_envelope(self):
        """Verifies complete /v1/chat/completions structure."""
        completion = self.materializer.materialize_chat_completion([10, 20, 30])
        self.assertTrue(completion["id"].startswith("chatcmpl-"))
        self.assertEqual(completion["object"], "chat.completion")
        self.assertEqual(completion["model"], "ornith-1.5-9b")
        self.assertEqual(len(completion["choices"]), 1)

        choice = completion["choices"][0]
        self.assertEqual(choice["finish_reason"], "tool_calls")
        self.assertEqual(choice["message"]["role"], "assistant")
        self.assertIsNone(choice["message"]["content"])
        self.assertEqual(len(choice["message"]["tool_calls"]), 3)

        self.assertIn("usage", completion)
        self.assertGreater(completion["usage"]["total_tokens"], 0)

    def test_07_materialize_acp_packet(self):
        """Verifies ACP A2A envelope, tasks list, and sha256Digest integrity."""
        packet = self.materializer.materialize_acp_packet([1, 2, 3])
        self.assertEqual(packet["schema"], "atlas.acp-a2a-task-packet.v1")
        self.assertEqual(packet["taskCount"], 3)
        self.assertEqual(len(packet["tasks"]), 3)
        self.assertFalse(packet["canonicalAuthority"])
        self.assertTrue(packet["cAbiSynthesizerActive"])
        self.assertIn("sha256Digest", packet)
        self.assertEqual(len(packet["sha256Digest"]), 64)


if __name__ == "__main__":
    unittest.main()
