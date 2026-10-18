"""Offline tests for ace_packet_proposal_v1 (stdlib unittest; no network, DB, GPU or LLM).

Run from the repo root:  python -m unittest discover -s scripts/atlas -p "test_ace_packet_proposal_v1.py"
The TypeScript parity test needs `node` and packages/parent-atlas/dist (skipped otherwise); the torch parity test needs
torch (skipped on interpreters without it, e.g. run it with the WSL atlas-rapids-cu13 python).
"""
from __future__ import annotations

import copy
import json
import math
import os
import shutil
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ace_packet_proposal_v1 as ace  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFEST = "sha256:" + "a" * 64
T = [
    ("P2", "E9", 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8),
    ("P1", "E2", 0.9, None, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6),
    ("P1", "E1", 0.0, 1.0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5),
]


def payload(rows=None):
    return ace.to_alignment_payload_v1(
        rows or ace.build_feature_rows_v1(T), alignment_revision="align:r1", feature_snapshot_revision="feat:r1",
        producer_revision="ace-proposal-adapter:r1", source_snapshot_revision="snap:r1",
    )


def good_proposal(align):
    return {
        "schema": ace.PROPOSAL_SCHEMA, "packetKey": "P1", "workspaceRevision": "ws:r1", "sourceRevision": "src:r1",
        "contextManifestChecksum": MANIFEST, "featureSignalAlignmentChecksum": align, "modelRevision": "ornith-1.5-9b",
        "policyRevision": "policy:r1", "evidenceRefs": ["E2", "E1"],
        "task": {"kind": "diagnose", "instruction": "Diagnose the supplied failure.", "expectedOutputSchema": ace.REPAIR_OUTPUT_SCHEMA},
        "advisoryOnly": True,
    }


