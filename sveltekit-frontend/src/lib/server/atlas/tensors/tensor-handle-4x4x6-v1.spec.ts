import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertGpuTileReadableV1,
  createVramPressureEvictionCoordinatorV1,
  decodeTensorHandle4x4x6V1,
  encodeTensorHandle4x4x6V1,
  projectMode7Affine2x3V1,
  projectTileGrid4x4Mode7V1,
  SafeTileResidencyStateV1,
  TENSOR_HANDLE_V1_MAGIC_LE,
  TENSOR_HANDLE_V1_TOTAL_BYTES,
  transitionSafeTileResidencyV1,
} from './tensor-handle-4x4x6-v1.js';

const repoRoot = path.resolve(process.cwd(), '..');
const requireAddon = createRequire(import.meta.url);
const winNapiAddonPath = path.join(
  repoRoot,
  'packages/atlas-native-core/build/Release/atlas_native_core.node',
);
const sharedFixture = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'packages/atlas-native-core/tests/fixtures/tensor-handle-4x4x6-v1.fixture.json'),
    'utf8',
  ),
) as {
  candidateOrdinal: number;
  kmeansClusterId: number;
  somBmuId: number;
  workspaceRevisionPrefix64Hex: string;
  sourceRevisionPrefix64Hex: string;
  affine2x3: [number, number, number, number, number, number];
  residencyState: number;
  activeConsumers: number;
  theoreticalMaxChannelErrorRatio: number;
};

