import unittest

from pydantic import ValidationError

from atlas_corpus_lib import StructuralFunctionObservationV1


SOURCE_REVISION = f"sha256:{'a' * 64}"
WORKSPACE_REVISION = f"sha256:{'b' * 64}"


def observation(**overrides):
    value = {
        "source_ref": "src/éxample.ts",
        "file_path": "src/éxample.ts",
        "source_revision": SOURCE_REVISION,
        "workspace_revision": WORKSPACE_REVISION,
        "parser_language": "typescript",
        "language_resolver_revision": "tree-sitter-language-map:v1",
        "extractor_id": "treesitter-chunker",
        "extractor_version": "4.0.0",
        "source_byte_length": 64,
        "start_byte": 8,
        "end_byte": 32,
        "symbol_name": "searchCandidates",
    }
    value.update(overrides)
    return value


class StructuralObservationTests(unittest.TestCase):
    def test_accepts_revision_bound_proposal_with_separate_utf16_lsp_range(self):
        row = StructuralFunctionObservationV1.model_validate(observation(lsp_observation={
            "server_id": "typescript-language-server",
            "server_version": "4.3.0",
            "symbol_name": "searchCandidates",
            "symbol_kind": "Function",
            "start_line": 2,
            "start_character_utf16": 4,
            "end_line": 2,
            "end_character_utf16": 22,
        }))
        self.assertEqual(row.source_ref, row.file_path)
        self.assertEqual(row.lsp_observation.position_encoding, "UTF16_CODE_UNITS")
        self.assertEqual(row.authority, "PROPOSAL_ONLY")

    def test_rejects_source_ref_file_path_mismatch(self):
        with self.assertRaisesRegex(ValidationError, "FILE_PATH_MUST_EQUAL_SOURCE_REF"):
            StructuralFunctionObservationV1.model_validate(observation(file_path="src/other.ts"))

    def test_rejects_noncanonical_or_escaping_paths(self):
        for source_ref in ("../src/a.ts", "C:/src/a.ts", "src\\a.ts", "src//a.ts"):
            with self.subTest(source_ref=source_ref):
                with self.assertRaises(ValidationError):
                    StructuralFunctionObservationV1.model_validate(observation(source_ref=source_ref, file_path=source_ref))

    def test_rejects_invalid_revisions_and_out_of_bounds_byte_spans(self):
        with self.assertRaises(ValidationError):
            StructuralFunctionObservationV1.model_validate(observation(source_revision="0"))
        with self.assertRaises(ValidationError):
            StructuralFunctionObservationV1.model_validate(observation(end_byte=65))

    def test_rejects_reversed_lsp_utf16_ranges(self):
        with self.assertRaises(ValidationError):
            StructuralFunctionObservationV1.model_validate(observation(lsp_observation={
                "server_id": "tsserver",
                "server_version": "1",
                "symbol_name": "f",
                "symbol_kind": "Function",
                "start_line": 2,
                "start_character_utf16": 4,
                "end_line": 1,
                "end_character_utf16": 9,
            }))

    def test_rejects_unreviewed_extra_identity_fields(self):
        with self.assertRaises(ValidationError):
            StructuralFunctionObservationV1.model_validate(observation(packet_key="invented"))


if __name__ == "__main__":
    unittest.main()
