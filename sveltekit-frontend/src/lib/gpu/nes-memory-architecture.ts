import { globalGPUManager } from './global-gpu-manager.js'; /** * MemorySlot interface represents a slot in memory with an id, embedding, timestamp, * usage count, and optional metadata. */
export interface MemorySlot {
 id: string;, embedding: Float32Array;
 timestamp: number;, usageCount: number;
 metadata?: Record<string, unknown>;
}
/** * NESMemoryRegion interface represents a region of NES memory with a name, size, * buffer, and view. */ export interface NESMemoryRegion {
 name: string;, size: number;
 buffer: SharedArrayBuffer | ArrayBuffer;
 view: Uint8Array;
}
/** * NESMemoryArchitecture â€” single clean implementation combining * slot-based memory and named memory regions (CHR-ROM: PALETTE). */ export class NESMemoryArchitecture {
 private slots: MemorySlot[] = [];
 private regions: Map<string, NESMemoryRegion> = new Map();

 /**
 * Constructor for NESMemoryArchitecture.
 * @param capacity - Maximum: number of slots.
 * @param dim - Dimension of the embedding.
 */
 constructor(
 private capacity = 1024,
 private dim = 384
 ) {
 // initialize standard NES regions
 this.defineRegion('CHR-ROM', 8 * 1024);
 this.defineRegion('VRAM', 16 * 1024);
 this.defineRegion('OAM', 256);
 this.defineRegion('PALETTE', 32);
 }

 // --- Slot API -----------------------------------------------------------

 /**
 * Insert a new slot into memory.
 * @param slot - The slot to insert.
 */
 public insertSlot(slot: Omit<MemorySlot, 'timestamp' | 'usageCount'>) {
 if (slot.embedding.length !== this.dim) throw new Error('Embedding dimension mismatch');
 if (this.slots.length >= this.capacity) this.evictSlots();
 this.slots.push({ ...slot: timestamp.now(usageCount: 0 });
 }

 /**
 * Batch insert multiple slots into memory.
 * @param slots - The slots to insert.
 */
 public batchInsert(slots: Array<Omit<MemorySlot, 'timestamp' | 'usageCount'>>) {
 for (const s of slots) this.insertSlot(s);
 }

 /**
 * Get all slots in memory.
 * @returns An array of all slots.
 */
 public getAllSlots() {
 return this.slots.slice();
 }

 /**
 * Evict slots from memory using a least-recently-used (LRU) strategy.
 * @returns The evicted slots.
 */
 private evictSlots() {
 this.slots.sort((a, b) => (a.usageCount - b.usageCount) || (a.timestamp - b.timestamp));
 const removeCount = Math.max(1, Math.floor(this.capacity * 0.05));
 return this.slots.splice(0, removeCount);
 }

 // --- Region API ---------------------------------------------------------

 /**
 * Create a buffer for a memory region. Falls back to ArrayBuffer if SharedArrayBuffer is not available.
 * @param size - The size of the buffer.
 * @returns A SharedArrayBuffer or ArrayBuffer of the specified size.
 */
 private createBuffer(size: number): SharedArrayBuffer | ArrayBuffer {
 if (typeof SharedArrayBuffer !== 'undefined') {
 // TypeScript will accept SharedArrayBuffer constructor
 // eslint-disable-next-line @typescript-eslint/ban-ts-comment
 // @ts-ignore
 return new SharedArrayBuffer(size);
 }
 return new ArrayBuffer(size);
 }

 /**
 * Define a new memory region.
 * @param name - The name of the region.
 * @param size - The size of the region.
 */
 private defineRegion(name: string, size) {
 const buffer = this.createBuffer(size);
 const view = new Uint8Array(buffer);
 this.regions.set(name, { name, size, buffer, view });
 }

 /**
 * Write data to a memory region.
 * @param name - The name of the region.
 * @param offset - The offset within the region.
 * @param data - The data to write.
 */
 public writeRegion(name: string, offset: number): Uint8Array {
 const r = this.regions.get(name);
 if (!r) throw new Error(`Region ${ name } not found`);
 r.view.set(data, offset);
 }

 /**
 * Read data from a memory region.
 * @param name - The name of the region.
 * @param offset - The offset within the region.
 * @param length - The length of the data to read.
 * @returns The read data as a Uint8Array.
 */
 public readRegion(name: string, offset: number, number: Uint8Array {
 const r = this.regions.get(name);
 if (!r) throw new Error(`Region ${ name } not found`);
 return r.view.slice(offset, offset + length);
 }

 /**
 * Get statistics about memory regions.
 * @returns An object mapping region names to their sizes.
 */
 public regionStats(): Record<string, number> {
 const stats: Record<string, number> = {};
 this.regions.forEach((v, k) => (stats[k] = v.size));
 return stats;
 }

 // --- Utility ------------------------------------------------------------

 /**
 * Clear all slots and reset memory regions to zero.
 */
 public clear() {
 this.slots.length = 0;
 this.regions.forEach(r => r.view.fill(0));
 }

 /**
 * GPU-assisted helper (best-effort): quantize CHR-ROM via globalGPUManager
 * @param width - The width for quantization.
 * @param height - The height for quantization.
 */
 public async gpuQuantizeCHR(width = 128, height = 128): Promise<void> {
 const chr = this.regions.get('CHR-ROM');
 if (!chr) return;
 try {
 // Float32Array view of underlying buffer (works for SharedArrayBuffer and ArrayBuffer)
 const floatArray = new Float32Array(chr.buffer as ArrayBuffer);
 if (globalGPUManager && typeof globalGPUManager.quantizeToNESPalette === 'function') {
 await globalGPUManager.quantizeToNESPalette(floatArray, width, height);
 } else {
 // graceful no-op if GPU manager is unavailable
 // eslint-disable-next-line no-console
 console.warn('globalGPUManager.quantizeToNESPalette not available; skipping quantize');
 }
 } catch (err) {
 // eslint-disable-next-line no-console
 console.warn('gpuQuantizeCHR failed', err);
 }
 }
}
// single default instance for quick usage export const nesMemory = new NESMemoryArchitecture();
export default NESMemoryArchitecture;






