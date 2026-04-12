/**
 * GET /api/canon — List canonical documents with filters
 * POST /api/canon — Create a new canonical document
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { canonicalDocuments } from '$lib/server/db/schema-postgres.js';
import { desc, and, sql } from 'drizzle-orm';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';

const createDocSchema = z.object({
	title: z.string().min(1).max(500),
	docType: z.enum(['statute', 'opinion', 'rule', 'jury_instruction', 'treatise', 'regulation']),
	citation: z.string().max(500).optional(),
	jurisdiction: z.string().min(2).max(10),
	authorityLevel: z.enum(['primary', 'persuasive', 'secondary', 'fictional']),
	sourceUrl: z.string().url().optional(),
	sourceName: z.string().max(200).optional(),
	licenseTag: z.string().max(100).optional(),
	fullText: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const jurisdiction = url.searchParams.get('jurisdiction');
  const authorityLevel = url.searchParams.get('authority');
  const docType = url.searchParams.get('type');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

  try {
    const conditions = [];
    if (jurisdiction) conditions.push(sql`${canonicalDocuments.jurisdiction} = ${jurisdiction}`);
    if (authorityLevel)
      conditions.push(sql`${canonicalDocuments.authorityLevel} = ${authorityLevel}`);
    if (docType) conditions.push(sql`${canonicalDocuments.docType} = ${docType}`);

    const docs = await db
      .select({
        id: canonicalDocuments.id,
        title: canonicalDocuments.title,
        docType: canonicalDocuments.docType,
        citation: canonicalDocuments.citation,
        jurisdiction: canonicalDocuments.jurisdiction,
        authorityLevel: canonicalDocuments.authorityLevel,
        sourceName: canonicalDocuments.sourceName,
        licenseTag: canonicalDocuments.licenseTag,
        createdAt: canonicalDocuments.createdAt,
      })
      .from(canonicalDocuments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(canonicalDocuments.createdAt))
      .limit(limit);

    const responseData = { success: true, documents: docs, count: docs.length };

    // ETag check for 304 response (canonical documents are stable reference data)
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.long, ETag: etag }
    });
  } catch (err) {
    console.error('[canon] GET error:', err);
    return json(
      { success: true, documents: [], count: 0 },
      { headers: cacheControl.long }
    );
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = createDocSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const body = parsed.data;
		const [doc] = await db.insert(canonicalDocuments).values({
			title: body.title,
			docType: body.docType,
			citation: body.citation ?? null,
			jurisdiction: body.jurisdiction as typeof canonicalDocuments.jurisdiction.enumValues[number],
			authorityLevel: body.authorityLevel as typeof canonicalDocuments.authorityLevel.enumValues[number],
			sourceUrl: body.sourceUrl ?? null,
			sourceName: body.sourceName ?? null,
			licenseTag: body.licenseTag ?? null,
			fullText: body.fullText ?? null,
			metadata: body.metadata ?? {},
			retrievedAt: new Date(),
		}).returning();

		return json({ success: true, document: doc }, { status: 201 });
	} catch (err) {
		console.error('[canon] POST error:', err);
		return json({ error: 'Failed to create canonical document' }, { status: 500 });
	}
};