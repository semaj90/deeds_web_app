import unittest
from atlas_compute.graph_gpu_proof_plan_v1 import plan
def sample():
 return ([dict(packet_key=f"p{i}",source_revision="s",workspace_revision="w",graph_revision="g",
 feature_revision="f",ordinal=i,evidence_digest="e") for i in range(2)],
 [dict(source=0,target=1,kind="CALLS",evidence_digest="e",graph_revision="g")])
class PlanTests(unittest.TestCase):
 def test_no_false_gpu_proof(self):
  n,e=sample(); result=plan(n,e)
  self.assertFalse(result.gpu_executed)
  self.assertFalse(result.lineage_readback_proven)
 def test_readback_must_match(self):
  n,e=sample(); base=plan(n,e)
  result=plan(n,e,authoritative_readback=dict(graph_revision="g",ordinal_checksum=base.ordinal_checksum,source="CANONICAL_READBACK"))
  self.assertTrue(result.lineage_readback_proven)
  self.assertFalse(result.gpu_executed)
if __name__=="__main__":unittest.main()
