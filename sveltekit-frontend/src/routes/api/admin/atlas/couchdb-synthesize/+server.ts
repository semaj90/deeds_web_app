/**
 * POST /api/admin/atlas/couchdb-synthesize
 *
 * 1. Bootstrap `_design/cluster_synthesis` in karpathy_wiki (idempotent).
 * 2. Query the `by_cluster` MapReduce view for wiki_note docs grouped by clusterId.
 * 3. For each cluster call Gemma4 (TurboQuant :8090) to synthesize a 2-3 sentence summary.
 * 4. Write results back as `type: cluster_synthesis` docs in karpathy_wiki.
 *
 * Body: { maxClusters?: number, dryRun?: boolean }
 */
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const COUCHDB_URL      = (process.env.COUCHDB_URL  ?? 'http://localhost:5984').replace(/\/+$/, '');
const COUCHDB_USER     = process.env.COUCHDB_USER  ?? 'admin';
const COUCHDB_PASS     = process.env.COUCHDB_PASS  ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass';
const DB_NAME          = process.env.COUCHDB_AGENTS_DB ?? 'karpathy_wiki';
const ROTORQUANT_URL   = (process.env.ROTORQUANT_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');

const schema = z.object({
	maxClusters: z.number().int().min(1).max(50).default(10),
	dryRun:      z.boolean().default(false),
});

function authHeader(): string {
	return 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
}
const hdrs = () => ({ 'Content-Type': 'application/json', Authorization: authHeader() });

// ── Design doc: map wiki_note docs by clusterId ───────────────────────────────
const DESIGN_DOC = {
	_id:      '_design/cluster_synthesis',
	language: 'javascript',
	views: {
		by_cluster: {
			// emit(clusterId, {title, body_excerpt, tags}) for each wiki_note
			map: `function(doc){
  if(doc.type==='wiki_note'&&doc.clusterId!=null){
    emit(String(doc.clusterId),{
      title: doc.title||doc.stableKey||doc._id,
      body:  doc.body?doc.body.slice(0,400):'',
      tags:  Array.isArray(doc.tags)?doc.tags:[]
    });
  }
}`,
		},
	},
};

async function ensureDesignDoc(): Promise<void> {
	const url = `${COUCHDB_URL}/${DB_NAME}/_design/cluster_synthesis`;
	const existing = await fetch(url, { headers: hdrs(), signal: AbortSignal.timeout(4_000) });
	if (existing.ok) return;
	const put = await fetch(url, {
		method: 'PUT', headers: hdrs(),
		body:   JSON.stringify(DESIGN_DOC),
		signal: AbortSignal.timeout(4_000),
	});
	if (!put.ok && put.status !== 412) {
		throw new Error(`design doc PUT ${put.status}`);
	}
}

interface ViewRow { key: string; value: { title: string; body: string; tags: string[] } }

async function queryView(limitRows: number): Promise<Map<string, Array<{ title: string; body: string; tags: string[] }>>> {
	const url = `${COUCHDB_URL}/${DB_NAME}/_design/cluster_synthesis/_view/by_cluster?limit=${limitRows}`;
	const res  = await fetch(url, { headers: hdrs(), signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`view query ${res.status}`);
	const data = await res.json() as { rows: ViewRow[] };
	const map  = new Map<string, Array<{ title: string; body: string; tags: string[] }>>();
	for (const row of data.rows) {
		if (!map.has(row.key)) map.set(row.key, []);
		map.get(row.key)!.push(row.value);
	}
	return map;
}

async function synthesize(clusterId: string, docs: Array<{ title: string; body: string; tags: string[] }>): Promise<string> {
	const context = docs.slice(0, 8).map(d =>
		`### ${d.title}\n${d.body}${d.tags.length ? `\ntags: ${d.tags.slice(0, 5).join(', ')}` : ''}`,
	).join('\n\n');
	const prompt = `Synthesize a concise 2-3 sentence technical summary for GPU cluster ${clusterId}. Focus on: what code lives here, its role, key dependencies.\n\n${context}\n\nSummary:`;

	try {
		const res = await fetch(`${ROTORQUANT_URL}/v1/chat/completions`, {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body:   JSON.stringify({
				model:      'gemma4-rotorquant:latest',
				max_tokens: 800,
				messages: [{ role: 'user', content: prompt }],
			}),
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) return `Cluster ${clusterId}: ${docs.length} wiki notes (LLM unavailable)`;
		const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
		const text = (data.choices?.[0]?.message?.content ?? '').trim();
		return text.slice(0, 500) || `Cluster ${clusterId}: ${docs.length} wiki notes`;
	} catch {
		return `Cluster ${clusterId}: ${docs.length} wiki notes`;
	}
}

async function writeSynthesisDoc(clusterId: string, summary: string, docCount: number, tags: string[]): Promise<void> {
	const docId  = `cluster_synthesis:${clusterId}`;
	const docUrl = `${COUCHDB_URL}/${DB_NAME}/${encodeURIComponent(docId)}`;
	let rev: string | undefined;
	try {
		const g = await fetch(docUrl, { headers: hdrs(), signal: AbortSignal.timeout(3_000) });
		if (g.ok) rev = ((await g.json()) as { _rev?: string })._rev;
	} catch { /* new doc */ }

	const doc: Record<string, unknown> = {
		_id: docId, type: 'cluster_synthesis', stableKey: docId,
		clusterId, summary, docCount, tags: [...new Set(tags)].slice(0, 20),
		createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
	};
	if (rev) doc._rev = rev;
	await fetch(docUrl, {
		method: 'PUT', headers: hdrs(),
		body:   JSON.stringify(doc),
		signal: AbortSignal.timeout(4_000),
	}).catch(() => { /* non-fatal */ });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body   = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Bad request');

	const { maxClusters, dryRun } = parsed.data;
	const t0 = Date.now();

	try { await ensureDesignDoc(); } catch (e) {
		throw error(502, `CouchDB design doc: ${(e as Error).message}`);
	}

	let clusterMap: Map<string, Array<{ title: string; body: string; tags: string[] }>>;
	try { clusterMap = await queryView(maxClusters * 30); } catch (e) {
		throw error(502, `CouchDB view: ${(e as Error).message}`);
	}

	const clusterIds  = [...clusterMap.keys()].slice(0, maxClusters);
	const syntheses: Array<{ clusterId: string; docCount: number; summary: string }> = [];

	for (const cid of clusterIds) {
		const docs    = clusterMap.get(cid)!;
		const allTags = docs.flatMap(d => d.tags);
		const summary = await synthesize(cid, docs);
		if (!dryRun) await writeSynthesisDoc(cid, summary, docs.length, allTags);
		syntheses.push({ clusterId: cid, docCount: docs.length, summary });
	}

	return json({
		dryRun,
		clustersProcessed: syntheses.length,
		durationMs:        Date.now() - t0,
		syntheses,
	});
};
