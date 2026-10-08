import unittest
from ontology_unknown_router import route_unknown, oak_tuple_candidates
class UnknownTests(unittest.TestCase):
    def setUp(self):
        self.taxonomy={"database":("sql",),"graph":("edge",),"retrieval":("vector",)}
    def test_proposal(self):
        result=route_unknown("postgres sql transaction",self.taxonomy)
        self.assertEqual(result.status,"PROPOSAL_ONLY")
        self.assertTrue(result.evidence_required)
    def test_ambiguity(self):
        self.assertEqual(route_unknown("unrecognized",self.taxonomy).domain,"UNKNOWN")
    def test_allowed_candidates(self):
        result=route_unknown("postgres sql transaction",self.taxonomy)
        self.assertEqual(oak_tuple_candidates(result,{"database":("SQL",)}),(("database","SQL"),))
    def test_invalid_threshold(self):
        with self.assertRaisesRegex(ValueError,"INVALID_THRESHOLDS"):
            route_unknown("x",self.taxonomy,minimum=2)
if __name__=="__main__":unittest.main()
