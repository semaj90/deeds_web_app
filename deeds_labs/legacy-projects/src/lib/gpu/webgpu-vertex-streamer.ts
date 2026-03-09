import { browser } from '$app/environment';
import type { HybridGPUContext } from './hybrid-gpu-context';

/**
 * Simple streamer that writes vertex data to WebGPU device queue in chunks.
 * It accepts a hybrid context that should contain a `device` with `queue` API.
 */
export class WebGPUVertexStreamer {
  private context: HybridGPUContext | null;

  constructor(context?: HybridGPUContext | null) {
    this.context = context ?? null;
  }

  /**
   * Stream vertices in chunkSize (number of floats). onChunk is called for each chunk (useful to push to Redis or network).
   */
  async streamVertices(
    vertices: Float32Array,
    chunkSizeFloats = 65536,
    onChunk?: (chunk: Float32Array, idx: number) => Promise<void> | void
  ): Promise<void> {
    if (!browser) return;
    if (!this.context) throw new Error('No GPU context provided');
    // Try WebGPU device path
    const deviceAny = (this.context as any).device;
    if (deviceAny && deviceAny.queue && typeof deviceAny.queue.writeBuffer === 'function') {
      const floatByteSize = 4;
      const total = vertices.length;
      let idx = 0;
      while (idx < total) {
        const end = Math.min(total, idx + chunkSizeFloats);
        const slice = vertices.subarray(idx, end);
        // create GPUBuffer and write
        try {
          const buf = deviceAny.createBuffer({
            size: slice.byteLength,
            usage:
              (deviceAny as any).GPUBufferUsage?.MAP_WRITE ||
              (deviceAny as any).GPUBufferUsage?.COPY_SRC ||
              0,
            mappedAtCreation: true,
          });
          // write via mappedRange if supported
          try {
            const mapped = buf.getMappedRange();
            new Float32Array(mapped).set(slice);
            buf.unmap();
          } catch {
            // fallback to queue.writeBuffer
            deviceAny.queue.writeBuffer(buf, 0, slice.buffer, slice.byteOffset, slice.byteLength);
          }
          if (onChunk) await onChunk(slice, idx / chunkSizeFloats);
        } catch {
          // best-effort: call onChunk so caller can fallback to CPU-side handling
          if (onChunk) await onChunk(slice, idx / chunkSizeFloats);
        }
        idx = end;
      }
      return;
    }

    // Fallback path: call onChunk with CPU slices
    let i = 0;
    while (i < vertices.length) {
      const end = Math.min(vertices.length, i + chunkSizeFloats);
      const slice = vertices.subarray(i, end);
      if (onChunk) await onChunk(slice, i / chunkSizeFloats);
      i = end;
    }
  }
}
