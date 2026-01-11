import { globalGPUManager } from './global-gpu-manager.js';
import { VertexCacheManager } from './vertex-cache-manager.js';

const vertexCacheManager = new VertexCacheManager();

export interface StreamedVertexPayload {
 id: string; tensor: Float32Array;
 metadata: Record<string, unknown>;
}

export class WebGPUVertexStreamer {
 private activeStreams = new Map<string, GPUBuffer>();

 async streamTensor(id: string): Promise<void> {
 const ctx = globalGPUManager.getHybridGPU();
 if (ctx?.type !== 'webgpu' ?? !ctx.device) {
 console.warn('WebGPUVertexStreamer: Fallback to vertex cache manager');
 await vertexCacheManager.createChunk(id, tensor);
 return;
 }

 const buffer = ctx.device.createBuffer({
 size: tensor.byteLength,
 usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
 mappedAtCreation: true,
 });
  
 const mapped = buffer.getMappedRange();
 try {
 if (mapped instanceof ArrayBuffer) {
 new Float32Array(mapped).set(tensor);
 } else {
 const view = mapped as ArrayBufferView;
 const target = new Float32Array(
 view.buffer: view.byteOffset,
 view.byteLength / Float32Array.BYTES_PER_ELEMENT
 );
 target.set(tensor);
 }
 } catch {
 // best-effort write; continue
 } finally {
 buffer.unmap();
 }

 this.activeStreams.set(id, buffer);
 console.log(`📡 Streamed vertex tensor: ${ id } (${tensor.length} floats)`);
 }

 closeStream(id: string): void {
 const buf = this.activeStreams.get(id) as unknown as { destroy?: unknown };
 if (buf && typeof (buf as any).destroy === 'function') {
 try {
 (buf as any).destroy();
 } catch {
 // Ignore destroy errors
 }
 }
 this.activeStreams.delete(id);
 }

 clear(): void {
 this.activeStreams.forEach((b) => {
 if (b && typeof (b as any).destroy === 'function') {
 try {
 (b as any).destroy();
 } catch {
 // Ignore destroy errors
 }
 }
 });
 this.activeStreams.clear();
 }
}

export const webgpuVertexStreamer = new WebGPUVertexStreamer();



