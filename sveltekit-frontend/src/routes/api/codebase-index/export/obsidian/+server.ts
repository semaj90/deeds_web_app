/**
 * GET  /api/codebase-index/export/obsidian
 *   Generates a Karpathy-style Obsidian knowledge vault from codebase_chunks_768.
 *   ?limit=N       — max chunks to scroll (default 5000, cap 30000)
 *   ?vault=true    — write all generated notes directly to Obsidian via /api/obsidian
 *   ?folder=<str>  — vault folder prefix (default 'Codebase Intelligence')
 *   ?topN=<n>      — when vault=true, only write top-N files by PageRank (default 150)
 *
 * POST /api/codebase-index/export/obsidian
 *   { action: 'generate' | 'write-vault', folder?: string, topN?: number }
 *   generate    → returns { files: [{path, content}], stats }
 *   write-vault → writes all files to Obsidian, returns { written, failed, skipped }
 *
 * Knowledge card format (Karpathy-style):
 *   YAML frontmatter with all Qdrant + Neo4j metadata
 *   Summary: domain, kind, complexity, PageRank
 *   Semantic tags
 *   Top code chunks (first 400 chars each)
 *   Cross-references: wikilinks to same GPU cluster + same domain
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const QDRANT_URL  = ENV.QDRANT_URL;
const COLLECTION  = 'codebase_chunks_768';

// ── Payload shape ─────────────────────────────────────────────────────────────

interface ChunkPayload {
	file_path?:                string;
	relativePath?:             string;
	content?:                  string;
	kind?:                     string;
	symbol?:                   string;
	lineStart?:                number;
	lineEnd?:                  number;
	extension?:                string;
	domain?:                   string;
	role?:                     string;
	risk?:                     string;
	summary?:                  string;
	tags?:                     string | string[];
	// Neo4j enrichment fields
	neo4j_gpuCluster?:         number;
	neo4j_pageRankScore?:      number;
	neo4j_hasAuthGuard?:       boolean;
	neo4j_hasZodValidation?:   boolean;
	neo4j_hasCachePattern?:    boolean;
	neo4j_isSseEndpoint?:      boolean;
	neo4j_isWorkerBoundary?:   boolean;
	neo4j_hasErrorHandling?:   boolean;
	neo4j_complexity?:         number;
	neo4j_routeType?:          string;
	neo4j_communityId?:        number;
	neo4j_enrichedAt?:         string;
	// SOM / KAG fields
	som_cluster?:              number;
	kag_context?:              string;
	[key: string]: unknown;
}

interface QdrantPoint {
	id:      string | number;
	payload?: ChunkPayload;
}

// ── File card (aggregated from all chunks of the same file) ────────────────────

interface FileCard {
	noteId:        string;
	title:         string;
	path:          string;
	relativePath:  string;
	domain:        string;
	extension:     string;
	kind:          string;
	role:          string;
	risk:          string;
	summary:       string;
	tags:          string[];
	gpuCluster?:   number;
	pageRank?:     number;
	hasAuthGuard?: boolean;
	hasZod?:       boolean;
	hasCache?:     boolean;
	isSse?:        boolean;
	isWorker?:     boolean;
	hasErrorHandling?: boolean;
	complexity?:   number;
	routeType?:    string;
	somCluster?:   number;
	kagContext?:   string;
	chunks: { content: string; symbol?: string; lineStart?: number; lineEnd?: number }[];
	totalChunks:   number;
}

// ── Validation ────────────────────────────────────────────────────────────────

const getSchema  = z.object({
	limit:  z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
	vault:  z.enum(['true', 'false']).optional().default('false'),
	folder: z.string().max(100).optional().default('Codebase Intelligence'),
	topN:   z.coerce.number().int().min(1).max(500).optional().default(150),
});

const postSchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('generate'),    folder: z.string().max(100).optional().default('Codebase Intelligence'), topN: z.number().int().min(1).max(500).optional().default(150) }),
	z.object({ action: z.literal('write-vault'), folder: z.string().max(100).optional().default('Codebase Intelligence'), topN: z.number().int().min(1).max(500).optional().default(150) }),
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a file path into a stable Obsidian note ID (no slashes/dots). */
function toNoteId(filePath: string): string {
	return filePath
		.replace(/^(src\/|sveltekit-frontend\/src\/)/i, '')
		.replace(/\.[^.]+$/, '')              // strip extension
		.replace(/[/\\]/g, '-')               // slashes → dashes
		.replace(/[^a-zA-Z0-9-_]/g, '_')      // other specials → underscore
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase()
		.slice(0, 120);
}

