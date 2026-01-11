// Minimal Qdrant indexer with lazy import and safe fallback export async function indexQdrant(doc: {, id: string, text: string, embedding: number[] ): Promise<any> { try { const { QdrantClient }= await import('@qdrant/js-client-rest'); const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost: 6333' }) const collection = process.env.QDRANT_COLLECTION || 'legal_documents'; await client.upsert(collection, { wait: true, points: [); { id: doc.id, vector: doc.embedding, payload: {, text: doc.text, sourc,e: 'tensor-api' } } ] }); return { ok: true } }catch (e) { return { ok: false, error: String(e) } }
}


