import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { getQdrantUrl, getOllamaUrl } from '$lib/config/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
const QDRANT_URL = getQdrantUrl();
const OLLAMA_URL = getOllamaUrl();
const COLLECTION_NAME = 'fastmcp_file_profiles';

interface FileProfile {
	file_path: string;
	role: string;
	surface: string[];
	dependencies: string[];
	exports: string[];
	imports: string[];
	comments: string[];
	risk: string;
	change_frequency: string;
	related_routes: string[];
	tags: string[];
	summary: string;
	generated_at: string;
}

interface QdrantPoint {
	id: number;
	payload: FileProfile;
	vector?: number[];
}

interface QdrantScrollResponse {
	result: {
		points: QdrantPoint[];
		next_page_offset?: number;
	};
	status: string;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const limit = parseInt(url.searchParams.get('limit') ?? '100');
		const offset = url.searchParams.get('offset') ?? null;
		const role = url.searchParams.get('role') ?? null;
		const risk = url.searchParams.get('risk') ?? null;
		const surface = url.searchParams.get('surface') ?? null;
		const search = url.searchParams.get('search') ?? null;

		// Build filter
		const must: Array<{ key: string; match: { value: string } | { any: string[] } }> = [];
		if (role) {
			must.push({ key: 'role', match: { value: role } });
		}
		if (risk) {
			must.push({ key: 'risk', match: { value: risk } });
		}
		if (surface) {
			must.push({ key: 'surface', match: { any: [surface] } });
		}

		// Scroll through Qdrant collection
		const scrollPayload: Record<string, unknown> = {
			limit,
			with_payload: true,
			with_vector: false
		};

		if (offset) {
			scrollPayload.offset = parseInt(offset);
		}

		if (must.length > 0) {
			scrollPayload.filter = { must };
		}

		const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(scrollPayload)
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Qdrant error:', errorText);
			return json({
				files: [],
				stats: { totalFiles: 0, byRole: {}, byRisk: {}, bySurface: {} },
				error: `Qdrant request failed: ${response.status}`
			}, { status: 200 });
		}

		const data = await response.json() as QdrantScrollResponse;
		let files = data.result?.points ?? [];

		// Client-side search if query provided
		if (search) {
			const q = search.toLowerCase();
			files = files.filter(f =>
				f.payload.file_path.toLowerCase().includes(q) ||
				f.payload.summary.toLowerCase().includes(q) ||
				f.payload.tags.some(t => t.toLowerCase().includes(q))
			);
		}

		// Calculate stats
		const stats = {
			totalFiles: files.length,
			byRole: {} as Record<string, number>,
			byRisk: {} as Record<string, number>,
			bySurface: {} as Record<string, number>
		};

		for (const file of files) {
			const p = file.payload;
			stats.byRole[p.role] = (stats.byRole[p.role] ?? 0) + 1;
			stats.byRisk[p.risk] = (stats.byRisk[p.risk] ?? 0) + 1;
			for (const s of p.surface) {
				stats.bySurface[s] = (stats.bySurface[s] ?? 0) + 1;
			}
		}

		return json({
			files,
			stats,
			nextOffset: data.result?.next_page_offset
		});
	} catch (error) {
		console.error('Codebase index API error:', error);
		return json({
			files: [],
			stats: { totalFiles: 0, byRole: {}, byRisk: {}, bySurface: {} },
			error: 'Indexing failed'
		}, { status: 200 });
	}
};

const codebaseSearchSchema = z.object({
	query: z.string().min(1, 'Query is required').max(5000),
	limit: z.number().int().min(1).max(100).optional().default(20)
});

// POST for semantic search using embedding
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = codebaseSearchSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { query, limit } = parsed.data;

		// Get embedding from Ollama
		const embedResponse = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: query
			})
		});

		if (!embedResponse.ok) {
			return json({ error: 'Failed to generate embedding' }, { status: 500 });
		}

		const embedData = await embedResponse.json();
		const vector = embedData.embedding;

		// Search Qdrant with vector
		const searchResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector,
				limit,
				with_payload: true
			})
		});

		if (!searchResponse.ok) {
			const errorText = await searchResponse.text();
			return json({ error: `Qdrant search failed: ${errorText}` }, { status: 500 });
		}

		const data = await searchResponse.json();
		return json({
			files: data?.result || [],
			query
		});
	} catch (error) {
		console.error('Semantic search error:', error);
		return json({
			error: 'Search failed'
		}, { status: 500 });
	}
};
