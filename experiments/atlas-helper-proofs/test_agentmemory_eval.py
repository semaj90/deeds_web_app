import unittest
from pathlib import Path
from agentmemory_v4_eval import read_fixture,evaluate_cases
class EvalTests(unittest.TestCase):
    def setUp(self):
        self.fixture=read_fixture(Path(__file__).with_name("agentmemory-eval-fixture.json"))
    def test_ablation(self):
        out=evaluate_cases(self.fixture,{"semantic":{"semantic":1},"hybrid":{"semantic":.3,"lexical":.4,"graph":.3}},1)
        self.assertEqual(out["case_count"],2)
        self.assertGreater(out["summaries"]["hybrid"]["recall_at_k"],out["summaries"]["semantic"]["recall_at_k"])
        self.assertIsNone(out["longmemeval_score"])
    def test_reject_unqualified(self):
        self.fixture["cases"][0]["candidates"][0]["admitted"]=False
        with self.assertRaisesRegex(ValueError,"UNQUALIFIED_EVIDENCE"):
            evaluate_cases(self.fixture,{"semantic":{"semantic":1}})
    def test_duplicate(self):
        self.fixture["cases"].append(self.fixture["cases"][0])
        with self.assertRaisesRegex(ValueError,"DUPLICATE_CASE"):
            evaluate_cases(self.fixture,{"semantic":{"semantic":1}})
if __name__=="__main__":unittest.main()
