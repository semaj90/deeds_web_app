import unittest
from cpu_graph_rank_features import rank_directed
class GraphRankTests(unittest.TestCase):
    def test_reverse_rank(self):
        try: result=rank_directed(["A","B","C"],[("A","B"),("B","C")])
        except ImportError: self.skipTest("networkx absent")
        scores={r.node:r for r in result}
        self.assertGreater(scores["C"].pagerank,scores["A"].pagerank)
        self.assertGreater(scores["A"].cheirank,scores["C"].cheirank)
    def test_unknown_node(self):
        try:
            with self.assertRaisesRegex(ValueError,"UNQUALIFIED_EDGE"):
                rank_directed(["A"],[("A","B")])
        except ImportError: self.skipTest("networkx absent")
class TorchTests(unittest.TestCase):
    def test_train_cpu(self):
        try:
            from cpu_torch_alignment import train_classifier_cpu
            data=[[float(i%2)]*25 for i in range(8)]
            out=train_classifier_cpu(data,[i%2 for i in range(8)],epochs=15)
            self.assertLess(out["final_loss"],out["initial_loss"])
        except ImportError: self.skipTest("torch absent")
    def test_kmeans(self):
        try:
            from cpu_torch_alignment import kmeans_cpu
            out=kmeans_cpu([[0.0,0.0],[1.0,1.0],[10.0,10.0]],2)
            self.assertEqual(len(out["labels"]),3)
            self.assertFalse(out["canonical_authority"])
        except ImportError: self.skipTest("torch absent")
if __name__=="__main__":unittest.main()
