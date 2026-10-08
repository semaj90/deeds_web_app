import unittest
from packet_bridge import PacketRef, ordered_features, proposal, admit_proposal, verify_proposal

class TestPacketBridge(unittest.TestCase):
    def setUp(self):
        self.ref = PacketRef("cid", "pk", "w1", "s1", "g1", "r1")
        self.registry = {"semantic": 0, "centrality": 1}

    def test_order_is_registry_defined(self):
        self.assertEqual(ordered_features({"centrality": 0.25, "semantic": 0.75}, self.registry), (0.75, 0.25))

    def test_missing_defaults_to_zero(self):
        self.assertEqual(ordered_features({"semantic": 0.75}, self.registry), (0.75, 0.0))

    def test_unknown_feature_denied(self):
        with self.assertRaises(ValueError):
            ordered_features({"surprise": 3.0}, self.registry)

    def test_bad_ordinals_denied(self):
        with self.assertRaises(ValueError):
            ordered_features({"semantic": 1.0}, {"semantic": 2})

    def test_nonfinite_and_bool_denied(self):
        for value in [float("nan"), float("inf"), True]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                ordered_features({"semantic": value}, self.registry)

    def test_digest_independent_of_dict_input_order(self):
        a = proposal(self.ref, {"semantic": 0.5, "centrality": 0.2}, self.registry)
        b = proposal(self.ref, {"centrality": 0.2, "semantic": 0.5}, self.registry)
        self.assertEqual(a["feature_digest"], b["feature_digest"])
        self.assertTrue(admit_proposal(a, self.ref, self.registry))

    def test_revision_mismatch_denied(self):
        a = proposal(self.ref, {"semantic": 0.5}, self.registry)
        stale = PacketRef("cid", "pk", "w1", "s2", "g1", "r1")
        with self.assertRaisesRegex(ValueError, "STALE_OR_MISMATCHED_PACKET"):
            admit_proposal(a, stale, self.registry)

    def test_feature_tampering_denied(self):
        a = proposal(self.ref, {"semantic": 0.5}, self.registry)
        a["features"] = (0.9, 0.0)
        with self.assertRaisesRegex(ValueError, "FEATURE_DIGEST_MISMATCH"):
            verify_proposal(a, self.ref, self.registry)

    def test_registry_remapping_denied(self):
        a = proposal(self.ref, {"semantic": 0.5}, self.registry)
        with self.assertRaisesRegex(ValueError, "FEATURE_DIGEST_MISMATCH"):
            verify_proposal(a, self.ref, {"centrality": 0, "semantic": 1})

    def test_invalid_shape_and_width_denied(self):
        a = proposal(self.ref, {"semantic": 0.5}, self.registry)
        with self.assertRaisesRegex(ValueError, "INVALID_PROPOSAL_SHAPE"):
            verify_proposal({**a, "unexpected": True}, self.ref, self.registry)
        with self.assertRaisesRegex(ValueError, "INVALID_FEATURE_WIDTH"):
            verify_proposal({**a, "features": (0.5,)}, self.ref, self.registry)

    def test_missing_revision_denied(self):
        with self.assertRaises(ValueError):
            PacketRef("cid", "pk", "w1", "", "g1", "r1")

if __name__ == "__main__":
    unittest.main()
