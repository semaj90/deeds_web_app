import { pgRows } from '$lib/server/db/client';
/**
 * Mirrored Tag Sync — CouchDB + Qdrant + pgvector
 *
 * Tags are written to all 3 stores via Promise.allSettled (best-effort).
 * Reads: pgvector primary, Qdrant fallback, CouchDB catalog.
 */
import { sql } from 'drizzle-orm';
import type { GeneratedTag } from './types.js';
import { traceCouchDB, traceDB, traceVectorSearch } from '$lib/server/observability/langfuse.js';

// ── Mirror a tag to all 3 stores ──────────────────────────────────────

export async function mirrorTag(
	tag: GeneratedTag,
	documentId: string,
	embedding: number[]
): Promise<{ pgvector: boolean; qdrant: boolean; couchdb: boolean }> {
	const results = await Promise.allSettled([
		mirrorToPgvector(tag, documentId, embedding),
		mirrorToQdrant(tag, documentId, embedding),
		mirrorToCouchDB(tag, documentId)
	]);

	return {
		pgvector: results[0].status === 'fulfilled',
		qdrant: results[1].status === 'fulfilled',
		couchdb: results[2].status === 'fulfilled'
	};
}

// ── Batch mirror multiple tags ────────────────────────────────────────

export async function mirrorTags(
	tags: GeneratedTag[],
	documentId: string,
	embeddings: Map<string, number[]>
): Promise<{ mirrored: number; failed: number }> {
	let mirrored = 0;
	let failed = 0;

	for (const tag of tags) {
		const embedding = embeddings.get(tag.label) ?? new Array(768).fill(0);
		const result = await mirrorTag(tag, documentId, embedding);
		if (result.pgvector || result.qdrant || result.couchdb) {
			mirrored++;
		} else {
			failed++;
		}
	}

	return { mirrored, failed };
}

// ── Retrieve tags for a document ──────────────────────────────────────

export async function getDocumentTags(documentId: string): Promise<GeneratedTag[]> {
  // Primary: pgvector
  try {
    const { db } = await import('$lib/server/db/client');
    const rows = await db.execute(sql`
			SELECT tag_label, tag_category, confidence, source
			FROM document_tags
			WHERE document_id = ${documentId}
			ORDER BY confidence DESC
			LIMIT 30
		`);
    const tags = pgRows(rows) as Array<{
      tag_label: string;
      tag_category: string;
      confidence: number;
      source: string;
    }>;
    if (tags.length > 0) {
      return tags.map((t) => ({
        label: t.tag_label,
        category: t.tag_category as GeneratedTag['category'],
        confidence: Number(t.confidence),
        source: t.source as GeneratedTag['source'],
      }));
    }
  } catch (err) {
    console.warn(
      '[tag-sync] PostgreSQL tag lookup failed, falling back to Qdrant:',
      (err as Error)?.message ?? err
    );
  }

  // Fallback: Qdrant
  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const results = await qdrant.client.scroll('document_tags', {
      filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
      limit: 30,
      with_payload: true,
    });
    if (results.points?.length > 0) {
      return results.points.map((p: any) => ({
        label: p.payload?.tag_label ?? '',
        category: p.payload?.tag_category ?? 'topic',
        confidence: p.payload?.confidence ?? 0.5,
        source: p.payload?.source ?? 'llm',
      }));
    }
  } catch (err) {
    console.warn(
      '[tag-sync] Qdrant tag lookup failed, falling back to CouchDB:',
      (err as Error)?.message ?? err
    );
  }

  // Catalog: CouchDB
  try {
    return await traceCouchDB('get-tags', 'ace_tags', async () => {
      const { couchdb } = await import('$lib/server/services/couchdb-client.js');
      const doc = (await couchdb.get('ace_tags', `doc:${documentId}`)) as Record<string, unknown>;
      const tags = (doc.tags as GeneratedTag[]) ?? [];
      return tags;
    });
  } catch (err) {
    console.warn('[tag-sync] CouchDB tag lookup failed:', (err as Error)?.message ?? err);
    return [];
  }
}

