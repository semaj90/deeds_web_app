import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("train-packet-jepa.py")
SPEC = importlib.util.spec_from_file_location("train_packet_jepa", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load JEPA trainer from {SCRIPT}")
JEPA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(JEPA)


def pair_row(anchor_vector, target_vector):
    return {
        "anchor_packet_key": "packet:a",
        "anchor_vector": anchor_vector,
        "target_packet_key": "packet:b",
        "target_vector": target_vector,
    }


class PacketJepaInputGateTests(unittest.TestCase):
    def test_accepts_flat_finite_semantic_768_vectors(self):
        vector = [1.0] + [0.0] * 767
        keys, vectors, _ = JEPA.dedupe_packet_vectors([pair_row(vector, vector)], [])

        self.assertEqual(keys, ["packet:a", "packet:b"])
        self.assertEqual(vectors["packet:a"].shape, (768,))
        self.assertEqual(vectors["packet:b"].shape, (768,))

    def test_rejects_non_768_dimensions_instead_of_dropping_rows(self):
        for dimension in (64, 128, 256, 384, 512):
            with self.subTest(dimension=dimension):
                vector = [1.0] * dimension
                with self.assertRaisesRegex(ValueError, "flat 768-D semantic_768 vector"):
                    JEPA.dedupe_packet_vectors([pair_row(vector, vector)], [])

    def test_rejects_non_finite_values(self):
        vector = [1.0] * 768
        vector[17] = float("nan")

        with self.assertRaisesRegex(ValueError, "contains non-finite values"):
            JEPA.dedupe_packet_vectors([pair_row(vector, [1.0] * 768)], [])

    def test_collapses_identical_duplicate_packet_vectors(self):
        vector = [1.0] + [0.0] * 767
        rows = [pair_row(vector, vector), pair_row(vector, vector)]

        keys, vectors, _ = JEPA.dedupe_packet_vectors(rows, [])

        self.assertEqual(keys, ["packet:a", "packet:b"])
        self.assertEqual(len(vectors), 2)

    def test_rejects_conflicting_duplicate_packet_vectors(self):
        first = [1.0] + [0.0] * 767
        second = [0.0, 1.0] + [0.0] * 766

        with self.assertRaisesRegex(ValueError, "Conflicting semantic_768 vectors.*packet:a"):
            JEPA.dedupe_packet_vectors([pair_row(first, first), pair_row(second, second)], [])

    def test_rejects_nested_vectors(self):
        vector = [[1.0] * 768]

        with self.assertRaisesRegex(ValueError, "flat 768-D semantic_768 vector"):
            JEPA.dedupe_packet_vectors([pair_row(vector, [1.0] * 768)], [])

    def test_validates_eval_vectors_with_the_same_dimension_gate(self):
        eval_row = {
            "query_packet_key": "packet:q",
            "query_vector": [1.0] * 768,
            "positive_packet_keys": ["packet:p"],
            "positive_vectors": [[1.0] * 64],
            "negative_packet_keys": [],
            "negative_vectors": [],
        }

        with self.assertRaisesRegex(ValueError, "positive_vector.*flat 768-D semantic_768 vector"):
            JEPA.dedupe_packet_vectors([], [eval_row])


if __name__ == "__main__":
    unittest.main()
