import hashlib
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from parent_atlas_ontology.language_coverage_v1 import (
    build_language_coverage_v2,
    build_language_coverage_evidence_join_v1,
    build_language_coverage_evidence_join_v2,
    load_graphify_overlay,
    verify_language_coverage_v2,
    verify_language_coverage_evidence_join_v1,
    verify_language_coverage_evidence_join_v2,
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
    (repo / ".vscode").mkdir()
    (repo / ".vscode" / "tasks.json").write_text("{\"version\": 1}", encoding="utf-8")
    (repo / ".env").write_text("TOKEN=not-read", encoding="utf-8")
    (repo / ".git").mkdir()
    (repo / ".git" / "HEAD").write_text("ref: refs/heads/main", encoding="utf-8")
    (repo / ".tmp" / "cache").mkdir(parents=True)
    (repo / ".tmp" / "cache" / "cached.ts").write_text("cached", encoding="utf-8")
    (profiles / "typescript.yaml").write_text(
        "language: typescript\nextensions:\n  - .ts\n  - .svelte.ts\n", encoding="utf-8"
    )
    (profiles / "python.yaml").write_text(
        "language: python\nextensions:\n  - .py\n", encoding="utf-8"
    )
    return repo, profiles


def _parser_receipt(results=None):
    receipt = {
        "schema": "atlas.language-coverage-live-parser-fixtures.v1",
        "authority": {"canonicalAuthority": False, "productionWrites": False},
        "sidecar": {
            "languageAuthorityOwner": "sidecar::_AST_LANGUAGE_EXTENSIONS",
            "languageAuthorityRevision": "sha256:" + "b" * 64,
            "treeSitterChunkerVersion": "4.0.0",
        },
        "results": results or [{
            "language": "python",
            "extension": ".py",
            "status": "FIXTURE_PASSED",
            "spanValidation": "STRICT_UTF8_BOUNDARIES_VERIFIED",
            "sourceRevision": "sha256:" + "c" * 64,
            "spans": [{"valid": True}],
            "authorityOwner": "sidecar::_AST_LANGUAGE_EXTENSIONS",
            "authorityRevision": "sha256:" + "b" * 64,
            "chunkCount": 1,
        }],
    }
    canonical = json.dumps(receipt, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    receipt["receiptSha256"] = hashlib.sha256(canonical).hexdigest()
    return receipt


def _source_fixture_receipt(repository_root: Path, fixtures=None):
    producer = repository_root / "python" / "miniforge_nlp_sidecar.py"
    producer.parent.mkdir(parents=True, exist_ok=True)
    producer.write_text("sidecar source fixture", encoding="utf-8")
    fixture_rows = fixtures or [{
        "language": "typescript",
        "filePath": "fixture.ts",
        "sourceRevision": "sha256:" + "e" * 64,
        "syntaxStatus": "CLEAN",
        "scanCompleteness": "COMPLETE",
        "chunkCount": 1,
        "byteSpansValid": True,
    }]
    receipt = {
        "schema": "atlas.parser-fixture-e2e-receipt.v1",
        "status": "SOURCE_FIXTURES_PASS_DEPLOYMENT_PENDING",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "sidecar": {
            "status": "ok",
            "languagePackVersion": "0.9.0",
            "chunkerVersion": "4.0.0",
            "liveBindingRevision": "sha256:" + "d" * 64,
            "processRestarted": False,
        },
        "fixtures": fixture_rows,
        "fixtureCount": len(fixture_rows),
        "allSyntaxClean": True,
        "allScansComplete": True,
        "allByteSpansValid": True,
        "sourceSha256": {
            "python/miniforge_nlp_sidecar.py": hashlib.sha256(producer.read_bytes()).hexdigest(),
        },
    }
    body = json.dumps(receipt, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    receipt["receiptSha256"] = hashlib.sha256(body).hexdigest()
    return receipt


class LanguageCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.repo, self.profiles = _fixture(Path(self.temp_dir.name))

    def build(self, **kwargs):
        return build_language_coverage_v2(
            grammar_catalog=kwargs.pop("grammar_catalog", _catalog()),
            repository_root=kwargs.pop("repository_root", self.repo),
            profile_dir=kwargs.pop("profile_dir", self.profiles),
            **kwargs,
        )

    def test_inventory_is_deterministic_and_includes_dependency_cache_and_venv_trees(self):
        first_paths = []
        second_paths = []
        first = self.build(path_writer=first_paths.append)
        second = self.build(path_writer=second_paths.append)

        self.assertEqual(first, second)
        self.assertEqual(first_paths, second_paths)
        self.assertEqual(first["coverageCounts"]["grammarCatalogCandidates"], 2)
        self.assertEqual(first["coverageCounts"]["repositoryMappedLanguages"], 2)
        self.assertEqual(first["coverageCounts"]["repositoryUnmappedOrAmbiguousExtensions"], 3)
        self.assertEqual(first["workspace"]["fileCount"], 10)
        self.assertEqual(first["workspace"]["enumerationStatus"], "COMPLETE")
        relative_paths = {row["relativePath"] for row in first_paths}
        self.assertIn("node_modules/ignored.ts", relative_paths)
        self.assertIn(".tmp/cache/cached.ts", relative_paths)
        self.assertIn(".venv-cu130/Lib/ignored.cu", relative_paths)
        self.assertIn(".git", relative_paths)
        self.assertEqual(first["workspace"]["roleCounts"]["DEPENDENCY_TREE"], 2)
        self.assertEqual(first["workspace"]["roleCounts"]["CACHE_OR_TEMP"], 3)
        self.assertEqual(first["workspace"]["roleCounts"]["VIRTUAL_ENVIRONMENT"], 3)
        self.assertEqual(first["workspace"]["roleCounts"]["REPOSITORY_METADATA"], 2)
        self.assertEqual(first["workspace"]["pathManifestSha256"], hashlib.sha256(
            b"".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n" for row in first_paths)
        ).hexdigest())
        verify_language_coverage_v2(first)

    def test_files_outside_source_scope_are_labeled_and_not_counted_as_languages(self):
        paths = []
        scope = {"src/a.ts", "src/c.py", "src/unknown.xyzlang", ".vscode/tasks.json", ".env"}
        inventory = self.build(path_writer=paths.append, source_scope=scope)
        outside = {row["relativePath"] for row in paths if row["indexingStatus"] == "NOT_IN_GIT_SOURCE_SCOPE"}
        self.assertEqual(outside, {
            "src/b.svelte.ts",
            "node_modules/ignored.ts",
            ".git/HEAD",
            ".tmp/cache/cached.ts",
            ".venv-cu130/Lib/ignored.cu",
        })
        typescript = next(row for row in inventory["languageMatrix"] if row["languageId"] == "typescript")
        self.assertEqual(typescript["fileCountInCorpus"], 4)
        self.assertEqual(inventory["workspace"]["roleCounts"]["WORKTREE_FILE"], 6)
        self.assertEqual(next(row for row in paths if row["relativePath"] == "node_modules/ignored.ts")["role"], "DEPENDENCY_TREE")

    def test_mapping_and_parser_evidence_are_distinct(self):
        inventory = self.build()
        typescript = next(row for row in inventory["languageMatrix"] if row["languageId"] == "typescript")

        self.assertEqual(typescript["extensions"], [".svelte.ts", ".ts"])
        self.assertEqual(typescript["fileCountInCorpus"], 4)
        self.assertEqual(typescript["parserCandidateFiles"], 2)
        self.assertEqual(typescript["grammarAvailability"], "CATALOG_CANDIDATE_NOT_RUNTIME_PROOF")
        self.assertEqual(typescript["parserOwnerStatus"], "NOT_JOINED_TO_INVENTORY")
        self.assertEqual(typescript["parserFixtureStatus"], "NOT_JOINED_TO_RUN_EVIDENCE")
        self.assertEqual(typescript["spanValidationStatus"], "NOT_JOINED_TO_RUN_EVIDENCE")
        self.assertEqual(typescript["compilerLspStatus"], "NOT_JOINED_TO_RUN_EVIDENCE")

    def test_dot_paths_are_audit_only_and_not_parser_candidates(self):
        inventory = self.build()
        dot_rows = [row for row in inventory["languageMatrix"] if row["languageId"] == "typescript"]
        self.assertEqual(dot_rows[0]["dotPathAuditOnlyFiles"], 1)
        paths = []
        self.build(path_writer=paths.append)
        vscode = next(row for row in paths if row["relativePath"] == ".vscode/tasks.json")
        env = next(row for row in paths if row["relativePath"] == ".env")
        self.assertEqual(vscode["editPolicy"], "AUDIT_ONLY_NEVER_EDIT")
        self.assertEqual(vscode["parserEligibility"], "AUDIT_ONLY")
        self.assertEqual(env["editPolicy"], "AUDIT_ONLY_NEVER_EDIT")
        self.assertEqual(env["sizeBytes"], len("TOKEN=not-read"))

    def test_graphify_overlay_is_labeled_snapshot_membership_not_parse_proof(self):
        overlay = {
            "qualificationStatus": "UNQUALIFIED_SNAPSHOT_MEMBERSHIP",
            "memberships": {
                "src/a.ts": [{"sourceRef": "src/a.ts", "sourceRevision": "sha256:old"}],
                "src/b.svelte.ts": [
                    {"sourceRef": "src/b.svelte.ts", "sourceRevision": "sha256:one"},
                    {"sourceRef": "src/b.svelte.ts", "sourceRevision": "sha256:two"},
                ],
            },
        }
        paths = []
        inventory = self.build(graphify_overlay=overlay, path_writer=paths.append)
        by_path = {row["relativePath"]: row for row in paths}
        self.assertEqual(by_path["src/a.ts"]["graphifyMembership"], "SNAPSHOT_MEMBER_UNQUALIFIED")
        self.assertEqual(by_path["src/b.svelte.ts"]["graphifyMembership"], "DUPLICATE_SNAPSHOT_MEMBERSHIP")
        self.assertEqual(by_path["src/a.ts"]["snapshotRows"][0]["sourceRevision"], "sha256:old")
        self.assertEqual(inventory["graphifyOverlay"]["pathMembershipSemantics"], "SOURCE_SNAPSHOT_MEMBERSHIP_NOT_SYMBOL_PARSE_STATUS")

    def test_snapshot_loader_joins_repository_relative_paths_and_fails_closed(self):
        receipt_path = self.repo / "authority.json"
        manifest_path = self.repo / "snapshot.json"
        manifest_path.write_text(json.dumps({
            "schema": "atlas.workspace-source-snapshot-capture.v1",
            "status": "CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK",
            "canonicalAuthority": False,
            "datastoreWritesPerformed": False,
            "repositories": [{"relativePath": ""}, {"relativePath": "nested"}],
            "sources": [{
                "repositoryId": "repo:nested",
                "repositoryPath": "nested",
                "repositoryRelativePath": "src/module.py",
                "sourceRef": "nested/src/module.py",
                "sourceRevision": "sha256:abc",
                "contentDigest": "abc",
            }],
            "sourceMembershipChecksum": "sha256:reported",
        }), encoding="utf-8")
        receipt_path.write_text(json.dumps({
            "schema": "atlas.current-graphify-snapshot-authority.v1",
            "status": "CURRENT_SNAPSHOT_PROVEN",
            "sourceSnapshot": {
                "workspaceRevision": "sha256:old",
                "snapshotRevision": "sha256:snapshot",
                "snapshotManifestPath": str(manifest_path),
            },
        }), encoding="utf-8")
        overlay = load_graphify_overlay(self.repo, receipt_path)
        self.assertEqual(overlay["qualificationStatus"], "UNQUALIFIED_SNAPSHOT_MEMBERSHIP")
        self.assertEqual(overlay["sourceCountReported"], 1)
        self.assertEqual(overlay["memberships"]["nested/src/module.py"][0]["sourceRevision"], "sha256:abc")

    def test_syntax_failure_does_not_become_parser_validation(self):
        (self.repo / "src" / "broken.ts").write_text("export const = ;", encoding="utf-8")
        inventory = self.build()
        typescript = next(row for row in inventory["languageMatrix"] if row["languageId"] == "typescript")
        self.assertEqual(typescript["parserFixtureStatus"], "NOT_JOINED_TO_RUN_EVIDENCE")
        self.assertEqual(inventory["coverageCounts"]["parserFixturesVerified"], 0)

    def test_incomplete_path_scan_fails_acceptance(self):
        inventory = self.build()
        inventory["workspace"]["enumerationStatus"] = "PARTIAL_SCAN_ERRORS"
        body = {key: value for key, value in inventory.items() if key != "inventorySha256"}
        canonical = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        inventory["inventorySha256"] = hashlib.sha256(canonical).hexdigest()
        with self.assertRaisesRegex(ValueError, "LANGUAGE_COVERAGE_ENUMERATION_INCOMPLETE"):
            verify_language_coverage_v2(inventory)

    def test_duplicate_extension_mapping_is_reported_unmapped(self):
        (self.profiles / "javascript.yaml").write_text(
            "language: javascript\nextensions:\n  - .ts\n", encoding="utf-8"
        )
        inventory = self.build()

        self.assertIn(".ts", {row["extension"] for row in inventory["unmappedExtensions"]})
        typescript = next(row for row in inventory["languageMatrix"] if row["languageId"] == "typescript")
        self.assertEqual(typescript["extensions"], [".svelte.ts"])
        self.assertEqual(typescript["fileCountInCorpus"], 1)

    def test_tampered_inventory_fails_checksum_validation(self):
        inventory = self.build()
        inventory["coverageCounts"]["repositoryMappedLanguages"] = 140

        with self.assertRaisesRegex(ValueError, "LANGUAGE_COVERAGE_CHECKSUM_MISMATCH"):
            verify_language_coverage_v2(inventory)

    def test_parser_evidence_join_is_reproducible_and_does_not_promote_language(self):
        inventory = self.build()
        receipt = _parser_receipt()
        first = build_language_coverage_evidence_join_v1(inventory, receipt)
        second = build_language_coverage_evidence_join_v1(inventory, receipt)
        self.assertEqual(first, second)
        self.assertEqual(first["coverageCounts"]["fixtureLanguagesPassed"], 1)
        self.assertEqual(first["coverageCounts"]["wholeRepositoryParserCoverage"], "NOT_ESTABLISHED_BY_CONTROLLED_FIXTURES")
        python_row = next(row for row in first["languageMatrix"] if row["languageId"] == "python")
        self.assertEqual(python_row["parserFixtureStatus"], "FIXTURE_PASSED")
        self.assertEqual(python_row["compilerLspStatus"], "NOT_TESTED")
        self.assertEqual(first["runtimeParserFixtures"][0]["repositoryParserCandidateFiles"], 1)
        verify_language_coverage_evidence_join_v1(first)
        first["runtimeParserFixtures"][0]["fixtureChunkCount"] = 999
        with self.assertRaisesRegex(ValueError, "JOIN_CHECKSUM_MISMATCH"):
            verify_language_coverage_evidence_join_v1(first)

    def test_parser_evidence_join_rejects_bad_receipt_and_unqualified_fixture(self):
        inventory = self.build()
        bad_checksum = _parser_receipt()
        bad_checksum["results"][0]["status"] = "FIXTURE_FAILED"
        with self.assertRaisesRegex(ValueError, "PARSER_RECEIPT_CHECKSUM_MISMATCH"):
            build_language_coverage_evidence_join_v1(inventory, bad_checksum)
        unqualified = _parser_receipt([{
            **_parser_receipt()["results"][0],
            "spanValidation": "NOT_VALIDATED",
        }])
        with self.assertRaisesRegex(ValueError, "PARSER_FIXTURE_NOT_QUALIFIED"):
            build_language_coverage_evidence_join_v1(inventory, unqualified)

    def test_combined_evidence_join_keeps_source_fixtures_deployment_pending(self):
        inventory = self.build()
        live_receipt = _parser_receipt()
        source_receipt = _source_fixture_receipt(self.repo)
        result = build_language_coverage_evidence_join_v2(
            inventory,
            [live_receipt, source_receipt],
            repository_root=self.repo,
        )
        self.assertEqual(result["coverageCounts"]["fixtureLanguagesPassed"], 2)
        self.assertEqual(result["coverageCounts"]["liveParserFixtureCount"], 1)
        self.assertEqual(result["coverageCounts"]["sourceTestFixtureCount"], 1)
        typescript = next(row for row in result["languageMatrix"] if row["languageId"] == "typescript")
        self.assertEqual(typescript["parserFixtureStatus"], "SOURCE_FIXTURE_PASSED_DEPLOYMENT_PENDING")
        self.assertEqual(typescript["runtimeActivationStatus"], "DEPLOYMENT_PENDING")
        self.assertEqual(result["canonicalAuthority"], False)
        verify_language_coverage_evidence_join_v2(result)

    def test_combined_evidence_join_rejects_receipt_tamper_and_stale_producer(self):
        inventory = self.build()
        live_receipt = _parser_receipt()
        bad_receipt = _source_fixture_receipt(self.repo)
        bad_receipt["fixtures"][0]["byteSpansValid"] = False
        with self.assertRaisesRegex(ValueError, "SOURCE_FIXTURE_CHECKSUM_MISMATCH"):
            build_language_coverage_evidence_join_v2(inventory, [live_receipt, bad_receipt], repository_root=self.repo)

        stale_producer = _source_fixture_receipt(self.repo)
        (self.repo / "python" / "miniforge_nlp_sidecar.py").write_text("changed producer", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "SOURCE_FIXTURE_PRODUCER_CHECKSUM_MISMATCH"):
            build_language_coverage_evidence_join_v2(inventory, [live_receipt, stale_producer], repository_root=self.repo)

    def test_combined_evidence_join_rejects_unknown_extension_and_tampered_join(self):
        inventory = self.build()
        live_receipt = _parser_receipt()
        source_receipt = _source_fixture_receipt(self.repo, [{
            "language": "unknown",
            "filePath": "fixture.unknown",
            "sourceRevision": "sha256:" + "e" * 64,
            "syntaxStatus": "CLEAN",
            "scanCompleteness": "COMPLETE",
            "chunkCount": 1,
            "byteSpansValid": True,
        }])
        with self.assertRaisesRegex(ValueError, "SOURCE_FIXTURE_PROFILE_UNRESOLVED"):
            build_language_coverage_evidence_join_v2(inventory, [live_receipt, source_receipt], repository_root=self.repo)

        valid_receipt = _source_fixture_receipt(self.repo)
        result = build_language_coverage_evidence_join_v2(inventory, [live_receipt, valid_receipt], repository_root=self.repo)
        result["coverageCounts"]["sourceTestFixtureCount"] += 1
        with self.assertRaisesRegex(ValueError, "JOIN_CHECKSUM_MISMATCH"):
            verify_language_coverage_evidence_join_v2(result)

    def test_combined_evidence_join_rejects_duplicate_or_failed_fixture_rows(self):
        inventory = self.build()
        live_receipt = _parser_receipt()
        fixture = {
            "language": "typescript",
            "filePath": "fixture.ts",
            "sourceRevision": "sha256:" + "e" * 64,
            "syntaxStatus": "CLEAN",
            "scanCompleteness": "COMPLETE",
            "chunkCount": 1,
            "byteSpansValid": True,
        }
        duplicate = _source_fixture_receipt(self.repo, [fixture, fixture])
        with self.assertRaisesRegex(ValueError, "SOURCE_FIXTURE_ROW_INVALID"):
            build_language_coverage_evidence_join_v2(inventory, [live_receipt, duplicate], repository_root=self.repo)

        failed = _source_fixture_receipt(self.repo, [{**fixture, "syntaxStatus": "ERROR"}])
        with self.assertRaisesRegex(ValueError, "SOURCE_FIXTURE_ROW_INVALID"):
            build_language_coverage_evidence_join_v2(inventory, [live_receipt, failed], repository_root=self.repo)

    def test_combined_evidence_join_rejects_duplicate_receipt_paths(self):
        with self.assertRaisesRegex(ValueError, "PARSER_RECEIPT_PATH_DUPLICATE"):
            build_language_coverage_evidence_join_v2(
                self.build(),
                [_parser_receipt(), _source_fixture_receipt(self.repo)],
                repository_root=self.repo,
                parser_fixture_receipt_paths=["same.json", "same.json"],
            )

    def test_invalid_catalog_and_sample_limit_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "LANGUAGE_COVERAGE_CATALOG_SCHEMA_INVALID"):
            self.build(grammar_catalog={})
        with self.assertRaisesRegex(ValueError, "LANGUAGE_COVERAGE_SAMPLE_LIMIT_INVALID"):
            self.build(sample_limit=0)

    def test_symlink_is_recorded_without_following(self):
        target = self.repo / "src" / "linked-target.ts"
        target.write_text("export const linked = true", encoding="utf-8")
        link = self.repo / "src" / "linked.ts"
        try:
            link.symlink_to(target)
        except (OSError, NotImplementedError):
            paths = []
            with patch(
                "parent_atlas_ontology.language_coverage_v1._is_link_or_junction",
                side_effect=lambda candidate: candidate.name == "src" and candidate.is_dir(),
            ):
                self.build(path_writer=paths.append)
            by_path = {row["relativePath"]: row for row in paths}
            self.assertEqual(by_path["src"]["entryKind"], "SYMLINK_OR_JUNCTION")
            self.assertNotIn("src/a.ts", by_path)
            return
        paths = []
        self.build(path_writer=paths.append)
        linked = next(row for row in paths if row["relativePath"] == "src/linked.ts")
        self.assertEqual(linked["entryKind"], "SYMLINK_OR_JUNCTION")
        self.assertEqual(linked["role"], "LINK_ONLY")
        self.assertEqual(linked["parserEligibility"], "NOT_PARSER_INPUT")


if __name__ == "__main__":
    unittest.main()
