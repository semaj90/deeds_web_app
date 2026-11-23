from __future__ import annotations

import hashlib
import unittest

from python.atlas_graph_runtime.api_document_fact_v1 import (
    build_doc14_oak_mapping_review_v1,
    extract_api_document_facts_v1,
    verify_cited_api_recommendation_v1,
    verify_source_span,
)
from python.parent_atlas_ontology.oaklib_external_adapter import search_oaklib_label_candidates_v1


class ApiDocumentFactV1Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.md = "# DSPy RLM\nUse `dspy.Predict(Signature)` with CUDA >= 12.1.\n"
        self.raw = self.md.encode("utf-8")
        self.sha = f"sha256:{hashlib.sha256(self.raw).hexdigest()}"
        self.rev = "sha256:" + "a" * 64

    def _fact(self):
        return extract_api_document_facts_v1(
            document_id="doc:dspy-rlm",
            chunk_id="chunk:dspy-rlm:0",
            source_url="https://dspy.ai/api/modules/RLM/",
            source_revision=self.rev,
            markdown_text=self.md,
            heading="DSPy RLM",
            expected_content_sha256=self.sha,
        )[0]

    def _oak_bundle(self, *, ids=("dspy:Predict",)):
        ontology_revision = "sha256:" + "b" * 64
        producer_revision = "oak-adapter/v1"
        return {
            "schema": "atlas.oaklib-candidate-bundle.v1",
            "sourceSelector": "sqlite:parent-atlas-ontology",
            "ontologyRevision": ontology_revision,
            "producerRevision": producer_revision,
            "canonicalAuthority": False,
            "matches": [{"searchText": "dspy.Predict(Signature)", "externalIds": list(ids)}],
            "concepts": [
                {
                    "externalId": item,
                    "label": "DSPy Predict",
                    "ontologyRevision": ontology_revision,
                    "producerRevision": producer_revision,
                    "evidenceRefs": ["oak-search:fixture"],
                    "status": "PROPOSED",
                    "canonicalAuthority": False,
                }
                for item in ids
            ],
        }

    def test_oak_join_emits_review_only_candidate_with_exact_span(self) -> None:
        fact = self._fact()
        review = build_doc14_oak_mapping_review_v1(
            fact=fact,
            markdown_bytes=self.raw,
            expected_content_sha256=self.sha,
            oak_candidate_bundle=self._oak_bundle(),
        )
        self.assertEqual(review["status"], "SINGLE_CANDIDATE_REVIEW_REQUIRED")
        self.assertEqual(review["relationProposal"]["ontologyIds"], [])
        self.assertEqual(review["source"]["evidenceText"], fact["mention"]["text"])
        self.assertFalse(review["canonicalAuthority"])
        self.assertFalse(review["writesPerformed"])
        self.assertEqual(len(review["proposalChecksum"]), 71)
        self.assertNotIn("sqlite:parent-atlas-ontology", str(review["oak"]))

    def test_oak_adapter_output_flows_into_review_join(self) -> None:
        class FixtureOakAdapter:
            def basic_search(self, search_term):
                return ["dspy:Predict"] if search_term == "dspy.Predict(Signature)" else []

            def label(self, entity_id):
                return "DSPy Predict"

            def definition(self, entity_id):
                return "A structured prediction module."

            def relationships(self, subjects):
                return []

        bundle = search_oaklib_label_candidates_v1(
            FixtureOakAdapter(),
            terms=["dspy.Predict(Signature)"],
            source_selector="sqlite:parent-atlas-ontology",
            ontology_revision="sha256:" + "b" * 64,
            producer_revision="oak-adapter/v1",
        )
        review = build_doc14_oak_mapping_review_v1(
            fact=self._fact(),
            markdown_bytes=self.raw,
            expected_content_sha256=self.sha,
            oak_candidate_bundle=bundle,
        )
        self.assertEqual(bundle["matches"][0]["externalIds"], ["dspy:Predict"])
        self.assertEqual(review["candidates"][0]["externalId"], "dspy:Predict")
        self.assertEqual(review["relationProposal"]["ontologyIds"], [])
        self.assertFalse(review["canonicalAuthority"])

    def test_sidecar_search_response_shape_is_joined_without_leaking_source_path(self) -> None:
        fact = self._fact()
        bundle = search_oaklib_label_candidates_v1(
            type("FixtureOakAdapter", (), {
                "basic_search": lambda self, search_term: ["dspy:Predict"],
                "label": lambda self, entity_id: "DSPy Predict",
                "definition": lambda self, entity_id: "A structured prediction module.",
                "relationships": lambda self, subjects: [],
            })(),
            terms=[fact["mention"]["text"]],
            source_selector="C:/private/ontology.obo",
            ontology_revision="sha256:" + "b" * 64,
            producer_revision="sidecar/v1",
        )
        matches = bundle.pop("matches")
        response = {
            "schema": "atlas.oaklib-label-search-response.v1",
            "status": "PROPOSAL_ONLY",
            "ontologyRevision": bundle["ontologyRevision"],
            "producerRevision": bundle["producerRevision"],
            "matches": matches,
            "candidateBundle": bundle,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
        review = build_doc14_oak_mapping_review_v1(
            fact=fact,
            markdown_bytes=self.raw,
            expected_content_sha256=self.sha,
            oak_candidate_bundle=response,
        )
        self.assertEqual(review["status"], "SINGLE_CANDIDATE_REVIEW_REQUIRED")
        self.assertEqual(review["oak"]["responseSource"], "SIDECAR_LABEL_SEARCH")
        self.assertNotIn("C:/private/ontology.obo", str(review))
        response["canonicalAuthority"] = True
        with self.assertRaisesRegex(ValueError, "DOC14_OAK_SERVICE_RESPONSE_AUTHORITY_INVALID"):
            build_doc14_oak_mapping_review_v1(
                fact=fact,
                markdown_bytes=self.raw,
                expected_content_sha256=self.sha,
                oak_candidate_bundle=response,
            )

    def test_oak_join_preserves_ambiguity_and_fails_closed_on_stale_or_tampered_inputs(self) -> None:
        fact = self._fact()
        ambiguous = build_doc14_oak_mapping_review_v1(
            fact=fact,
            markdown_bytes=self.raw,
            expected_content_sha256=self.sha,
            oak_candidate_bundle=self._oak_bundle(ids=("dspy:Predict", "other:Predict")),
        )
        self.assertEqual(ambiguous["status"], "AMBIGUOUS_REVIEW_REQUIRED")
        self.assertEqual(len(ambiguous["candidates"]), 2)
        with self.assertRaisesRegex(ValueError, "DOC14_SOURCE_CONTENT_HASH_MISMATCH"):
            build_doc14_oak_mapping_review_v1(
                fact=fact,
                markdown_bytes=self.raw + b"changed",
                expected_content_sha256=self.sha,
                oak_candidate_bundle=self._oak_bundle(),
            )
        stale = self._oak_bundle()
        stale["concepts"][0]["ontologyRevision"] = "sha256:" + "c" * 64
        with self.assertRaisesRegex(ValueError, "DOC14_OAK_CANDIDATE_REVISION_MISMATCH"):
            build_doc14_oak_mapping_review_v1(
                fact=fact,
                markdown_bytes=self.raw,
                expected_content_sha256=self.sha,
                oak_candidate_bundle=stale,
            )

    def test_extracts_verified_fact_and_admits_cited_recommendation(self) -> None:
        facts = extract_api_document_facts_v1(
            document_id="doc:dspy-rlm",
            chunk_id="chunk:dspy-rlm:0",
            source_url="https://dspy.ai/api/modules/RLM/",
            source_revision=self.rev,
            markdown_text=self.md,
            heading="DSPy RLM",
            expected_content_sha256=self.sha,
        )
        self.assertGreaterEqual(len(facts), 1)
        fact = facts[0]
        self.assertEqual(fact["schema"], "atlas.api-document-fact.v1")
        self.assertTrue(
            verify_source_span(
                self.raw,
                fact["mention"]["startByte"],
                fact["mention"]["endByte"],
                fact["mention"]["text"],
            )
        )
        # Approve ontology mapping explicitly for acceptance test
        fact["relationProposal"]["status"] = "APPROVED"
        fact["relationProposal"]["ontologyRevision"] = "onto-v1"
        fact["relationProposal"]["objectRef"] = "concept:dspy_predict"

        receipt = verify_cited_api_recommendation_v1(
            question="Which DSPy API should I use?",
            answer=f"Use {fact['mention']['text']} as documented.",
            cited_fact=fact,
            markdown_bytes=self.raw,
            expected_content_sha256=self.sha,
            asserted_version_requirement="12.1",
        )
        self.assertEqual(receipt["verifiedSymbol"], fact["mention"]["text"])
        self.assertFalse(receipt["canonicalAuthority"])

    def test_fails_closed_on_all_six_invalid_conditions(self) -> None:
        # 1. Uncaptured page
        with self.assertRaisesRegex(ValueError, "UNCAPTURED_PAGE_IDENTITY_REQUIRED"):
            extract_api_document_facts_v1(
                document_id="",
                chunk_id="c1",
                source_url="https://example.com",
                source_revision=self.rev,
                markdown_text=self.md,
                heading="h",
                expected_content_sha256=self.sha,
            )

        # 2. Stale documentation hash
        with self.assertRaisesRegex(ValueError, "STALE_DOCUMENT_CONTENT_SHA256"):
            extract_api_document_facts_v1(
                document_id="d1",
                chunk_id="c1",
                source_url="https://example.com",
                source_revision=self.rev,
                markdown_text=self.md,
                heading="h",
                expected_content_sha256="sha256:" + "0" * 64,
            )

        # 3. Nonexistent API symbol
        no_api = "Plain prose without any API signatures.\n"
        no_api_sha = f"sha256:{hashlib.sha256(no_api.encode('utf-8')).hexdigest()}"
        with self.assertRaisesRegex(ValueError, "NO_API_SYMBOL_FOUND"):
            extract_api_document_facts_v1(
                document_id="d1",
                chunk_id="c1",
                source_url="https://example.com",
                source_revision=self.rev,
                markdown_text=no_api,
                heading="h",
                expected_content_sha256=no_api_sha,
            )

        fact = extract_api_document_facts_v1(
            document_id="d1",
            chunk_id="c1",
            source_url="https://example.com",
            source_revision=self.rev,
            markdown_text=self.md,
            heading="h",
            expected_content_sha256=self.sha,
        )[0]

        # 4. Unapproved ontology mapping
        with self.assertRaisesRegex(ValueError, "UNAPPROVED_ONTOLOGY_MAPPING"):
            verify_cited_api_recommendation_v1(
                question="q",
                answer=f"Use {fact['mention']['text']}",
                cited_fact=fact,
                markdown_bytes=self.raw,
                expected_content_sha256=self.sha,
            )

        fact["relationProposal"]["status"] = "APPROVED"
        fact["relationProposal"]["ontologyRevision"] = "onto-v1"
        fact["relationProposal"]["objectRef"] = "concept:dspy_predict"

        # 5. Unsupported version assertion
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_VERSION_ASSERTION"):
            verify_cited_api_recommendation_v1(
                question="q",
                answer=f"Use {fact['mention']['text']}",
                cited_fact=fact,
                markdown_bytes=self.raw,
                expected_content_sha256=self.sha,
                asserted_version_requirement="13.9",
            )

        # 6. Unsupported citation (tampered span)
        bad_fact = {**fact, "mention": {**fact["mention"], "startByte": 0, "endByte": 3}}
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SOURCE_SPAN_CITATION"):
            verify_cited_api_recommendation_v1(
                question="q",
                answer=f"Use {fact['mention']['text']}",
                cited_fact=bad_fact,
                markdown_bytes=self.raw,
                expected_content_sha256=self.sha,
            )


if __name__ == "__main__":
    unittest.main()