// ── Semantic tag search via Qdrant ────────────────────────────────────

export async function searchTagsBySemantic(
  queryEmbedding: number[],
  limit = 10
): Promise<Array<GeneratedTag & { score: number; documentIds: string[] }>> {
  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const client = (qdrant as any).client;
    const results = await client.search('document_tags', {
      vector: queryEmbedding,
      limit,
      score_threshold: 0.6,
      with_payload: true,
    });

    return results.map((r: any) => ({
      label: r.payload?.tag_label ?? '',
      category: r.payload?.tag_category ?? 'topic',
      confidence: r.payload?.confidence ?? 0.5,
      source: r.payload?.source ?? 'llm',
      score: r.score,
      documentIds: r.payload?.document_ids ?? [],
    }));
  } catch (err) {
    console.warn('[tag-sync] semantic tag search failed:', (err as Error)?.message ?? err);
    return [];
  }
}

// ── Store Implementations ─────────────────────────────────────────────

async function mirrorToPgvector(
  tag: GeneratedTag,
  documentId: string,
  embedding: number[]
): Promise<void> {
  return traceDB(
    'tag-mirror-pgvector',
    { tag: tag.label, documentId: documentId.slice(0, 8) },
    async () => {
      const { db } = await import('$lib/server/db/client');
      const vectorStr = `[${embedding.join(',')}]`;
      await db.execute(sql`
			INSERT INTO document_tags (document_id, tag_label, tag_category, embedding, confidence, source)
			VALUES (${documentId}, ${tag.label}, ${tag.category}, ${vectorStr}::vector, ${tag.confidence}, ${tag.source})
			ON CONFLICT (document_id, tag_label) DO UPDATE SET
				confidence = EXCLUDED.confidence,
				embedding = EXCLUDED.embedding,
				source = EXCLUDED.source
		`);
    }
  );
}

async function mirrorToQdrant(
  tag: GeneratedTag,
  documentId: string,
  embedding: number[]
): Promise<void> {
  return traceVectorSearch(
    'document_tags',
    { tag: tag.label, documentId: documentId.slice(0, 8), op: 'upsert' },
    async () => {
      const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
      const client = (qdrant as any).client;
      const tagId = `${documentId}:${tag.label}`.replace(/[^a-zA-Z0-9_:-]/g, '_');

      await qdrant.upsert({
        collection: 'document_tags',
        wait: false,
        points: [
          {
            id: tagId,
            vector: embedding,
            payload: {
              tag_label: tag.label,
              tag_category: tag.category,
              confidence: tag.confidence,
              source: tag.source,
              document_id: documentId,
              document_ids: [documentId],
              created_at: new Date().toISOString(),
            },
          },
        ],
      } as any);
    }
  );
}

async function mirrorToCouchDB(tag: GeneratedTag, documentId: string): Promise<void> {
	return traceCouchDB('upsert-tag', 'ace_tags', async () => {
		const { couchdb } = await import('$lib/server/services/couchdb-client.js');
		const docKey = `doc:${documentId}`;

		try {
			const existing = (await couchdb.get('ace_tags', docKey)) as Record<string, unknown>;
			const tags = ((existing.tags as GeneratedTag[]) ?? []).filter((t) => t.label !== tag.label);
			tags.push(tag);
			await couchdb.put('ace_tags', docKey, { ...existing, tags, updatedAt: new Date().toISOString() });
		} catch (err) {
			console.warn('[tag-sync] CouchDB upsert fallback — creating new doc:', (err as Error)?.message ?? err);
			// Document doesn't exist — create it
			await couchdb.put('ace_tags', docKey, {
				documentId,
				tags: [tag],
				createdAt: new Date().toISOString()
			});
		}
	});
}
