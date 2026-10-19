import unittest

try:
    import torch
    HAS_CUDA = torch.cuda.is_available()
except Exception:  # torch absent
    HAS_CUDA = False


@unittest.skipUnless(HAS_CUDA, "needs torch with CUDA; check free VRAM/RAM first")
class Stage4GpuParityTests(unittest.TestCase):
    def test_gpu_matches_cpu_oracle_within_declared_tolerance(self):
        from atlas_compute import lowrank_stage4_gpu_parity_v1 as s4
        r = s4.run_parity()
        self.assertTrue(r["pass"], r)
        self.assertLess(r["peakVramMiB"], 64)
        for key in ("canonicalAuthority", "writesPerformed"):
            self.assertIs(r[key], False)


if __name__ == "__main__":
    unittest.main()
