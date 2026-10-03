"""VAL-02 tests: Pydantic mirror parity with the TypeScript/Zod owner (fixture + canonicalSha256V1 golden vectors). No network, DB or model."""
import copy
import json
import unittest
from pathlib import Path

from pydantic import ValidationError

from atlas_doc_coordinate import canonical_encode_v1, canonical_sha256_v1
from atlas_summary_claim_validation_v1 import (
    claim_checksum_v1, dump_summary_claim_validation_v1, parse_summary_claim_validation_v1, seal_v1,
)

DOCS = Path(__file__).resolve().parents[1] / "sveltekit-frontend" / "src" / "lib" / "server" / "atlas" / "docs" / "__fixtures__"
FIXTURE = json.loads((DOCS / "summary-claim-validation-v1.fixture.json").read_text(encoding="utf-8"))
GOLDEN = json.loads((DOCS / "canonical-hash-parity-v1.golden.json").read_text(encoding="utf-8"))


def _seal_in_place(body: dict) -> dict:
    body = copy.deepcopy(body)
    body.update(seal_v1(body))
    return body


class CanonicalHashParityTests(unittest.TestCase):
    def test_python_twin_reproduces_every_typescript_golden_vector(self) -> None:
        self.assertGreaterEqual(len(GOLDEN), 15)
        for vector in GOLDEN:
            with self.subTest(vector["name"]):
                self.assertEqual(canonical_encode_v1(vector["value"]), vector["encoding"])
                self.assertEqual(canonical_sha256_v1(vector["value"]), vector["sha256"])

    def test_documented_guarantees_match_typescript(self) -> None:
        self.assertEqual(canonical_sha256_v1({"b": 1, "a": 2}), canonical_sha256_v1({"a": 2, "b": 1}))
        self.assertEqual(canonical_sha256_v1("café"), canonical_sha256_v1("café"))
        self.assertNotEqual(canonical_sha256_v1(["a", "b"]), canonical_sha256_v1(["b", "a"]))
        self.assertEqual(canonical_sha256_v1(-0.0), canonical_sha256_v1(0))
        self.assertNotEqual(canonical_sha256_v1(1), canonical_sha256_v1("1"))

    def test_python_port_rejects_what_it_cannot_prove_equal_to_typescript(self) -> None:
        with self.assertRaises(TypeError):
            canonical_encode_v1({"Not-Simple": 1})  # ordering would depend on localeCompare; refuse rather than risk a mismatch
        with self.assertRaises(TypeError):
            canonical_encode_v1(float("nan"))


