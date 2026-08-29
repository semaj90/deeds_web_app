#!/usr/bin/env node

/**
 * Read-only plan for repairing semantic_768 coverage for the lineage canary.
 *
 * This planner never calls an embedding backend and never writes PostgreSQL or
 * Qdrant. It selects only exact source_ref rows from the frozen canary map.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadRepoEnv(process.env);
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_SEMANTIC_PLAN_REPORT ?? path.join(ROOT, 'docs/reports/lineage-qualified-semantic-768-backfill-plan-v1.json'));
const model = String(process.env.EMBEDDINGGEMMA_MODEL ?? process.env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const ollamaUrl = String(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const qdrantUrl = String(process.env.QDRANT_URL ?? `http://${process.env.QDRANT_HOST ?? '127.0.0.1'}:${process.env.QDRANT_PORT ?? '6333'}`).replace(/\/+$/, '');
const qdrantCollection = String(process.env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');

const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const clean = (value) => String(value ?? '').trim();
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value));

function embeddingText(row) {
  const ast = Array.isArray(row.ast_symbols) ? row.ast_symbols.join(' ') : '';
  return [row.relative_path, row.symbol, row.kind, row.summary, row.content, ast]
    .filter(Boolean).join('\n').trim().slice(0, 12_000);
}

async function qdrant(pathname) {
  const response = await fetch(`${qdrantUrl}${pathname}`, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function main() {
  const ordinalMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(ordinalMap.candidates) ? ordinalMap.candidates : [];
  if (!candidates.length) throw new Error('SEMANTIC_PLAN_CANDIDATE_MAP_EMPTY');
  if (candidates.length > 768) throw new Error('SEMANTIC_PLAN_CANDIDATE_LIMIT_EXCEEDED');
  const workspaceRevisions = [...new Set(candidates.map((candidate) => clean(candidate.workspaceRevision)).filter(Boolean))];
  if (workspaceRevisions.length !== 1 || !validRevision(workspaceRevisions[0])) {
    throw new Error('SEMANTIC_PLAN_WORKSPACE_REVISION_INVALID');
  }

  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'atlas-lineage-semantic-768-plan' });
  const started = Date.now();
  const report = {
    schema: 'atlas.lineage-qualified-semantic-768-backfill-plan.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_PLAN',
    candidateMap: {
      path: path.relative(REPO_ROOT, mapPath),
      candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision ?? null,
      ordinalMapChecksum: ordinalMap.ordinalMapChecksum ?? null,
      workspaceRevision: workspaceRevisions[0],
      candidateCount: candidates.length,
    },
    target: {
      representationId: 'semantic_768',
      vectorName: 'content',
      dimensions: 768,
      distance: 'Cosine',
      model,
      ollamaUrl,
      qdrantUrl,
      qdrantCollection,
      postgresTable: 'codebase_chunk_index',
      postgresVectorColumn: 'content_embedding_768',
      qdrantWritesPlanned: true,
      postgresWritesPlanned: true,
    },
    counts: {
      candidates: candidates.length,
      uniqueExactSourceRows: 0,
      missingExactSourceRows: 0,
      ambiguousExactSourceRows: 0,
      usableTextRows: 0,
      postgresVectorRowsAlreadyPresent: 0,
      qdrantLineagePointsAlreadyPresent: 0,
      plannedEmbeddings: 0,
    },
    candidates: [],
    writes: {
      applyAuthorized: false,
      postgresWrites: false,
      qdrantWrites: false,
      vectorGeneration: false,
    },
    status: 'FAIL',
    nextGate: 'SEMANTIC_768_PLAN_REVIEW',
    errors: [],
  };

  try {
    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
    `);
    const names = new Set(columns.rows.map((row) => row.column_name));
    const required = ['source_ref', 'content_embedding_768'];
    const missingColumns = required.filter((name) => !names.has(name));
    if (missingColumns.length) throw new Error(`SEMANTIC_PLAN_REQUIRED_COLUMNS_MISSING:${missingColumns.join(',')}`);
    const optional = ['id', 'relative_path', 'symbol', 'kind', 'summary', 'content', 'ast_symbols', 'content_hash', 'packet_key', 'source_revision', 'workspace_revision', 'representation_id', 'representation_revision'];
    const selected = ['source_ref', 'content_embedding_768', ...optional.filter((name) => names.has(name))];
    const resultRows = [];
    for (const candidate of candidates) {
      const sourceRef = clean(candidate.sourceRef);
      const result = await pool.query(`
        SELECT ${selected.map((name) => name === 'id' ? 'id::text AS id' : `"${name}"`).join(', ')}
        FROM public.codebase_chunk_index
        WHERE source_ref = $1
        ORDER BY ${names.has('id') ? 'id' : 'source_ref'}
      `, [sourceRef]);
      const classification = result.rows.length === 0
        ? 'EXACT_SOURCE_ROW_MISSING'
        : result.rows.length !== 1
          ? 'EXACT_SOURCE_ROW_AMBIGUOUS'
          : !clean(result.rows[0].content)
            ? 'SOURCE_CONTENT_MISSING'
            : 'EXACT_SOURCE_ROW_READY';
      if (classification === 'EXACT_SOURCE_ROW_MISSING') report.counts.missingExactSourceRows += 1;
      else if (classification === 'EXACT_SOURCE_ROW_AMBIGUOUS') report.counts.ambiguousExactSourceRows += 1;
      else {
        report.counts.uniqueExactSourceRows += 1;
        if (classification === 'EXACT_SOURCE_ROW_READY') {
          report.counts.usableTextRows += 1;
          if (result.rows[0].content_embedding_768 !== null && result.rows[0].content_embedding_768 !== undefined) report.counts.postgresVectorRowsAlreadyPresent += 1;
        }
      }
      const row = result.rows.length === 1 ? result.rows[0] : null;
      const text = row ? embeddingText(row) : '';
      let qdrantState = { status: 'NOT_CHECKED', points: 0, exactLineagePoints: 0 };
      if (candidate.packetKey) {
        try {
          // Use the exact packet filter; a broad collection sample cannot pass.
          const filtered = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(qdrantCollection)}/points/scroll`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              limit: 100,
              with_payload: true,
              with_vector: false,
              filter: { must: [{ key: 'packet_key', match: { value: candidate.packetKey } }] },
            }),
            signal: AbortSignal.timeout(15_000),
          });
          const body = await filtered.json().catch(() => ({}));
          if (!filtered.ok) qdrantState = { status: `HTTP_${filtered.status}`, points: 0, exactLineagePoints: 0 };
          else {
            const points = Array.isArray(body?.result?.points) ? body.result.points : [];
            const exact = points.filter((point) => {
              const payload = point?.payload ?? {};
              return clean(payload.packet_key) === clean(candidate.packetKey)
                && clean(payload.source_ref) === sourceRef
                && clean(payload.workspace_revision) === clean(candidate.workspaceRevision)
                && clean(payload.source_revision) === clean(candidate.sourceRevision)
                && clean(payload.representation_id) === 'semantic_768';
            });
            qdrantState = { status: exact.length ? 'EXACT_LINEAGE_PRESENT' : points.length ? 'IDENTITY_PRESENT_LINEAGE_MISMATCH' : 'PACKET_NOT_FOUND', points: points.length, exactLineagePoints: exact.length };
            report.counts.qdrantLineagePointsAlreadyPresent += exact.length;
          }
        } catch (error) {
          qdrantState = { status: 'UNAVAILABLE', points: 0, exactLineagePoints: 0, error: error?.message || String(error) };
        }
      }
      resultRows.push({
        candidateOrdinal: candidate.candidateOrdinal,
        packetKey: candidate.packetKey,
        sourceRef,
        sourceRevision: candidate.sourceRevision,
        workspaceRevision: candidate.workspaceRevision,
        candidateContentHash: candidate.evidenceRefs?.find((ref) => ref.startsWith('chunk:'))?.split(':').pop() ?? null,
        postgres: row ? {
          id: row.id ?? null,
          sourceRef: row.source_ref,
          contentHash: row.content_hash ?? null,
          packetKey: row.packet_key ?? null,
          sourceRevision: row.source_revision ?? null,
          workspaceRevision: row.workspace_revision ?? null,
          representationId: row.representation_id ?? null,
          representationRevision: row.representation_revision ?? null,
          vectorPresent: row.content_embedding_768 !== null && row.content_embedding_768 !== undefined,
          contentBytes: Buffer.byteLength(String(row.content ?? ''), 'utf8'),
          embeddingTextHash: text ? sha256(text) : null,
        } : null,
        qdrant: qdrantState,
        classification,
        plannedOperation: classification === 'EXACT_SOURCE_ROW_READY' && !(row.content_embedding_768 !== null && row.content_embedding_768 !== undefined)
          ? 'GENERATE_768_AND_WRITE_POSTGRES_THEN_PROJECT_QDRANT'
          : classification === 'EXACT_SOURCE_ROW_READY' ? 'RECONCILE_QDRANT_PROJECTION_ONLY' : 'BLOCKED',
      });
    }
    report.candidates = resultRows;
    report.counts.plannedEmbeddings = resultRows.filter((row) => row.plannedOperation === 'GENERATE_768_AND_WRITE_POSTGRES_THEN_PROJECT_QDRANT').length;
    report.status = report.counts.missingExactSourceRows === 0 && report.counts.ambiguousExactSourceRows === 0 && report.counts.usableTextRows === candidates.length
      ? 'SEMANTIC_768_BACKFILL_PLAN_READY'
      : 'SEMANTIC_768_BACKFILL_PLAN_BLOCKED';
    report.nextGate = report.status === 'SEMANTIC_768_BACKFILL_PLAN_READY'
      ? 'EXPLICIT_AUTHORIZATION_REQUIRED_FOR_VECTOR_GENERATION_AND_WRITES'
      : 'RECONCILE_EXACT_POSTGRES_SOURCE_ROWS';
  } catch (error) {
    report.errors.push(error?.message || String(error));
  } finally {
    await pool.end();
  }
  report.elapsedMs = Date.now() - started;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, target: report.target, reportPath }, null, 2));
  if (report.status === 'FAIL') process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
