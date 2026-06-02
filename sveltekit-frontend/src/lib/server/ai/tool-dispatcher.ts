import { ENV } from '$lib/server/env.server.js';
import type { VlmToolRequest } from './vlm-plan-parser.js';

export type ToolResult = {
	tool: string;
	output: string;
	error?: string;
};

const QDRANT_COLLECTION = 'codebase_chunks_768';

async function dispatchRg(args: Record<string, unknown>): Promise<string> {
	const pattern = typeof args.pattern === 'string' ? args.pattern : '';
	const filePath = typeof args.path === 'string' ? args.path : 'src/';
	if (!pattern) return 'Error: rg requires a pattern argument';

	try {
		const base = ENV.PUBLIC_APP_URL;
		const res = await fetch(`${base}/api/codebase-index/search?q=${encodeURIComponent(pattern)}&path=${encodeURIComponent(filePath)}&limit=8`, {
			signal: AbortSignal.timeout(8_000),
		});
		if (!res.ok) return `rg search failed: HTTP ${res.status}`;
		const data = await res.json() as { results?: Array<{ path?: string; snippet?: string }> };
		const hits = data.results ?? [];
		if (!hits.length) return 'No results found';
		return hits.map(h => `${h.path ?? ''}: ${h.snippet ?? ''}`).join('\n');
	} catch (err) {
		return `rg error: ${(err as Error).message}`;
	}
}

async function dispatchQdrant(args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === 'string' ? args.query : '';
	const limit = typeof args.limit === 'number' ? Math.min(args.limit, 10) : 5;
	if (!query) return 'Error: qdrant requires a query argument';

	try {
		const base = ENV.PUBLIC_APP_URL;
		const embedRes = await fetch(`${base}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: query }),
			signal: AbortSignal.timeout(15_000),
		});
		if (!embedRes.ok) return `Qdrant embed failed: HTTP ${embedRes.status}`;
		const embedData = await embedRes.json() as { embedding?: number[] };
		if (!embedData.embedding?.length) return 'Qdrant: embed returned empty vector';

		const searchRes = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: { name: 'content', vector: embedData.embedding },
				limit,
				with_payload: true,
				with_vector: false,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!searchRes.ok) return `Qdrant search failed: HTTP ${searchRes.status}`;
		const searchData = await searchRes.json() as { result?: Array<{ payload?: { file_path?: string; chunk_text?: string }; score?: number }> };
		const points = searchData.result ?? [];
		if (!points.length) return 'No Qdrant results found';
		return points.map(p => `[${p.score?.toFixed(3)}] ${p.payload?.file_path ?? ''}: ${(p.payload?.chunk_text ?? '').slice(0, 200)}`).join('\n');
	} catch (err) {
		return `Qdrant error: ${(err as Error).message}`;
	}
}

async function dispatchSearxng(args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === 'string' ? args.query : '';
	const limit = typeof args.limit === 'number' ? Math.min(args.limit, 5) : 3;
	if (!query) return 'Error: searxng requires a query argument';

	try {
		const url = `${ENV.SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en-US`;
		const res = await fetch(url, {
			headers: { 'Accept': 'application/json' },
			signal: AbortSignal.timeout(12_000),
		});
		if (!res.ok) return `SearXNG failed: HTTP ${res.status}`;
		const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
		const results = (data.results ?? []).slice(0, limit);
		if (!results.length) return 'No SearXNG results';
		return results.map(r => `${r.title ?? ''}\n${r.url ?? ''}\n${(r.content ?? '').slice(0, 300)}`).join('\n\n');
	} catch (err) {
		return `SearXNG error: ${(err as Error).message}`;
	}
}

async function dispatchPostgres(args: Record<string, unknown>): Promise<string> {
	const query = typeof args.query === 'string' ? args.query : '';
	if (!query) return 'Error: postgres requires a query argument';

	const blocked = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/i;
	if (blocked.test(query)) return 'Error: only SELECT queries are allowed via tool-dispatcher';

	try {
		const base = ENV.PUBLIC_APP_URL;
		const res = await fetch(`${base}/api/admin/db/query`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sql: query, readOnly: true }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return `Postgres failed: HTTP ${res.status}`;
		const data = await res.json() as { rows?: unknown[]; error?: string };
		if (data.error) return `Postgres error: ${data.error}`;
		const rows = data.rows ?? [];
		return `${rows.length} row(s):\n${JSON.stringify(rows.slice(0, 10), null, 2)}`;
	} catch (err) {
		return `Postgres error: ${(err as Error).message}`;
	}
}

export async function dispatchTool(req: VlmToolRequest): Promise<ToolResult> {
	try {
		let output: string;
		switch (req.name) {
			case 'rg':       output = await dispatchRg(req.args);       break;
			case 'qdrant':   output = await dispatchQdrant(req.args);   break;
			case 'searxng':  output = await dispatchSearxng(req.args);  break;
			case 'postgres': output = await dispatchPostgres(req.args); break;
			default:         output = `Unknown tool: ${req.name}`;
		}
		return { tool: req.name, output };
	} catch (err) {
		return { tool: req.name, output: '', error: (err as Error).message };
	}
}

export async function dispatchTools(requests: readonly VlmToolRequest[]): Promise<ToolResult[]> {
	return Promise.all(requests.map(dispatchTool));
}
