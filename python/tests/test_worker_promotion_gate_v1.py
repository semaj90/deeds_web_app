import unittest
from atlas_compute.worker_promotion_gate_v1 import FIELDS,prepare_proposal
def fixture():
    d={k:"v" for k in FIELDS}
    d["generation"]=1
    d["worker_status"]="PROPOSED"
    return d
class WorkerPromotionTests(unittest.TestCase):
    def test_only_proposed(self):
        d=fixture()
        self.assertEqual(prepare_proposal(d,d).status,"PROPOSED")
    def test_stale(self):
        a=fixture();b=fixture();b["graph_revision"]="new"
        with self.assertRaisesRegex(ValueError,"PROMOTION_STALE:graph_revision"):
            prepare_proposal(a,b)
    def test_cache_hit_not_authority(self):
        d=fixture()
        p=prepare_proposal(d,d,cache_hit=True)
        self.assertTrue(p.cache_hit)
        self.assertNotEqual(p.status,"SUCCEEDED")
if __name__=="__main__": unittest.main()
