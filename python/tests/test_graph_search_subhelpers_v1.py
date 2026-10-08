import unittest
from atlas_compute.graph_search_subhelpers_v1 import (cosine,similarity_0_100,manhattan,binary_polynomial,bfs,astar,greedy_best_first)
class GraphSearchTests(unittest.TestCase):
    def test_metrics(self):
        self.assertAlmostEqual(cosine([1,0],[1,0]),1)
        self.assertAlmostEqual(similarity_0_100([1,0],[-1,0]),0)
        self.assertEqual(manhattan([0,2],[2,1]),3)
    def test_polynomial(self):
        self.assertEqual(binary_polynomial([1,0,1]),(1,0,1,0,1,0))
    def test_paths(self):
        adj={"a":["b","c"],"b":["d"],"c":["d"]}
        self.assertEqual(bfs(adj,"a"),("a","b","c","d"))
        weighted={"a":[("b",1),("c",5)],"b":[("d",1)],"c":[("d",1)]}
        self.assertEqual(astar(weighted,"a","d"),("a","b","d"))
        self.assertEqual(greedy_best_first(adj,"a","d",{"a":2,"b":1,"c":3,"d":0}),("a","b","d"))
if __name__=="__main__":unittest.main()