class SummaryClaimValidationMirrorTests(unittest.TestCase):
    def test_fixture_objects_parse_and_round_trip_exactly(self) -> None:
        for name in ("skeleton", "populated"):
            with self.subTest(name):
                model = parse_summary_claim_validation_v1(FIXTURE[name])
                self.assertEqual(dump_summary_claim_validation_v1(model), FIXTURE[name])

    def test_recomputed_ids_and_checksums_equal_the_typescript_values(self) -> None:
        for name in ("skeleton", "populated"):
            with self.subTest(name):
                expected = seal_v1(FIXTURE[name])
                for key in ("claimChecksum", "validationId", "validationChecksum"):
                    self.assertEqual(expected[key], FIXTURE[name][key])

    def test_claim_checksum_depends_on_text_and_not_on_ordinal(self) -> None:
        body = FIXTURE["populated"]
        moved = _seal_in_place({**body, "claimOrdinal": 7})
        self.assertEqual(moved["claimChecksum"], body["claimChecksum"])
        self.assertNotEqual(moved["validationId"], body["validationId"])
        changed = _seal_in_place({**body, "claimText": body["claimText"] + " Changed."})
        self.assertNotEqual(changed["claimChecksum"], body["claimChecksum"])
        self.assertEqual(claim_checksum_v1(body["claimText"]), body["claimChecksum"])

    def test_tampering_and_unknown_fields_are_rejected(self) -> None:
        good = FIXTURE["populated"]
        for label, bad in {
            "claimText": {**good, "claimText": "changed"},
            "validationId": {**good, "validationId": "scv:" + "0" * 64},
            "validationChecksum": {**good, "validationChecksum": "0" * 64},
            "unknown field": {**good, "extra": 1},
            "authority": {**good, "canonicalAuthority": True},
            "bad chunk revision": {**good, "chunkEvidenceRevision": good["chunkEvidenceRevision"][7:]},
            "placeholder revision": _seal_in_place({**good, "validatorRevision": "latest"}),
            "negative ordinal": _seal_in_place({**good, "claimOrdinal": -1}),
        }.items():
            with self.subTest(label), self.assertRaises(ValidationError):
                parse_summary_claim_validation_v1(bad)

    def test_semantic_slot_invariants_match_the_zod_owner(self) -> None:
        good = FIXTURE["skeleton"]
        judged = {**good["semantic"], "status": "JUDGED", "verdict": "SUPPORTED", "judgeModelId": "fixture-only", "judgeModelRevision": "fixture-model:r1", "judgePromptRevision": "fixture-prompt:r1", "independenceClass": "SAME_MODEL_SEMANTIC_JUDGE"}
        parse_summary_claim_validation_v1(_seal_in_place({**good, "semantic": judged}))
        for label, slot in {
            "verdict without JUDGED": {**good["semantic"], "verdict": "SUPPORTED"},
            "JUDGED without verdict": {**judged, "verdict": None},
            "JUDGED without judge model": {**judged, "judgeModelId": None},
            "unknown verdict": {**judged, "verdict": "PROBABLY_FINE"},
            "NOT_RUN with content": {**good["semantic"], "unsupportedFragment": "x"},
        }.items():
            with self.subTest(label), self.assertRaises(ValidationError):
                parse_summary_claim_validation_v1(_seal_in_place({**good, "semantic": slot}))

    def test_ontology_slot_holds_typed_assertions_only_and_needs_a_kernel_when_run(self) -> None:
        good = FIXTURE["skeleton"]
        assertion = {"subject": "hnsw.iterative_scan", "predicate": "PART_OF", "object": "pgvector", "status": "SUPPORTED", "evidenceRef": "span:10-20"}
        parse_summary_claim_validation_v1(_seal_in_place({**good, "ontology": {"status": "PASS", "kernelRevision": "oak-kernel:r1", "assertions": [assertion]}}))
        for label, slot in {
            "run without kernel": {"status": "PASS", "kernelRevision": None, "assertions": []},
            "assertions without run": {"status": "NOT_APPLICABLE", "kernelRevision": None, "assertions": [assertion]},
            "missing evidenceRef": {"status": "PASS", "kernelRevision": "oak-kernel:r1", "assertions": [{k: v for k, v in assertion.items() if k != "evidenceRef"}]},
        }.items():
            with self.subTest(label), self.assertRaises(ValidationError):
                parse_summary_claim_validation_v1(_seal_in_place({**good, "ontology": slot}))

    def test_decision_is_structural_only_and_spans_are_claims(self) -> None:
        good = FIXTURE["skeleton"]
        for decision in ("ADMIT", "REVIEW", "REJECT"):
            parse_summary_claim_validation_v1(_seal_in_place({**good, "result": {"decision": decision, "escalationRevision": None}, "resolutionLayer": "COMPOSITE"}))
        span = {"startByte": 10, "endByte": 20, "textChecksum": "a" * 64}
        parse_summary_claim_validation_v1(_seal_in_place({**good, "sourceSpan": {"status": "VERIFIED", "spans": [span]}}))
        for bad_span in ({**span, "endByte": 10}, {**span, "textChecksum": "xyz"}, {**span, "startByte": -1}):
            with self.subTest(bad_span), self.assertRaises(ValidationError):
                parse_summary_claim_validation_v1(_seal_in_place({**good, "sourceSpan": {"status": "VERIFIED", "spans": [bad_span]}}))


if __name__ == "__main__":
    unittest.main()
