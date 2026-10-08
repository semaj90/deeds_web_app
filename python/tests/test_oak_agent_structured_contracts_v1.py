import unittest
import hashlib
import json

from pydantic import ValidationError

from python.oak_agent.structured_contracts_v1 import (
    FailureContextEvidenceV1,
    FindFailureContextArgsV1,
    build_failure_context_result_v1,
)


def valid_args():
    return {
        "requestId": "fixture-request-1",
        "taskProfileChecksum": "sha256:" + "a" * 64,
        "admittedFactIds": ("fact-a", "fact-b"),
        "admittedFactChecksums": ("sha256:" + "b" * 64, "sha256:" + "c" * 64),
        "workspaceRevision": "sha256:" + "d" * 64,
        "ontologyRevision": "ontology:fixture-v1",
        "policyRevision": "policy:fixture-v1",
        "maxNeighbors": 32,
        "maxHops": 2,
    }


def evidence(fact_id, fill, distance):
    return FailureContextEvidenceV1(
        factId=fact_id,
        factChecksum="sha256:" + fill * 64,
        evidenceRef=f"fixture://evidence/{fact_id}",
        relation="SUPPORTS",
        distance=distance,
    )


class OaKStructuredContractsV1Tests(unittest.TestCase):
    def test_accepts_bounded_admitted_fact_inputs(self):
        args = FindFailureContextArgsV1.model_validate(valid_args())
        self.assertFalse(args.canonicalAuthority)
        self.assertEqual(args.maxNeighbors, 32)

    def test_rejects_extra_fields_and_authority_escalation(self):
        with self.assertRaises(ValidationError):
            FindFailureContextArgsV1.model_validate({**valid_args(), "rawSql": "select 1"})
        with self.assertRaises(ValidationError):
            FindFailureContextArgsV1.model_validate({**valid_args(), "canonicalAuthority": True})

    def test_rejects_bad_limits_and_unbound_fact_checksums(self):
        with self.assertRaises(ValidationError):
            FindFailureContextArgsV1.model_validate({**valid_args(), "maxHops": 5})
        with self.assertRaises(ValidationError):
            FindFailureContextArgsV1.model_validate({**valid_args(), "maxNeighbors": 257})
        with self.assertRaises(ValidationError):
            FindFailureContextArgsV1.model_validate({**valid_args(), "admittedFactChecksums": ("sha256:" + "b" * 64,)})

    def test_result_sorting_and_checksum_are_input_order_independent(self):
        items = (evidence("fact-b", "c", 2), evidence("fact-a", "b", 1))
        first = build_failure_context_result_v1(
            request_id="fixture-request-1",
            status="AVAILABLE",
            evidence=items,
            ontology_revision="ontology:fixture-v1",
            policy_revision="policy:fixture-v1",
            producer_revision="oak-agent-contracts:v1",
        )
        second = build_failure_context_result_v1(
            request_id="fixture-request-1",
            status="AVAILABLE",
            evidence=tuple(reversed(items)),
            ontology_revision="ontology:fixture-v1",
            policy_revision="policy:fixture-v1",
            producer_revision="oak-agent-contracts:v1",
        )
        self.assertEqual(first.resultChecksum, second.resultChecksum)
        self.assertEqual([item.factId for item in first.evidence], ["fact-a", "fact-b"])
        self.assertFalse(first.canonicalAuthority)
        self.assertFalse(first.writesPerformed)
        payload = first.model_dump(mode="json", by_alias=True, exclude={"resultChecksum"})
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.assertEqual(first.resultChecksum, "sha256:" + hashlib.sha256(canonical).hexdigest())
        with self.assertRaises(ValidationError):
            first.status = "REJECTED"


if __name__ == "__main__":
    unittest.main()
