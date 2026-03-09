// Minimal pgvector indexer using Drizzle (safe no-op if db not configured)

// Lazy imports to avoid build failure when not configured
export async function indexPgVector(doc: {
	id: string;
	text: string;
	embedding?: number[];
}): Promise<any> {
	try {
        // @ts-ignore - dynamic imports
		const mod = await import('$lib/server/db/connection');
        // @ts-ignore - dynamic imports
		const schema = await import('$lib/server/db/schema-unified');
		const db = (mod as any).db;
		const table = (schema as any).embeddings;

		if (!db || !table) return { ok: false, reason: 'db_or_table_missing' };

		const row = {
			id: doc.id,
			content: doc.text,
			embedding: doc.embedding,
			createdAt: new Date()
		};

		await db.insert(table).values(row);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
}




