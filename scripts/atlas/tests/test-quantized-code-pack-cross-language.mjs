import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BITS, packCodes, unpackAll } from '../lib/quantized-code-pack-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// Deterministic xorshift codes so Node and Python see identical input without a shared file.
const codesFor = (n, bits, seed) => { let s = seed >>> 0 || 1; return Uint8Array.from({ length: n }, () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s & ((1 << bits) - 1); }); };
const py = (code) => { const r = spawnSync('py', ['-3.13', '-I', '-c', code], { cwd: ROOT, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || 'python failed'); return r.stdout.trim(); };

test('round trip for 2/3/4 bits at 64/128/256/512 dims and boundary values', () => {
  for (const bits of BITS) for (const n of [1, 3, 64, 128, 256, 512]) {
    const codes = codesFor(n, bits, 7 + bits + n);
    assert.deepEqual(unpackAll(packCodes(codes, bits), n, bits), codes, `${bits}b x ${n}`);
  }
  for (const bits of BITS) { const all = new Uint8Array(128).fill((1 << bits) - 1); assert.deepEqual(unpackAll(packCodes(all, bits), 128, bits), all); }
});

test('packed size matches ceil(n*bits/8) and rejects out-of-range input', () => {
  assert.equal(packCodes(new Uint8Array(512), 3).length, 192);
  assert.throws(() => packCodes(Uint8Array.of(4), 2), /QUANT_CODE_OUT_OF_RANGE/);
  assert.throws(() => packCodes(Uint8Array.of(1), 5), /QUANT_BITS_UNSUPPORTED/);
  assert.throws(() => unpackAll(packCodes(Uint8Array.of(1), 2), 5, 2), /QUANT_INDEX_OUT_OF_RANGE/);
});

test('Node and Python produce byte-identical packed output', () => {
  for (const bits of BITS) for (const n of [64, 128, 256, 512]) {
    const codes = codesFor(n, bits, 99 + bits * n);
    const nodeHex = Buffer.from(packCodes(codes, bits)).toString('hex');
    const pyHex = py(`import sys; sys.path.insert(0,'python/atlas_compute')\nimport importlib.util as u\ns=u.spec_from_file_location('q','python/atlas_compute/quantized_code_pack_v1.py');m=u.module_from_spec(s);s.loader.exec_module(m)\ncodes=${JSON.stringify(Array.from(codes))}\np=m.pack_codes(codes,${bits})\nassert [m.unpack_code(p,i,${bits}) for i in range(len(codes))]==codes\nprint(p.hex())`);
    assert.equal(pyHex, nodeHex, `${bits}b x ${n}`);
  }
});

// C++ leg: runs only when ATLAS_QPACK_EXE points at a binary compiled from scripts/atlas/native-reference/quantized_code_pack_v1.cpp
// (standalone, e.g. `cl /EHsc /O2 /std:c++17`); skipped otherwise so clean checkouts need no native toolchain.
test('C++ reference produces byte-identical packed output', { skip: process.env.ATLAS_QPACK_EXE ? false : 'ATLAS_QPACK_EXE not set (C++ leg NOT_RUN)' }, () => {
  for (const bits of BITS) for (const n of [64, 128, 256, 512]) {
    const codes = codesFor(n, bits, 99 + bits * n);
    const r = spawnSync(process.env.ATLAS_QPACK_EXE, [String(bits), Array.from(codes).join(',')], { encoding: 'utf8' });
    assert.equal(r.status, 0, `exit ${r.status} for ${bits}b x ${n}`);
    assert.equal(r.stdout.trim(), Buffer.from(packCodes(codes, bits)).toString('hex'), `${bits}b x ${n}`);
  }
  const bad = spawnSync(process.env.ATLAS_QPACK_EXE, ['2', '4'], { encoding: 'utf8' });
  assert.equal(bad.status, 3);
  assert.equal(spawnSync(process.env.ATLAS_QPACK_EXE, ['5', '1'], { encoding: 'utf8' }).status, 2);
});
