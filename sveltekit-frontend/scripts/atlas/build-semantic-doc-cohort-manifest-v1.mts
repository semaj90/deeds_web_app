#!/usr/bin/env node
/**
 * SEMANTIC-DOC-PROVENANCE-01 (READ ONLY): freeze the embedding COHORT manifest for atlas_external_doc_chunks.content_embedding.
 * The stored vectors carry no row-local provenance, so a Qdrant projection needs a stable `representationRevision` bound to this exact cohort.
 * The cohort checksum covers every (chunk evidence revision, exact stored vector text), so a re-embedding by a different model/prompt is detectable as drift.
 * Writes only docs/reports/semantic-doc-01-embedding-cohort-manifest-v1.json. `--verify` recomputes and compares with the frozen manifest (exit 1 on drift).
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/build-semantic-doc-cohort-manifest-v1.mts [--verify]
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const OUT = resolve(ROOT, 'docs/reports/semantic-doc-01-embedding-cohort-manifest-v1.json');
const verify = process.argv.includes('--verify');
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const readJson = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

async function main(): Promise<void> {
	const parity = readJson(resolve(ROOT, 'docs/reports/semantic-doc-01-embedding-parity-v1.json'));
	const population = readJson(resolve(ROOT, 'docs/reports/semantic-doc-01-embedding-population-v1.json'));
	if (parity?.result !== 'EMBEDDING_PARITY_PROVEN' || population?.result !== 'SEMANTIC_DOC_01_POPULATED') throw new Error('COHORT_PREREQUISITE_RECEIPTS_MISSING');
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	try {
		await pool.query('BEGIN READ ONLY');
		const stats = (await pool.query(`SELECT count(*)::int total, count(content_embedding)::int embedded, count(*) FILTER (WHERE vector_dims(content_embedding) = 768)::int dim768 FROM atlas_external_doc_chunks`)).rows[0];
		const norms = (await pool.query(`SELECT min(vector_norm(content_embedding))::float8 mn, max(vector_norm(content_embedding))::float8 mx FROM atlas_external_doc_chunks`)).rows[0];
		const rows = (await pool.query(`SELECT evidence_revision, chunk_id, content_embedding::text AS v FROM atlas_external_doc_chunks ORDER BY evidence_revision`)).rows as { evidence_revision: string; chunk_id: string; v: string }[];
		await pool.query('ROLLBACK');
		const h = createHash('sha256');
		for (const r of rows) h.update(`${r.evidence_revision}\n${r.v}\n`, 'utf8');
		const cohortChecksum = h.digest('hex');
		const corpusChecksum = sha(rows.map((r) => r.evidence_revision).join('\n'));
		const core = {
			representation: 'semantic_768', model: 'embeddinggemma-300m (Q8_0 GGUF executor)', dimension: 768, normalization: 'L2 unit norm (mean pooling)', executor: 'llama-server EmbeddingGemma :8081 (NOT Ollama)',
			ggufSha256: parity.executor.artifactSha256, referenceSafetensorsSha256: parity.reference.safetensorsSha256, promptContract: population.executor.promptRevision, promptContractChecksum: population.executor.promptContractChecksum,
			sourceCorpusChecksum: corpusChecksum, chunkCount: rows.length, cohortChecksum
		};
		const representationRevision = `semantic_768:embeddinggemma-300m-q8_0:gguf-${core.ggufSha256.slice(0, 12)}:doc-prompt-v1:cohort-${cohortChecksum.slice(0, 16)}`;
		const manifest = {
			schema: 'atlas.semantic-doc-embedding-cohort-manifest.v1', generatedAt: new Date().toISOString(), gate: 'SEMANTIC-DOC-PROVENANCE-01', representationRevision, ...core,
			liveStats: { total: stats.total, embedded: stats.embedded, dim768: stats.dim768, minNorm: norms.mn, maxNorm: norms.mx },
			parityEvidence: { receipt: 'docs/reports/semantic-doc-01-embedding-parity-v1.json', meanCosine: parity.measured.mean_cosine, minCosine: parity.measured.min_cosine, top1Agreement: parity.measured.top1_agreement },
			populationReceipt: 'docs/reports/semantic-doc-01-embedding-population-v1.json',
			qdrantProjectionRule: 'a Qdrant payload/vector may claim this cohort only if it carries this representationRevision and the recomputed cohortChecksum equals the frozen one (--verify); a future re-embedding gets a NEW representationRevision',
			rowLocalProvenance: false, note: 'atlas_external_doc_chunks has no per-row embedding provenance columns; provenance is frozen at cohort level here. Adding row-local columns would be a separate DDL decision.',
			writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
		};
		if (verify) {
			const frozen = readJson(OUT);
			const ok = frozen?.cohortChecksum === cohortChecksum && frozen?.representationRevision === representationRevision;
			console.log(JSON.stringify({ verify: ok ? 'COHORT_UNCHANGED' : 'COHORT_DRIFT', frozen: frozen?.cohortChecksum, live: cohortChecksum }));
			if (!ok) process.exitCode = 1;
			return;
		}
		writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
		console.log(JSON.stringify({ result: 'SEMANTIC_DOC_PROVENANCE_FROZEN', representationRevision, chunkCount: rows.length, cohortChecksum, minNorm: norms.mn, maxNorm: norms.mx }, null, 2));
	} finally { await pool.end(); }
}

main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; });
