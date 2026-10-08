import unittest
from cpu_regex_lut import PatternRule, compile_lut, extract_lut_features, lut_to_mlp_inputs
from cpu_mlp import MultiHeadMLP

class LexicalLUTTests(unittest.TestCase):
    def setUp(self):
        self.lut = compile_lut({"drizzle": "DATA", "sveltekit": "UI", "pgvector": "DATA"})

    def test_order_and_checksum(self):
        other = compile_lut({"pgvector": "DATA", "sveltekit": "UI", "drizzle": "DATA"})
        self.assertEqual(self.lut.checksum, other.checksum)

    def test_token_boundary(self):
        self.assertEqual(extract_lut_features("drizzle drizzlekit", self.lut)["domain_scores"]["DATA"], 1)
        self.assertEqual(extract_lut_features("nondrizzle", self.lut)["domain_scores"], {})

    def test_uppercase(self):
        result = extract_lut_features("Drizzle PGVECTOR", self.lut)
        self.assertEqual(result["domain_scores"]["DATA"], 2)

    def test_regex_rejects_unsafe(self):
        for expression in (".*", "(a+)+", "(?=x)", "[a-z]+"):
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                compile_lut({}, (PatternRule("r1", expression, "DATA"),))

    def test_duplicate_normalized_term(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE_NORMALIZED_TERM"):
            compile_lut({"Drizzle": "DATA", "drizzle": "UI"})

    def test_size_limit(self):
        with self.assertRaisesRegex(ValueError, "TEXT_LIMIT"):
            extract_lut_features("a" * 65537, self.lut)

    def test_mlp_bridge(self):
        features = extract_lut_features("Drizzle SvelteKit", self.lut)
        registry = {"domain_data": 0, "domain_ui": 1}
        x = lut_to_mlp_inputs(features, registry)
        model = MultiHeadMLP(registry)
        p, value = model.forward(x)
        self.assertGreaterEqual(p, 0)
        self.assertLessEqual(p, 1)
        self.assertFalse(features["admitted"])

if __name__ == "__main__":
    unittest.main()
