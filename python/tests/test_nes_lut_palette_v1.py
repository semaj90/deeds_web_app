import sys
import json
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_compute.nes_lut_palette import load_nes_lut_palette
from parent_atlas_learning.ace_compiler import compile_ace_packet_from_proposal


class TestNesLutPaletteV1(unittest.TestCase):
    def test_ace_returns_separate_domain_byte_and_nes_color(self):
        manifest = {"checksum": "sha256:manifest", "evidenceRefs": ["src/routes/+server.ts"]}
        proposal = {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": "palette-test",
            "conceptId": "drizzle-query",
            "evidenceRefs": ["src/routes/+server.ts"],
            "instruction": "Inspect the route evidence.",
            "contextManifestChecksum": "sha256:manifest",
        }
        packet = compile_ace_packet_from_proposal(
            proposal, context_manifest=manifest, domain="database", created_at="2026-10-23T00:00:00Z"
        )
        self.assertEqual(packet["nes_lut"]["lut_byte"], 0x05)
        self.assertEqual(packet["nes_lut"]["nes_hex"], "0x12")
        self.assertEqual(packet["nes_lut"]["mapping_status"], "EXACT_SHARED_PALETTE")
        self.assertEqual(
            packet["bitfrost_caching"]["centroid_lru_key"],
            "bitfrost:centroid:lru:cuml-kmeans-k16-nes-domain-palette-v1-0x12",
        )
        self.assertFalse(packet["canonical_authority"])
        self.assertFalse(packet["writes_performed"])

    def test_unknown_domain_falls_back_without_becoming_unresolved(self):
        manifest = {"checksum": "sha256:manifest", "evidenceRefs": ["src/file.ts"]}
        proposal = {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": "unknown-domain-test",
            "conceptId": "unknown",
            "evidenceRefs": ["src/file.ts"],
            "instruction": "Review the evidence.",
            "contextManifestChecksum": "sha256:manifest",
        }
        packet = compile_ace_packet_from_proposal(
            proposal, context_manifest=manifest, domain="not-a-domain", created_at="2026-10-23T00:00:00Z"
        )
        self.assertEqual(packet["nes_lut"]["resolved_domain"], "general")
        self.assertEqual(packet["nes_lut"]["lut_byte"], 0x0A)
        self.assertEqual(packet["nes_lut"]["mapping_status"], "UNKNOWN_DOMAIN_FALLBACK_GENERAL")

    def test_shared_palette_has_unique_nonzero_domain_ordinals(self):
        palette = load_nes_lut_palette()
        ordinals = [row["lutByte"] for row in palette["domains"].values()]
        self.assertEqual(len(ordinals), 10)
        self.assertEqual(len(set(ordinals)), 10)
        self.assertNotIn(palette["unresolved"]["lutByte"], ordinals)

    def test_tampered_palette_checksum_fails_closed(self):
        palette_path = REPO_ROOT / "scripts" / "atlas" / "data" / "nes-domain-palette-v1.json"
        payload = json.loads(palette_path.read_text(encoding="utf-8"))
        payload["domains"]["ui"]["lutByte"] = 0x0B
        with tempfile.TemporaryDirectory() as temp_dir:
            tampered_path = Path(temp_dir) / "palette.json"
            tampered_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "NES_LUT_PALETTE_CHECKSUM_MISMATCH"):
                load_nes_lut_palette(tampered_path)


if __name__ == "__main__":
    unittest.main()
