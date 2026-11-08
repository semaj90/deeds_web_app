#!/usr/bin/env node
/**
 * scripts/atlas/verify-quantized-feature-block-cross-language.mjs
 *
 * Implements Milestone 3A cross-language binary reference test:
 * - Tests 2-bit, 3-bit, and 4-bit quantization packing/unpacking in TypeScript and Python.
 * - Dimensions: 64, 128, 256, 512.
 * - Proves exact byte-for-byte binary equality under SHA-256 between Node and Python.
 * - Asserts round-trip lossless code recovery and out-of-bounds error handling.
 * - Emits receipt to docs/reports/quantized-feature-block-cross-language-receipt-v1.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

import {
  packCodes,
  unpackCode,
  unpackCodes,
  QUANTIZED_FEATURE_BLOCK_SCHEMA_V1,
} from '../../sveltekit-frontend/src/lib/server/gpu/quantized-feature-block-v1.ts';

const ROOT = process.cwd();
const PY_SCRIPT = path.join(ROOT, 'scripts/spatial/quantized_feature_block_v1.py');
const OUT_REPORT = path.join(ROOT, 'docs/reports/quantized-feature-block-cross-language-receipt-v1.json');
const PYTHON = process.env.ATLAS_PYTHON || 'C:\\Python313\\python.exe';

function sha256Hex(buf) {
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

// Deterministic pseudorandom generator for reproducible test patterns
function makeTestCodes(dim, bits, seed = 0x12345678) {
  const mask = (1 << bits) - 1;
  const codes = new Uint8Array(dim);
  let state = seed;
  for (let i = 0; i < dim; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    codes[i] = state & mask;
  }
  return codes;
}

async function main() {
  console.log('[QuantizedFeatureBlock] Starting Milestone 3A cross-language verification...');

  const DIMS = [64, 128, 256, 512];
  const BITS = [2, 3, 4];
  const testResults = [];

  for (const dim of DIMS) {
    for (const bits of BITS) {
      const codes = makeTestCodes(dim, bits);

      // 1. Node pack & unpack
      const nodePacked = packCodes(codes, bits);
      const nodeHash = sha256Hex(nodePacked);
      const nodeUnpacked = unpackCodes(nodePacked, dim, bits);
      assert.deepEqual(nodeUnpacked, codes, `Node round-trip mismatch for dim=${dim}, bits=${bits}`);

      // 2. Python pack & unpack via inline subshell
      const pyCode = `
import sys, json, hashlib
from scripts.spatial.quantized_feature_block_v1 import pack_codes, unpack_codes

codes = [${Array.from(codes).join(',')}]
bits = ${bits}
packed = pack_codes(codes, bits)
digest = 'sha256:' + hashlib.sha256(packed).hexdigest()
unpacked = unpack_codes(packed, len(codes), bits)
assert unpacked == codes, "Python round-trip mismatch"

print(json.dumps({
    "digest": digest,
    "byteLength": len(packed),
    "hex": packed.hex()
}))
`;

      const pyRes = spawnSync(PYTHON, ['-c', pyCode], { encoding: 'utf8', cwd: ROOT });
      if (pyRes.status !== 0) {
        console.error('Python error:', pyRes.stderr);
        throw new Error(`Python execution failed for dim=${dim}, bits=${bits}`);
      }

      const pyOutput = JSON.parse(pyRes.stdout.trim());
      const pyHash = pyOutput.digest;

      // 3. Exact binary digest equality
      assert.equal(nodeHash, pyHash, `Cross-language digest mismatch for dim=${dim}, bits=${bits}`);
      assert.equal(nodePacked.length, pyOutput.byteLength);

      testResults.push({
        dim,
        bits,
        packedByteLength: nodePacked.length,
        idealBits: dim * bits,
        allocatedBytes: Math.ceil((dim * bits) / 8),
        sha256: nodeHash,
        nodePythonParity: true,
      });

      console.log(`  ✓ Dim ${dim.toString().padStart(3, ' ')} | ${bits}-bit | ${nodePacked.length.toString().padStart(3, ' ')} bytes | Digest: ${nodeHash.slice(0, 24)}... (Parity PASS)`);
    }
  }

  // 4. Test error handling
  console.log('[QuantizedFeatureBlock] Verifying error handling and bounds...');
  const badCodes = new Uint8Array([0, 1, 4]); // 4 exceeds 2-bit mask (3)
  assert.throws(() => packCodes(badCodes, 2), /QUANT_CODE_OUT_OF_RANGE/);

  const testBuf = new Uint8Array(4); // 32 bits total = sixteen 2-bit codes
  assert.throws(() => unpackCode(testBuf, 16, 2), /QUANT_INDEX_OUT_OF_RANGE/);
  console.log('✓ Bounds and range exceptions validated');

  // 5. Emit report
  const report = {
    schema: 'atlas.quantized-feature-block-cross-language-receipt.v1',
    generatedAt: new Date().toISOString(),
    schemaReference: QUANTIZED_FEATURE_BLOCK_SCHEMA_V1,
    dimensionsTested: DIMS,
    bitWidthsTested: BITS,
    totalConfigurations: testResults.length,
    allParityPassed: true,
    results: testResults,
  };

  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(`\n✓ Milestone 3A cross-language receipt written to ${OUT_REPORT}`);
}

main().catch(err => {
  console.error('[Error in QuantizedFeatureBlock Verification]:', err);
  process.exit(1);
});
