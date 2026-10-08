from __future__ import annotations

import unittest

from pydantic import ValidationError

from oak_agent.structured_contracts_v1 import (
    FailureContextEvidenceV1,
    FindFailureContextArgsV1,
    build_failure_context_result_v1,
)


SHA = "sha256:" + ("a" * 64)


class OakAgentStructuredContractsTests(unittest.TestCase):
    def test_find_failure_context_args_are_strict_and_frozen(self) -> None:
        value = FindFailureContextArgsV1(
            request_id="req:1",
            task_profile_checksum=SHA,
            admitted_fact_ids=("fact:1",),
            admitted_fact_checksums=(SHA,),
            workspace_revision="workspace:v1",
            ontology_revision="ontology:v1",
            policy_revision="policy:v1",
        )
        self.assertFalse(value.canonical_authority)
        with self.assertRaises(ValidationError):
            FindFailureContextArgsV1.model_validate(
                {
                    **value.model_dump(),
                    "unexpected": True,
                }
            )

    def test_duplicate_fact_ids_fail_closed(self) -> None:
        with self.assertRaises(ValidationError):
            FindFailureContextArgsV1(
                request_id="req:1",
                task_profile_checksum=SHA,
                admitted_fact_ids=("fact:1", "fact:1"),
                admitted_fact_checksums=(SHA, SHA),
                workspace_revision="workspace:v1",
                ontology_revision="ontology:v1",
                policy_revision="policy:v1",
            )

    def test_failure_context_result_is_deterministic(self) -> None:
        rows = (
            FailureContextEvidenceV1(
                fact_id="fact:2",
                fact_checksum=SHA,
                evidence_ref="evidence:2",
                relation="CALLS",
                distance=2,
            ),
            FailureContextEvidenceV1(
                fact_id="fact:1",
                fact_checksum=SHA,
                evidence_ref="evidence:1",
                relation="DEFINES",
                distance=1,
            ),
        )
        a = build_failure_context_result_v1(
            request_id="req:1",
            status="AVAILABLE",
            evidence=rows,
            ontology_revision="ontology:v1",
            policy_revision="policy:v1",
            producer_revision="oak-agent:v1",
        )
        b = build_failure_context_result_v1(
            request_id="req:1",
            status="AVAILABLE",
            evidence=tuple(reversed(rows)),
            ontology_revision="ontology:v1",
            policy_revision="policy:v1",
            producer_revision="oak-agent:v1",
        )
        self.assertEqual(a, b)
        self.assertTrue(a.result_checksum.startswith("sha256:"))
        self.assertFalse(a.canonical_authority)
        self.assertFalse(a.writes_performed)


if __name__ == "__main__":
    unittest.main()
