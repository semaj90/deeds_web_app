from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from atlas_structured_value_arrow import (
    read_structured_value_arrow_mmap,
    reconstruct_structured_value,
    validate_structured_value_rows,
)


SHA = "a" * 64


def provenance(node_type: str, start: int, end: int) -> dict:
    return {
        "source_ref": "src/example.ts",
        "source_revision": "src-r1",
        "workspace_revision": "ws-r1",
        "language": "typescript",
        "parser_name": "NODE_TREE_SITTER",
        "parser_revision": "0.25.1",
        "grammar_revision": "g1",
        "node_type": node_type,
        "start_byte": start,
        "end_byte": end,
        "source_span_checksum": SHA,
        "tree_node_id": None,
        "upstream_node_id": None,
        "upstream_chunk_id": None,
        "identity_status": "SPAN_ONLY",
        "ast_path_json": "[]",
    }


def rows() -> list[dict]:
    return [
        {
            "value_ordinal": 0,
            "value_id": "v0",
            "kind": "ARRAY",
            "source_text": "[1]",
            "null_value": False,
            "boolean_value": None,
            "number_value": None,
            "string_value": None,
            "expression_node_type": None,
            "provenance": provenance("array", 0, 3),
            "members": [{"ordinal": 0, "role": "ELEMENT", "field_name": None, "child_value_ordinal": 1}],
            "entries": [],
        },
        {
            "value_ordinal": 1,
            "value_id": "v1",
            "kind": "NUMBER",
            "source_text": "1",
            "null_value": False,
            "boolean_value": None,
            "number_value": 1.0,
            "string_value": None,
            "expression_node_type": None,
            "provenance": provenance("number", 1, 2),
            "members": [],
            "entries": [],
        },
    ]


class StructuredValueArrowReferenceTests(unittest.TestCase):
    def test_validates_dense_rows_and_reconstructs_nested_value(self) -> None:
        identity_checksum, structure_checksum = validate_structured_value_rows(rows(), 0)
        self.assertRegex(identity_checksum, r"^[0-9a-f]{64}$")
        self.assertRegex(structure_checksum, r"^[0-9a-f]{64}$")
        nested = reconstruct_structured_value(rows(), 0)
        self.assertEqual(nested["kind"], "ARRAY")
        self.assertEqual(nested["members"][0]["value"]["value"], 1.0)

    def test_rejects_out_of_range_child(self) -> None:
        invalid = rows()
        invalid[0]["members"][0]["child_value_ordinal"] = 9
        with self.assertRaisesRegex(ValueError, "MEMBER_REF_OUT_OF_RANGE"):
            validate_structured_value_rows(invalid, 0)

    def test_mmap_reads_nested_arrow_file_when_pyarrow_available(self) -> None:
        try:
            import pyarrow as pa
            import pyarrow.ipc as ipc
        except ImportError:
            self.skipTest("pyarrow unavailable")

        data = rows()
        table = pa.table({
            "value_ordinal": [row["value_ordinal"] for row in data],
            "value_id": [row["value_id"] for row in data],
            "kind": [row["kind"] for row in data],
            "source_text": [row["source_text"] for row in data],
            "null_value": [row["null_value"] for row in data],
            "boolean_value": [row["boolean_value"] for row in data],
            "number_value": [row["number_value"] for row in data],
            "string_value": [row["string_value"] for row in data],
            "expression_node_type": [row["expression_node_type"] for row in data],
            "provenance": [row["provenance"] for row in data],
            "members": [row["members"] for row in data],
            "entries": [row["entries"] for row in data],
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "structured.arrow"
            with pa.OSFile(str(path), "wb") as sink:
                with ipc.new_file(sink, table.schema) as writer:
                    writer.write_table(table)
            loaded, receipt = read_structured_value_arrow_mmap(path, root_value_ordinal=0)
            self.assertEqual(loaded.num_rows, 2)
            self.assertTrue(receipt.provenance_is_struct)
            self.assertTrue(receipt.members_is_list_struct)
            self.assertTrue(receipt.entries_is_list_struct)
            self.assertFalse(receipt.canonical_authority)


if __name__ == "__main__":
    unittest.main()
