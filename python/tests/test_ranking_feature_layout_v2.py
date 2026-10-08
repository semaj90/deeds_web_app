"""CPU-only layout regression tests; no optional CUDA imports."""
import unittest
from atlas_compute.ranking_alignment_v1 import align_rows
from atlas_compute.ranking_feature_layout_v2 import encode_cpu, validate_semantic_vectors, LAYOUT

class FeatureLayoutV2Tests(unittest.TestCase):
    def test_mask_kept_and_concatenated_in_known_order(self):
        row=dict(qid="q",packet_key="p",label=1,source_revision="sr",
          workspace_revision="wr",representation_revision="rr",revision_status="PROVEN",
          semantic_similarity=0.75)
        rows=align_rows([row])
        values,mask,scoring=encode_cpu(rows)
        self.assertEqual(values.shape,(1,8))
        self.assertEqual(mask.shape,(1,8))
        self.assertEqual(scoring.shape,(1,16))
        self.assertEqual(scoring[0,2],0.75)
        self.assertEqual(scoring[0,8+2],0.)
        self.assertEqual(scoring[0,8+0],1.)
        self.assertEqual(LAYOUT.semantic_dim,768)

    def test_semantic_vectors_dimension_mismatch(self):
        with self.assertRaisesRegex(ValueError,"SEMANTIC_768"):
            validate_semantic_vectors([[0.]*64],expected_rows=1)

if __name__=="__main__":
    unittest.main()
