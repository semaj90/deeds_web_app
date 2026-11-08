import json
import unittest
from pathlib import Path
try:
    from atlas_compute.nes_lut_palette_v2_candidate import (
        load_nes_palette_v2_candidate, resolve_proposed_domain
    )
except ModuleNotFoundError as exc:
    if exc.name != "atlas_compute":
        raise
    from nes_lut_palette_v2_candidate import (
        load_nes_palette_v2_candidate, resolve_proposed_domain
    )
_ROOT=Path(__file__).resolve().parents[2]
_V1=(_ROOT/"fixtures/nes-domain-palette-v1.json") if (_ROOT/"fixtures/nes-domain-palette-v1.json").exists() else (_ROOT/"scripts/atlas/data/nes-domain-palette-v1.json")
_V2=_ROOT/"scripts/atlas/data/nes-domain-palette-v2.candidate.json"

class TestNesV2(unittest.TestCase):
    def test_additive(self):
        x=load_nes_palette_v2_candidate(_V2,_V1)
        self.assertEqual(len(x['domains']),14)
        self.assertEqual(x['domains']['ui']['lutByte'],2)
        self.assertEqual(x['domains']['ui']['nesHex'],'0x2A')
        self.assertEqual(x['domains']['test']['lutByte'],14)
    def test_unknown_fails_closed(self):
        x=load_nes_palette_v2_candidate(_V2,_V1)
        self.assertEqual(resolve_proposed_domain('unknown',x)['lutByte'],0)
        self.assertEqual(resolve_proposed_domain('agent',x)['status'],'PALETTE_MATCH_PROPOSAL')
        self.assertEqual(resolve_proposed_domain('compiler',x)['lutByte'],11)

if __name__=='__main__': unittest.main()
