import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from parent_atlas_ontology.language_coverage_v1 import (
    build_language_coverage_v1,
    verify_language_coverage_v1,
)


def _catalog():
    catalog = {
        "schema": "atlas.okf-tree-sitter-language-catalog.v1",
        "catalogId": "tree-sitter-language-pack",
        "source": {
            "packageName": "tree-sitter-language-pack",
            "packageVersion": "1.14.0",
            "manifestSha256": "a" * 64,
        },
        "entries": [
            {"grammarId": "python", "qualification": "CANDIDATE"},
            {"grammarId": "typescript", "qualification": "CANDIDATE"},
        ],
        "namespace": "PARSER_GRAMMAR_ID",
        "lspServerBindings": [],
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    canonical = json.dumps(catalog, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    catalog["catalogSha256"] = hashlib.sha256(canonical).hexdigest()
    return catalog


def _fixture(tmp_path: Path):
    repo = tmp_path / "repo"
    profiles = tmp_path / "profiles"
    (repo / "src").mkdir(parents=True)
    profiles.mkdir()
    (repo / "src" / "a.ts").write_text("export const a = 1;", encoding="utf-8")
    (repo / "src" / "b.svelte.ts").write_text("export const b = 2;", encoding="utf-8")
    (repo / "src" / "c.py").write_text("print('c')", encoding="utf-8")
    (repo / "src" / "unknown.xyzlang").write_text("", encoding="utf-8")
    (repo / "node_modules").mkdir()
    (repo / "node_modules" / "ignored.ts").write_text("ignored", encoding="utf-8")
    (repo / ".venv-cu130" / "Lib").mkdir(parents=True)
    (repo / ".venv-cu130" / "Lib" / "ignored.cu").write_text("ignored", encoding="utf-8")
    (profiles / "typescript.yaml").write_text(
        "language: typescript\nextensions:\n  - .ts\n  - .svelte.ts\n", encoding="utf-8"
    )
    (profiles / "python.yaml").write_text(
        "language: python\nextensions:\n  - .py\n", encoding="utf-8"
    )
    return repo, profiles


class LanguageCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.repo, self.profiles = _fixture(Path(self.temp_dir.name))

    def build(self, **kwargs):
        return build_language_coverage_v1(
            grammar_catalog=kwargs.pop("grammar_catalog", _catalog()),
            repository_root=kwargs.pop("repository_root", self.repo),
            profile_dir=kwargs.pop("profile_dir", self.profiles),
            **kwargs,
        )

    def test_inventory_is_deterministic_and_keeps_catalog_separate_from_corpus(self):
        first = self.build()
        second = self.build()

        self.assertEqual(first, second)
        self.assertEqual(first["coverageCounts"]["grammarCatalogCandidates"], 2)
        self.assertEqual(first["coverageCounts"]["repositoryMappedLanguages"], 2)
        self.assertEqual(first["coverageCounts"]["repositoryUnmappedExtensions"], 1)
        self.assertEqual(first["workspace"]["filesWithRecognizedOrUnknownExtensions"], 4)
        self.assertNotIn("node_modules/ignored.ts", str(first))
        verify_language_coverage_v1(first)

    def test_longest_extension_match_and_parser_evidence_stay_unverified(self):
        inventory = self.build()
        typescript = next(row for row in inventory["observedLanguages"] if row["languageId"] == "typescript")

        self.assertEqual(typescript["extensions"], [".svelte.ts", ".ts"])
        self.assertEqual(typescript["fileCount"], 2)
        self.assertEqual(typescript["grammarRuntimeAvailability"], "NOT_PROBED")
        self.assertEqual(typescript["parserFixtureStatus"], "NOT_RUN")
        self.assertEqual(typescript["astChunkCoverage"], "NOT_MEASURED")
        self.assertEqual(typescript["compilerLspStatus"], "NOT_BOUND")

    def test_duplicate_extension_mapping_is_reported_unmapped(self):
        (self.profiles / "javascript.yaml").write_text(
            "language: javascript\nextensions:\n  - .ts\n", encoding="utf-8"
        )
        inventory = self.build()

        self.assertIn(".ts", {row["extension"] for row in inventory["unmappedExtensions"]})
        typescript = next(row for row in inventory["observedLanguages"] if row["languageId"] == "typescript")
        self.assertEqual(typescript["extensions"], [".svelte.ts"])
        self.assertEqual(typescript["fileCount"], 1)

    def test_tampered_inventory_fails_checksum_validation(self):
        inventory = self.build()
        inventory["coverageCounts"]["repositoryMappedLanguages"] = 140

        with self.assertRaisesRegex(ValueError, "LANGUAGE_COVERAGE_CHECKSUM_MISMATCH"):
            verify_language_coverage_v1(inventory)

    def test_invalid_catalog_and_sample_limit_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "LANGUAGE_COVERAGE_CATALOG_SCHEMA_INVALID"):
            self.build(grammar_catalog={})
        with self.assertRaisesRegex(ValueError, "LANGUAGE_COVERAGE_SAMPLE_LIMIT_INVALID"):
            self.build(sample_limit=0)


if __name__ == "__main__":
    unittest.main()
