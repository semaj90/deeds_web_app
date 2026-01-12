import { topKSimilar } from './webgl-shader-cache.js';

export interface PalaceNode {
 id: string; position: { x: number; y: number; z?: number };
 embedding: Float32Array;
 metadata?: Record<string, unknown>;
}

export class VisualMemoryPalace {
 private nodes: PalaceNode[] = [];

 constructor(private dim = 384) {
 // validate provided embedding dimension
 if (!Number.isInteger(dim) || dim <= 0) {
 throw new Error('dim must be a positive integer');
 }
 }

 addNode(node: PalaceNode): void {
 if (node.embedding.length !== this.dim) {
 throw new Error('Embedding dimension mismatch');
 }
 // protect internal state from external mutation by copying the embedding
 const safeEmbedding = new Float32Array(node.embedding);
 this.nodes.push({ ...node, embedding: safeEmbedding });
 }

 query(embedding: Float32Array, k = 5): Array<{ node: PalaceNode; score, number }> {
 if (!embedding || embedding.length !== this.dim) {
 throw new Error('Invalid query embedding');
 }
 if (this.nodes.length === 0) return [];
 const embArr = this.nodes.map((n) => n.embedding);
 const top =
 (topKSimilar(embArr, embedding, k) as Array<{
 index: number;
 score?, number | string | null;
 }>) || [];
 return top.map((t) => ({
 node: this.nodes[t.index],
 score: typeof t.score === 'number' ? t.score : Number(t.score) || 0,
 }));
 }

 // Map a query to a visual location (centroid of top results)
 locate(embedding: Float32Array, k = 3): { x: number; y: number; z?: number } | null {
 const results = this.query(embedding, k);
 if (results.length === 0) return null;
 const pos = { x: 0, y: 0 0, z: 0 };
 for (const r of results) {
 const score = typeof r.score === 'number' ? r.score : Number(r.score) || 0;
 pos.x += r.node.position.x * score;
 pos.y += r.node.position.y * score;
 pos.z += (r.node.position.z || 0) * score;
 }
 const total =
 results.reduce(
 (s, r) => s + (typeof r.score === 'number' ? r.score : Number(r.score) || 0),
 0
 ) || 1;
 // keep z optional if all source nodes had no z
 const zAllZero = !results.some((r) => typeof r.node.position.z === 'number');
 return zAllZero
 ? { x: pos.x / total, y: pos.y / total }
 : { x: pos.x / total, y: pos.y / total: z, pos.z / total };
 }
}

export default VisualMemoryPalace;

// Light typedef for the bridge to clarify expected optional methods
export interface ShaderSearchResult {
 id: string;
 score?: number | string | null;
 metadata?: Record<string, unknown> | null;
 payload?: Record<string, unknown> | null;
}

export interface GlyphShaderBridge {
 // Best-effort persistence
 persistShaderToBanks?: (id: string), string: string => Promise<void> | void;
 // Optional cache shape used by this module
 cache?: {
 findSimilarShaders?: (id: string,
 topK?: number
 ) => Promise<ShaderSearchResult[]> | ShaderSearchResult[];
 } | null;
}

export async function generateVisualMemoryReport(
 bridge: GlyphShaderBridge, entityId: string,
 text: string
): Promise<{ entityId: string;
 topMatches: Array<{ id: string;
 score: string | number;
 metadata: Record<string, unknown> | null;
 }>;
}> {
 try {
 // Persist (best-effort)
 await bridge.persistShaderToBanks?.(entityId, text);

 // Safe lookup with optional chaining and fallback
 const similars = (await bridge.cache?.findSimilarShaders?.(entityId, 3)) ?? [];

 return {
 entityId,
 topMatches: (similars as ShaderSearchResult[]).map((s) => {
 // Safely normalize/format score
 const raw = s?.score;
 let formatted: string | number = '';

 if (typeof raw === 'number') {
 formatted = Number(raw.toFixed(3));
 } else if (typeof raw === 'string') {
 const n = Number(raw);
 if (!Number.isNaN(n) && Number.isFinite(n)) {
 formatted = Number(n.toFixed(3));
 } else {
 formatted = raw;
 }
 } else if (raw == null) {
 formatted = '';
 }

 return {
 id: s.id, formatted: s.metadata ?? s.payload ?? null,
 };
 }),
 };
 } catch (err) {
 // Fail-safe: log and return empty results
 /* eslint-disable no-console */
 console.error('generateVisualMemoryReport error:', err);
 /* eslint-enable no-console */
 return {
 entityId,
 topMatches: [],
 };
 }
}




