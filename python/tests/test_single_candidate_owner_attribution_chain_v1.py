import unittest
from scripts.atlas.prove_single_candidate_owner_attribution_chain_v1 import (
    run_single_candidate_owner_chain_proof,
    verify_workspace_admission_grant_v1,
)


class TestSingleCandidateOwnerAttributionChainV1(unittest.TestCase):
    def test_forged_caller_current_boolean_rejected(self) -> None:
        with self.assertRaises(PermissionError) as ctx:
            verify_workspace_admission_grant_v1(
                {"current": True, "allowedSourceRefs": ["a.ts"]},
                required_source_ref="a.ts",
            )
        self.assertIn("FORGED_CALLER_CURRENT_BOOLEAN_REJECTED", str(ctx.exception))

    def test_end_to_end_single_candidate_owner_chain(self) -> None:
        report = run_single_candidate_owner_chain_proof()
        self.assertTrue(report["forgedCallerCurrentBooleanRejected"])
        self.assertTrue(report["stage1_workspaceAuthorization"]["admitted"])

        g_assertions = report["stage2_dailyGraphifyStageReceipt"]["boundaryAssertions"]
        self.assertFalse(g_assertions["searchesRetrievalCandidates"])
        self.assertFalse(g_assertions["indexesIntoDuplicatePostgresTable"])
        self.assertFalse(g_assertions["mintsRetrievalVote"])

        self.assertEqual(
            report["stage3_oaklibTaxonomyCrosswalk"]["tupleStatus"],
            "GATED_PROPOSAL_ONLY",
        )

        s4 = report["stage4_featureRowSortPairsLowRank"]
        self.assertFalse(s4["featureRowV1"]["featureLabelInNumericArray"])
        self.assertEqual(
            [p["candidateOrdinal"] for p in s4["sortPairsTieSafeOrder"]],
            [0, 2, 1],
        )
        self.assertFalse(
            s4["lowRankPrefillDescriptor"]["replacesCanonicalSemantic768"]
        )

        s5 = report["stage5_searchRuntimeFusion"]
        self.assertTrue(s5["duplicateExecutorVotesDeduplicated"])
        self.assertFalse(s5["pagerankExtraVoteMinted"])
        self.assertFalse(s5["oaklibExtraVoteMinted"])

        s6 = report["stage6_contextManifestV1"]
        self.assertTrue(s6["admitted"])
        self.assertTrue(s6["independentSourceByteReadbackVerified"])
        self.assertEqual(len(s6["admittedCandidates"]), 1)


if __name__ == "__main__":
    unittest.main()
