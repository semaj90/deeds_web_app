import unittest
from cpu_nlp_lut import classify, features, tokenize
from cpu_mlp import MultiHeadMLP

class LUTTests(unittest.TestCase):
    def test_domain(self):
        self.assertEqual(classify("postgres sql transaction")[0].domain,"database")
    def test_determinism(self):
        self.assertEqual(classify("graph node DAG"),classify("graph node DAG"))
    def test_case(self):
        self.assertEqual(classify("GPU CUDA"),classify("gpu cuda"))
    def test_limit(self):
        with self.assertRaisesRegex(ValueError,"INVALID_TEXT"):
            tokenize("x"*20001)
    def test_mlp_lut_training(self):
        values=features("postgres sql transaction")
        model=MultiHeadMLP({name:i for i,name in enumerate(sorted(values))})
        loss1=model.train_step(values,1,.9,.05)
        loss2=model.train_step(values,1,.9,.05)
        self.assertLess(loss2,loss1)
    def test_not_evidence(self):
        self.assertNotIn("packet_key",features("graph node"))

if __name__=="__main__":
    unittest.main()
