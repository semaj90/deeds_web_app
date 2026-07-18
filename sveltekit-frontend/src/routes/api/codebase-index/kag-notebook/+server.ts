import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { couchdb } from '$lib/server/services/couchdb-client.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { bifrostChat } from '$lib/server/ollama.js';

const QDRANT_URL = ENV.QDRANT_URL;

interface NotebookCell {
	id: string;
	type: 'error-cluster' | 'file-profile';
	title: string;
	summary: string;
	errorCount: number;
	topErrors: { code: string; message: string; file: string }[];
	relatedFiles: { path: string; role: string; risk: string; tags: string[] }[];
	kagContext: string;
	aceReady: boolean;
	// CouchDB GPU cluster enrichment
	gpuClusterId?: number;
	gpuClusterSize?: number;
	importRecommendations?: { targetPath: string; similarity: number; reason: string }[];
}

const postSchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('export-obsidian') }),
	z.object({ action: z.literal('ace-fix'),     errorId: z.string().min(1) }),
	z.object({ action: z.literal('llm-ace-fix'), errorId: z.string().min(1), clusterId: z.string().optional() }),
]);

/** GET /api/codebase-index/kag-notebook
 *
 *  Data sources (all degraded-safe):
 *   - Qdrant phase90_error_clusters   → error cluster cells
 *   - Qdrant phase90_error_cards      → per-error context
 *   - Qdrant codebase_chunks_768      → file profiles
 *   - CouchDB graph_clusters          → GPU k-means cluster membership (MapReduce)
 *   - CouchDB graph_recommendations   → GPU cosine-similarity import suggestions
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 50);

	// ── Parallel fetches: Qdrant (3) + CouchDB (2) ────────────────────────────
	const qdrantScroll = (collection: string, rowLimit: number) =>
		fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ limit: rowLimit, with_payload: true, with_vector: false }),
			signal: AbortSignal.timeout(15_000)
		}).catch(() => null);

	const [clustersRes, cardsRes, filesRes, gpuClusters, importRecos] = await Promise.all([
		qdrantScroll('phase90_error_clusters', limit),
		qdrantScroll('phase90_error_cards', 200),
		qdrantScroll('codebase_chunks_768', 500),
		// CouchDB: GPU k-means cluster membership (written by codebase-cluster-detection.ts)
		couchdb.allDocs('graph_clusters', { include_docs: true, limit: 50 }).catch(() => null),
		// CouchDB: GPU cosine-similarity import recommendations (written by missing-import-recommendations.ts)
		couchdb.allDocs('graph_recommendations', { include_docs: true, limit: 100 }).catch(() => null)
	]);

	const clusters: any[]    = clustersRes?.ok ? (await clustersRes.json()).result?.points  ?? [] : [];
	const cards: any[]       = cardsRes?.ok    ? (await cardsRes.json()).result?.points     ?? [] : [];
	const filePoints: any[]  = filesRes?.ok    ? (await filesRes.json()).result?.points     ?? [] : [];

	// ── CouchDB MapReduce data ────────────────────────────────────────────────
	// graph_clusters: { _id: "cluster-N", clusterId, memberCount, members[], dominantAstCluster }
	const gpuClusterDocs: any[] = gpuClusters?.rows?.map((r: any) => r.doc).filter(Boolean) ?? [];

	// graph_recommendations: { _id: "graph-reco:file:<id>", filePath, recommendedImports[] }
	// Build a map from filePath → import recommendations for fast lookup
	const recoByFile = new Map<string, { targetPath: string; similarity: number; reason: string }[]>();
	for (const row of (importRecos?.rows ?? [])) {
		const doc = row.doc;
		if (doc?.filePath && Array.isArray(doc.recommendedImports)) {
			recoByFile.set(doc.filePath, doc.recommendedImports.slice(0, 3).map((r: any) => ({
				targetPath: r.targetFilePath ?? '',
				similarity: r.similarity ?? 0,
				reason: r.reason ?? ''
			})));
		}
	}

	// Build GPU cluster lookup: filePath → { clusterId, clusterSize }
	const fileClusterMap = new Map<string, { clusterId: number; clusterSize: number }>();
	for (const doc of gpuClusterDocs) {
		if (!Array.isArray(doc.members)) continue;
		for (const member of doc.members) {
			if (member.filePath) {
				fileClusterMap.set(member.filePath, {
					clusterId: doc.clusterId ?? 0,
					clusterSize: doc.memberCount ?? 0
				});
			}
		}
	}

	// ── Build file map from codebase chunks ───────────────────────────────────
	const fileMap = new Map<string, { path: string; role: string; risk: string; tags: string[]; domain: string; summary: string }>();
	for (const pt of filePoints) {
		const { file_path, role, risk, tags, domain, summary } = pt.payload ?? {};
		if (file_path && !fileMap.has(file_path)) {
			fileMap.set(file_path, {
				path: file_path,
				role: role ?? 'unknown',
				risk: risk ?? 'unknown',
				tags: Array.isArray(tags) ? tags : [],
				domain: domain ?? '',
				summary: summary ?? ''
			});
		}
	}

	// ── Build notebook cells from error clusters ──────────────────────────────
	const cells: NotebookCell[] = clusters.map((cluster) => {
		const p = cluster.payload ?? {};
		const clusterFilePaths: string[] = p.affected_files ?? p.file_paths ?? [];

		const clusterCards = cards.filter(
			(c) => c.payload?.cluster_id === cluster.id || clusterFilePaths.includes(c.payload?.file_path)
		);

		const directFiles = clusterFilePaths
			.map((fp: string) => fileMap.get(fp))
			.filter(Boolean) as { path: string; role: string; risk: string; tags: string[] }[];

		const padFiles =
			directFiles.length < 3
				? Array.from(fileMap.values()).filter((f) => f.risk === 'high').slice(0, 5 - directFiles.length)
				: [];

		const allRelated = [...directFiles, ...padFiles].slice(0, 8);

		// Enrich with GPU cluster data for the first related file
		const firstFilePath = allRelated[0]?.path;
		const gpuInfo = firstFilePath ? fileClusterMap.get(firstFilePath) : undefined;
		const importRecosList = firstFilePath ? (recoByFile.get(firstFilePath) ?? []) : [];

		return {
			id: String(cluster.id),
			type: 'error-cluster' as const,
			title: p.cluster_label ?? p.label ?? `Error Cluster ${cluster.id}`,
			summary: p.description ?? p.summary ?? 'No description available',
			errorCount: p.error_count ?? clusterCards.length,
			topErrors: clusterCards.slice(0, 5).map((c) => ({
				code: c.payload?.error_code ?? 'UNKNOWN',
				message: c.payload?.normalized_message ?? c.payload?.raw_message ?? '',
				file: c.payload?.file_path ?? ''
			})),
			relatedFiles: allRelated,
			kagContext: p.kag_context ?? '',
			aceReady: clusterCards.length > 0,
			gpuClusterId: gpuInfo?.clusterId,
			gpuClusterSize: gpuInfo?.clusterSize,
			importRecommendations: importRecosList
		};
	});

	// ── Fallback: high-risk file-profile cells when no error clusters ─────────
	if (cells.length === 0) {
		const highRisk = Array.from(fileMap.values()).filter((f) => f.risk === 'high').slice(0, limit);
		for (const f of highRisk) {
			const gpuInfo = fileClusterMap.get(f.path);
			cells.push({
				id: f.path,
				type: 'file-profile',
				title: f.path.split('/').pop() ?? f.path,
				summary: f.summary || `High-risk ${f.role} in ${f.domain}`,
				errorCount: 0,
				topErrors: [],
				relatedFiles: [f],
				kagContext: '',
				aceReady: false,
				gpuClusterId: gpuInfo?.clusterId,
				gpuClusterSize: gpuInfo?.clusterSize,
				importRecommendations: recoByFile.get(f.path) ?? []
			});
		}
	}

	const highRiskCount = Array.from(fileMap.values()).filter((f) => f.risk === 'high').length;

	return json({
		cells,
		stats: {
			totalCells: cells.length,
			totalFiles: fileMap.size,
			errorClusters: clusters.length,
			errorCards: cards.length,
			highRiskFiles: highRiskCount,
			aceReadyCells: cells.filter((c) => c.aceReady).length,
			gpuClusters: gpuClusterDocs.length,
			importRecos: importRecos?.total_rows ?? 0
		},
		exportedAt: new Date().toISOString()
	});
};

/** POST /api/codebase-index/kag-notebook
 *  action: 'export-obsidian' — writes notebook markdown to Obsidian vault
 *  action: 'ace-fix'         — calls KAG traverser for a specific error ID
 */