/** Tags derived from neo4j boolean flags */
function auditTags(card: FileCard): string[] {
	const t: string[] = [];
	if (card.hasAuthGuard   === true)  t.push('has-auth-guard');
	if (card.hasAuthGuard   === false) t.push('no-auth-guard');
	if (card.hasZod         === true)  t.push('has-zod-validation');
	if (card.hasCache)                 t.push('has-cache-pattern');
	if (card.isSse)                    t.push('sse-endpoint');
	if (card.isWorker)                 t.push('worker-boundary');
	if (card.hasErrorHandling)         t.push('has-error-handling');
	if (card.routeType)                t.push(`route:${card.routeType}`);
	if (card.risk === 'high')          t.push('high-risk');
	if (card.risk === 'med')           t.push('medium-risk');
	return t;
}

/** Render a YAML string value (quoted if needed). */
function yamlStr(v: string | undefined | null): string {
	if (!v) return '""';
	if (/[:#\[\]{},&*?|<>=!%@`\n]/.test(v)) return `"${v.replace(/"/g, '\\"')}"`;
	return v;
}

/** Render a YAML string list. */
function yamlList(arr: string[]): string {
	if (arr.length === 0) return '[]';
	return arr.map(t => `  - ${yamlStr(t)}`).join('\n');
}

/** Generate a single Obsidian markdown note for one file. */
function buildNote(card: FileCard, allCards: FileCard[], folder: string): { path: string; content: string } {
	const exportedAt = new Date().toISOString();
	const allTags    = [...card.tags, ...auditTags(card)].filter(Boolean);
	const uniqueTags = [...new Set(allTags)];

	// Related files: same GPU cluster or same domain, exclude self
	const related = allCards
		.filter(c =>
			c.noteId !== card.noteId &&
			(
				(card.gpuCluster !== undefined && c.gpuCluster === card.gpuCluster) ||
				(c.domain === card.domain && c.domain !== 'unknown')
			)
		)
		.sort((a, b) => (b.pageRank ?? 0) - (a.pageRank ?? 0))
		.slice(0, 8);

	// YAML frontmatter
	const frontmatter = [
		'---',
		`title: ${yamlStr(card.title)}`,
		`path: ${yamlStr(card.path)}`,
		`domain: ${yamlStr(card.domain)}`,
		`extension: ${yamlStr(card.extension)}`,
		`kind: ${yamlStr(card.kind)}`,
		`role: ${yamlStr(card.role)}`,
		`risk: ${yamlStr(card.risk)}`,
		`tags:\n${yamlList(uniqueTags)}`,
		card.gpuCluster   !== undefined ? `neo4j_gpuCluster: ${card.gpuCluster}` : null,
		card.pageRank     !== undefined ? `neo4j_pageRankScore: ${card.pageRank.toFixed(6)}` : null,
		card.complexity   !== undefined ? `neo4j_complexity: ${card.complexity}` : null,
		card.somCluster   !== undefined ? `som_cluster: ${card.somCluster}` : null,
		`totalChunks: ${card.totalChunks}`,
		`exportedAt: "${exportedAt}"`,
		'---',
	].filter(l => l !== null).join('\n');

	// Body
	const lines: string[] = [frontmatter, ''];

	// Header
	lines.push(`# \`${card.path}\``);
	lines.push('');

	// Stats line
	const stats: string[] = [];
	if (card.domain    ) stats.push(`**Domain**: \`${card.domain}\``);
	if (card.kind      ) stats.push(`**Kind**: \`${card.kind}\``);
	if (card.complexity !== undefined) stats.push(`**Complexity**: ${card.complexity}`);
	if (card.pageRank  !== undefined)  stats.push(`**PageRank**: ${card.pageRank.toFixed(4)}`);
	if (card.gpuCluster !== undefined) stats.push(`**GPU Cluster**: ${card.gpuCluster}`);
	if (card.somCluster !== undefined) stats.push(`**SOM Cluster**: ${card.somCluster}`);
	if (stats.length > 0) {
		lines.push('> ' + stats.join(' · '));
		lines.push('');
	}

	// Summary
	if (card.summary) {
		lines.push('## Summary');
		lines.push('');
		lines.push(card.summary);
		lines.push('');
	}

	// Semantic tags
	if (uniqueTags.length > 0) {
		lines.push('## Semantic Tags');
		lines.push('');
		lines.push(uniqueTags.map(t => `\`${t}\``).join(' '));
		lines.push('');
	}

	// Code chunks (top 3, 400 chars max each)
	if (card.chunks.length > 0) {
		lines.push('## Code Chunks');
		lines.push('');
		card.chunks.slice(0, 3).forEach((chunk, i) => {
			const loc = (chunk.lineStart !== undefined && chunk.lineEnd !== undefined)
				? ` — lines ${chunk.lineStart}–${chunk.lineEnd}`
				: '';
			const sym = chunk.symbol ? ` (${chunk.symbol})` : '';
			lines.push(`### Chunk ${i + 1}${sym}${loc}`);
			lines.push('');
			if (chunk.content) {
				const preview = chunk.content.length > 400
					? chunk.content.slice(0, 400) + '\n// …truncated'
					: chunk.content;
				lines.push('```' + (card.extension === 'ts' ? 'typescript' : card.extension ?? ''));
				lines.push(preview);
				lines.push('```');
			}
			lines.push('');
		});
	}

	// KAG context
	if (card.kagContext) {
		lines.push('## KAG Context');
		lines.push('');
		lines.push('```');
		lines.push(card.kagContext.slice(0, 800));
		lines.push('```');
		lines.push('');
	}

	// Related files (wikilinks)
	if (related.length > 0) {
		lines.push('## Related Files');
		lines.push('');
		for (const rel of related) {
			const reason = rel.gpuCluster === card.gpuCluster
				? `GPU cluster ${rel.gpuCluster}`
				: `domain: ${rel.domain}`;
			lines.push(`- [[${rel.noteId}|${rel.path}]] *(${reason})*`);
		}
		lines.push('');
	}

	lines.push('---');
	lines.push('*Auto-generated by Deeds Legal AI · Codebase Intelligence*');

	// Obsidian path: folder/domain/noteId.md
	const domainFolder = (card.domain && card.domain !== 'unknown') ? card.domain : 'misc';
	const obsidianPath = `${folder}/${domainFolder}/${card.noteId}.md`;

	return { path: obsidianPath, content: lines.join('\n') };
}

/** Build an index note listing all files grouped by domain. */
function buildIndex(cards: FileCard[], folder: string, stats: Record<string, number>): { path: string; content: string } {
	const now = new Date().toISOString();
	const byDomain = new Map<string, FileCard[]>();
	for (const c of cards) {
		const d = c.domain || 'misc';
		if (!byDomain.has(d)) byDomain.set(d, []);
		byDomain.get(d)!.push(c);
	}

	const lines: string[] = [
		'---',
		`title: "Codebase Knowledge Index"`,
		`generated: "${now}"`,
		`totalFiles: ${cards.length}`,
		`totalChunks: ${stats.totalChunks ?? 0}`,
		'tags: [codebase, index, karpathy, knowledge-base]',
		'---',
		'',
		'# Codebase Knowledge Index',
		'',
		`> Generated ${now} · ${cards.length} files · ${stats.totalChunks ?? 0} chunks`,
		'',
		'## Stats',
		'',
		'| Metric | Value |',
		'|--------|-------|',
		`| Indexed Files | ${cards.length} |`,
		`| Total Chunks  | ${stats.totalChunks ?? 0} |`,
		`| GPU Clusters  | ${stats.gpuClusters ?? '?'} |`,
		`| Domains       | ${byDomain.size} |`,
		`| High-Risk     | ${cards.filter(c => c.risk === 'high').length} |`,
		`| Auth-Guarded  | ${cards.filter(c => c.hasAuthGuard).length} |`,
		'',
		'---',
		'',
	];

	for (const [domain, domCards] of [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)) {
		lines.push(`## ${domain} (${domCards.length} files)`);
		lines.push('');
		const sorted = domCards.sort((a, b) => (b.pageRank ?? 0) - (a.pageRank ?? 0));
		for (const c of sorted) {
			const pr  = c.pageRank  !== undefined ? ` · PR: ${c.pageRank.toFixed(4)}`  : '';
			const cpu = c.gpuCluster !== undefined ? ` · C${c.gpuCluster}`              : '';
			const risk = c.risk === 'high' ? ' 🔴' : c.risk === 'med' ? ' 🟡' : '';
			lines.push(`- [[${c.noteId}|${c.title}]]${risk}${pr}${cpu}`);
		}
		lines.push('');
	}

	return { path: `${folder}/_Index.md`, content: lines.join('\n') };
}

// ── Scroll Qdrant ─────────────────────────────────────────────────────────────

async function scrollChunks(limit: number): Promise<QdrantPoint[]> {
	const points: QdrantPoint[] = [];
	let offset: string | number | null = null;
	const PAGE = 1_000;

	while (points.length < limit) {
		const body: Record<string, unknown> = {
			limit:        Math.min(PAGE, limit - points.length),
			with_payload: true,
			with_vector:  false,
		};
		if (offset !== null) body['offset'] = offset;

		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify(body),
			signal:  AbortSignal.timeout(30_000),
		}).catch(() => null);

		if (!res?.ok) break;

		const data = await res.json() as { result?: { points?: QdrantPoint[]; next_page_offset?: string | number | null } };
		const batch = data?.result?.points ?? [];
		points.push(...batch);

		offset = data?.result?.next_page_offset ?? null;
		if (!offset || batch.length < PAGE) break;
	}

	return points;
}

