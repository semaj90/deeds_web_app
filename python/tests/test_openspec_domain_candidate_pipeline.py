from __future__ import annotations

import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "atlas" / "run-openspec-concurrent-nlp-oaklib-pipeline-v1.py"
SPEC = importlib.util.spec_from_file_location("openspec_domain_candidate_pipeline", SCRIPT)
PIPELINE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(PIPELINE)


class OpenSpecDomainCandidateTests(unittest.TestCase):
    def test_keyword_match_is_only_an_unreviewed_candidate(self) -> None:
        result = PIPELINE.classify_domain_candidate("build a three.js scene mesh", "", "", "")
        self.assertEqual(result["domainId"], "candidate:domain.scene_3d")
        self.assertEqual(result["status"], "UNREVIEWED_CANDIDATE")
        self.assertEqual(result["method"], "TASK_TEXT_KEYWORD_RULE")
        self.assertGreater(result["matchedKeywordCount"], 0)

    def test_no_keyword_match_stays_unclassified(self) -> None:
        result = PIPELINE.classify_domain_candidate("miscellaneous follow-up", "", "", "")
        self.assertIsNone(result["domainId"])
        self.assertEqual(result["status"], "UNCLASSIFIED_REVIEW_REQUIRED")
        self.assertEqual(result["method"], "NO_KEYWORD_MATCH")
        self.assertEqual(result["matchedKeywordCount"], 0)

    def test_change_context_can_only_produce_a_candidate(self) -> None:
        result = PIPELINE.classify_domain_candidate("review the policy", "", "parent-atlas-cache-residency", "")
        self.assertEqual(result["status"], "UNREVIEWED_CANDIDATE")
        self.assertTrue(str(result["domainId"]).startswith("candidate:"))

    def test_identity_join_requires_matching_snapshot_and_current_source_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = "openspec/changes/example/tasks.md"
            source_path = root / source
            source_path.parent.mkdir(parents=True)
            source_path.write_text("- [ ] ENG-03 implement the adapter\n", encoding="utf-8")
            source_revision = "sha256:" + hashlib.sha256(source_path.read_bytes()).hexdigest()
            task_revision = "sha256:" + "b" * 64
            stable_key = "example#1234567890abcdef"
            logical_key = "example:ENG-03"
            snapshot = {
                "schema": "atlas.openspec.workboard-task-snapshot.v1",
                "generatedAt": "2026-11-22T00:00:00Z",
                "sourceFileHashes": {source: source_revision},
                "tasks": [{
                    "taskKey": "example:10",
                    "source": source,
                    "line": 1,
                    "stableKey": stable_key,
                    "logicalTaskKey": logical_key,
                    "blockHash": task_revision,
                    "taskIdentity": {"taskRevision": task_revision, "basis": "DECLARED_ID"},
                }],
            }
            snapshot_path = root / "snapshot.json"
            snapshot_bytes = json.dumps(snapshot).encode("utf-8")
            snapshot_path.write_bytes(snapshot_bytes)
            join_row = {
                "schema": "atlas.openspec.task-inventory-workboard-join.v1",
                "source": source,
                "line": 1,
                "joinStatus": "MATCHED_EXACT_SOURCE_REVISION",
                "sourceFileRevision": source_revision,
                "workboardTaskKey": "example:10",
                "stableKey": stable_key,
                "logicalTaskKey": logical_key,
                "taskRevision": task_revision,
                "identityBasis": "DECLARED_ID",
                "taskCode": "ENG-03",
            }
            join_path = root / "join.jsonl"
            join_bytes = (json.dumps(join_row) + "\n").encode("utf-8")
            join_path.write_bytes(join_bytes)
            manifest = {
                "schema": "atlas.openspec.task-inventory-workboard-join-manifest.v1",
                "inputs": {"snapshotSha256": "sha256:" + hashlib.sha256(snapshot_bytes).hexdigest()},
                "output": {"sha256": "sha256:" + hashlib.sha256(join_bytes).hexdigest()},
                "joinStatusCounts": {"MATCHED_EXACT_SOURCE_REVISION": 1},
            }
            manifest_path = root / "join.manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            previous_root = PIPELINE.REPO_ROOT
            PIPELINE.REPO_ROOT = root
            try:
                identities, metadata = PIPELINE.load_task_identity_join(join_path, manifest_path, snapshot_path)
                self.assertEqual(identities[(source, 1)]["logicalTaskKey"], logical_key)
                self.assertEqual(metadata["logicalTaskKeys"], 1)

                source_path.write_text("- [ ] ENG-03 changed after join\n", encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "STALE_TASK_SOURCE_REVISION"):
                    PIPELINE.load_task_identity_join(join_path, manifest_path, snapshot_path)
            finally:
                PIPELINE.REPO_ROOT = previous_root


if __name__ == "__main__":
    unittest.main()
