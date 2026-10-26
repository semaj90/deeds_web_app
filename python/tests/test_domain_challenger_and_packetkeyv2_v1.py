import unittest
from python.atlas_domain_challenger_v1 import run_challenger_calibration
from scripts.atlas.audit_unpacketized_bound_candidates_v2 import (
    PACKET_KEY_V2_RE,
    compute_packet_key_v2,
    run_unpacketized_dryrun_audit,
)


class TestDomainChallengerAndPacketKeyV2(unittest.TestCase):
    def test_compute_packet_key_v2_deterministic_and_fail_closed(self) -> None:
        key1 = compute_packet_key_v2("sveltekit-frontend/src/hooks.server.ts")
        key2 = compute_packet_key_v2("sveltekit-frontend/src/hooks.server.ts")
        self.assertEqual(key1, key2)
        self.assertRegex(key1, PACKET_KEY_V2_RE)

        with self.assertRaises(ValueError):
            compute_packet_key_v2("./sveltekit-frontend/src/hooks.server.ts")
        with self.assertRaises(ValueError):
            compute_packet_key_v2("sveltekit-frontend\\src\\hooks.server.ts")

    def test_unpacketized_dryrun_audit_counts(self) -> None:
        report = run_unpacketized_dryrun_audit()
        self.assertEqual(report["summary"]["totalIngested"], 150)
        self.assertEqual(report["summary"]["totalSourceRevisionBound"], 149)
        self.assertEqual(report["summary"]["alreadyJoinedInAtlasPackets"], 79)
        self.assertEqual(report["summary"]["unpacketizedBoundFiles"], 70)
        self.assertFalse(report["writesPerformed"])

    def test_challenger_calibration_shadow_only(self) -> None:
        report = run_challenger_calibration()
        self.assertEqual(report["authority"], "SHADOW_ONLY")
        self.assertFalse(report["canonicalAuthority"])
        self.assertFalse(report["writesPerformed"])
        self.assertEqual(report["summary"]["totalBoundEvaluated"], 149)
        self.assertEqual(report["okfDomainCount"], 17)


if __name__ == "__main__":
    unittest.main()
