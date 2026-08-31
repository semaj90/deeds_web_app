#!/usr/bin/env node

/** Read-only exporter for the exact semantic_768 cohort used by the FEAT-04 proof. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadRepoEnv(process.env);
const reportPath = path.resolve(process.env.ATLAS_SEMANTIC_COHORT_REPORT ?? path.join(ROOT, 'docs/reports/lineage-semantic-768-cohort-v1.json'));
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const outputPath = path.resolve(process.env.ATLAS_SEMANTIC_COHORT_NDJSON ?? path.join(ROOT, '.tmp/atlas/semantic-768-cohort-v1.ndjson'));

function vector(value) {
  if (Array.isArray(value)) return value.map(Number);
  const text = String(value ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
  return text ? text.split(',').map(Number) : [];
}

async function main() {
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (!candidates.length || report.status !== 'SEMANTIC_768_COHORT_PROVEN') throw new Error('SEMANTIC_COHORT_NOT_PROVEN');
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'atlas-export-semantic-cohort-read-only' });
  try {
    const lines = [];
    for (const candidate of candidates) {
      const hashRef = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
      const contentHash = hashRef ? String(hashRef).split(':').pop() : null;
      if (!contentHash) throw new Error(`COHORT_CHUNK_HASH_MISSING:${candidate.candidateOrdinal}`);
      const result = await pool.query(`SELECT id::text AS id, source_ref, content_embedding_768::text AS embedding FROM public.codebase_chunk_index WHERE source_ref=$1 AND lower(content_hash)=lower($2)`, [candidate.sourceRef, contentHash]);
      if (result.rows.length !== 1) throw new Error(`COHORT_CHUNK_ROW_NOT_EXACT:${candidate.candidateOrdinal}:${result.rows.length}`);
      const embedding = vector(result.rows[0].embedding);
      if (embedding.length !== 768 || embedding.some((value) => !Number.isFinite(value))) throw new Error(`COHORT_VECTOR_INVALID:${candidate.candidateOrdinal}`);
      lines.push(JSON.stringify({
        canonical_id: candidate.packetKey,
        canonical_revision: candidate.sourceRevision,
        source_ref: candidate.sourceRef,
        representation_id: 'semantic_768',
        representation_revision: candidate.semanticRevision,
        workspace_revision: candidate.workspaceRevision,
        embedding,
      }));
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
    console.log(JSON.stringify({ status: 'SEMANTIC_COHORT_NDJSON_EXPORTED', rows: lines.length, dimensions: 768, output: outputPath, postgresWrites: false, qdrantWrites: false }, null, 2));
  } finally { await pool.end(); }
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