// ── Aggregate chunks → FileCard map ──────────────────────────────────────────

function aggregateCards(points: QdrantPoint[]): FileCard[] {
	const map = new Map<string, FileCard>();

	for (const pt of points) {
		const p = pt.payload ?? {};
		const filePath = (p.file_path as string | undefined) ?? (p.relativePath as string | undefined) ?? '';
		if (!filePath) continue;

		if (!map.has(filePath)) {
			map.set(filePath, {
				noteId:       toNoteId(filePath),
				title:        filePath.split('/').pop() ?? filePath,
				path:         filePath,
				relativePath: (p.relativePath as string | undefined) ?? filePath,
				domain:       (p.domain   as string  | undefined) ?? 'unknown',
				extension:    (p.extension as string  | undefined) ?? '',
				kind:         (p.kind     as string  | undefined) ?? 'unknown',
				role:         (p.role     as string  | undefined) ?? 'unknown',
				risk:         (p.risk     as string  | undefined) ?? 'unknown',
				summary:      (p.summary  as string  | undefined) ?? '',
				tags:         [],
				gpuCluster:   p.neo4j_gpuCluster   as number  | undefined,
				pageRank:     p.neo4j_pageRankScore as number  | undefined,
				hasAuthGuard: p.neo4j_hasAuthGuard   as boolean | undefined,
				hasZod:       p.neo4j_hasZodValidation as boolean | undefined,
				hasCache:     p.neo4j_hasCachePattern   as boolean | undefined,
				isSse:        p.neo4j_isSseEndpoint     as boolean | undefined,
				isWorker:     p.neo4j_isWorkerBoundary  as boolean | undefined,
				hasErrorHandling: p.neo4j_hasErrorHandling as boolean | undefined,
				complexity:   p.neo4j_complexity  as number  | undefined,
				routeType:    p.neo4j_routeType   as string  | undefined,
				somCluster:   p.som_cluster        as number  | undefined,
				kagContext:   p.kag_context        as string  | undefined,
				chunks:       [],
				totalChunks:  0,
			});
		}

		const card = map.get(filePath)!;
		card.totalChunks++;

		// Merge tags
		const rawTags = p.tags as string | string[] | undefined;
		if (rawTags) {
			const arr = Array.isArray(rawTags) ? rawTags : [rawTags];
			for (const t of arr) {
				if (t && !card.tags.includes(t)) card.tags.push(t);
			}
		}

		// Collect chunk content (up to 3 per file)
		if (card.chunks.length < 3 && p.content) {
			card.chunks.push({
				content:   p.content as string,
				symbol:    p.symbol    as string | undefined,
				lineStart: p.lineStart as number | undefined,
				lineEnd:   p.lineEnd   as number | undefined,
			});
		}

		// Keep enrichment fields from whichever chunk has them
		if (p.neo4j_pageRankScore !== undefined && card.pageRank === undefined) {
			card.pageRank = p.neo4j_pageRankScore as number;
		}
		if (p.neo4j_gpuCluster !== undefined && card.gpuCluster === undefined) {
			card.gpuCluster = p.neo4j_gpuCluster as number;
		}
	}

	return [...map.values()];
}

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const params = getSchema.safeParse(Object.fromEntries(url.searchParams));
	const { limit, vault, folder, topN } = params.success
		? params.data
		: { limit: 5_000, vault: 'false', folder: 'Codebase Intelligence', topN: 150 };

	try {
		const points  = await scrollChunks(limit);
		const allCards = aggregateCards(points);

		// Sort by PageRank descending; fall back to totalChunks
		allCards.sort((a, b) =>
			(b.pageRank ?? 0) - (a.pageRank ?? 0) ||
			b.totalChunks - a.totalChunks
		);

		const stats = {
			totalFiles:    allCards.length,
			totalChunks:   points.length,
			gpuClusters:   new Set(allCards.map(c => c.gpuCluster).filter(x => x !== undefined)).size,
			domains:       new Set(allCards.map(c => c.domain)).size,
			highRiskFiles: allCards.filter(c => c.risk === 'high').length,
			enrichedFiles: allCards.filter(c => c.gpuCluster !== undefined).length,
		};

		if (vault !== 'true') {
			// Return file list only (no vault write)
			const topCards  = allCards.slice(0, topN ?? 150);
			const indexNote = buildIndex(topCards, folder, stats);
			const notes     = topCards.map(c => buildNote(c, topCards, folder));
			notes.unshift(indexNote);
			return json({ files: notes.map(n => ({ path: n.path, size: n.content.length })), stats, exportedAt: new Date().toISOString() });
		}

		// Write vault — top N files by PageRank
		const topCards  = allCards.slice(0, topN ?? 150);
		const indexNote = buildIndex(topCards, folder, stats);
		const notes     = topCards.map(c => buildNote(c, topCards, folder));
		notes.unshift(indexNote);

		let written = 0;
		let failed  = 0;
		for (const note of notes) {
			const res = await fetch('/api/obsidian', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ action: 'write', path: note.path, content: note.content }),
			}).catch(() => null);
			if (res?.ok) written++; else failed++;
		}

		return json({ written, failed, stats, exportedAt: new Date().toISOString() });
	} catch (err) {
		console.error('[obsidian-export] Error:', err);
		return json({ written: 0, failed: 0, stats: { totalFiles: 0, totalChunks: 0 }, error: 'Export failed' }, { status: 200 });
	}
};

