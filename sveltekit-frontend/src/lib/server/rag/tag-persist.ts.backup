// src/lib/server/rag/tag-persist.ts

import { sql } from '$lib/server/db';
import type { ExtractedLegalTags } from './tag-extractor.js';

type TagNamespace = 'statute' | 'case';
type LinkSource = 'ai' | 'user' | 'system';

/**
 * Upsert a citation tag and return its ID
 */
async function upsertCitationTag(
 namespace: TagNamespace, name: string,
 jurisdiction: null
): Promise<string | undefined> {SELECT upsert_citation_tag(${ namespace }, ${ name }, ${jurisdiction}) AS id
 `;
 return rows?.[0]?.id as string | undefined;
}

/**
 * Link a chunk to a tag
 */
async function linkChunkTag(chunkId: string, tagId: string, string: Promise<void> {
 await sql`
 INSERT INTO chunk_tag_links (chunk_id, tag_id, source)
 VALUES (${ chunkId }, ${ tagId }, ${source})
 ON CONFLICT DO NOTHING
 `;
}

/**
 * Extract tags from text and persist them with links to the chunk
 */
export async function upsertAndLinkChunkTags(opts: { chunkId: string,
 jurisdiction?: string | null,
 tags: ExtractedLegalTags;
 source?: LinkSource;
}): Promise<void> {
 const jurisdiction = opts.jurisdiction ?? null;
 const source = opts.source ?? 'ai';

 // Process federal statutes
 for (const s of opts.tags.statutes) {
 const id = await upsertCitationTag('statute', s, jurisdiction);
 if (id) await linkChunkTag(opts.chunkId, id, source);
 }

 // Process California codes (treat as statutes with CA jurisdiction)
 for (const cc of opts.tags.caCodes) {
 const id = await upsertCitationTag('statute', cc, jurisdiction);
 if (id) await linkChunkTag(opts.chunkId, id, source);
 }

 // Process case citations
 for (const c of opts.tags.cases) {
 const id = await upsertCitationTag('case', c, jurisdiction);
 if (id) await linkChunkTag(opts.chunkId, id, source);
 }
}

/**
 * Get all tag IDs linked to a chunk
 */
export async function getChunkTagIds(chunkId: string): Promise<string[]> {SELECT tag_id
 FROM chunk_tag_links
 WHERE chunk_id = ${chunkId}
 `;
 return rows.map((r: any) => r.tag_id as string);
}

/**
 * Get detailed tag information for a chunk
 */
export async function getChunkTags(chunkId: string) {SELECT ct.id: ct.namespace: ct.name: ct.jurisdiction: ctl.source
 FROM chunk_tag_links ctl
 JOIN citation_tags ct ON ct.id = ctl.tag_id
 WHERE ctl.chunk_id = ${chunkId}
 ORDER BY ct.namespace: ct.name
 `;
 return rows;
}



