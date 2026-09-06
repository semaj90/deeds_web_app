"""Tests for extract_code_blocks_and_signatures + its chunk_document() wiring
(parent-atlas-versioned-doc-intelligence, DOC-05).
"""

from __future__ import annotations

import unittest

from atlas_external_docs import chunk_document, extract_code_blocks_and_signatures


class CodeBlocksAndSignaturesTests(unittest.TestCase):
    def test_fenced_code_block_extracted_with_language(self) -> None:
        text = "Some prose.\n\n```python\ndef kernel(x):\n    return x\n```\n\nMore prose."
        code_blocks, _signatures = extract_code_blocks_and_signatures(text)
        self.assertEqual(len(code_blocks), 1)
        self.assertEqual(code_blocks[0]["language"], "python")
        self.assertIn("def kernel(x):", code_blocks[0]["code"])

    def test_fenced_code_block_without_language_is_none_not_empty_string(self) -> None:
        text = "```\nraw text block\n```"
        code_blocks, _signatures = extract_code_blocks_and_signatures(text)
        self.assertEqual(len(code_blocks), 1)
        self.assertIsNone(code_blocks[0]["language"])

    def test_multiple_code_blocks_all_extracted_in_order(self) -> None:
        text = "```python\na = 1\n```\ntext\n```sql\nSELECT 1\n```"
        code_blocks, _signatures = extract_code_blocks_and_signatures(text)
        self.assertEqual([b["language"] for b in code_blocks], ["python", "sql"])

    def test_function_and_class_signatures_detected(self) -> None:
        text = "```python\ndef kernel(x, y):\n    return x + y\n\nclass TileBuffer:\n    pass\n```"
        _code_blocks, signatures = extract_code_blocks_and_signatures(text)
        self.assertTrue(any(sig.startswith("def kernel(x, y)") for sig in signatures))
        self.assertTrue(any(sig.startswith("class TileBuffer") for sig in signatures))

    def test_sql_ddl_signature_detected(self) -> None:
        text = "```sql\nCREATE TABLE atlas_external_doc_pages (id uuid);\n```"
        _code_blocks, signatures = extract_code_blocks_and_signatures(text)
        self.assertTrue(any(sig.upper().startswith("CREATE TABLE") for sig in signatures))

    def test_inline_backtick_call_detected_as_signature(self) -> None:
        text = "Call `cutile.tile_load(ptr, shape)` to load a tile."
        _code_blocks, signatures = extract_code_blocks_and_signatures(text)
        self.assertIn("cutile.tile_load(ptr, shape)", signatures)

    def test_signatures_deduplicated_across_sources(self) -> None:
        text = "```python\ndef foo(x):\n    return x\n```\nSee `foo(x)` above? no, `def foo(x)` differs."
        _code_blocks, signatures = extract_code_blocks_and_signatures(text)
        # "def foo(x)" (from the fence) is distinct from the inline "foo(x)" call --
        # both legitimate, but each must appear only once even though the fence's
        # own text and the surrounding prose both mention the symbol.
        self.assertEqual(signatures.count("def foo(x):"), 1)

    def test_plain_prose_yields_no_code_blocks_or_signatures(self) -> None:
        code_blocks, signatures = extract_code_blocks_and_signatures("Just a sentence with no code.")
        self.assertEqual(code_blocks, ())
        self.assertEqual(signatures, ())

    def test_chunk_document_wires_code_blocks_and_signatures_per_chunk(self) -> None:
        text = (
            "# Usage\n"
            "Overview text.\n\n"
            "```python\n"
            "def kernel(x):\n"
            "    return x\n"
            "```\n\n"
            "## API\n"
            "Call `cutile.tile_load(ptr, shape)` to load a tile.\n"
        )
        chunks = chunk_document(
            source_id="nvidia-tile-ir",
            source_revision="sha256:" + "a" * 64,
            source_url="https://docs.nvidia.com/cuda/tile-ir/",
            title="Tile IR",
            text=text,
        )
        usage_chunk = next(c for c in chunks if c.heading_path == ("Usage",))
        api_chunk = next(c for c in chunks if c.heading_path == ("Usage", "API"))
        self.assertEqual(len(usage_chunk.code_blocks), 1)
        self.assertEqual(usage_chunk.code_blocks[0]["language"], "python")
        self.assertIn("cutile.tile_load(ptr, shape)", api_chunk.api_signatures)
        # Backward compat: fields are optional-with-defaults, so a chunk with no
        # code/signatures still round-trips through to_dict() cleanly.
        serialized = usage_chunk.to_dict()
        self.assertIn("code_blocks", serialized)
        self.assertIn("api_signatures", serialized)

    def test_heading_regex_does_not_misfire_on_hash_comment_inside_fence(self) -> None:
        """Regression guard for the _heading_sections fence-awareness fix: a
        Python "# comment" at column 0 inside a fenced code block must not be
        treated as a markdown heading and split the code block apart."""
        text = (
            "# Usage\n"
            "Intro.\n\n"
            "```python\n"
            "# Load the tile\n"
            "import cutile\n"
            "```\n\n"
            "## Next\n"
            "More.\n"
        )
        chunks = chunk_document(
            source_id="s1",
            source_revision="sha256:" + "b" * 64,
            source_url="https://example.test/",
            title="T",
            text=text,
        )
        usage_chunk = next(c for c in chunks if c.heading_path == ("Usage",))
        self.assertIn("# Load the tile", usage_chunk.text)
        self.assertEqual(len(usage_chunk.code_blocks), 1)
        # "Load the tile" must NOT appear as its own heading path anywhere.
        self.assertNotIn(("Load the tile",), [c.heading_path for c in chunks])
