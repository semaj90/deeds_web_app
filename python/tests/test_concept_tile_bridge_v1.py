import unittest
from atlas_compute.concept_tile_bridge_v1 import project_candidates
from atlas_compute.concept_tile_residency_v1 import descriptor_key,TileState,transition

def candidate():
    return dict(packet_key="p",source_revision="s",workspace_revision="w",graph_revision="g",
      representation_revision="r",domain_taxonomy_revision="d",feature_schema_revision="f",
      revision_status="PROVEN",semantic_score=.8,domain_alignment=.6,
      nary_facts=[dict(fact_id="fact",graph_revision="g",checksum="sha",
      participant_ids=["p","other"],participant_roles=["subject","object"],evidence_refs=["e"])])

class BridgeTests(unittest.TestCase):
    def test_project(self):
        t=project_candidates([candidate()])
        self.assertEqual(t.valid_rows,(1,0,0,0))
    def test_absent_participant(self):
        c=candidate()
        c["nary_facts"][0]["participant_ids"]=["a","b"]
        with self.assertRaisesRegex(ValueError,"ABSENT"): project_candidates([c])
    def test_cache_revision_changes_key(self):
        d={k:"x" for k in ("packet_key","source_revision","workspace_revision","graph_revision",
         "representation_revision","domain_taxonomy_revision","feature_schema_revision",
         "tile_checksum","evidence_checksum","cache_generation","lease_id")}
        a=descriptor_key(d)
        d["graph_revision"]="new"
        self.assertNotEqual(a,descriptor_key(d))
    def test_state_guard(self):
        t=TileState("CACHED","a")
        with self.assertRaisesRegex(ValueError,"MISMATCH"): transition(t,"CONTEXT_ADMITTED",descriptor="b")
        self.assertEqual(transition(t,"INVALIDATED",descriptor="b").state,"INVALIDATED")
if __name__=="__main__": unittest.main()
