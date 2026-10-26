import { describe, expect, it } from 'vitest';
import {
  cacheBitNetLUTToNVMe,
  readBitNetLUTFromNVMe,
  queryBitNetNodeOPFS,
  BITNET_LUT_NODE_SIZE,
  BITNET_LUT_TRANSITION_SIZE,
} from './bitnet-opfs-store.js';

describe('BitNet OPFS Store (Client-Side NVMe Storage Engine)', () => {
  it('writes and reads 64-byte aligned ternary LUT blocks', async () => {
    const nodeCount = 16;
    const totalBytes = nodeCount * BITNET_LUT_NODE_SIZE; // 1024 bytes
    const sampleLUT = new Uint8Array(totalBytes);

    // Populate with distinctive pattern
    for (let i = 0; i < nodeCount; i++) {
      const nodeOffset = i * BITNET_LUT_NODE_SIZE;
      sampleLUT[nodeOffset] = i + 1; // node mark
      for (let b = 1; b < BITNET_LUT_TRANSITION_SIZE; b++) {
        sampleLUT[nodeOffset + b] = (b * 3) & 0xff; // ternary transition pattern
      }
    }

    const result = await cacheBitNetLUTToNVMe(sampleLUT, { filename: 'test_bitnet_lut.bin' });
    expect(result.bytesWritten).toBe(totalBytes);
    expect(result.filename).toBe('test_bitnet_lut.bin');

    const readBack = await readBitNetLUTFromNVMe('test_bitnet_lut.bin');
    expect(readBack.byteLength).toBe(totalBytes);
    expect(readBack[0]).toBe(1);
    expect(readBack[BITNET_LUT_NODE_SIZE]).toBe(2);
  });

  it('queries individual nodes in O(1) time returning 32-byte transition LUTs', async () => {
    const node0 = await queryBitNetNodeOPFS(0, 'test_bitnet_lut.bin');
    expect(node0.byteLength).toBe(BITNET_LUT_TRANSITION_SIZE);
    expect(node0[0]).toBe(1);

    const node5 = await queryBitNetNodeOPFS(5, 'test_bitnet_lut.bin');
    expect(node5.byteLength).toBe(BITNET_LUT_TRANSITION_SIZE);
    expect(node5[0]).toBe(6);
  });
});
