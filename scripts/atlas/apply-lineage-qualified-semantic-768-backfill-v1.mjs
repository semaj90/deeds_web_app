#!/usr/bin/env node

/**
 * Authorized bounded semantic_768 repair for the frozen lineage canary.
 * Requires ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL=1.
 * PostgreSQL is updated first; Qdrant is a rebuildable projection.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const ROOT = REPO_ROOT;
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_SEMANTIC_APPLY_REPORT ?? path.join(ROOT, 'docs/reports/lineage-qualified-semantic-768-backfill-apply-v1.json'));
const model = String(process.env.EMBEDDINGGEMMA_MODEL ?? process.env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const ollamaUrl = String(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const qdrantUrl = String(process.env.QDRANT_URL ?? `http://${process.env.QDRANT_HOST ?? '127.0.0.1'}:${process.env.QDRANT_PORT ?? '6333'}`).replace(/\/+$/, '');
const collection = String(process.env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');
const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const clean = (value) => String(value ?? '').trim();
const vectorLiteral = (vector) => `[${vector.join(',')}]`;
const embeddingText = (row) => [row.relative_path, row.symbol, row.kind, row.summary, row.content, Array.isArray(row.ast_symbols) ? row.ast_symbols.join(' ') : ''].filter(Boolean).join('\n').trim().slice(0, 12_000);

function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) throw new Error(`SEMANTIC_768_VECTOR_INVALID:${Array.isArray(vector) ? vector.length : 'non-array'}`);
}

async function embed(texts) {
  const response = await fetch(`${ollamaUrl}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: texts, dimensions: 768, truncate: true, keep_alive: '30m' }), signal: AbortSignal.timeout(180_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) throw new Error(`OLLAMA_EMBED_FAILED:${response.status}:${JSON.stringify(body).slice(0, 300)}`);
  body.embeddings.forEach(validateVector);
  return body.embeddings;
}

async function qdrantUpsert(points) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points?wait=true`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ points }), signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`QDRANT_UPSERT_FAILED:${response.status}:${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

async function qdrantReadback(packetKeys) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: Math.max(100, packetKeys.length), with_payload: true, with_vector: false, filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }] } }), signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`QDRANT_READBACK_FAILED:${response.status}:${JSON.stringify(body).slice(0, 400)}`);
  return Array.isArray(body?.result?.points) ? body.result.points : [];
}

async function main() {
  if (process.env.ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL !== '1') throw new Error('EXPLICIT_SEMANTIC_768_BACKFILL_AUTHORIZATION_REQUIRED');
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (candidates.length !== 15) throw new Error(`FROZEN_CANARY_COUNT_REQUIRED:expected=15:actual=${candidates.length}`);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'atlas-lineage-semantic-768-apply' });
  const report = { schema: 'atlas.lineage-qualified-semantic-768-backfill-apply.v1', generatedAt: new Date().toISOString(), authorization: { explicit: true, envFlag: 'ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL=1', scope: 'frozen 15-candidate lineage canary' }, candidateMap: { candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, workspaceRevision: map.workspaceRevision, count: candidates.length }, representation: { representationId: 'semantic_768', dimensions: 768, vectorName: 'content', distance: 'Cosine', model, modelRevision: null }, counts: { selected: 0, embedded: 0, postgresWritten: 0, postgresReadback: 0, qdrantUpserted: 0, qdrantReadback: 0 }, writes: { postgresWrites: false, qdrantWrites: false }, status: 'FAIL', errors: [] };
  try {
    const ids = candidates.map((candidate) => candidate.evidenceRefs?.find((ref) => ref.startsWith('postgres:atlas_packets:'))?.split(':').pop()).filter(Boolean);
    const result = await pool.query(`SELECT cci.id::text AS id, cci.source_ref, cci.content_hash, cci.relative_path, cci.symbol, cci.kind, cci.summary, cci.content, cci.ast_symbols, cci.content_embedding_768, cci.embedding_model, cci.embedding_version, cci.embedding_dimension, cci.embedding_normalized FROM public.codebase_chunk_index cci WHERE cci.source_ref = ANY($1::text[])`, [candidates.map((candidate) => candidate.sourceRef)]);
    const bySource = new Map(result.rows.map((row) => [clean(row.source_ref), row]));
    const rows = candidates.map((candidate) => {
      const row = bySource.get(clean(candidate.sourceRef));
      if (!row || String(row.content_hash).toLowerCase() !== String(candidate.evidenceRefs?.find((ref) => ref.startsWith('chunk:'))?.split(':').pop() ?? '').toLowerCase()) throw new Error(`EXACT_CHUNK_GUARD_FAILED:${candidate.sourceRef}`);
      if (row.content_embedding_768 !== null && row.content_embedding_768 !== undefined) throw new Error(`VECTOR_ALREADY_PRESENT:${candidate.sourceRef}`);
      return { candidate, row, text: embeddingText(row) };
    });
    report.counts.selected = rows.length;
    const vectors = await embed(rows.map((item) => item.text));
    report.counts.embedded = vectors.length;
    report.representation.modelRevision = `semantic_768:${model}:batch:${sha256(rows.map((item) => item.row.content_hash).join('|'))}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < rows.length; index += 1) {
        const { candidate, row } = rows[index];
        const version = `semantic_768:${model}:${sha256(String(row.content_hash))}`;
        const updated = await client.query(`UPDATE public.codebase_chunk_index SET content_embedding_768=$1::vector(768), embedding_model=$2, embedding_version=$3, embedding_dimension=768, embedding_normalized=true, embedding_created_at=NOW(), updated_at=NOW() WHERE id=$4::uuid AND source_ref=$5 AND lower(content_hash)=lower($6) AND content_embedding_768 IS NULL`, [vectorLiteral(vectors[index]), model, version, row.id, candidate.sourceRef, row.content_hash]);
        if (updated.rowCount !== 1) throw new Error(`POSTGRES_EXACT_UPDATE_FAILED:${candidate.sourceRef}`);
        report.counts.postgresWritten += 1;
      }
      await client.query('COMMIT');
      report.writes.postgresWrites = true;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const readback = await pool.query(`SELECT id::text AS id, source_ref, content_embedding_768, embedding_model, embedding_version, embedding_dimension, embedding_normalized, encoder_id FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[]) AND content_embedding_768 IS NOT NULL`, [rows.map((item) => item.row.id)]);
    report.counts.postgresReadback = readback.rows.length;
    if (readback.rows.length !== rows.length || readback.rows.some((row) => Number(row.embedding_dimension) !== 768 || row.embedding_model !== model || row.embedding_normalized !== true)) throw new Error('POSTGRES_SEMANTIC_768_READBACK_FAILED');
    const points = rows.map((item, index) => ({ id: item.row.id, vector: { content: vectors[index] }, payload: { packet_key: item.candidate.packetKey, source_ref: item.candidate.sourceRef, source_revision: item.candidate.sourceRevision, workspace_revision: item.candidate.workspaceRevision, content_hash: item.row.content_hash, representation_id: 'semantic_768', representation_revision: `semantic_768:${model}:${sha256(String(item.row.content_hash))}`, embedding_model: model, embedding_dimension: 768, projection_revision: null } }));
    await qdrantUpsert(points);
    report.counts.qdrantUpserted = points.length;
    report.writes.qdrantWrites = true;
    const qdrantRows = await qdrantReadback(rows.map((item) => item.candidate.packetKey));
    const exact = qdrantRows.filter((point) => rows.some((item) => { const payload = point.payload ?? {}; return clean(payload.packet_key) === clean(item.candidate.packetKey) && clean(payload.source_ref) === clean(item.candidate.sourceRef) && clean(payload.source_revision) === clean(item.candidate.sourceRevision) && clean(payload.workspace_revision) === clean(item.candidate.workspaceRevision) && clean(payload.representation_id) === 'semantic_768' && clean(payload.embedding_model) === model; }));
    report.counts.qdrantReadback = exact.length;
    if (exact.length !== rows.length) throw new Error(`QDRANT_SEMANTIC_768_READBACK_FAILED:${exact.length}/${rows.length}`);
    report.status = 'SEMANTIC_768_BACKFILL_AND_PROJECTION_PROVEN';
  } catch (error) { report.errors.push(error?.message || String(error)); }
  finally { await pool.end(); }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, writes: report.writes, reportPath, errors: report.errors }, null, 2));
  if (report.status !== 'SEMANTIC_768_BACKFILL_AND_PROJECTION_PROVEN') process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