describe('TensorHandleV1 4x4x6 binary codec, cross-language C++/TS/Python parity, and SafeTileResidencyStateV1 FSM', () => {
  it('round-trips a 4x4x6 (96-float) feature tile into 160 bytes with Mode-7 affine transform and revision checks', () => {
    const values96 = Float32Array.from({ length: 96 }, (_, i) => {
      const cell = Math.floor(i / 6);
      const ch = i % 6;
      return ch * 0.5 + cell / 15.0;
    });
    const wsRev = 0x1122334455667788n;
    const srcRev = 0x99aabbccddeeff00n;
    const affine2x3: [number, number, number, number, number, number] = [1, 0, 12.5, 0, 1, -4.25];

    const encoded = encodeTensorHandle4x4x6V1({
      values96,
      candidateOrdinal: 42,
      kmeansClusterId: 3,
      somBmuId: 127,
      workspaceRevisionPrefix64: wsRev,
      sourceRevisionPrefix64: srcRev,
      affine2x3,
      residencyState: SafeTileResidencyStateV1.GPU_READY,
      activeConsumers: 2,
    });

    expect(encoded.byteLength).toBe(TENSOR_HANDLE_V1_TOTAL_BYTES);
    expect(encoded.readUInt32LE(0)).toBe(TENSOR_HANDLE_V1_MAGIC_LE);

    const decoded = decodeTensorHandle4x4x6V1(encoded, wsRev);
    expect(decoded.candidateOrdinal).toBe(42);
    expect(decoded.kmeansClusterId).toBe(3);
    expect(decoded.somBmuId).toBe(127);
    expect(decoded.workspaceRevisionPrefix64).toBe(wsRev);
    expect(decoded.sourceRevisionPrefix64).toBe(srcRev);
    expect(decoded.affine2x3).toEqual(affine2x3);
    expect(decoded.residencyState).toBe(SafeTileResidencyStateV1.GPU_READY);
    expect(decoded.activeConsumers).toBe(2);
    for (let i = 0; i < 96; i++) {
      expect(decoded.values96[i]).toBeCloseTo(values96[i], 4);
    }

    // Stale revision rejection
    expect(() => decodeTensorHandle4x4x6V1(encoded, 0xdeadbeefn)).toThrow(
      'TENSOR_HANDLE_V1_STALE_WORKSPACE_REVISION',
    );
  });

  it('proves 100% byte-for-byte 160B parity and lossy INT4 error bounds across TypeScript, C++ N-API (.node), and C++ pybind11 (.pyd) on varied non-grid inputs', () => {
    const addon = requireAddon(winNapiAddonPath);
    const varied96 = Float32Array.from({ length: 96 }, (_, i) =>
      Math.fround(Math.sin(i * 0.37) * 1.25 + (i % 6) * 0.4),
    );
    const affine2x3: [number, number, number, number, number, number] = [
      1.5, -0.25, 10.0, 0.25, 1.5, -4.0,
    ];
    const wsRev = 0x1122334455667788n;
    const srcRev = 0x99aabbccddeeff00n;

    const tsBuf = encodeTensorHandle4x4x6V1({
      values96: varied96,
      candidateOrdinal: 42,
      kmeansClusterId: 3,
      somBmuId: 127,
      workspaceRevisionPrefix64: wsRev,
      sourceRevisionPrefix64: srcRev,
      affine2x3,
      residencyState: SafeTileResidencyStateV1.GPU_READY,
      activeConsumers: 2,
    });

    const napiBuf: Buffer = addon.encodeTensorHandle4x4x6V1(
      varied96,
      42,
      3,
      127,
      wsRev,
      srcRev,
      Float32Array.from(affine2x3),
      SafeTileResidencyStateV1.GPU_READY,
      2,
    );

    // Byte-for-byte equality between TypeScript and C++ N-API
    expect(napiBuf.toString('hex')).toBe(tsBuf.toString('hex'));

    // Cross-decode and verify lossy INT4 max error bound (<= range / 30 per channel)
    const tsDecoded = decodeTensorHandle4x4x6V1(napiBuf, wsRev);
    const napiDecoded: Float32Array = addon.decodeTensorHandle4x4x6V1(tsBuf, wsRev);
    let maxAbsErr = 0;
    for (let i = 0; i < 96; i++) {
      expect(napiDecoded[i]).toBeCloseTo(tsDecoded.values96[i], 6);
      const err = Math.abs(tsDecoded.values96[i] - varied96[i]);
      if (err > maxAbsErr) maxAbsErr = err;
    }
    expect(maxAbsErr).toBeGreaterThan(0);
    expect(maxAbsErr).toBeLessThanOrEqual(0.09);

    // Verify Mode-7 2D affine coordinate projection parity between TypeScript and C++ N-API
    const [tsX, tsY] = projectMode7Affine2x3V1(affine2x3, 2.0, 4.0);
    const napiPt: Float32Array = addon.projectMode7Affine2x3V1(Float32Array.from(affine2x3), 2.0, 4.0);
    expect(tsX).toBeCloseTo(12.0, 5);
    expect(tsY).toBeCloseTo(2.5, 5);
    expect(napiPt[0]).toBeCloseTo(tsX, 5);
    expect(napiPt[1]).toBeCloseTo(tsY, 5);

    const grid16 = projectTileGrid4x4Mode7V1(affine2x3);
    expect(grid16).toHaveLength(16);

    // Verify Python pybind11 (_atlas_native_core.cp313-win_amd64.pyd) produces the exact same 160-byte hex
    const pyScript = [
      'import sys',
      `sys.path.insert(0, ${JSON.stringify(path.join(repoRoot, 'python/atlas_corpus_lib/atlas_corpus_lib'))})`,
      'import _atlas_native_core as m',
      `vals = ${JSON.stringify(Array.from(varied96))}`,
      `aff = ${JSON.stringify(affine2x3)}`,
      'enc = m.encode_tensor_handle_4x4x6_v1(vals, 42, 3, 127, 0x1122334455667788, 0x99aabbccddeeff00, aff, 3, 2)',
      'print(enc.hex())',
    ].join('; ');
    const pyHex = execFileSync('C:\\Python313\\python.exe', ['-c', pyScript], {
      encoding: 'utf8',
    }).trim();
    expect(pyHex).toBe(tsBuf.toString('hex'));
  });

  it('enforces the safer 7-state residency FSM identically across TypeScript and C++ N-API', () => {
    const addon = requireAddon(winNapiAddonPath);
    let st = SafeTileResidencyStateV1.ABSENT;
    st = transitionSafeTileResidencyV1({
      current: st,
      target: SafeTileResidencyStateV1.HOST_STAGED,
      transferCompleted: false,
      activeConsumers: 0,
    });
    expect(addon.transitionSafeTileResidencyV1(0, 1, false, 0, true)).toBe(st);

    st = transitionSafeTileResidencyV1({
      current: st,
      target: SafeTileResidencyStateV1.GPU_PENDING,
      transferCompleted: false,
      activeConsumers: 0,
    });
    expect(addon.transitionSafeTileResidencyV1(1, 2, false, 0, true)).toBe(st);

    expect(() =>
      transitionSafeTileResidencyV1({
        current: st,
        target: SafeTileResidencyStateV1.GPU_READY,
        transferCompleted: false,
        activeConsumers: 0,
      }),
    ).toThrow('SAFE_RESIDENCY_GPU_READY_REQUIRES_TRANSFER_COMPLETE');
    expect(() => addon.transitionSafeTileResidencyV1(2, 3, false, 0, true)).toThrow(
      /SAFE_RESIDENCY_GPU_READY_REQUIRES_TRANSFER_COMPLETE/,
    );

    st = transitionSafeTileResidencyV1({
      current: st,
      target: SafeTileResidencyStateV1.GPU_READY,
      transferCompleted: true,
      activeConsumers: 0,
    });
    st = transitionSafeTileResidencyV1({
      current: st,
      target: SafeTileResidencyStateV1.IN_USE,
      transferCompleted: true,
      activeConsumers: 1,
    });
    expect(() =>
      transitionSafeTileResidencyV1({
        current: st,
        target: SafeTileResidencyStateV1.EVICTABLE,
        transferCompleted: true,
        activeConsumers: 1,
      }),
    ).toThrow('SAFE_RESIDENCY_EVICTABLE_REQUIRES_ZERO_CONSUMERS');
    expect(() => addon.transitionSafeTileResidencyV1(4, 5, true, 1, true)).toThrow(
      /SAFE_RESIDENCY_EVICTABLE_REQUIRES_ZERO_CONSUMERS/,
    );

    st = transitionSafeTileResidencyV1({
      current: st,
      target: SafeTileResidencyStateV1.EVICTABLE,
      transferCompleted: true,
      activeConsumers: 0,
    });
    st = transitionSafeTileResidencyV1({
      current: st,
      target: SafeTileResidencyStateV1.EVICTED,
      transferCompleted: true,
      activeConsumers: 0,
    });
    expect(st).toBe(SafeTileResidencyStateV1.EVICTED);
    expect(addon.transitionSafeTileResidencyV1(5, 6, true, 0, true)).toBe(st);

    // Revision mismatch invalidates to ABSENT at any state
    expect(
      transitionSafeTileResidencyV1({
        current: SafeTileResidencyStateV1.GPU_READY,
        target: SafeTileResidencyStateV1.IN_USE,
        transferCompleted: true,
        activeConsumers: 0,
        revisionMatched: false,
      }),
    ).toBe(SafeTileResidencyStateV1.ABSENT);
    expect(addon.transitionSafeTileResidencyV1(3, 4, true, 0, false)).toBe(
      SafeTileResidencyStateV1.ABSENT,
    );
  });

  it('quantifies per-channel lossy INT4 error bounds from the shared fixture and rejects invalid inputs', () => {
    const varied96 = Float32Array.from({ length: 96 }, (_, i) =>
      Math.fround(Math.sin(i * 0.37) * 1.25 + (i % 6) * 0.4),
    );
    const wsRev = BigInt(`0x${sharedFixture.workspaceRevisionPrefix64Hex}`);
    const srcRev = BigInt(`0x${sharedFixture.sourceRevisionPrefix64Hex}`);
    const encoded = encodeTensorHandle4x4x6V1({
      values96: varied96,
      candidateOrdinal: sharedFixture.candidateOrdinal,
      kmeansClusterId: sharedFixture.kmeansClusterId,
      somBmuId: sharedFixture.somBmuId,
      workspaceRevisionPrefix64: wsRev,
      sourceRevisionPrefix64: srcRev,
      affine2x3: sharedFixture.affine2x3,
      residencyState: sharedFixture.residencyState as SafeTileResidencyStateV1,
      activeConsumers: sharedFixture.activeConsumers,
    });
    const decoded = decodeTensorHandle4x4x6V1(encoded, wsRev);

    // Compute exact per-channel theoretical upper bound: (max_c - min_c) / 30.0
    const chMin = new Float32Array(6).fill(Infinity);
    const chMax = new Float32Array(6).fill(-Infinity);
    for (let i = 0; i < 96; i++) {
      const ch = i % 6;
      if (varied96[i] < chMin[ch]) chMin[ch] = varied96[i];
      if (varied96[i] > chMax[ch]) chMax[ch] = varied96[i];
    }
    let maxErr = 0;
    let sumErr = 0;
    for (let i = 0; i < 96; i++) {
      const ch = i % 6;
      const err = Math.abs(decoded.values96[i] - varied96[i]);
      const channelBound = (chMax[ch] - chMin[ch]) * sharedFixture.theoreticalMaxChannelErrorRatio + 1e-5;
      expect(err).toBeLessThanOrEqual(channelBound);
      if (err > maxErr) maxErr = err;
      sumErr += err;
    }
    const meanErr = sumErr / 96;
    expect(maxErr).toBeGreaterThan(0);
    expect(meanErr).toBeGreaterThan(0);
    expect(meanErr).toBeLessThan(maxErr);

    // Invalid inputs: NaN, Infinity, out-of-range somBmuId, truncated packet, tampered checksum
    const withNaN = Float32Array.from(varied96);
    withNaN[5] = Number.NaN;
    expect(() =>
      encodeTensorHandle4x4x6V1({
        values96: withNaN,
        candidateOrdinal: 1,
        kmeansClusterId: 0,
        somBmuId: 0,
        workspaceRevisionPrefix64: wsRev,
        sourceRevisionPrefix64: srcRev,
        affine2x3: sharedFixture.affine2x3,
      }),
    ).toThrow('TENSOR_HANDLE_V1_NONFINITE_VALUE');

    const withInf = Float32Array.from(varied96);
    withInf[12] = Number.POSITIVE_INFINITY;
    expect(() =>
      encodeTensorHandle4x4x6V1({
        values96: withInf,
        candidateOrdinal: 1,
        kmeansClusterId: 0,
        somBmuId: 0,
        workspaceRevisionPrefix64: wsRev,
        sourceRevisionPrefix64: srcRev,
        affine2x3: sharedFixture.affine2x3,
      }),
    ).toThrow('TENSOR_HANDLE_V1_NONFINITE_VALUE');

    expect(() =>
      encodeTensorHandle4x4x6V1({
        values96: varied96,
        candidateOrdinal: 1,
        kmeansClusterId: 0,
        somBmuId: 400,
        workspaceRevisionPrefix64: wsRev,
        sourceRevisionPrefix64: srcRev,
        affine2x3: sharedFixture.affine2x3,
      }),
    ).toThrow('TENSOR_HANDLE_V1_SOM_BMU_OUT_OF_RANGE');

    expect(() => decodeTensorHandle4x4x6V1(encoded.subarray(0, 159), wsRev)).toThrow(
      'TENSOR_HANDLE_V1_BYTE_LENGTH_INVALID',
    );
    const tampered = Buffer.from(encoded);
    tampered[120] ^= 0xff;
    expect(() => decodeTensorHandle4x4x6V1(tampered, wsRev)).toThrow(
      'TENSOR_HANDLE_V1_BODY_CHECKSUM_MISMATCH',
    );
  });

  it('enforces lease TTL and evictedAtMs checks on SafeTileResidencyStateV1 and assertGpuTileReadableV1', async () => {
    const {
      assertGpuTileReadableV1,
      transitionSafeTileResidencyV1,
    } = await import('./tensor-handle-4x4x6-v1.js');

    expect(
      assertGpuTileReadableV1({
        residencyState: SafeTileResidencyStateV1.GPU_READY,
        revisionMatched: true,
        leaseExpiresAtMs: 2000,
        evictedAtMs: null,
        nowMs: 1500,
      }),
    ).toEqual({ readable: true, reason: null });

    expect(
      assertGpuTileReadableV1({
        residencyState: SafeTileResidencyStateV1.GPU_READY,
        revisionMatched: true,
        leaseExpiresAtMs: 1000,
        evictedAtMs: null,
        nowMs: 1500,
      }),
    ).toEqual({ readable: false, reason: 'RESIDENCY_LEASE_EXPIRED' });

    expect(
      assertGpuTileReadableV1({
        residencyState: SafeTileResidencyStateV1.GPU_READY,
        revisionMatched: true,
        leaseExpiresAtMs: 5000,
        evictedAtMs: 1400,
        nowMs: 1500,
      }),
    ).toEqual({ readable: false, reason: 'TILE_EVICTED' });

    expect(() =>
      transitionSafeTileResidencyV1({
        current: SafeTileResidencyStateV1.GPU_READY,
        target: SafeTileResidencyStateV1.IN_USE,
        transferCompleted: true,
        activeConsumers: 0,
        leaseExpiresAtMs: 1000,
        nowMs: 1500,
      }),
    ).toThrow('SAFE_RESIDENCY_LEASE_EXPIRED');

    expect(
      transitionSafeTileResidencyV1({
        current: SafeTileResidencyStateV1.GPU_READY,
        target: SafeTileResidencyStateV1.IN_USE,
        transferCompleted: true,
        activeConsumers: 0,
        evictedAtMs: 1400,
        nowMs: 1500,
      }),
    ).toBe(SafeTileResidencyStateV1.EVICTED);
  });

  it('evicts EVICTABLE tiles in LRU order under VRAM pressure and stamps evictedAtMs before IN_USE reads', () => {
    const evictedCallbackIds: string[] = [];
    const coord = createVramPressureEvictionCoordinatorV1({
      minFreeVramMiB: 1536,
      onEvict: (tile) => evictedCallbackIds.push(tile.tileId),
    });

    const t1 = {
      tileId: 'tile:1',
      residencyState: SafeTileResidencyStateV1.EVICTABLE,
      byteSize: 160,
      activeConsumers: 0,
      revisionMatched: true,
      leaseExpiresAtMs: 9999,
      evictedAtMs: null,
    };
    const t2 = {
      tileId: 'tile:2',
      residencyState: SafeTileResidencyStateV1.IN_USE,
      byteSize: 160,
      activeConsumers: 1,
      revisionMatched: true,
      leaseExpiresAtMs: 9999,
      evictedAtMs: null,
    };
    const t3 = {
      tileId: 'tile:3',
      residencyState: SafeTileResidencyStateV1.EVICTABLE,
      byteSize: 160,
      activeConsumers: 0,
      revisionMatched: true,
      leaseExpiresAtMs: 9999,
      evictedAtMs: null,
    };

    coord.registerOrTouch(t1);
    coord.registerOrTouch(t2);
    coord.registerOrTouch(t3);
    // Touch t1 so t3 becomes oldest EVICTABLE
    coord.registerOrTouch(t1);

    const ok = coord.onVramPressure({ freeVramMiB: 2048, nowMs: 1000 });
    expect(ok.triggered).toBe(false);
    expect(ok.evictedTileIds).toEqual([]);

    const pressured = coord.onVramPressure({
      freeVramMiB: 1024,
      targetReclaimBytes: 160,
      nowMs: 2500,
    });
    expect(pressured.triggered).toBe(true);
    expect(pressured.evictedTileIds).toEqual(['tile:3']);
    expect(evictedCallbackIds).toEqual(['tile:3']);
    expect(t3.residencyState).toBe(SafeTileResidencyStateV1.EVICTED);
    expect(t3.evictedAtMs).toBe(2500);
    expect(assertGpuTileReadableV1({ ...t3, nowMs: 2600 })).toEqual({
      readable: false,
      reason: 'TILE_EVICTED',
    });
    expect(assertGpuTileReadableV1({ ...t2, nowMs: 2600 })).toEqual({
      readable: true,
      reason: null,
    });
  });
});