export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success)
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });

	const body = parsed.data;

	if (body.action === 'export-obsidian') {
		const notebookRes = await fetch('/api/codebase-index/kag-notebook?limit=50');
		if (!notebookRes.ok) return json({ error: 'Failed to build notebook' }, { status: 502 });
		const notebook = await notebookRes.json();

		const md = buildObsidianMarkdown(notebook.cells, notebook.stats);

		const obsidianRes = await fetch('/api/obsidian', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'write',
				path: 'Legal AI/Codebase/KAG Error Notebook.md',
				content: md
			})
		});

		if (!obsidianRes.ok)
			return json({ error: 'Obsidian write failed', detail: await obsidianRes.text() }, { status: 502 });

		return json({ exported: true, path: 'Legal AI/Codebase/KAG Error Notebook.md', cells: notebook.cells.length });
	}

	if (body.action === 'ace-fix') {
		const kagRes = await fetch('/api/phase109/kag', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ errorId: body.errorId, action: 'root-cause' })
		});
		const kagData = await kagRes.json();
		return json({ aceContext: kagData.result, errorId: body.errorId, degraded: kagData.degraded ?? false });
	}

	// ── LLM-powered ACE fix using Bifrost L1→L2→L3 cache (zero API cost) ─────
	if (body.action === 'llm-ace-fix') {
		const errorId   = body.errorId;
		const clusterId = body.clusterId ?? null;

		// 1. Fetch error cards for this error from Qdrant
		const cardFilter = clusterId
			? { must: [{ key: 'cluster_id', match: { value: clusterId } }] }
			: { must: [{ key: 'error_id',   match: { value: errorId   } }] };

		const cardRes = await fetch(`${QDRANT_URL}/collections/phase90_error_cards/points/scroll`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ limit: 5, with_payload: true, with_vector: false, filter: cardFilter }),
			signal:  AbortSignal.timeout(10_000),
		}).catch(() => null);

		const cardData  = cardRes?.ok ? await cardRes.json() : { result: { points: [] } };
		const errorCards: any[] = cardData?.result?.points ?? [];

		// 2. Fetch related codebase chunks for context
		const affectedFiles: string[] = errorCards.map((c: any) => c.payload?.file_path ?? '').filter(Boolean);
		let chunkContext = '';
		if (affectedFiles.length > 0) {
			const chunkRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({
					limit:        10,
					with_payload: true,
					with_vector:  false,
					filter: { must: [{ key: 'file_path', match: { any: affectedFiles.slice(0, 3) } }] },
				}),
				signal: AbortSignal.timeout(10_000),
			}).catch(() => null);

			const chunkData = chunkRes?.ok ? await chunkRes.json() : { result: { points: [] } };
			const chunks: any[] = chunkData?.result?.points ?? [];
			chunkContext = chunks
				.map((c: any) => `// ${c.payload?.file_path ?? 'unknown'} (lines ${c.payload?.lineStart ?? '?'}-${c.payload?.lineEnd ?? '?'})\n${(c.payload?.content ?? '').slice(0, 400)}`)
				.join('\n\n---\n\n');
		}

		// 3. Build LLM prompt — context is cached by Bifrost L1/L2 on repeated error patterns
		const errorSummary = errorCards.map((c: any) => {
			const p = c.payload ?? {};
			return `- [${p.error_code ?? 'TS????'}] ${p.normalized_message ?? p.raw_message ?? ''}\n  File: ${p.file_path ?? 'unknown'}`;
		}).join('\n');

		const systemPrompt = [
			'You are an expert TypeScript / SvelteKit code fixer.',
			'Given error information and related code context, produce a concise fix plan.',
			'Format: 1) Root cause 2) Fix steps (numbered) 3) Code patch (if applicable).',
			'Keep responses under 600 words.',
		].join(' ');

		const userPrompt = [
			`## Error ID: ${errorId}`,
			'',
			'### Errors',
			errorSummary || '(no error cards found — using cluster context)',
			'',
			chunkContext ? '### Related Code\n\n```typescript\n' + chunkContext + '\n```' : '',
			'',
			'### Task',
			'Provide root cause analysis and a step-by-step fix for the errors above.',
		].filter(Boolean).join('\n');

		// bifrostChat → L1 Redis exact-match → L2 Bifrost semantic → L3 Ollama
		// Repeated calls with the same error pattern will hit L1/L2 cache instantly
		const fixText = await bifrostChat(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user',   content: userPrompt },
			],
			ENV.ROTORQUANT_CHAT_MODEL,
			{
				temperature: 0.2,
				maxTokens:   800,
				cacheKey:    `kag-ace-fix:${errorId}`,    // L2 Bifrost key for semantic dedup
				entityTags:  ['code-fix', 'typescript', 'sveltekit'],
			}
		).catch(() => 'LLM unavailable — check Ollama and Bifrost services.');

		return json({
			errorId,
			clusterId,
			fixText,
			errorCount:  errorCards.length,
			filesContext: affectedFiles,
			model:       ENV.ROTORQUANT_CHAT_MODEL,
			cached:      false,  // bifrostChat sets L1 on write; next identical call returns instantly
			degraded:    errorCards.length === 0,
		});
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};

