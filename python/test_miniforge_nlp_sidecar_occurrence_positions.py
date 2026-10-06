from types import SimpleNamespace
import unittest
from unittest.mock import patch
import sys

import miniforge_nlp_sidecar as sidecar
from atlas_structural_provenance import find_occurrence_positions, occurrence_to_absolute_byte_position


class FakeNode:
    def __init__(self, node_type, start_byte, end_byte, start_point, children=None, fields=None):
        self.type = node_type
        self.start_byte = start_byte
        self.end_byte = end_byte
        self.start_point = start_point
        self.children = children or []
        self.fields = fields or {}

    def child_by_field_name(self, name):
        return self.fields.get(name)


class FakeParser:
    def __init__(self, root):
        self.root = root

    def parse(self, _source_bytes):
        return SimpleNamespace(root_node=self.root)


class TestSidecarOccurrencePositions(unittest.TestCase):
    def test_ast_evidence_attaches_exact_occurrence_positions(self):
        source = "function caller() { helper(); helper(); }"
        chunk = SimpleNamespace(
            start=0,
            end=len(source.encode("utf-8")),
            kind="function_declaration",
            symbol="caller",
            metadata={"calls": ["helper"], "dependencies": [], "imports": [], "exports": []},
        )
        seen = {}

        def find_positions(text, language, names):
            seen.update(text=text, language=language, names=names)
            return {"helper": [(0, 20), (0, 30)]}

        with (
            patch.object(sidecar, "TREESITTER_CHUNKER_AVAILABLE", True),
            patch.object(sidecar, "_code_chunks_tree_sitter", return_value=[chunk]),
            patch.object(sidecar, "_syntax_diagnostics", return_value=[]),
            patch.object(sidecar, "_package_version", return_value="test"),
            patch.object(sidecar, "find_occurrence_positions", side_effect=find_positions),
        ):
            response = sidecar._ast_evidence(sidecar.AstChunkRequest(
                source=source,
                language="typescript",
                file_path="src/caller.ts",
                source_revision="sha256:" + "a" * 64,
            ))

        self.assertEqual(seen, {"text": source, "language": "typescript", "names": ["helper"]})
        call_edges = [edge for edge in response.edges if edge.type == "CALLS"]
        self.assertEqual(len(call_edges), 1)
        self.assertEqual(call_edges[0].occurrence_positions, [[1, 20], [1, 30]])

    def test_occurrence_parser_deduplicates_same_position_from_nested_call_nodes(self):
        source = b"helper(); helper();"
        call_nodes = []
        for start in (0, 10):
            identifier = FakeNode("identifier", start, start + 6, (0, start))
            call = FakeNode("call", start, start + 8, (0, start), [identifier], {"function": identifier})
            call_nodes.append(FakeNode("call_expression", start, start + 8, (0, start), [call], {"function": identifier}))
        root = FakeNode("program", 0, len(source), (0, 0), call_nodes)
        fake_language_pack = SimpleNamespace(get_parser=lambda _language: FakeParser(root))

        with patch.dict(sys.modules, {"tree_sitter_language_pack": fake_language_pack}):
            result = find_occurrence_positions(source.decode("utf-8"), "typescript", ["helper"])

        self.assertEqual(result["helper"], [(0, 0), (0, 10)])

    def test_relative_occurrence_becomes_absolute_utf8_line_and_byte_column(self):
        source = "πrefix;\r\n  helper();"
        chunk_start_byte = len("πrefix;\r\n".encode("utf-8"))
        self.assertEqual(occurrence_to_absolute_byte_position(source, chunk_start_byte, 0, 2), (2, 2))

    def test_occurrence_byte_column_cannot_cross_source_line(self):
        with self.assertRaisesRegex(ValueError, "outside the source line"):
            occurrence_to_absolute_byte_position("one\nx", 0, 0, 4)
