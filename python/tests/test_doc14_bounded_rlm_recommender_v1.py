from __future__ import annotations

import hashlib
import json
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

from python.atlas_graph_runtime.doc14_bounded_rlm_recommender_v1 import (
    _canonical_sha256_v1,
    _validate_context_manifest_v2,
    make_dspy_predict_synthesizer_v1,
    read_verified_source_span,
    select_bounded_evidence_span_v1,
    run_bounded_dspy_recommendation_with_ace_manifest_v1,
    run_bounded_rlm_recommendation_v1,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


class Doc14BoundedRlmRecommenderTests(unittest.TestCase):
    def _rec(self, cid: str, ref: str, text: str) -> dict:
        return {
            "chunkId": cid,
            "sourceRef": ref,
            "sourceRevision": "sha256:" + "a" * 64,
            "chunkSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "text": text,
            "pgReadbackStatus": "PROVEN",
            "lineageMembershipStatus": "EXACT_SINGLE_MEMBER",
            "lineageRevisionStatus": "PROVEN",
        }

    def test_bounded_rlm_returns_verified_utf8_citations(self) -> None:
        text = "Résumé 🔍: context-assembler builds bounded ACE ContextManifest packets."
        rec = self._rec("c1", "sveltekit-frontend/src/lib/server/ace/context-assembler.ts", text)
        out = run_bounded_rlm_recommendation_v1(
            question="How does context-assembler build ContextManifest?",
            records=[rec],
            max_iters=6,
            max_llm_calls=8,
            max_output_chars=3000,
        )
        self.assertEqual(out["status"], "VERIFIED_CITATIONS_READY")
        self.assertFalse(out["canonicalAuthority"])
        self.assertFalse(out["writesPerformed"])
        self.assertGreaterEqual(len(out["citations"]), 1)
        c0 = out["citations"][0]
        self.assertEqual(
            text.encode("utf-8")[c0["startByte"]:c0["endByte"]].decode("utf-8"),
            c0["verifiedText"],
        )

    def test_fails_closed_on_tampered_chunk_or_bad_span(self) -> None:
        rec = self._rec("c1", "a.ts", "hello world")
        rec["chunkSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "CHUNK_SHA256_MISMATCH"):
            read_verified_source_span({"c1": rec}, "c1", 0, 5, "hello")

    def test_bounded_evidence_span_keeps_matching_context_and_utf8_byte_coordinates(self) -> None:
        text = "Résumé 🔍 header\n" + "unrelated filler line\n" * 100 + "bindRetrievedEvidence(sourceRef, sourceRevision, exactSpan)\n" + "tail line\n" * 20
        start, end, selected = select_bounded_evidence_span_v1(text, "How does it bind retrieved evidence?", max_span_bytes=1200)
        raw = text.encode("utf-8")
        self.assertLessEqual(end - start, 1200)
        self.assertEqual(raw[start:end].decode("utf-8"), selected)
        self.assertIn("bindRetrievedEvidence", selected)
        self.assertIn("Résumé", text[:text.index(selected)])

    def test_dspy_predict_receives_only_verified_context_and_allowlists_returned_chunks(self) -> None:
        calls = []
        contexts = []
        configured_lm = object()

        class FakeSignature:
            pass

        class FakeDspy:
            Signature = FakeSignature

            @staticmethod
            def InputField():
                return "input"

            @staticmethod
            def OutputField():
                return "output"

            @staticmethod
            def Predict(signature):
                def predict(**kwargs):
                    calls.append(kwargs)
                    return SimpleNamespace(
                        answer="Context assembler binds verified source evidence.",
                        supporting_claims=[{
                            "claim": "Context assembler binds verified source evidence.",
                            "chunkId": "c1",
                            "quote": "Context assembler binds verified source evidence.",
                        }],
                    )
                return predict

            @staticmethod
            def context(**kwargs):
                contexts.append(kwargs)
                return nullcontext()

        text = "Résumé 🔍 — Context assembler binds verified source evidence."
        rec = self._rec("c1", "src/context.ts", text)
        synth = make_dspy_predict_synthesizer_v1(
            lm_resolver=lambda: configured_lm,
            dspy_module=FakeDspy,
            model_revision="test-model:r1",
            program_revision="doc14-predict:r1",
        )
        out = run_bounded_rlm_recommendation_v1(
            question="How does context assembler bind source evidence?",
            records=[rec],
            synthesizer=synth,
        )
        self.assertEqual(out["synthesis"]["engine"], "DSPY_PREDICT")
        self.assertEqual(out["synthesis"]["supportingChunkIds"], ["c1"])
        self.assertEqual(out["synthesis"]["claimSupportStatus"], "EXACT_QUOTE_MATCH_REVIEW_REQUIRED")
        expected_start = len(rec["text"][:rec["text"].index("Context")].encode("utf-8"))
        self.assertEqual(out["synthesis"]["claimEvidence"][0]["startByte"], expected_start)
        self.assertEqual([citation["chunkId"] for citation in out["citations"]], ["c1"])
        self.assertIn("verifiedText", calls[0]["verified_evidence_json"])
        self.assertNotIn("hiddenThoughts", calls[0]["verified_evidence_json"])
        self.assertIs(contexts[0]["lm"], configured_lm)

    def test_dspy_predict_rejects_model_citation_not_in_verified_context(self) -> None:
        class FakeSignature:
            pass

        claim = {
            "claim": "Unsupported source binding.",
            "chunkId": "invented",
            "quote": "Context",
        }

        class FakeDspy:
            Signature = FakeSignature

            @staticmethod
            def InputField():
                return "input"

            @staticmethod
            def OutputField():
                return "output"

            @staticmethod
            def Predict(signature):
                return lambda **kwargs: SimpleNamespace(
                    answer="Unsupported source binding.",
                    supporting_claims=[claim],
                )

            @staticmethod
            def context(**kwargs):
                return nullcontext()

        synth = make_dspy_predict_synthesizer_v1(
            lm=object(),
            dspy_module=FakeDspy,
            model_revision="test-model:r1",
            program_revision="doc14-predict:r1",
        )
        rec = self._rec("c1", "src/context.ts", "Context assembler binds source evidence.")
        with self.assertRaisesRegex(ValueError, "DSPY_CLAIM_QUOTE_NOT_IN_VERIFIED_CONTEXT"):
            synth("How does it work?", [{
                "chunkId": "c1", "sourceRef": "src/context.ts", "sourceRevision": rec["sourceRevision"],
                "startByte": 0, "endByte": 7, "verifiedText": "Context",
            }])
        claim["unexpected"] = "must reject"
        with self.assertRaisesRegex(ValueError, "DSPY_SUPPORTING_CLAIM_FIELDS_INVALID"):
            synth("How does it work?", [{
                "chunkId": "c1", "sourceRef": "src/context.ts", "sourceRevision": rec["sourceRevision"],
                "startByte": 0, "endByte": 7, "verifiedText": "Context",
            }])

    def _ace_manifest_fixture(self):
        return {
            "schema": "atlas.context-manifest.v2",
            "v1": {
                "schema": "atlas.context-manifest.v1",
                "requestId": "req-1",
                "snapshotId": "snap-1",
                "graphRevision": "sha256:" + "c" * 64,
                "query": "How does context assembler bind source evidence?",
                "candidateBucket": 32,
                "candidateCount": 1,
                "tokenBudget": 200,
                "selectedNodeKeys": ["node-1"],
                "evidenceRefs": ["evidence:doc1"],
                "producerRevision": "test-producer",
            },
            "identityInput": {
                "selectedOrdinalSetChecksum": "sha256:" + "a" * 64,
                "evidenceRevisions": {
                    "sourceRevision": "5b1ae7544f7a7e1bf11c4b37943143b6860cd57b1678338817a73f3b4915c688",
                    "representationRevision": "repr:r1",
                    "featureRevision": "feature:r1",
                    "ontologyRevision": None,
                    "modelRevision": "model:r1",
                    "promptTemplateRevision": "prompt:r1",
                },
                "ordinalMapChecksum": "sha256:" + "c" * 64,
                "retrievalPolicyRevision": "retrieval:r1",
                "acePlaybookRevision": "ace:r1",
            },
            "identityChecksum": "7deb3130585e97f61356a2dacb5aff34de5a79a9028dfc61ebb9c98e69724d63",
        }

    def test_manifest_keeps_task_binding_inside_identity_checksum(self) -> None:
        manifest = self._ace_manifest_fixture()
        task = {
            "schema": "atlas.documentation-task-binding.v1",
            "logicalTaskKey": "parent-atlas-versioned-doc-intelligence:DOC-15",
            "taskRevision": "sha256:" + "1" * 64,
            "sourceRef": "openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md#L1131",
            "sourceFileSha256": "sha256:" + "2" * 64,
            "workboardSnapshotSha256": "sha256:" + "3" * 64,
        }
        manifest["identityInput"]["taskBinding"] = task
        identity = {
            "schema": "atlas.context-manifest-v2-identity.v1",
            "v1RequestId": manifest["v1"]["requestId"],
            "v1SnapshotId": manifest["v1"]["snapshotId"],
            "v1CandidateBucket": manifest["v1"]["candidateBucket"],
            **manifest["identityInput"],
        }
        manifest["identityChecksum"] = _canonical_sha256_v1(identity)
        verified = _validate_context_manifest_v2(manifest)
        self.assertEqual(verified["identityInput"]["taskBinding"], task)

        task["taskRevision"] = "sha256:" + "4" * 64
        with self.assertRaisesRegex(ValueError, "ACE_CONTEXT_MANIFEST_CHECKSUM_MISMATCH"):
            _validate_context_manifest_v2(manifest)
        task["taskRevision"] = "invalid"
        with self.assertRaisesRegex(ValueError, "ACE_CONTEXT_MANIFEST_TASK_BINDING_INVALID"):
            _validate_context_manifest_v2(manifest)

    def test_dspy_path_requires_verified_ace_manifest_and_exact_row_joins(self) -> None:
        class FakeSignature:
            pass

        class FakeDspy:
            Signature = FakeSignature

            @staticmethod
            def InputField():
                return "input"

            @staticmethod
            def OutputField():
                return "output"

            @staticmethod
            def Predict(signature):
                return lambda **kwargs: SimpleNamespace(
                    answer="Context assembler binds verified source evidence.",
                    supporting_claims=[{
                        "claim": "Context assembler binds verified source evidence.",
                        "chunkId": "c1",
                        "quote": "Context assembler binds verified source evidence.",
                    }],
                )

            @staticmethod
            def context(**kwargs):
                return nullcontext()

        manifest = self._ace_manifest_fixture()
        text = "Context assembler binds verified source evidence."
        rec = self._rec("c1", "src/context.ts", text)
        rec.update({"sourceRevision": "sha256:" + "b" * 64, "manifestNodeKey": "node-1", "evidenceRefs": ["evidence:doc1"]})
        out = run_bounded_dspy_recommendation_with_ace_manifest_v1(
            question="How does context assembler bind source evidence?",
            records=[rec],
            context_manifest=manifest,
            model_revision="test-model:r1",
            program_revision="doc14-predict:r1",
            dspy_module=FakeDspy,
            lm_resolver=lambda: object(),
            token_counter=lambda value: len(value.encode("utf-8")) // 4,
        )
        self.assertEqual(out["schema"], "atlas.doc14-ace-dspy-predict-recommendation.v1")
        self.assertEqual(out["contextManifestChecksum"], manifest["identityChecksum"])
        self.assertEqual(out["contextAdmission"], "ACE_CONTEXT_MANIFEST_IDENTITY_VERIFIED")
        self.assertEqual(out["citations"][0]["chunkId"], "c1")
        self.assertFalse(out["canonicalAuthority"])

        resolver_calls = []
        with self.assertRaisesRegex(ValueError, "ACE_CONTEXT_TOKEN_BUDGET_EXCEEDED"):
            run_bounded_dspy_recommendation_with_ace_manifest_v1(
                question="How does context assembler bind source evidence?", records=[rec], context_manifest=manifest,
                model_revision="test-model:r1", program_revision="doc14-predict:r1",
                token_counter=lambda value: 10_000,
                lm_resolver=lambda: resolver_calls.append("called") or object(),
                dspy_module=FakeDspy,
            )
        self.assertEqual(resolver_calls, [], "model discovery must wait until ACE context passes its token budget")

        missing_producer = {**manifest, "v1": {key: value for key, value in manifest["v1"].items() if key != "producerRevision"}}
        with self.assertRaisesRegex(ValueError, "ACE_CONTEXT_MANIFEST_FIELD_REQUIRED:producerRevision"):
            run_bounded_dspy_recommendation_with_ace_manifest_v1(
                question="How does context assembler bind source evidence?", records=[rec], context_manifest=missing_producer,
                model_revision="test-model:r1", program_revision="doc14-predict:r1",
                token_counter=lambda value: len(value), dspy_module=FakeDspy,
            )

        tampered_manifest = {**manifest, "v1": {**manifest["v1"], "query": "changed"}}
        with self.assertRaisesRegex(ValueError, "ACE_CONTEXT_MANIFEST_CHECKSUM_MISMATCH"):
            run_bounded_dspy_recommendation_with_ace_manifest_v1(
                question="changed", records=[rec], context_manifest={**manifest, "identityInput": {**manifest["identityInput"], "retrievalPolicyRevision": "tampered"}},
                model_revision="test-model:r1", program_revision="doc14-predict:r1",
                token_counter=lambda value: len(value), dspy_module=FakeDspy,
            )
        with self.assertRaisesRegex(ValueError, "ACE_CONTEXT_QUERY_MISMATCH"):
            run_bounded_dspy_recommendation_with_ace_manifest_v1(
                question="How does context assembler bind source evidence?", records=[rec], context_manifest=tampered_manifest,
                model_revision="test-model:r1", program_revision="doc14-predict:r1",
                token_counter=lambda value: len(value), dspy_module=FakeDspy,
            )

        bad_rec = {**rec, "evidenceRefs": ["evidence:other"]}
        with self.assertRaisesRegex(ValueError, "ACE_CONTEXT_EVIDENCE_OUTSIDE_MANIFEST"):
            run_bounded_dspy_recommendation_with_ace_manifest_v1(
                question="How does context assembler bind source evidence?", records=[bad_rec], context_manifest=manifest,
                model_revision="test-model:r1", program_revision="doc14-predict:r1",
                token_counter=lambda value: len(value), dspy_module=FakeDspy,
            )

        for rows, reason in (
            ([rec, {**rec, "manifestNodeKey": "other-node"}], "ACE_CONTEXT_ROW_OUTSIDE_SELECTION"),
            ([{**rec, "sourceRevision": "sha256:" + "e" * 64}], "ACE_CONTEXT_SOURCE_REVISION_SET_MISMATCH"),
        ):
            with self.assertRaisesRegex(ValueError, reason):
                run_bounded_dspy_recommendation_with_ace_manifest_v1(
                    question=manifest["v1"]["query"], records=rows, context_manifest=manifest,
                    model_revision="test-model:r1", program_revision="doc14-predict:r1",
                    token_counter=len, dspy_module=FakeDspy,
                    lm_resolver=lambda: self.fail("rejected rows must not reach the model"),
                )

    def test_legacy_chunk_jsonl_without_lineage_status_is_not_admitted(self) -> None:
        jsonl_path = REPO_ROOT / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
        records = [json.loads(l) for l in jsonl_path.read_text(encoding="utf-8").splitlines() if l.strip()]
        out = run_bounded_rlm_recommendation_v1(
            question="Where is ContextAssembler or search-runtime implemented?",
            records=records,
        )
        self.assertEqual(out["status"], "NO_ADMITTED_EVIDENCE")
        self.assertEqual(out["citations"], [])


if __name__ == "__main__":
    unittest.main()
