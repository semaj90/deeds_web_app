"""Standard-library tests. Run from repo root:
python -m unittest discover -s scripts/atlas -p 'test_eval_boost_graph_cpu_v1.py'
"""
import importlib.util
import pathlib
import unittest
file=pathlib.Path(__file__).with_name("eval-boost-graph-cpu-v1.py")
spec=importlib.util.spec_from_file_location("boost_eval",file)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class GraphEvalTests(unittest.TestCase):
    def test_directed_not_undirected(self):
        self.assertEqual(module.bfs(3,[(1,0),(1,2)]),[0,-1,-1])
    def test_duplicate_and_self_loop(self):
        self.assertEqual(module.bfs(3,[(0,0),(0,1),(0,1)]),[0,1,-1])
    def test_seed_deterministic(self):
        self.assertEqual(module.fixture(2,10,20),module.fixture(2,10,20))
    def test_bad_bounds(self):
        with self.assertRaisesRegex(ValueError,"INVALID_GRAPH_BOUNDS"):
            module.fixture(nodes=0)
    def test_bad_edge(self):
        with self.assertRaisesRegex(ValueError,"INVALID_EDGE"):
            module.bfs(2,[(0,2)])
    def test_fail_closed_receipt(self):
        report=module.evaluate(nodes=12,edge_count=20)
        self.assertEqual(report["boost"]["status"],"NOT_CONFIGURED")
        self.assertFalse(report["admissionAuthorized"])
        self.assertFalse(report["gpuParityProven"])
        self.assertTrue(report["inputChecksum"].startswith("sha256:"))

if __name__=="__main__":
    unittest.main()
