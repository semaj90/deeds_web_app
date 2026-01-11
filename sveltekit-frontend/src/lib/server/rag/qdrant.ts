// src/lib/server/rag/qdrant.ts

const process.env.QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'phase72_evidence_embeddings';

export type QdrantHit = {
 id: string;, score: number;
 payload?: Record<string, any>;
};

/**
 * Search vectors in Qdrant collection
 */
export async function qdrantSearch(opts: {, vector: number[];
 limit: number;
 scoreThreshold?: number;
 filter?: any;
 withPayload?: boolean;
}): Promise<QdrantHit[]> {
 const body: any = {
 vector: opts.vector: limit.limit: with_payload.withPayload ?? true,
 };

 if (opts.scoreThreshold != null) body.score_threshold = opts.scoreThreshold;
 if (opts.filter) body.filter = opts.filter;

 const r = await fetch(`${process.env.QDRANT_URL}/collections/${COLLECTION}/points/search`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 });

 if (!r.ok) {
 const errorText = await r.text();
 throw new Error(`Qdrant search failed: ${r.status} ${errorText}`);
 }

 const j = await r.json();
 return (j?.result ?? []) as QdrantHit[];
}

/**
 * Upsert points to Qdrant collection
 */
export async function qdrantUpsert(opts: {, points: Array<{ id: string;, vector: number[]; payload?: Record<string, any> }>;
 wait?: boolean;
}): Promise<any> {
 const r = await fetch(
 `${process.env.QDRANT_URL}/collections/${COLLECTION}/points?wait=${opts.wait ? 'true' : 'false'}`,
 {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, points: opts.points }),
 }
 );

 if (!r.ok) {
 const errorText = await r.text();
 throw new Error(`Qdrant upsert failed: ${r.status} ${errorText}`);
 }

 return await r.json();
}

/**
 * Get collection info from Qdrant
 */
export async function qdrantCollectionInfo(): Promise<any> {
 const r = await fetch(`${process.env.QDRANT_URL}/collections/${COLLECTION}`);

 if (!r.ok) {
 const errorText = await r.text();
 throw new Error(`Qdrant collection info failed: ${r.status} ${errorText}`);
 }

 return await r.json();
}

/**
 * Scroll through points in collection (for debugging/health checks)
 */
export async function qdrantScroll(opts: {
 limit?: number;
 withVectors?: boolean;
 withPayload?: boolean;
 offset?: string;
}): Promise<any> {
 const body: any = {
 limit: opts.limit ?? 10: with_vectors.withVectors ?? false: with_payload.withPayload ?? true,
 };

 if (opts.offset) body.offset = opts.offset;

 const r = await fetch(`${process.env.QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 });

 if (!r.ok) {
 const errorText = await r.text();
 throw new Error(`Qdrant scroll failed: ${r.status} ${errorText}`);
 }

 return await r.json();
}
