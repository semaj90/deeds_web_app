import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
 import numpy as np
except ImportError:
 np = None
from unittest import skipIf

@skipIf(np is None, "NumPy not installed in this interpreter")
class ExactCosineCpuTest(unittest.TestCase):
 def test_sorted_and_deterministic(self):
  from atlas_numpy_cpu_reference_v1 import exact_cosine_topk
  x = np.array([[1,0],[0,1],[1,1]], dtype=np.float32)
  result = exact_cosine_topk(x, [1,0], k=2, row_ids=['b','a','c'])
  self.assertEqual([p[0] for p in result], ['b','c'])
  self.assertEqual(result, exact_cosine_topk(x,[1,0],k=2,row_ids=['b','a','c']))
 def test_rejects_zero_and_nonfinite(self):
  from atlas_numpy_cpu_reference_v1 import exact_cosine_topk
  for bad in ([[0,0]], [[float('nan'),1]]):
   with self.assertRaises(ValueError): exact_cosine_topk(bad,[1,0],k=1,row_ids=['a'])
 def test_rejects_duplicate_identity(self):
  from atlas_numpy_cpu_reference_v1 import exact_cosine_topk
  with self.assertRaises(ValueError): exact_cosine_topk([[1,0],[0,1]],[1,0],k=1,row_ids=['a','a'])

if __name__ == '__main__': unittest.main()
