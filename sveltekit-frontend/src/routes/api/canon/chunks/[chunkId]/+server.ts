/**
 * GET /api/canon/chunks/[chunkId] — Fetch a specific canonical chunk by its deterministic ID
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { canonicalChunks, canonicalDocuments } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { isValidSafeId } from '$lib/server/validation.js';

export const GET: RequestHandler = async ({ params }) => {
	const { chunkId } = params;

	if (!isValidSafeId(chunkId)) {
		return json({ error: 'Invalid chunk ID format' }, { status: 400 });
	}

	try {
		const rows = await db
			.select({
				id: canonicalChunks.id,
				chunkId: canonicalChunks.chunkId,
				chunkIndex: canonicalChunks.chunkIndex,
				content: canonicalChunks.content,
				tokenCount: canonicalChunks.tokenCount,
				semanticLabel: canonicalChunks.semanticLabel,
				domains: canonicalChunks.domains,
				keyTerms: canonicalChunks.keyTerms,
				metadata: canonicalChunks.metadata,
				createdAt: canonicalChunks.createdAt,
				docTitle: canonicalDocuments.title,
				docType: canonicalDocuments.docType,
				citation: canonicalDocuments.citation,
				jurisdiction: canonicalDocuments.jurisdiction,
				authorityLevel: canonicalDocuments.authorityLevel,
				sourceName: canonicalDocuments.sourceName,
			})
			.from(canonicalChunks)
			.innerJoin(canonicalDocuments, eq(canonicalChunks.documentId, canonicalDocuments.id))
			.where(eq(canonicalChunks.chunkId, chunkId))
			.limit(1);

		if (!rows[0]) {
			return json({ error: 'Chunk not found' }, { status: 404 });
		}

		return json({ success: true, chunk: rows[0] });
	} catch (err) {
		console.error('[canon/chunks] GET error:', err);
		return json({ error: 'Failed to fetch chunk' }, { status: 500 });
	}
};