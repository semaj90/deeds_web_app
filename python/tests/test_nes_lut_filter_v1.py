"""NLUT-07: scalar oracle tests + cross-check against the C++ harness (scalar and AVX2).

The cross-check runs only when NES_LUT_FILTER_EXE points at the built harness
(build: scripts/dev/clang-vs.bat scripts/spatial/nes_lut_filter_cpp_check.cpp <exe> -mavx2).
"""

from __future__ import annotations

import os
import random
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from atlas_compute.nes_lut_filter_v1 import match_mask_scalar, expected_mask_hex  # noqa: E402

DOMAIN_ALLOWED = list(range(0x01, 0x0B))  # 0x01..0x0A: the ten domain bytes
EXE = os.environ.get("NES_LUT_FILTER_EXE")


def frozen_cases() -> list[tuple[list[int], list[int]]]:
    rng = random.Random(20261108)  # frozen seed
    cases: list[tuple[list[int], list[int]]] = []
    for n in (0, 1, 31, 32, 33, 63, 64, 65, 100, 257, 1000):
        lut = [rng.randrange(0, 0x10) for _ in range(n)]  # heavy on 0x00..0x0F
        cases.append((lut, DOMAIN_ALLOWED))
        cases.append((lut, [0x00]))            # 0x00 alone (unresolved)
        cases.append((lut, [0x02, 0x07, 0x0A]))
    # Edge fixture: explicit 0x00 fail-closed, boundary values, out-of-range domain bytes
    edge = [0x00, 0x01, 0x0A, 0x0B, 0xFF, 0x00] * 6 + [0x2A, 0x00]
    cases.append((edge, DOMAIN_ALLOWED))           # 0x00 must NOT match
    cases.append((edge, [0x00, 0xFF]))             # 0x00 and 0xFF explicitly allowed
    cases.append((edge, list(range(0x00, 0x10))))  # 16 allowed values (max)
    return cases


class ScalarOracle(unittest.TestCase):
    def test_zero_byte_is_fail_closed_unless_allowed(self):
        self.assertEqual(match_mask_scalar([0x00, 0x00], DOMAIN_ALLOWED), [0])
        self.assertEqual(match_mask_scalar([0x00, 0x01], [0x00]), [0b01])

    def test_domain_bytes_and_bit_layout(self):
        lut = [0x01] + [0x00] * 30 + [0x0A] + [0x0B]
        self.assertEqual(match_mask_scalar(lut, DOMAIN_ALLOWED), [(1 << 0) | (1 << 31), 0])  # 33 bytes -> 2 words; 0x0B unmatched

    def test_word_count_is_ceil_n_over_32(self):
        for n, words in ((0, 0), (1, 1), (32, 1), (33, 2), (64, 2), (65, 3)):
            self.assertEqual(len(match_mask_scalar([0x01] * n, DOMAIN_ALLOWED)), words, n)

    def test_fail_closed_arguments(self):
        for bad_allowed in ([], list(range(17)), [1, 1], [256], [-1], [True]):
            with self.assertRaises(ValueError, msg=str(bad_allowed)):
                match_mask_scalar([1], bad_allowed)
        with self.assertRaises(ValueError):
            match_mask_scalar([300], [1])


@unittest.skipUnless(EXE and Path(EXE).exists(), "set NES_LUT_FILTER_EXE to the built C++ harness")
class CppCrossCheck(unittest.TestCase):
    def run_harness(self, lut: list[int], allowed: list[int]) -> list[str]:
        payload = f"{len(lut)}\n{len(allowed)} {' '.join(map(str, allowed))}\n{bytes(lut).hex()}\n"
        proc = subprocess.run([EXE], input=payload, capture_output=True, text=True, timeout=30)
        self.assertIn(proc.returncode, (0,), proc.stdout + proc.stderr)
        return proc.stdout.splitlines()

    def test_scalar_and_avx2_match_python_oracle_on_frozen_fixture(self):
        for lut, allowed in frozen_cases():
            expected = expected_mask_hex(lut, allowed)
            out = self.run_harness(lut, allowed)
            scalar = next(line for line in out if line.startswith("SCALAR"))
            avx2 = next((line for line in out if line.startswith("AVX2")), None)
            self.assertIsNotNone(avx2, out)
            words_expected = " ".join(expected)
            self.assertEqual(scalar.split(" ", 1)[1] if " " in scalar else "", words_expected, (len(lut), allowed))
            self.assertEqual(avx2.split(" ", 1)[1] if " " in avx2 else "", words_expected, (len(lut), allowed))


if __name__ == "__main__":
    unittest.main()