// ── POST ──────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try { raw = await request.json(); } catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

	const parsed = postSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const { action, folder, topN } = parsed.data;

	try {
		const points   = await scrollChunks(10_000);
		const allCards = aggregateCards(points);

		allCards.sort((a, b) =>
			(b.pageRank ?? 0) - (a.pageRank ?? 0) ||
			b.totalChunks - a.totalChunks
		);

		const stats = {
			totalFiles:    allCards.length,
			totalChunks:   points.length,
			gpuClusters:   new Set(allCards.map(c => c.gpuCluster).filter(x => x !== undefined)).size,
			domains:       new Set(allCards.map(c => c.domain)).size,
			highRiskFiles: allCards.filter(c => c.risk === 'high').length,
			enrichedFiles: allCards.filter(c => c.gpuCluster !== undefined).length,
		};

		const n        = topN ?? 150;
		const topCards = allCards.slice(0, n);
		const indexNote = buildIndex(topCards, folder, stats);
		const notes    = topCards.map(c => buildNote(c, topCards, folder));
		notes.unshift(indexNote);

		if (action === 'generate') {
			return json({ files: notes.map(n => ({ path: n.path, content: n.content })), stats, exportedAt: new Date().toISOString() });
		}

		// write-vault
		let written = 0;
		let failed  = 0;
		for (const note of notes) {
			const res = await fetch('/api/obsidian', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ action: 'write', path: note.path, content: note.content }),
			}).catch(() => null);
			if (res?.ok) written++; else failed++;
		}

		return json({ written, failed, total: notes.length, stats, folder, exportedAt: new Date().toISOString() });
	} catch (err) {
		console.error('[obsidian-export POST] Error:', err);
		return json({ written: 0, failed: 0, total: 0, stats: { totalFiles: 0, totalChunks: 0 }, error: 'Export failed' });
	}
};
