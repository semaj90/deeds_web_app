import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	generateClusterNote,
	generateAllClusterNotes,
	recordRetrievalNote,
	buildPlaybookNote,
	recordResearchNote,
	listWikiNotes,
	getWikiNote,
	exportToObsidian,
} from '$lib/server/features/codebase-intel/index.js';
import type { WikiNote } from '$lib/server/features/codebase-intel/index.js';

/**
 * GET /api/codebase-index/wiki
 *
 * Query params:
 *   type     — 'cluster' | 'retrieval' | 'playbook' | 'research'
 *   id       — specific note ID (e.g. "cluster:gpu:5")
 *   limit    — max results (default 50)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const type = url.searchParams.get('type') as WikiNote['type'] | null;
	const id = url.searchParams.get('id');
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

	// Single note lookup
	if (id) {
		const note = await getWikiNote(id);
		if (!note) return json({ note: null });
		return json({ note });
	}

	// List by type
	if (type && ['cluster', 'retrieval', 'playbook', 'research'].includes(type)) {
		const notes = await listWikiNotes(type, limit);
		return json({ notes, total: notes.length });
	}

	return json({ notes: [], total: 0, hint: 'Provide ?type= or ?id=' });
};

const generateSchema = z.object({
	action: z.enum(['generate_cluster', 'generate_all_clusters', 'record_retrieval', 'build_playbook', 'record_research', 'export_obsidian']),
	// generate_cluster
	clusterId: z.number().optional(),
	clusterType: z.enum(['gpu', 'som']).optional(),
	// record_retrieval
	query: z.string().max(4000).optional(),
	queryHash: z.string().max(16).optional(),
	chunks: z.array(z.object({
		path: z.string(),
		score: z.number(),
		tags: z.array(z.string()).optional(),
	})).optional(),
	clusters: z.array(z.number()).optional(),
	cacheHit: z.enum(['L1', 'L2', 'L3', 'miss']).optional(),
	pipeline: z.string().max(50).optional(),
	durationMs: z.number().optional(),
	// build_playbook
	symptom: z.string().max(500).optional(),
	domain: z.string().max(100).optional(),
	// record_research
	outsideSources: z.array(z.object({
		title: z.string(),
		url: z.string(),
		snippet: z.string(),
	})).optional(),
	internalAreas: z.array(z.string()).optional(),
	confidence: z.number().optional(),
	unresolvedQuestions: z.array(z.string()).optional(),
	// export_obsidian
	noteId: z.string().optional(),
});

/**
 * POST /api/codebase-index/wiki
 *
 * Actions:
 *   generate_cluster      — generate wiki note for one cluster
 *   generate_all_clusters — bulk generate for all clusters with ≥3 members
 *   record_retrieval      — record a retrieval run as wiki note
 *   build_playbook        — build/update error-fixing playbook
 *   record_research       — record deep research output
 *   export_obsidian       — export a note to Obsidian vault
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: z.infer<typeof generateSchema>;
	try {
		body = generateSchema.parse(await request.json());
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	switch (body.action) {
		case 'generate_cluster': {
			if (body.clusterId == null) return json({ error: 'clusterId required' }, { status: 400 });
			const note = await generateClusterNote(body.clusterId, body.clusterType ?? 'gpu');
			return json({ note });
		}

		case 'generate_all_clusters': {
			const result = await generateAllClusterNotes(body.clusterType ?? 'gpu');
			return json(result);
		}

		case 'record_retrieval': {
			if (!body.query || !body.queryHash) return json({ error: 'query + queryHash required' }, { status: 400 });
			const note = await recordRetrievalNote({
				query: body.query,
				queryHash: body.queryHash,
				chunks: body.chunks ?? [],
				clusters: body.clusters ?? [],
				cacheHit: body.cacheHit ?? 'miss',
				pipeline: body.pipeline ?? 'ace',
				durationMs: body.durationMs ?? 0,
			});
			return json({ note });
		}

		case 'build_playbook': {
			if (!body.symptom || !body.domain) return json({ error: 'symptom + domain required' }, { status: 400 });
			const note = await buildPlaybookNote(body.symptom, body.domain);
			return json({ note });
		}

		case 'record_research': {
			if (!body.query) return json({ error: 'query required' }, { status: 400 });
			const note = await recordResearchNote({
				query: body.query,
				outsideSources: body.outsideSources ?? [],
				internalAreas: body.internalAreas ?? [],
				confidence: body.confidence ?? 0,
				pipeline: body.pipeline ?? 'deep-research',
				unresolvedQuestions: body.unresolvedQuestions,
			});
			return json({ note });
		}

		case 'export_obsidian': {
			if (!body.noteId) return json({ error: 'noteId required' }, { status: 400 });
			const note = await getWikiNote(body.noteId);
			if (!note) return json({ error: 'Note not found' }, { status: 404 });
			const exported = await exportToObsidian(note);
			return json({ exported, noteId: body.noteId });
		}
	}
};
