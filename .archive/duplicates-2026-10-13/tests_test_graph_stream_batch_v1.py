import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('stream', ROOT/'scripts/atlas/graph_stream_batch_v1.py')
import sys
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

class GraphStreamTests(unittest.TestCase):
    def test_batches_and_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'graph.jsonl'
            with p.open('w') as f:
                for i in range(5):
                    f.write(json.dumps(dict(kind='node',canonical_id=f'p{i}',source_revision='sha256:abc',graph_revision='g1',source_ref=f's{i}',features=[1.0,2.0]))+'\n')
            report = mod.summarize(p, batch_size=2)
            self.assertEqual((report['records'],report['batches'],report['feature_values']), (5,3,10))
            self.assertFalse(report['canonical_writes'])
    def test_reject_missing_revision(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.jsonl'
            p.write_text(json.dumps(dict(kind='node',canonical_id='a',source_ref='b',graph_revision='g'))+'\n')
            with self.assertRaises(mod.GraphStreamError):mod.summarize(p)
    def test_reject_oversized_record(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'big.jsonl'
            p.write_bytes(b'x'*2000+b'\n')
            with self.assertRaises(mod.GraphStreamError):mod.summarize(p,max_record_bytes=512)
    def test_reject_nan(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'nan.jsonl'
            p.write_text('{"kind":"node","canonical_id":"a","source_revision":"s","graph_revision":"g","source_ref":"x","features":[NaN]}\n')
            with self.assertRaises(mod.GraphStreamError):mod.summarize(p)

if __name__=='__main__': unittest.main()
