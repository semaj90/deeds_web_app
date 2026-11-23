from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "atlas" / "join-openspec-task-inventory-workboard-v1.py"
SPEC = importlib.util.spec_from_file_location("openspec_task_workboard_join", SCRIPT)
JOIN = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(JOIN)


class OpenSpecTaskWorkboardJoinTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = "openspec/changes/example/tasks.md"
        self.revision = "sha256:" + "a" * 64
        self.task = {
            "taskKey": "example:10",
            "change": "example",
            "source": self.source,
            "line": 10,
            "state": "OPEN",
            "lane": "RETRIEVAL_ACE",
            "stableKey": "example#0123456789abcdef",
            "logicalTaskKey": "example:EXAMPLE-01",
            "blockHash": "sha256:" + "b" * 64,
            "taskIdentity": {
                "logicalTaskKey": "example:EXAMPLE-01",
                "taskRevision": "sha256:" + "b" * 64,
                "basis": "DECLARED_ID",
            },
            "program": {
                "classification": "TASK_TEXT_RULE",
                "matchedRule": "example-task-rule",
                "lane": "RETRIEVAL_ACE",
            },
        }
        self.snapshot = {
            "schema": JOIN.SNAPSHOT_SCHEMA,
            "generatedAt": "2026-11-22T00:00:00Z",
            "sourceFileHashes": {self.source: self.revision},
            "tasks": [self.task],
        }
        self.row = {
            "id": f"{self.source}#L10",
            "file": self.source,
            "line": 10,
            "task_code": "EXAMPLE-01",
            "status": "open",
            "sourceFileRevision": self.revision,
            "taskLineChecksum": "c" * 64,
        }

    def test_joins_only_exact_source_revision_and_location(self) -> None:
        result = JOIN.reconcile_rows([self.row], self.snapshot)[0]
        self.assertEqual(result["joinStatus"], "MATCHED_EXACT_SOURCE_REVISION")
        self.assertEqual(result["workboardTaskKey"], "example:10")
        self.assertEqual(result["logicalTaskKey"], "example:EXAMPLE-01")
        self.assertEqual(result["taskRevision"], self.task["blockHash"])
        self.assertEqual(result["taskCode"], "EXAMPLE-01")
        self.assertEqual(result["programLabelDisposition"], "HEURISTIC_CANDIDATE_ONLY")
        self.assertIsNone(result["reviewedTaskDomainLabel"])

    def test_source_revision_mismatch_never_attaches_workboard_identity(self) -> None:
        row = {**self.row, "sourceFileRevision": "sha256:" + "d" * 64}
        result = JOIN.reconcile_rows([row], self.snapshot)[0]
        self.assertEqual(result["joinStatus"], "STALE_SOURCE_REVISION")
        self.assertIsNone(result["stableKey"])
        self.assertIsNone(result["logicalTaskKey"])

    def test_file_outside_workboard_scope_is_not_fuzzy_joined(self) -> None:
        row = {**self.row, "file": "local/other/tasks.md"}
        result = JOIN.reconcile_rows([row], self.snapshot)[0]
        self.assertEqual(result["joinStatus"], "OUTSIDE_WORKBOARD_SNAPSHOT_SCOPE")
        self.assertIsNone(result["workboardTaskKey"])

    def test_duplicate_source_locations_are_ambiguous(self) -> None:
        duplicate = {**self.task, "taskKey": "example:10-copy", "stableKey": "example#fedcba9876543210"}
        snapshot = {**self.snapshot, "tasks": [self.task, duplicate]}
        result = JOIN.reconcile_rows([self.row], snapshot)[0]
        self.assertEqual(result["joinStatus"], "AMBIGUOUS_WORKBOARD_LOCATION")
        self.assertIsNone(result["workboardTaskKey"])

    def test_inconsistent_snapshot_task_revision_is_rejected(self) -> None:
        task = {**self.task, "taskIdentity": {**self.task["taskIdentity"], "taskRevision": "sha256:" + "e" * 64}}
        snapshot = {**self.snapshot, "tasks": [task]}
        result = JOIN.reconcile_rows([self.row], snapshot)[0]
        self.assertEqual(result["joinStatus"], "WORKBOARD_TASK_REVISION_INCONSISTENT")
        self.assertIsNone(result["stableKey"])

    def test_rejects_unrecognized_snapshot_schema(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported workboard snapshot schema"):
            JOIN.reconcile_rows([self.row], {**self.snapshot, "schema": "wrong.v1"})


if __name__ == "__main__":
    unittest.main()
