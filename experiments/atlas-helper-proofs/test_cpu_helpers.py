import math
import unittest
from dataclasses import dataclass
from hashlib import sha256
from chunker_adapter import normalize_chunks
from cpu_mlp import MultiHeadMLP
from cpu_dag import reachable, topological_order

@dataclass
class MockChunk:
    byte_start: int = 0
    byte_end: int = 3
    content: str = 'abc'
    language: str = 'python'
    node_type: str = 'function_definition'
    start_line: int = 1
    end_line: int = 1
    chunk_id: str = 'upstream'

class CPUGates(unittest.TestCase):
    def test_chunk(self):
        got = normalize_chunks(b'abc', 'src/a.py', 'python', [MockChunk()])
        self.assertEqual(got[0].content_hash, 'sha256:' + sha256(b'abc').hexdigest())
    def test_chunk_tamper(self):
        with self.assertRaisesRegex(ValueError, 'CONTENT_SPAN_MISMATCH'):
            normalize_chunks(b'xyz','src/a.py','python',[MockChunk()])
    def test_unicode_bytes(self):
        with self.assertRaisesRegex(ValueError, 'INVALID_BYTE_SPAN'):
            normalize_chunks('é'.encode(),'a','python',[MockChunk()])
    def test_order(self):
        self.assertEqual(topological_order([('A','C'),('B','C')],['C','B','A']), ['A','B','C'])
    def test_cycle(self):
        with self.assertRaisesRegex(ValueError, 'CYCLE_DETECTED'):
            topological_order([('A','B'),('B','A')],['A','B'])
    def test_reachability(self):
        self.assertEqual(reachable([('A','B'),('B','C')], 'A', 2), ['A','B'])
    def test_mlp(self):
        m = MultiHeadMLP({'x1':0,'x2':1}, seed=4)
        before = sum(m.train_step({'x1':1,'x2':0}, 1, 0.8, 0.05) for _ in range(5))
        after = sum(m.train_step({'x1':1,'x2':0}, 1, 0.8, 0.05) for _ in range(5))
        self.assertLess(after, before)
        self.assertTrue(all(math.isfinite(v) for v in m.forward({'x1': 1})))
    def test_mlp_unknown_key(self):
        with self.assertRaisesRegex(ValueError, 'UNKNOWN_FEATURE'):
            MultiHeadMLP({'x1':0}).forward({'x2':1})
if __name__ == '__main__':
    unittest.main()
