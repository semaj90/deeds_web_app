import json
import unittest
from pathlib import Path
from cpu_parity_cli import matrix_object
class ParityTests(unittest.TestCase):
    def test_fixture(self):
        p=Path(__file__).with_name("c25-parity-fixture.json")
        result=matrix_object(json.loads(p.read_text()))
        self.assertEqual(result["candidate_count"],2)
        self.assertEqual(len(result["candidate_features"]),50)
        self.assertEqual(result["presence_mask"][1],1)
        self.assertEqual(result["presence_mask"][3],0)
        self.assertEqual(result["presence_mask"][25+2],1)
if __name__=="__main__": unittest.main()
