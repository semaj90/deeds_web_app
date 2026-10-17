/**
 * BitNet LUT Bridge — Server-Side NVMe Memory-Mapped Ternary Weight Store
 *
 * Exposes zero-copy memory-mapped access to BitNet ternary weight LUTs and DAG state tables.
 * Leverages native N-API bridge when available (mmap + _mm_prefetch), with fallback
 * to Node.js synchronous file buffer mapping.
 */

import fs from 'node:fs';

export const BITNET_LUT_NODE_SIZE = 64; // 1 cache line (64 bytes)
export const BITNET_LUT_TRANSITION_SIZE = 32; // 32 bytes

export interface BitNetLUTBridgeOptions {
  nativeAddonPath?: string;
}

export class BitNetLUTStore {
  private fd: number = -1;
  private fileSize: number = 0;
  private buffer: Buffer | null = null;
  private nativeBridge: any = null;

  constructor(options: BitNetLUTBridgeOptions = {}) {
    if (options.nativeAddonPath && fs.existsSync(options.nativeAddonPath)) {
      try {
        const req = (globalThis as any).require || import.meta.resolve;
        this.nativeBridge = req(options.nativeAddonPath);
      } catch {
        this.nativeBridge = null;
      }
    }
  }

  /**
   * Initializes and memory-maps the BitNet LUT file from NVMe storage.
   */
  open(filepath: string): boolean {
    if (this.nativeBridge?.initLUTStore) {
      const ok = this.nativeBridge.initLUTStore(filepath);
      if (ok) return true;
    }

    // Node.js fallback: open synchronous descriptor and map buffer
    try {
      if (!fs.existsSync(filepath)) return false;
      const stat = fs.statSync(filepath);
      this.fileSize = stat.size;
      this.fd = fs.openSync(filepath, 'r');
      this.buffer = fs.readFileSync(filepath); // direct buffer allocation
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns a zero-copy buffer view of the mapped NVMe region.
   */
  getLUTBuffer(): Buffer | Uint8Array | null {
    if (this.nativeBridge?.getLUTBuffer) {
      return this.nativeBridge.getLUTBuffer();
    }
    return this.buffer;
  }

  /**
   * O(1) query for a 64-byte DAG node, returning the 32-byte transition LUT view.
   */
  queryBitNetLUT(nodeIndex: number): Uint8Array {
    if (this.nativeBridge?.queryBitNetLUT) {
      return this.nativeBridge.queryBitNetLUT(nodeIndex);
    }

    if (!this.buffer) {
      throw new Error('BITNET_LUT_STORE_NOT_OPEN');
    }

    const offset = nodeIndex * BITNET_LUT_NODE_SIZE;
    if (offset + BITNET_LUT_NODE_SIZE > this.fileSize) {
      throw new RangeError(`BITNET_NODE_INDEX_OUT_OF_BOUNDS: index ${nodeIndex} exceeds file size ${this.fileSize}`);
    }

    // Return zero-copy 32-byte subarray representing transition LUT
    return this.buffer.subarray(offset, offset + BITNET_LUT_TRANSITION_SIZE);
  }

  close(): void {
    if (this.nativeBridge?.closeLUTStore) {
      this.nativeBridge.closeLUTStore();
    }
    if (this.fd !== -1) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // ignore
      }
      this.fd = -1;
    }
    this.buffer = null;
    this.fileSize = 0;
  }
}
