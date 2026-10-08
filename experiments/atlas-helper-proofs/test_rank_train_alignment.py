import unittest
from dataclasses import replace
from cpu_rank_row_alignment import QualifiedRow, align_graph_ranks
from cpu_graph_rank_features import GraphRank
from cpu_train_eval import group_split, impute_train_only, classification_report
class AlignmentTests(unittest.TestCase):
    def setUp(self):
        self.rows=[QualifiedRow("p1","s","w","g","n1"),QualifiedRow("p2","s","w","g","n2")]
        self.rank=[GraphRank("n1",.6,.4,.5),GraphRank("n2",.4,.6,.5)]
    def test_order(self):
        result=align_graph_ranks(self.rows,list(reversed(self.rank)),"g")
        self.assertEqual([r["packet_key"] for r in result],["p1","p2"])
        self.assertEqual(result[0]["pagerank"],.6)
    def test_stale_graph(self):
        with self.assertRaisesRegex(ValueError,"REVISION_UNQUALIFIED"):
            align_graph_ranks(self.rows,self.rank,"other")
    def test_missing_node(self):
        with self.assertRaisesRegex(ValueError,"GRAPH_ROW_COVERAGE_MISMATCH"):
            align_graph_ranks(self.rows,self.rank[:1],"g")
    def test_group_split(self):
        train,test=group_split([0,1,2,3],["a","a","b","b"])
        self.assertFalse(set(train)&set(test))
    def test_train_only_imputation(self):
        rows=[[1.0]*25,[100.0]*25]
        masks=[[1]*25,[0]*25]
        output,means=impute_train_only(rows,masks,(0,))
        self.assertEqual(means[0],1.0)
        self.assertEqual(output[1][0],1.0)
    def test_eval(self):
        out=classification_report([0,1,1],[0,-1,1])
        self.assertEqual(out["abstention_rate"],1/3)
if __name__=="__main__":unittest.main()
