import unittest
import numpy as np

from python.atlas_graph_runtime.document_relation_rrf_v1 import (
    admit_verified_topk,
    build_relation_proposal_v1,
    fuse_topk,
    svd_topk_recommend,
)

SHA_A = "sha256:" + "a" * 64
SHA_B = "sha256:" + "b" * 64
SHA_G = "sha256:" + "c" * 64


class DocumentRelationRrfTests(unittest.TestCase):
    def test_relation_proposal_separates_predicted_from_verified(self):
        pred = build_relation_proposal_v1(
            subject_kind="task",
            subject_id="CASE-SCENE-LIVE-04",
            subject_source_revision=SHA_A,
            object_kind="document_chunk",
            object_id="chunk-1",
            object_source_revision=SHA_B,
            predicate="TASK_RELEVANT_TO_DOCUMENT",
            method="hybrid_lowrank_v1",
            source_ref="openspec/changes/x/tasks.md#L10",
            content_sha256=SHA_B,
            graph_revision=SHA_G,
        )
        self.assertEqual(pred["relation"]["assertion"], "PREDICTED")
        self.assertEqual(pred["canonicalAuthority"], False)
        self.assertEqual(pred["writesPerformed"], False)

        ver = build_relation_proposal_v1(
            subject_kind="file",
            subject_id="a.ts",
            subject_source_revision=SHA_A,
            object_kind="file",
            object_id="b.ts",
            object_source_revision=SHA_B,
            predicate="FILE_IMPORTS_FILE",
            method="tree_sitter_ast_v1",
            source_ref="a.ts#L1",
            content_sha256=SHA_A,
            graph_revision=SHA_G,
        )
        self.assertEqual(ver["relation"]["assertion"], "VERIFIED")

    def test_svd_and_rrf_fuse_and_verify_before_ace_admission(self):
        mat = np.array([
            [0.95, 0.05, 0.2],
            [0.1, 0.95, 0.1],
            [0.1, 0.2, 0.95],
        ])
        svd_ranked = svd_topk_recommend(mat, task_index=0, doc_ids=["docA", "docB", "docC"], rank_k=2, top_k=3)
        self.assertEqual(svd_ranked[0]["chunkId"], "docA")

        fused = fuse_topk(
            lexical_ids=["docA", "docC"],
            dense_ids=["docA", "docB"],
            graph_ids=["docC", "docUnverified"],
            lowrank_ids=[r["chunkId"] for r in svd_ranked],
            k=4,
        )
        self.assertEqual(fused[0]["chunkId"], "docA")

        store = {
            "docA": {
                "taskKey": "T-1",
                "sourceRevision": SHA_A,
                "graphRevision": SHA_G,
                "supportingSpans": [[0, 120]],
                "relationPaths": [{"predicate": "TASK_REFERENCES_DOCUMENT"}],
            },
            "docC": {
                "taskKey": "T-1",
                "sourceRevision": SHA_B,
                "graphRevision": None,  # missing graphRevision for graph-lane hit
                "supportingSpans": [[10, 40]],
            },
            "docUnverified": {
                "sourceRevision": None,
                "supportingSpans": [],
            },
        }
        admitted = admit_verified_topk(fused, lambda cid: store.get(cid), limit=5)
        by_id = {row["chunkId"]: row for row in admitted}
        self.assertEqual(by_id["docA"]["admissionStatus"], "ADMITTED")
        self.assertEqual(by_id["docC"]["admissionStatus"], "UNRESOLVED")
        self.assertEqual(by_id["docC"]["rejectionReason"], "GRAPH_REVISION_REQUIRED")
        self.assertEqual(by_id["docUnverified"]["admissionStatus"], "REJECTED")
        self.assertEqual(by_id["docUnverified"]["rejectionReason"], "MISSING_SOURCE_REVISION")

    def test_admit_verified_topk_rejects_superseded_stale_crawl_and_missing_domain_tags(self) -> None:
        fused = [
            {"chunkId": "superseded", "fusionScore": 0.9, "contributingLanes": ["lexical"], "laneRanks": {"lexical": 1}},
            {"chunkId": "staleCrawl", "fusionScore": 0.8, "contributingLanes": ["lexical"], "laneRanks": {"lexical": 2}},
            {"chunkId": "untagged", "fusionScore": 0.7, "contributingLanes": ["lexical"], "laneRanks": {"lexical": 3}},
            {"chunkId": "fresh", "fusionScore": 0.6, "contributingLanes": ["lexical"], "laneRanks": {"lexical": 4}},
        ]
        store = {
            "superseded": {
                "sourceRevision": SHA_A,
                "supportingSpans": [[0, 10]],
                "supersededBy": "fresh",
                "crawlRevision": "crawl-2",
                "domainTags": ["postgres"],
            },
            "staleCrawl": {
                "sourceRevision": SHA_A,
                "supportingSpans": [[0, 10]],
                "crawlRevision": "crawl-1",
                "domainTags": ["postgres"],
            },
            "untagged": {
                "sourceRevision": SHA_A,
                "supportingSpans": [[0, 10]],
                "crawlRevision": "crawl-2",
                "domainTags": [],
            },
            "fresh": {
                "sourceRevision": SHA_A,
                "supportingSpans": [[0, 10]],
                "crawlRevision": "crawl-2",
                "domainTags": ["postgres"],
            },
        }
        admitted = admit_verified_topk(
            fused,
            lambda cid: store.get(cid),
            limit=5,
            expected_crawl_revision="crawl-2",
            require_domain_tags=True,
        )
        by_id = {row["chunkId"]: row for row in admitted}
        self.assertEqual(by_id["superseded"]["rejectionReason"], "SUPERSEDED_DOC_CHUNK")
        self.assertEqual(by_id["staleCrawl"]["rejectionReason"], "STALE_CRAWL_REVISION")
        self.assertEqual(by_id["untagged"]["rejectionReason"], "DOMAIN_TAGS_UNPOPULATED")
        self.assertEqual(by_id["fresh"]["admissionStatus"], "ADMITTED")


if __name__ == "__main__":
    unittest.main()
