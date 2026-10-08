import unittest
from atlas_compute.candidate_concept_tile_v1 import materialize

def fixture(i):
    return dict(packet_key=f"p{i}",source_revision="sr",workspace_revision="wr",
      graph_revision="gr",representation_revision="rr",domain_taxonomy_revision="dr",
      feature_schema_revision="fr",revision_status="PROVEN",
      exact_match=1.,nary_facts=[dict(fact_id="f",checksum="abc",evidence_refs=["e"],
      participant_ids=["p1","p2"],participant_roles=["subject","object"],graph_revision="gr")])

class ConceptTileTests(unittest.TestCase):
    def test_padding_masks_determinism(self):
        a=materialize([fixture(2),fixture(1)])
        b=materialize([fixture(1),fixture(2)])
        self.assertEqual(a.checksum,b.checksum)
        self.assertEqual(a.valid_rows,(1,1,0,0))
        self.assertEqual(a.missing[2],(1,)*6)
        self.assertEqual(len(a.values),4)
    def test_fact_revision_rejects(self):
        a=fixture(1);a["nary_facts"][0]["graph_revision"]="stale"
        with self.assertRaisesRegex(ValueError,"REVISION"):
            materialize([a])
    def test_duplicate_rejects(self):
        with self.assertRaisesRegex(ValueError,"DUPLICATE"):
            materialize([fixture(1),fixture(1)])
if __name__=="__main__": unittest.main()
