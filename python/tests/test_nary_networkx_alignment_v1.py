import unittest
from atlas_compute.nary_networkx_alignment_v1 import build_snapshot,bounded_neighbors,pagerank_cpu

def fact(fid="f",revision="g"):
    return dict(fact_id=fid,graph_revision=revision,checksum="hash",evidence_refs=["ev"],
      participant_ids=["a","b"],participant_roles=["subject","object"])
class TestNaryAlignment(unittest.TestCase):
    def test_deterministic(self):
        a=build_snapshot([fact("a"),fact("b")],graph_revision="g")
        b=build_snapshot([fact("b"),fact("a")],graph_revision="g")
        self.assertEqual(a.checksum,b.checksum)
    def test_bounded_incidence(self):
        s=build_snapshot([fact()],graph_revision="g")
        self.assertEqual(bounded_neighbors(s,packet_key="a",max_hops=2),("fact:f","packet:b"))
    def test_revision_failure(self):
        with self.assertRaisesRegex(ValueError,"REVISION"): build_snapshot([fact(revision="old")],graph_revision="g")
    def test_pagerank(self):
        s=build_snapshot([fact()],graph_revision="g")
        p=pagerank_cpu(s)
        self.assertAlmostEqual(sum(p.values()),1.0)
if __name__=="__main__": unittest.main()
