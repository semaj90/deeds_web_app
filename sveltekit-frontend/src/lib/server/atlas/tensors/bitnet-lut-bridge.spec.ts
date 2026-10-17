import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  BitNetLUTStore,
  BITNET_LUT_NODE_SIZE,
  BITNET_LUT_TRANSITION_SIZE,
} from './bitnet-lut-bridge.js';

describe('BitNet LUT Bridge (Server-Side NVMe Memory Mapping)', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitnet-lut-test-'));
  const tempFile = path.join(tempDir, 'bitnet_dag_lut.bin');
  const nodeCount = 32;
  const totalBytes = nodeCount * BITNET_LUT_NODE_SIZE; // 2048 bytes

  beforeAll(() => {
    const buffer = Buffer.alloc(totalBytes);
    for (let i = 0; i < nodeCount; i++) {
      const offset = i * BITNET_LUT_NODE_SIZE;
      buffer[offset] = i + 10;
      for (let b = 1; b < BITNET_LUT_TRANSITION_SIZE; b++) {
        buffer[offset + b] = (b * 5) & 0xff;
      }
    }
    fs.writeFileSync(tempFile, buffer);
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch {
      // ignore cleanup errors
    }
  });

  it('opens and maps NVMe LUT file into memory', () => {
    const store = new BitNetLUTStore();
    const success = store.open(tempFile);
    expect(success).toBe(true);

    const buffer = store.getLUTBuffer();
    expect(buffer).not.toBeNull();
    expect(buffer?.length).toBe(totalBytes);

    store.close();
  });

  it('queries BitNet nodes in O(1) time returning 32-byte transition LUTs', () => {
    const store = new BitNetLUTStore();
    store.open(tempFile);

    const lut0 = store.queryBitNetLUT(0);
    expect(lut0.length).toBe(BITNET_LUT_TRANSITION_SIZE);
    expect(lut0[0]).toBe(10);

    const lut3 = store.queryBitNetLUT(3);
    expect(lut3.length).toBe(BITNET_LUT_TRANSITION_SIZE);
    expect(lut3[0]).toBe(13);

    expect(() => store.queryBitNetLUT(100)).toThrow(RangeError);

    store.close();
  });
});
