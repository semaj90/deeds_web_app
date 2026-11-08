"""Read-only and fail-closed parity proof, discoverable as module or path."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
try:
    from atlas_compute.verify_nes_v2_parity import verify
except ModuleNotFoundError as exc:
    if exc.name != 'atlas_compute':
        raise
    from verify_nes_v2_parity import verify

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    'fixtures/nes-domain-palette-v1.json',
    'fixtures/atlas-domain-taxonomy.yaml',
    'scripts/atlas/data/nes-domain-palette-v2.candidate.json',
    'docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json',
]

class TestNesCrossLanguageParity(unittest.TestCase):
    def clone_fixture(self, tmp):
        root = Path(tmp)
        for f in FILES:
            dst = root / f
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / f, dst)
        return root

    def test_valid_candidate_matches_python_checksum_recipe(self):
        result = verify(ROOT)
        self.assertEqual(result['status'], 'PARITY_PASS')
        self.assertEqual(result['domains'], 14)
        self.assertEqual(result['ontologyGroups'], 17)
        self.assertEqual(result['generalByte'], 10)
        self.assertEqual(result['unresolvedByte'], 0)

    def test_invalid_crosswalk_checksum_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.clone_fixture(d)
            p = r / 'docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json'
            doc = json.loads(p.read_text())
            doc['rows'][0]['lutByte'] = 254
            p.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'DOCUMENT_CHECKSUM_DRIFT'):
                verify(r)

    def test_source_yaml_drift_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.clone_fixture(d)
            p = r / 'fixtures/atlas-domain-taxonomy.yaml'
            p.write_bytes(p.read_bytes() + b'\n# drift\n')
            with self.assertRaisesRegex(ValueError, 'SOURCE_YAML_HASH_DRIFT'):
                verify(r)

    def test_multiple_palette_variants_block_migration(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.clone_fixture(d)
            p = r / 'scripts/atlas/data/nes-domain-palette-v2-PROPOSED.json'
            p.write_text(json.dumps({'schema': 'atlas.nes-domain-palette.v2', 'domains': {}}))
            with self.assertRaisesRegex(ValueError, 'COMPETING_V2_CANDIDATES_NOT_RECONCILED'):
                verify(r)

    def test_unknown_group_rollup_fails_even_with_new_checksum(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.clone_fixture(d)
            p = r / 'docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json'
            doc = json.loads(p.read_text())
            doc['rows'][0]['domain'] = 'ui'
            doc['rows'][0]['lutByte'] = 2
            doc['rows'][0]['nesHex'] = '0x2A'
            from hashlib import sha256
            unsigned = {k: v for k, v in doc.items() if k != 'checksum'}
            doc['checksum'] = 'sha256:' + sha256(json.dumps(unsigned, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
            p.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'UNAPPROVED_GROUP_ROLLUP'):
                verify(r)

if __name__ == '__main__':
    unittest.main()
