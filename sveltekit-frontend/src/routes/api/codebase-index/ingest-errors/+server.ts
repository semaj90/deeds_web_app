/**
 * POST /api/codebase-index/ingest-errors
 *
 * Populates phase90_error_clusters + phase90_error_cards from:
 *   1. phase89_error_chunks  — existing GPU-clustered error data (13 clusters, 768-dim vectors)
 *   2. tsc --noEmit --skipLibCheck  — live TypeScript scan (optional, mode=live)
 *
 * After running, the KAG notebook (/admin/kag-notebook) will have cells.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';

import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const execAsync = promisify(exec);
const QDRANT_URL = ENV.QDRANT_URL;
const SRC_COLLECTION = 'phase89_error_chunks';
const DST_CLUSTERS = 'phase90_error_clusters';
const DST_CARDS = 'phase90_error_cards';
const DIM = 768;

const postSchema = z.object({
	/** 'migrate' copies phase89 → phase90 (fast, no Ollama needed)
	 *  'live'    runs tsc and embeds fresh errors via Ollama (slow, ~3 min)
	 *  'both'    live scan first, then backfill any missing clusters from phase89 */
	mode: z.enum(['migrate', 'live', 'both']).default('migrate'),
	force: z.boolean().default(false)
});

// ── Helpers ────────────────────────────────────────────────────────────────

function deterministicId(key: string): number {
	const hash = createHash('md5').update(key).digest();
	return hash.readUInt32BE(0) % 2147483648;
}

async function qdrantRequest(path: string, method = 'GET', body?: unknown) {
	const res = await fetch(`${QDRANT_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(30_000)
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text}`);
	}
	return res.json();
}

/** Create collection if it does not already exist (idempotent). */
async function ensureCollection(name: string): Promise<void> {
	try {
		await qdrantRequest(`/collections/${name}`);
		// exists — check vector size
	} catch {
		// 404 → create
		await qdrantRequest(`/collections/${name}`, 'PUT', {
			vectors: { size: DIM, distance: 'Cosine' },
			on_disk_payload: true,
			hnsw_config: { m: 16, ef_construct: 64 }
		});
	}
}

/** Scroll all points (handles pagination). */
async function scrollAll(collection: string): Promise<{ id: number; payload: Record<string, unknown>; vector?: number[] }[]> {
	const pts: { id: number; payload: Record<string, unknown>; vector?: number[] }[] = [];
	let offset: number | null = null;

	while (true) {
		const body: Record<string, unknown> = { limit: 100, with_payload: true, with_vector: true };
		if (offset !== null) body.offset = offset;

		const data = await qdrantRequest(`/collections/${collection}/points/scroll`, 'POST', body);
		const batch: { id: number; payload: Record<string, unknown>; vector: number[] }[] = data.result?.points ?? [];
		pts.push(...batch);

		const next = data.result?.next_page_offset;
		if (!next) break;
		offset = next;
	}
	return pts;
}

interface ParsedError {
	filePath: string;
	line: number;
	col: number;
	errorCode: string;
	message: string;
}