class FeatureRows(unittest.TestCase):
    def test_order_independent_and_sorted(self):
        a = ace.build_feature_rows_v1(T)
        b = ace.build_feature_rows_v1(list(reversed(T)))
        self.assertEqual(a, b)
        self.assertEqual([(r["packet_key"], r["evidence_ref"]) for r in a], [("P1", "E1"), ("P1", "E2"), ("P2", "E9")])
        self.assertEqual(payload(a)["output_checksum"], payload(b)["output_checksum"])

    def test_missing_is_masked_not_zero_measured(self):
        r = {(x["packet_key"], x["evidence_ref"]): x for x in ace.build_feature_rows_v1(T)}[("P1", "E2")]
        self.assertEqual(r["values"][1], 0.0)
        self.assertEqual(r["presence"][1], 0)
        self.assertEqual(sum(r["presence"]), 7)

    def test_fail_closed_inputs(self):
        for bad in (math.nan, math.inf, -0.1, 1.1, True, "0.5"):
            with self.assertRaises(ValueError, msg=repr(bad)):
                ace.build_feature_rows_v1([("P", "E", bad, 0, 0, 0, 0, 0, 0, 0)])
        with self.assertRaises(ValueError):
            ace.build_feature_rows_v1([("P", "E", 0, 0, 0, 0, 0, 0, 0)])  # short tuple
        with self.assertRaises(ValueError):
            ace.build_feature_rows_v1([T[0], T[0]])  # duplicate identity
        with self.assertRaises(ValueError):
            ace.build_feature_rows_v1([])
        with self.assertRaises(ValueError):
            ace.build_feature_rows_v1([("", "E", 0, 0, 0, 0, 0, 0, 0, 0)])

    def test_payload_shape(self):
        p = payload()
        self.assertEqual(p["schema"], ace.ALIGNMENT_SCHEMA)
        self.assertIs(p["canonical_authority"], False)
        self.assertEqual(p["row_count"], 3)
        self.assertEqual(p["concatenated_dimensions"], 16)
        self.assertEqual([b["kind"] for b in p["blocks"]], ["continuous", "binary_mask"])
        self.assertEqual(p["blocks"][1]["normalization"], "binary_01")
        self.assertEqual(len({b["row_identity_checksum"] for b in p["blocks"]}), 1)
        with self.assertRaises(ValueError):
            ace.to_alignment_payload_v1(ace.build_feature_rows_v1(T), alignment_revision="", feature_snapshot_revision="f",
                                        producer_revision="p", source_snapshot_revision="s")

    def test_value_change_changes_checksum(self):
        t2 = [list(x) for x in T]
        t2[0][2] = 0.11
        self.assertNotEqual(payload()["output_checksum"], payload(ace.build_feature_rows_v1(t2))["output_checksum"])

    @unittest.skipUnless(shutil.which("node") and os.path.exists(os.path.join(REPO, "packages/parent-atlas/dist/core/feature-signal-alignment.js")),
                         "node or packages/parent-atlas/dist missing")
    def test_typescript_contract_accepts_payload_and_checksum_matches(self):
        js = (
            "import {featureSignalAlignmentSchema as s, checksumFeatureSignalAlignment as c} from "
            "'./packages/parent-atlas/dist/core/feature-signal-alignment.js';"
            "let d='';process.stdin.on('data',x=>d+=x).on('end',()=>{const p=JSON.parse(d);const v=s.parse(p);"
            "const {output_checksum,...rest}=v;console.log(JSON.stringify({ok:true,tsChecksum:c(rest),given:p.output_checksum}))});"
        )
        out = subprocess.run(["node", "--input-type=module", "-e", js], input=json.dumps(payload()), text=True,
                             capture_output=True, cwd=REPO, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        res = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertTrue(res["ok"])
        self.assertEqual(res["tsChecksum"], res["given"], "Python stable()/sha256 must equal the TS contract checksum")

    def test_torch_parity(self):
        try:
            import torch  # noqa: F401
        except ImportError:
            self.skipTest("torch not installed in this interpreter")
        res = ace.verify_torch_parity(ace.build_feature_rows_v1(T))
        self.assertTrue(res["valuesChecksumMatches"] and res["presenceChecksumMatches"], res)


class Proposal(unittest.TestCase):
    def setUp(self):
        self.align = payload()["output_checksum"]
        self.kw = dict(context_manifest_checksum=MANIFEST, allowed_evidence_refs=["E1", "E2", "E3"],
                       allowed_packet_keys=["P1"], alignment_output_checksum=self.align)

    def test_accepts_and_normalizes(self):
        v = ace.validate_ace_packet_proposal_v1(good_proposal(self.align), **self.kw)
        self.assertEqual(v["evidenceRefs"], ["E1", "E2"])
        self.assertIs(v["canonicalAuthority"], False)
        self.assertTrue(v["proposalChecksum"].startswith("sha256:") and len(v["proposalChecksum"]) == 71)
        again = ace.validate_ace_packet_proposal_v1(good_proposal(self.align), **self.kw)
        self.assertEqual(v["proposalChecksum"], again["proposalChecksum"])  # deterministic

    def _reject(self, mutate, needle):
        p = good_proposal(self.align)
        mutate(p)
        with self.assertRaises(ValueError) as cm:
            ace.validate_ace_packet_proposal_v1(p, **self.kw)
        self.assertIn(needle, str(cm.exception))

    def test_rejections(self):
        self._reject(lambda p: p.update(evidenceRefs=["E1", "E999"]), "UNAUTHORIZED_EVIDENCE_REF")
        self._reject(lambda p: p.update(packetKey="P9"), "UNAUTHORIZED_PACKET_KEY")
        self._reject(lambda p: p.update(contextManifestChecksum="sha256:" + "b" * 64), "CONTEXT_MANIFEST_CHECKSUM_MISMATCH")
        self._reject(lambda p: p.update(featureSignalAlignmentChecksum="c" * 64), "FEATURE_ALIGNMENT_CHECKSUM_MISMATCH")
        self._reject(lambda p: p.update(advisoryOnly=False), "advisoryOnly")
        self._reject(lambda p: p.update(workspaceRevision=""), "workspaceRevision")
        self._reject(lambda p: p.update(modelRevision="  "), "modelRevision")
        self._reject(lambda p: p.update(evidenceRefs=["E1", "E1"]), "duplicates")
        self._reject(lambda p: p.update(evidenceRefs=[]), "non-empty")
        self._reject(lambda p: p.update(extra="x"), "exactly")
        self._reject(lambda p: p["task"].update(kind="delete_everything"), "task.kind")
        self._reject(lambda p: p["task"].update(expectedOutputSchema="atlas.other.v1"), "expectedOutputSchema")
        self._reject(lambda p: p["task"].update(instruction="x" * 2001), "max_instruction_chars")

    def test_hidden_state_keys_rejected_anywhere(self):
        for key in ("chainOfThought", "hiddenThoughts", "kv_cache", "tensor", "reasoning_content"):
            p = copy.deepcopy(good_proposal(self.align))
            p["task"][key] = "x"
            with self.assertRaises(ValueError) as cm:
                ace.validate_ace_packet_proposal_v1(p, **self.kw)
            self.assertIn("FORBIDDEN_KEY", str(cm.exception), key)

    def test_never_defaults_a_revision(self):
        p = good_proposal(self.align)
        del p["sourceRevision"]
        with self.assertRaises(ValueError):
            ace.validate_ace_packet_proposal_v1(p, **self.kw)

    def test_dspy_wrapper_output_is_untrusted_until_validated(self):
        class Pred:  # stands in for a dspy.Prediction
            task_kind, instruction, evidence_refs = "diagnose", "Diagnose it.", ["E1", "NOT_IN_MANIFEST"]
        prop = ace.proposal_from_prediction_v1(
            Pred, packet_key="P1", workspace_revision="ws:r1", source_revision="src:r1", context_manifest_checksum=MANIFEST,
            alignment_output_checksum=self.align, model_revision="m:r1", policy_revision="p:r1")
        with self.assertRaises(ValueError) as cm:
            ace.validate_ace_packet_proposal_v1(prop, **self.kw)
        self.assertIn("UNAUTHORIZED_EVIDENCE_REF", str(cm.exception))


class Outcome(unittest.TestCase):
    def chain(self):
        a = ace.build_outcome_receipt_v1(proposal_checksum="sha256:" + "1" * 64, prompt_plan_checksum="plan:abc", model_revision="m:r1",
                                         status="SUCCEEDED", validator_verdict="ACCEPT", previous_receipt_checksum=None, tests_passed=True)
        b = ace.build_outcome_receipt_v1(proposal_checksum="sha256:" + "2" * 64, prompt_plan_checksum=None, model_revision="m:r1",
                                         status="REJECTED", validator_verdict="UNAUTHORIZED_EVIDENCE_REF",
                                         previous_receipt_checksum=a["receiptChecksum"])
        return a, b

    def test_chain_verifies_and_never_writes(self):
        a, b = self.chain()
        self.assertTrue(ace.verify_receipt_chain_v1([a, b]))
        self.assertIs(a["writesPerformed"], False)
        self.assertIs(a["canonicalAuthority"], False)

    def test_tamper_and_reorder_detected(self):
        a, b = self.chain()
        t = dict(a, status="FAILED")
        self.assertFalse(ace.verify_receipt_chain_v1([t, b]))
        self.assertFalse(ace.verify_receipt_chain_v1([b, a]))
        self.assertFalse(ace.verify_receipt_chain_v1([b]))  # first receipt must have no predecessor

    def test_bad_inputs(self):
        with self.assertRaises(ValueError):
            ace.build_outcome_receipt_v1(proposal_checksum="nope", prompt_plan_checksum=None, model_revision="m", status="SUCCEEDED",
                                         validator_verdict="ok", previous_receipt_checksum=None)
        with self.assertRaises(ValueError):
            ace.build_outcome_receipt_v1(proposal_checksum="sha256:" + "1" * 64, prompt_plan_checksum=None, model_revision="m",
                                         status="PROMOTED", validator_verdict="ok", previous_receipt_checksum=None)


if __name__ == "__main__":
    unittest.main()
