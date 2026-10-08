"""CPU graph aggregation fixture. Optional CUDA parity is a separate proof."""
import unittest
from atlas_compute.graph_tensor_metrics_v1 import compare_tensors, benchmark_dense_aggregation

class GraphTensorMetricsTests(unittest.TestCase):
    def test_exact_comparison(self):
        a=compare_tensors([3,2,1],[3,2,1],k=2)
        self.assertEqual(a["max_absolute_error"],0.0)
        self.assertEqual(a["topk_overlap"],1.0)
    def test_invalid_pair(self):
        with self.assertRaises(ValueError):
            compare_tensors([1,2],[1])
    def test_cpu_aggregation_fixture(self):
        result=benchmark_dense_aggregation([[1.,0.],[0.,1.],[2.,2.]],[(0,2),(1,2)],graph_revision="fixture-rev",device="cpu")
        self.assertTrue(result.verified)
        self.assertEqual(result.edge_count,2)
        self.assertEqual(result.feature_dimensions,2)
if __name__=="__main__":
    unittest.main()
