/**
 * ACP Tools API Endpoint
 * GET /api/acp/tools - List available tools with schemas and capabilities
 */

import { getACPToolRegistry, toolSupportsDryRun } from '$lib/server/services/knowledge-search/ACPToolRegistry';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { RequestHandler } from './$types.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
	category: z.string().max(100).optional(),
	// Mirrors the MCP-side selectMcpToolSubset() query-hint pattern (src/mcp/server.ts,
	// MCP-SELECT-03/04/05) — an optional relevance hint used to shrink the response from
	// the full ~108-tool/1.2MB registry down to a query-relevant subset. This is a
	// context/discovery optimization only, never an authorization boundary: it fails
	// open to the full list on any error, missing hint, or selector unavailability.
	queryHint: z.string().max(500).optional()
});

type ToolSelectorFn = (query: string, opts: { topK: number }) => Promise<{ mcp_names?: string[] }>;

// Resolving a repo-root-relative script path from a SvelteKit +server.ts is
// unreliable via import.meta.url alone — dev (unbundled) and a production
// Vite build (bundled into .svelte-kit/output/) resolve to different
// directory depths. Try both process.cwd()-relative candidates (matches the
// "Cross-Directory Script Safety" convention: dev server is started from
// either the repo root or sveltekit-frontend/) and the import.meta.url
// fallback, first one that exists on disk wins. Fails open (null selector,
// full list returned) if none resolve — never throws.
function resolveToolSelectorPath(): string | null {
	const candidates = [
		join(process.cwd(), 'scripts', 'atlas', 'runtime-mcp-tool-selector.mjs'),
		join(process.cwd(), '..', 'scripts', 'atlas', 'runtime-mcp-tool-selector.mjs'),
		join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', 'scripts', 'atlas', 'runtime-mcp-tool-selector.mjs')
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

let _selectToolsForQuery: ToolSelectorFn | null | undefined;

async function loadToolSelector(): Promise<ToolSelectorFn | null> {
	if (_selectToolsForQuery !== undefined) return _selectToolsForQuery;
	try {
		const selectorPath = resolveToolSelectorPath();
		if (!selectorPath) {
			_selectToolsForQuery = null;
			return _selectToolsForQuery;
		}
		const mod = await import(/* @vite-ignore */ pathToFileURL(selectorPath).href);
		_selectToolsForQuery = typeof mod.selectToolsForQuery === 'function' ? mod.selectToolsForQuery : null;
	} catch {
		_selectToolsForQuery = null; // selector script unavailable — degrade to full list, never throw
	}
	return _selectToolsForQuery;
}

async function selectToolSubset<T extends { name: string }>(
	allTools: T[],
	queryHint: string | undefined
): Promise<{ tools: T[]; filtered: boolean }> {
	if (!queryHint) return { tools: allTools, filtered: false };

	const selectFn = await loadToolSelector();
	if (!selectFn) return { tools: allTools, filtered: false };

	try {
		const topK = Number(process.env.ACP_TOOL_TOP_K) || 16;
		const { mcp_names } = await selectFn(queryHint, { topK });
		if (!mcp_names?.length) return { tools: allTools, filtered: false };
		const names = new Set(mcp_names);
		const filtered = allTools.filter((t) => names.has(t.name));
		if (filtered.length === 0) return { tools: allTools, filtered: false }; // never advertise zero tools
		return { tools: filtered, filtered: true };
	} catch {
		return { tools: allTools, filtered: false }; // selector call failed at runtime — degrade to full list, never throw
	}
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const category = parsed.success ? parsed.data.category : undefined;
	const queryHint = parsed.success ? parsed.data.queryHint : undefined;

	const registry = getACPToolRegistry();
	let tools = registry.list();

	if (category) {
		tools = registry.byCategory(category);
	}

	const { tools: selectedTools, filtered } = await selectToolSubset(tools, queryHint);

	const responseData = {
		success: true,
		tools: selectedTools.map(t => ({
			name: t.name,
			description: t.description,
			category: t.category,
			supportsDryRun: toolSupportsDryRun(t.name),
			inputSchema: t.inputSchema,
			outputSchema: t.outputSchema,
			examples: t.examples
		})),
		count: selectedTools.length,
		...(filtered ? { filtered: true, totalAvailable: tools.length } : {})
	};

	// A query-hint-filtered subset must never be cached/ETag'd as if it were the
	// stable catalog (mirrors MCP-SELECT-04). The unfiltered (no-hint) response is
	// the real stable catalog and keeps its existing ETag/cache-control behavior.
	if (filtered) {
		return json(responseData, { headers: { 'Cache-Control': 'no-store' } });
	}

	const { etag, isMatch } = checkETag(responseData, request.headers);
	if (isMatch) return notModified(etag);

	return json(responseData, {
		headers: { ...cacheControl.medium, ETag: etag }
	});
};
