import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("nes_lut_palette", ROOT / "python" / "atlas_compute" / "nes_lut_palette.py")
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)
V1 = ROOT / "scripts" / "atlas" / "data" / "nes-domain-palette-v1.json"
V2 = ROOT / "scripts" / "atlas" / "data" / "nes-domain-palette-v2-PROPOSED.json"


class ProposedV2PaletteTest(unittest.TestCase):
    def setUp(self):
        self.v1 = loader.load_nes_lut_palette(V1)
        self.v2 = loader.load_nes_lut_palette(V2)

    def test_v2_loads_with_the_shared_loader_rules(self):
        self.assertEqual(len(self.v2["domains"]), 14)
        self.assertEqual(self.v2["unresolved"]["lutByte"], 0)

    def test_v1_domains_are_byte_for_byte_unchanged(self):
        for key, entry in self.v1["domains"].items():
            new = self.v2["domains"][key]
            self.assertEqual((entry["lutByte"], entry["nesHex"], entry["label"], entry["priorWeight"]),
                             (new["lutByte"], new["nesHex"], new["label"], new["priorWeight"]), key)

    def test_new_domains_do_not_collide_in_byte_or_color(self):
        hexes = [d["nesHex"] for d in self.v2["domains"].values()]
        self.assertEqual(len(hexes), len(set(hexes)))
        self.assertEqual({k for k in self.v2["domains"] if k not in self.v1["domains"]},
                         {"compiler", "devops", "error-handling", "test"})

    def test_derived_uuids_are_unique_and_cover_every_domain(self):
        uuids = self.v2["domainUuids"]
        self.assertEqual(set(uuids), set(self.v2["domains"]))
        self.assertEqual(len(set(uuids.values())), 14)


if __name__ == "__main__":
    unittest.main()
