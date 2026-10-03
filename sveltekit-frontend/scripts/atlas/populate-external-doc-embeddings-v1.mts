#!/usr/bin/env node
/**
 * SEMANTIC-DOC-01: populate atlas_external_doc_chunks.content_embedding (vector(768)) for the admitted canonical corpus from the EmbeddingGemma executor on :8081.
 * NOT Ollama. Postgres only: no Qdrant, no Valkey, no Neo4j, no Graphify, no HNSW build. Idempotent + resumable (only rows with content_embedding IS NULL are written).
 *
 * DEFAULT = DRY RUN: probes :8081, embeds a bounded sample IN MEMORY, validates dimension/finiteness/norm, counts what would be written; 0 writes.
 * `--apply` requires env ATLAS_DOC_EMBED_AUTHORIZED=I_AUTHORIZE_SEMANTIC_DOC_01 AND a passing parity receipt (docs/reports/semantic-doc-01-embedding-parity-v1.json, result EMBEDDING_PARITY_PROVEN).
 * Document prompt contract (EmbeddingGemma model card): `title: {page title} | text: {chunk text}`. Chunks that do not fit the executor context are left NULL and reported, never truncated.
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/populate-external-doc-embeddings-v1.mts [--apply] [--limit N]
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PARITY = resolve(ROOT, 'docs/reports/semantic-doc-01-embedding-parity-v1.json');
const RECEIPT = resolve(ROOT, 'docs/reports/semantic-doc-01-embedding-population-v1.json');
const BASE = process.env.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081';
const AUTH = 'I_AUTHORIZE_SEMANTIC_DOC_01';
const apply = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const BATCH = 8;
const CTX_TOKENS = 1024;
const DOC_PROMPT_REVISION = 'embeddinggemma-document-prompt-v1: "title: {title} | text: {text}"';

const docInput = (title: string, text: string) => `title: ${title || 'none'} | text: ${text}`;
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

async function tokens(text: string): Promise<number> {
	const r = await fetch(`${BASE}/tokenize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text }) });
	if (!r.ok) throw new Error(`TOKENIZE_HTTP_${r.status}`);
	return ((await r.json()) as { tokens: unknown[] }).tokens.length;
}
async function embed(inputs: string[]): Promise<number[][]> {
	const r = await fetch(`${BASE}/v1/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: inputs, model: 'embeddinggemma' }) });
	if (!r.ok) throw new Error(`EMBED_HTTP_${r.status}:${(await r.text()).slice(0, 120)}`);
	const data = ((await r.json()) as { data: { index: number; embedding: number[] }[] }).data.sort((a, b) => a.index - b.index);
	if (data.length !== inputs.length) throw new Error('EMBED_COUNT_MISMATCH');
	return data.map((d) => d.embedding);
}
function validate(v: number[]): string | null {
	if (v.length !== 768) return `DIM_${v.length}`;
	if (!v.every(Number.isFinite)) return 'NON_FINITE';
	const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
	return Math.abs(n - 1) > 0.02 ? `NORM_${n.toFixed(4)}` : null;
}

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null) as { status?: string } | null;
	if (health?.status !== 'ok') throw new Error('EMBED_EXECUTOR_NOT_HEALTHY');
	if (apply) {
		if (process.env.ATLAS_DOC_EMBED_AUTHORIZED !== AUTH) throw new Error(`EMBED_NOT_AUTHORIZED: set ATLAS_DOC_EMBED_AUTHORIZED=${AUTH}`);
		const parity = existsSync(PARITY) ? JSON.parse(readFileSync(PARITY, 'utf8')) as { result?: string } : null;
		if (parity?.result !== 'EMBEDDING_PARITY_PROVEN') throw new Error('EMBED_PARITY_NOT_PROVEN: run the parity proof first');
	}
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	try {
		const totals = (await pool.query(`SELECT count(*)::int total, count(content_embedding)::int embedded FROM atlas_external_doc_chunks`)).rows[0] as { total: number; embedded: number };
		const rows = (await pool.query(
			`SELECT c.id, c.chunk_id, c.text, p.title FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
			  WHERE c.content_embedding IS NULL ORDER BY c.chunk_id`)).rows as { id: string; chunk_id: string; text: string; title: string }[];
		const work = rows.slice(0, apply ? rows.length : Math.min(rows.length, Number.isFinite(limit) ? limit : 16));
		const tooLong: string[] = [];
		const failures: string[] = [];
		let written = 0;
		const prepared: { id: string; chunk_id: string; input: string }[] = [];
		for (const r of work) {
			const input = docInput(r.title, r.text);
			const n = await tokens(input);
			if (n > CTX_TOKENS - 8) { tooLong.push(`${r.chunk_id}:${n}`); continue; }
			prepared.push({ id: r.id, chunk_id: r.chunk_id, input });
		}
		for (let i = 0; i < prepared.length; i += BATCH) {
			const batch = prepared.slice(i, i + BATCH);
			const vecs = await embed(batch.map((b) => b.input));
			for (const [j, v] of vecs.entries()) {
				const bad = validate(v);
				if (bad) { failures.push(`${batch[j].chunk_id}:${bad}`); continue; }
				if (apply) {
					const res = await pool.query(`UPDATE atlas_external_doc_chunks SET content_embedding = $2::vector WHERE id = $1 AND content_embedding IS NULL`, [batch[j].id, `[${v.join(',')}]`]);
					written += res.rowCount ?? 0;
				}
			}
		}
		let readback: Record<string, unknown> | null = null;
		if (apply) {
			const rb = (await pool.query(`SELECT count(content_embedding)::int embedded, count(*) FILTER (WHERE vector_dims(content_embedding) = 768)::int dim768, count(*)::int total FROM atlas_external_doc_chunks`)).rows[0];
			readback = rb;
			if (rb.dim768 !== rb.embedded) failures.push('READBACK_DIM_MISMATCH');
		}
		const receipt = {
			schema: 'atlas.semantic-doc-01-embedding-population.v1', generatedAt: new Date().toISOString(), mode: apply ? 'APPLY' : 'DRY_RUN',
			executor: { url: BASE, kind: 'llama-server EmbeddingGemma (NOT Ollama)', pooling: 'mean', ctxTokens: CTX_TOKENS, promptRevision: DOC_PROMPT_REVISION, promptContractChecksum: sha(DOC_PROMPT_REVISION) },
			before: totals, considered: work.length, embeddedInMemoryOrWritten: prepared.length - failures.length, written, tooLongLeftNull: tooLong, failures, readback,
			writes: { postgres: apply ? { column: 'atlas_external_doc_chunks.content_embedding', rows: written } : 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 },
			result: failures.length ? 'SEMANTIC_DOC_01_FAILED' : apply ? 'SEMANTIC_DOC_01_POPULATED' : 'SEMANTIC_DOC_01_DRY_RUN_READY'
		};
		if (apply) writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
		console.log(JSON.stringify({ result: receipt.result, before: totals, considered: work.length, prepared: prepared.length, written, tooLong: tooLong.length, failures: failures.slice(0, 5), readback }, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally { await pool.end(); }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