// ─── Obsidian markdown builder ────────────────────────────────────────────────

function buildObsidianMarkdown(cells: NotebookCell[], stats: Record<string, number>): string {
	const now = new Date().toISOString();
	const lines: string[] = [
		'---',
		`generated: "${now}"`,
		`totalCells: ${stats.totalCells}`,
		`errorClusters: ${stats.errorClusters}`,
		`indexedFiles: ${stats.totalFiles}`,
		`gpuClusters: ${stats.gpuClusters}`,
		`aceReadyCells: ${stats.aceReadyCells}`,
		'tags: [kag, codebase, ace, error-fixing, gpu-cluster]',
		'---',
		'',
		'# KAG Codebase Error Notebook',
		'',
		`> Generated ${now} · ${stats.totalCells} cells · ${stats.errorClusters} error clusters · ${stats.totalFiles} indexed files · ${stats.gpuClusters} GPU clusters`,
		'',
		'## Stats',
		'',
		'| Metric | Value |',
		'|--------|-------|',
		`| Indexed Files | ${stats.totalFiles} |`,
		`| Error Clusters | ${stats.errorClusters} |`,
		`| Error Cards | ${stats.errorCards} |`,
		`| High-Risk Files | ${stats.highRiskFiles} |`,
		`| GPU k-means Clusters | ${stats.gpuClusters} |`,
		`| Import Recommendations | ${stats.importRecos} |`,
		`| ACE-Ready Cells | ${stats.aceReadyCells} |`,
		'',
		'---',
		''
	];

	for (const cell of cells) {
		lines.push(`## ${cell.title}`);
		lines.push('');
		lines.push(`> ${cell.summary}`);
		lines.push('');

		if (cell.errorCount > 0) {
			lines.push(`**Error Count:** ${cell.errorCount} · **ACE Ready:** ${cell.aceReady ? 'Yes ✅' : 'No'}`);
			lines.push('');
		}

		if (cell.gpuClusterId !== undefined) {
			lines.push(`**GPU Cluster:** ${cell.gpuClusterId} · **Cluster Size:** ${cell.gpuClusterSize ?? '?'} files`);
			lines.push('');
		}

		if (cell.topErrors.length > 0) {
			lines.push('### Top Errors');
			lines.push('');
			for (const e of cell.topErrors) {
				const loc = e.file ? ` (\`${e.file}\`)` : '';
				lines.push(`- \`${e.code}\` — ${e.message}${loc}`);
			}
			lines.push('');
		}

		if (cell.relatedFiles.length > 0) {
			lines.push('### Related Files');
			lines.push('');
			for (const f of cell.relatedFiles) {
				const badge = f.risk === 'high' ? '🔴' : f.risk === 'med' ? '🟡' : '🟢';
				const tagStr = f.tags.slice(0, 3).join(', ');
				lines.push(`- ${badge} \`${f.path}\` · ${f.role}${tagStr ? ` · ${tagStr}` : ''}`);
			}
			lines.push('');
		}

		if (cell.importRecommendations && cell.importRecommendations.length > 0) {
			lines.push('### GPU Import Recommendations');
			lines.push('');
			for (const r of cell.importRecommendations) {
				lines.push(`- \`${r.targetPath}\` (similarity: ${r.similarity.toFixed(3)}) — ${r.reason}`);
			}
			lines.push('');
		}

		if (cell.kagContext) {
			lines.push('### KAG Context');
			lines.push('');
			lines.push('```');
			lines.push(cell.kagContext);
			lines.push('```');
			lines.push('');
		}

		lines.push('---');
		lines.push('');
	}

	return lines.join('\n');
}