/** Parse tsc --noEmit output into structured errors. */
function parseTscOutput(output: string): ParsedError[] {
	const errors: ParsedError[] = [];
	// tsc format: "src/foo.ts(42,10): error TS2304: Cannot find name 'foo'."
	const re = /^([^(]+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
	let m: RegExpExecArray | null;
	while ((m = re.exec(output)) !== null) {
		const fp = m[1].trim().replace(/\\/g, '/').replace(/^.*?sveltekit-frontend\//, '');
		errors.push({
			filePath: fp,
			line: parseInt(m[2], 10),
			col: parseInt(m[3], 10),
			errorCode: m[4],
			message: m[5].trim()
		});
	}
	return errors;
}

/** Detect surface from file path. */
function detectSurface(fp: string): string[] {
	if (fp.includes('+server') || fp.includes('/api/') || fp.includes('/server/')) return ['server'];
	if (fp.includes('/components/') || fp.includes('/stores/')) return ['client'];
	return ['shared'];
}

/** Detect tech stack from file path. */
function detectTech(fp: string): string[] {
	const t: string[] = [];
	if (fp.endsWith('.svelte')) t.push('svelte');
	if (fp.includes('/machines/') || fp.includes('machine')) t.push('xstate');
	if (fp.includes('/server/db/')) t.push('drizzle');
	t.push('typescript');
	return t;
}

/** Parse example error message from phase89 summary text. */
function parseExampleFromSummary(summary: string): string {
	const m = /Example:\s+(.+?)(?:\.\s+Recommended|$)/i.exec(summary);
	return m ? m[1].trim() : summary.slice(0, 120);
}

/** Convert error_type string to a pseudo TS error code. */
function errorTypeToCode(errorType: string): string {
	const map: Record<string, string> = {
		'general-ts-error': 'TS-GENERAL',
		'token syntax corruption': 'TS1005',
		'missing property on type': 'TS2339',
		'type assignability mismatch': 'TS2345',
		'duplicate declaration': 'TS2300',
		'module export mismatch': 'TS2305',
		'unknown object property': 'TS7053',
		"Type '": 'TS2322'
	};
	for (const [k, v] of Object.entries(map)) {
		if (errorType.toLowerCase().includes(k.toLowerCase())) return v;
	}
	return 'TS-UNKNOWN';
}

// ── Migration path: phase89 → phase90 ─────────────────────────────────────

async function migrateFromPhase89(): Promise<{ clusters: number; cards: number }> {
	const srcPts = await scrollAll(SRC_COLLECTION);
	if (srcPts.length === 0) return { clusters: 0, cards: 0 };

	await Promise.all([ensureCollection(DST_CLUSTERS), ensureCollection(DST_CARDS)]);

	// Upsert cluster points
	const clusterUpserts = srcPts.map((pt) => {
		const p = pt.payload;
		const clusterId = Number(p.cluster_id ?? 0);
		const errorType = String(p.error_type ?? 'unknown');
		const summary = String(p.summary ?? '');
		const memberCount = Number(p.member_count ?? 0);
		const errorCode = errorTypeToCode(errorType);

		return {
			id: pt.id,
			vector: pt.vector ?? new Array(DIM).fill(0),
			payload: {
				cluster_id: clusterId,
				cluster_label: `${errorCode}: ${errorType}`,
				label: `${errorCode}: ${errorType}`,
				description: summary,
				summary,
				error_count: memberCount,
				top_codes: [errorCode],
				top_files: [],
				affected_files: [],
				kag_context: `Phase 89 GPU cluster ${clusterId}. ${summary.slice(0, 200)}`
			}
		};
	});

	await qdrantRequest(`/collections/${DST_CLUSTERS}/points`, 'PUT', {
		points: clusterUpserts,
		wait: true
	});

	// Generate error cards (one per cluster from example in summary)
	const cardUpserts = srcPts.map((pt) => {
		const p = pt.payload;
		const clusterId = Number(p.cluster_id ?? 0);
		const errorType = String(p.error_type ?? 'unknown');
		const summary = String(p.summary ?? '');
		const errorCode = errorTypeToCode(errorType);
		const exampleMsg = parseExampleFromSummary(summary);

		return {
			id: deterministicId(`card-${pt.id}`),
			vector: pt.vector ?? new Array(DIM).fill(0),
			payload: {
				error_code: errorCode,
				message: exampleMsg,
				normalized_message: exampleMsg,
				raw_message: exampleMsg,
				file_path: '',
				line: 0,
				surface: ['shared'],
				tech: ['typescript'],
				tool: 'phase89-gpu-cluster',
				timestamp: new Date().toISOString(),
				// cluster_id must match the Qdrant point ID of the cluster (not the sequential index)
				// kag-notebook matches: c.payload?.cluster_id === cluster.id
				cluster_id: pt.id
			}
		};
	});

	await qdrantRequest(`/collections/${DST_CARDS}/points`, 'PUT', {
		points: cardUpserts,
		wait: true
	});

	return { clusters: clusterUpserts.length, cards: cardUpserts.length };
}

// ── Live scan path: tsc → phase90 ─────────────────────────────────────────

async function liveIngest(cwd: string): Promise<{ clusters: number; cards: number }> {
	// Run tsc (faster than svelte-check, no Svelte compiler needed)
	let tscOutput = '';
	try {
		const { stdout, stderr } = await execAsync(
			'npx tsc --noEmit --skipLibCheck 2>&1 || true',
			{ cwd, timeout: 180_000, maxBuffer: 10 * 1024 * 1024 }
		);
		tscOutput = stdout + stderr;
	} catch (e: unknown) {
		tscOutput = String((e as { stdout?: string }).stdout ?? '') + String((e as { stderr?: string }).stderr ?? '');
	}

	const errors = parseTscOutput(tscOutput);
	if (errors.length === 0) return { clusters: 0, cards: 0 };

	await Promise.all([ensureCollection(DST_CLUSTERS), ensureCollection(DST_CARDS)]);

	// Group by error code
	const byCode = new Map<string, ParsedError[]>();
	for (const e of errors) {
		const arr = byCode.get(e.errorCode) ?? [];
		arr.push(e);
		byCode.set(e.errorCode, arr);
	}

	// Embed each cluster label (no Ollama → use zero vector as placeholder)
	let clusterId = 0;
	const clusterUpserts: { id: number; vector: number[]; payload: Record<string, unknown> }[] = [];
	const cardUpserts: { id: number; vector: number[]; payload: Record<string, unknown> }[] = [];

	for (const [code, errs] of byCode) {
		const affectedFiles = [...new Set(errs.map((e) => e.filePath))].slice(0, 10);
		const topMsgs = errs.slice(0, 5).map((e) => e.message);
		const label = `${code}: ${errs[0].message.slice(0, 60)}`;
		const placeholder = new Array(DIM).fill(0);

		clusterUpserts.push({
			id: deterministicId(`live-cluster-${code}`),
			vector: placeholder,
			payload: {
				cluster_id: clusterId,
				cluster_label: label,
				label,
				description: topMsgs.join(' | '),
				summary: topMsgs[0] ?? '',
				error_count: errs.length,
				top_codes: [code],
				top_files: affectedFiles.slice(0, 5),
				affected_files: affectedFiles,
				kag_context: `Live tsc scan. ${errs.length} occurrences across ${affectedFiles.length} files.`
			}
		});

		// One card per error (up to 20 per cluster)
		for (const e of errs.slice(0, 20)) {
			cardUpserts.push({
				id: deterministicId(`live-card-${code}-${e.filePath}-${e.line}`),
				vector: placeholder,
				payload: {
					error_code: code,
					message: e.message,
					normalized_message: e.message,
					raw_message: e.message,
					file_path: e.filePath,
					line: e.line,
					surface: detectSurface(e.filePath),
					tech: detectTech(e.filePath),
					tool: 'tsc',
					timestamp: new Date().toISOString(),
					cluster_id: String(clusterId)
				}
			});
		}

		clusterId++;
	}

	if (clusterUpserts.length) {
		await qdrantRequest(`/collections/${DST_CLUSTERS}/points`, 'PUT', {
			points: clusterUpserts,
			wait: true
		});
	}
	if (cardUpserts.length) {
		await qdrantRequest(`/collections/${DST_CARDS}/points`, 'PUT', {
			points: cardUpserts,
			wait: true
		});
	}

	return { clusters: clusterUpserts.length, cards: cardUpserts.length };
}

// ── Handler ────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(raw);
	if (!parsed.success)
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });

	const { mode, force } = parsed.data;

	// If not forced, check whether phase90_error_clusters already has data
	if (!force) {
		try {
			const info = await qdrantRequest(`/collections/${DST_CLUSTERS}`);
			const count = info.result?.points_count ?? 0;
			if (count > 0) {
				return json({
					skipped: true,
					reason: `${DST_CLUSTERS} already has ${count} points — pass force=true to re-ingest`,
					existingClusters: count
				});
			}
		} catch {
			// collection doesn't exist — proceed
		}
	}

	const cwd = process.cwd();
	let totalClusters = 0;
	let totalCards = 0;

	try {
		if (mode === 'live' || mode === 'both') {
			const r = await liveIngest(cwd);
			totalClusters += r.clusters;
			totalCards += r.cards;
		}

		if (mode === 'migrate' || (mode === 'both' && totalClusters === 0)) {
			const r = await migrateFromPhase89();
			totalClusters += r.clusters;
			totalCards += r.cards;
		}

		// Final stats
		const clusterInfo = await qdrantRequest(`/collections/${DST_CLUSTERS}`).catch(() => null);
		const cardInfo = await qdrantRequest(`/collections/${DST_CARDS}`).catch(() => null);

		return json({
			success: true,
			mode,
			ingested: { clusters: totalClusters, cards: totalCards },
			qdrant: {
				[DST_CLUSTERS]: clusterInfo?.result?.points_count ?? totalClusters,
				[DST_CARDS]: cardInfo?.result?.points_count ?? totalCards
			},
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[ingest-errors] failed:', err);
		return json(
			{ error: 'Ingest operation failed', success: false },
			{ status: 500 }
		);
	}
};

/** GET returns current state of phase90 collections. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const [clusters, cards] = await Promise.all([
		qdrantRequest(`/collections/${DST_CLUSTERS}`).catch(() => null),
		qdrantRequest(`/collections/${DST_CARDS}`).catch(() => null)
	]);

	return json({
		[DST_CLUSTERS]: {
			exists: !!clusters,
			points: clusters?.result?.points_count ?? 0,
			status: clusters?.result?.status ?? 'missing'
		},
		[DST_CARDS]: {
			exists: !!cards,
			points: cards?.result?.points_count ?? 0,
			status: cards?.result?.status ?? 'missing'
		},
		source: 'phase89_error_chunks',
		sourcePoints: 13
	});
};
