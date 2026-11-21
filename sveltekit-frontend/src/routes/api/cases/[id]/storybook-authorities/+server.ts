import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { compileContext } from '$lib/server/ace/context-compiler.parent-atlas.js';
import { listCaseAuthorityJurisdictionsV1, searchCaseLinkedAuthorityChunksV1, searchCaseLinkedCitingChunksV1 } from '$lib/server/legal/statute-search-v1.js';
import { createLibraryCitationContextManifestV1 } from '$lib/server/library/library-citation-provenance-v1.js';

const jurisdictionCode = z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/);
const questionSchema = z.object({
	question: z.string().trim().min(1).max(500),
	jurisdiction: jurisdictionCode,
}).strict();
const citingSchema = z.object({
	jurisdiction: jurisdictionCode, targetChunkId: z.uuid(), targetRevision: z.uuid(),
	targetChunkHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const headers = { 'Cache-Control': 'private, no-store' };

export const GET: RequestHandler = async ({ params, locals }) => {
	const actorId = Number(locals.user?.id);
	const empty = { jurisdictions: [] };
	if (!Number.isSafeInteger(actorId) || actorId < 1) return json(empty, { status: 401, headers });
	const caseId = z.uuid().safeParse(params.id);
	if (!caseId.success) return json(empty, { status: 404, headers });
	try {
		if (!await getAuthorizedCase(caseId.data, actorId)) return json(empty, { status: 404, headers });
		const jurisdictions = await listCaseAuthorityJurisdictionsV1(pool, caseId.data, actorId);
		return json({ jurisdictions }, { headers });
	} catch {
		return json(empty, { status: 503, headers });
	}
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const actorId = Number(locals.user?.id);
	if (!Number.isSafeInteger(actorId) || actorId < 1) return json({ error: 'Sign in to search case authorities.' }, { status: 401, headers });
	const caseId = z.uuid().safeParse(params.id);
	if (!caseId.success) return json({ error: 'Case not found.' }, { status: 404, headers });
	const parsed = z.union([questionSchema, citingSchema]).safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'Enter a research question or select a verified citation.' }, { status: 400, headers });
	const { jurisdiction } = parsed.data;
	const scope = { caseId: caseId.data, actorId, jurisdiction };
	const manifestScope = { caseId: caseId.data, actorId, authorityJurisdiction: jurisdiction };
	const target = 'targetChunkId' in parsed.data ? parsed.data : null;
	async function targetIsCurrent() {
		if (!target) return true;
		const manifest = await createLibraryCitationContextManifestV1({
			...manifestScope, candidates: [{ chunkId: target.targetChunkId, ordinal: 1 }],
		});
		const authority = manifest?.entries.get(1);
		return Boolean(authority?.authority && authority.documentRevision === target.targetRevision && authority.chunkHash === target.targetChunkHash);
	}
	try {
		if (!await getAuthorizedCase(caseId.data, actorId)) return json({ error: 'Case not found.' }, { status: 404, headers });
		if (!(await targetIsCurrent())) return json({ error: 'Citation changed or is unavailable.' }, { status: 409, headers });
		const hits = 'question' in parsed.data
			? await searchCaseLinkedAuthorityChunksV1(pool, { ...scope, question: parsed.data.question })
			: await searchCaseLinkedCitingChunksV1(pool, { ...scope, ...parsed.data });
		const libraryManifest = await createLibraryCitationContextManifestV1({
			...manifestScope,
			candidates: hits.map(({ chunkId }, index) => ({ chunkId, ordinal: index + 1 })),
		});
		if (!await getAuthorizedCase(caseId.data, actorId)) return json({ error: 'Case not found.' }, { status: 404, headers });
		if (target && !(await targetIsCurrent())) return json({ error: 'Citation changed or is unavailable.' }, { status: 409, headers });
		const entries = new Map([...(libraryManifest?.entries.values() ?? [])].map((entry) => [entry.chunkId, entry]));
		const admitted = hits.filter((hit) => {
			const entry = entries.get(hit.chunkId);
			if (!entry?.authority || !Number.isFinite(hit.score)) return false;
			if ('citationText' in hit && typeof hit.citationText === 'string') {
				return hit.citationText.length > 0 && entry.quote.toLowerCase().includes(hit.citationText.toLowerCase());
			}
			return !('citationText' in hit);
		});
		const compiled = compileContext({
			request_id: randomUUID(),
			candidates: admitted.flatMap(({ chunkId, score }) => {
				const entry = entries.get(chunkId);
				if (!entry) return [];
				return [{ packet_key: chunkId, source_ref: `library:${entry.documentId}:${entry.documentRevision}:${chunkId}`,
					source_revision: `sha256:${entry.sourceHash.toLowerCase()}`, content: entry.quote,
					lanes: [target ? 'graph' as const : 'lexical' as const], relevance: score, authority: 1 }];
			}),
			policy: { version: 'storybook-linked-authorities.v1', token_budget: 1500, max_packet_tokens: 450, max_packets: 6 },
		});
		const authorities = compiled.manifest.selected_packet_keys.flatMap((chunkId) => {
			const entry = entries.get(chunkId);
			return entry ? [{ ...entry, excerptCharEnd: entry.charStart + entry.quote.length }] : [];
		});
		return json({
			status: authorities.length ? 'READY_FOR_REVIEW' : 'NO_VERIFIED_PASSAGES', jurisdiction, authorities,
			coverage: { matched: hits.length, verified: admitted.length, shown: authorities.length,
				matchLimit: 24, contraryAuthorityChecked: false },
			citationManifestSha256: authorities.length ? libraryManifest?.manifestSha256 ?? null : null,
		}, { headers });
	} catch {
		return json({ error: 'Case authority search is unavailable.' }, { status: 503, headers });
	}
};
