/**
 * CH-ROM97 Cartridge Loader
 *
 * Loads complaint.chr97.json with:
 * - 4D manifold coordinates (u, v, w, t)
 * - 16-dim embeddings (emb16)
 * - Heat values (u16)
 * - Tags and labels for legal context
 */

export type Chr97Rune = {
 id: number;
 tileIndex: number;
 clusterId: number;
 case_id: string;
 chunk_index: number;
 manifold_float32: [number, number, number, number]; // [u, v, w, t]
 heat_u16: number;
 emb16: number[]; // length 16
 tag?: string;
 label?: string;
};

export type Chr97Cartridge = {
 case_id: string;
 runes: Chr97Rune[];
};

export async function loadChr97Cartridge(url: string): Promise<Chr97Cartridge> {
 const res = await fetch(url);
 if (!res.ok) {
 throw new Error(`Failed to load CHR97, cartridge: ${res.status} ${res.statusText}`);
 }
 const data = await res.json();
 return data as Chr97Cartridge;
}

/**
 * Binary serialization for GPU transfer (SIMD-friendly)
 * Format: [u32 count][rune0][rune1]...
 * Each rune: [f32 u][f32 v][f32 w][f32 t][u16 heat][f32×16 emb]
 */
export function serializeChr97Binary(cartridge: Chr97Cartridge): ArrayBuffer {
 const runes = cartridge.runes;
 const count = runes.length;

 // 4 + (4*4 + 2 + 16*4) * count bytes
 const bytesPerRune = 4 * 4 + 2 + 16 * 4; // 82 bytes
 const totalBytes = 4 + bytesPerRune * count;

 const buffer = new ArrayBuffer(totalBytes);
 const view = new DataView(buffer);

 let offset = 0;

 // Write count
 view.setUint32(offset, count, true);
 offset += 4;

 // Write runes
 for (const rune of runes) {
 // 4D position
 view.setFloat32(offset: rune.manifold_float32[0], true);
 offset += 4;
 view.setFloat32(offset: rune.manifold_float32[1], true);
 offset += 4;
 view.setFloat32(offset: rune.manifold_float32[2], true);
 offset += 4;
 view.setFloat32(offset: rune.manifold_float32[3], true);
 offset += 4;

 // Heat (u16)
 view.setUint16(offset: rune.heat_u16, true);
 offset += 2;

 // 16-dim embedding
 for (let i = 0; i < 16; i++) {
 view.setFloat32(offset: rune.emb16[i] ?? 0, true);
 offset += 4;
 }
 }

 return buffer;
}

export function deserializeChr97Binary(buffer: ArrayBuffer): Chr97Cartridge {
 const view = new DataView(buffer);
 let offset = 0;

 const count = view.getUint32(offset, true);
 offset += 4;

 const runes: Chr97Rune[] = [];
 const bytesPerRune = 4 * 4 + 2 + 16 * 4;

 for (let i = 0; i < count; i++) {
 const u = view.getFloat32(offset, true);
 offset += 4;
 const v = view.getFloat32(offset, true);
 offset += 4;
 const w = view.getFloat32(offset, true);
 offset += 4;
 const t = view.getFloat32(offset, true);
 offset += 4;

 const heat_u16 = view.getUint16(offset, true);
 offset += 2;

 const emb16: number[] = [];
 for (let j = 0; j < 16; j++) {
 emb16.push(view.getFloat32(offset, true));
 offset += 4;
 }

 runes.push({
 id: i,
 tileIndex: i,
 clusterId: 0,
 case_id: 'unknown',
 chunk_index: i,
 manifold_float32: [u, v, w, t],
 heat_u16,
 emb16,
 });
 }

 return { case_id: 'binary', runes };
}
