#!/usr/bin/env node
/**
 * CURRENT-PACKET-CHUNK-MATERIALIZER-PLAN-01 -- READ ONLY.
 *
 * Bounded snapshot-native planner that answers which producer is actually
 * missing for current packet/chunk lineage:
 *   - packet already exists + chunks already exist -> lineage fill only
 *   - packet missing -> packet materializer required
 *   - canonical chunk row missing -> current chunk materializer required
 *   - >1 exact canonical chunk candidate -> ambiguity, fail closed
 *
 * Hard invariants:
 *   - selected execution comes from graphify-snapshot-native-readback-v1.json
 *   - source bytes come from the revision-addressed materialized snapshot root
 *   - sidecar observations never mint canonical chunk identity
 *   - canonicalChunkId always comes from an existing codebase_chunk_index row
 *   - no Postgres/Qdrant/Neo4j/Valkey writes
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  classifyPacketRows,
  classifySourceMaterializerPlan,
  languageForSourceRef,
  matchObservationToCanonicalChunkRows,
  normalizeText,
  sourceDigestMatches,
} from './lib/snapshot-packet-chunk-materializer-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const ROOT = path.resolve(import.meta.dirname, '../..');
const READBACK_PATH = path.join(ROOT, 'docs/reports/graphify-snapshot-native-readback-v1.json');
const REPORT_PATH = path.join(ROOT, 'docs/reports/snapshot-packet-chunk-materializer-plan-v1.json');
const SIDECAR_URL = (process.env.ATLAS_NLP_SIDECAR_URL || 'http://127.0.0.1:8095').replace(/\/$/, '');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = Math.max(1, Math.min(Number.parseInt(limitArg?.split('=')[1] ?? '8', 10) || 8, 64));
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const ONLY_SOURCE = sourceArg ? sourceArg.slice('--source='.length).replaceAll('\\', '/') : null;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function die(message) {
  console.error(message);
  process.exit(2);
}

if (!fs.existsSync(READBACK_PATH)) die('SNAPSHOT_NATIVE_READBACK_RECEIPT_MISSING');
const readback = JSON.parse(fs.readFileSync(READBACK_PATH, 'utf8'));
if (readback.status !== 'SNAPSHOT_NATIVE_READBACK_PROVEN') die(`SNAPSHOT_NATIVE_READBACK_NOT_PROVEN:${readback.status}`);
if (!readback.executionId || !readback.workspaceRevision || !readback.snapshotRevision) die('SNAPSHOT_NATIVE_READBACK_IDENTITY_INCOMPLETE');

const materializedRoot = path.join(ROOT, '.tmp', 'workspace-source-snapshots', String(readback.snapshotRevision).replace(/^sha256:/, ''));
if (!fs.existsSync(materializedRoot)) die(`MATERIALIZED_SNAPSHOT_ROOT_MISSING:${materializedRoot}`);

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 2,
  statement_timeout: 120000,
  application_name: 'atlas-snapshot-packet-chunk-materializer-plan-v1',
});

async function postAst(source, language, filePath, sourceRevision) {
  const response = await fetch(`${SIDECAR_URL}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, language, filePath, sourceRevision }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(`SIDECAR_NON_JSON:${response.status}:${text.slice(0,200)}`); }
  if (!response.ok) throw new Error(`SIDECAR_HTTP_${response.status}:${text.slice(0,200)}`);
  if (payload?.schema !== 'atlas.ast.evidence.v1' || !Array.isArray(payload?.chunks)) throw new Error('SIDECAR_AST_CONTRACT_INVALID');
  return payload;
}

let memberships = [];
let error = null;
const plans = [];
try {
  const { rows } = await pool.query(
    `select execution_id::text, repository_id, repository_relative_path, source_ref,
            code_source_revision, content_hash, workspace_revision
       from public.graphify_execution_file_membership_v2
      where execution_id = $1::uuid
        and ($2::text is null or source_ref = $2::text)
      order by repository_id, repository_relative_path
      limit $3`,
    [readback.executionId, ONLY_SOURCE, LIMIT * 8],
  );
  memberships = rows.filter((row) => languageForSourceRef(row.source_ref)).slice(0, LIMIT);

  for (const membership of memberships) {
    const sourceRef = normalizeText(membership.source_ref).replaceAll('\\', '/');
    const sourcePath = path.resolve(materializedRoot, sourceRef.replaceAll('/', path.sep));
    if (!sourcePath.startsWith(path.resolve(materializedRoot) + path.sep) || !fs.existsSync(sourcePath)) {
      plans.push({ sourceRef, classification: 'BLOCKED_MATERIALIZED_SOURCE_MISSING', blockers: ['MATERIALIZED_SOURCE_MISSING'] });
      continue;
    }
    const sourceBuffer = fs.readFileSync(sourcePath);
    const digestEvidence = sourceDigestMatches(sourceBuffer, membership);
    if (!digestEvidence.contentHashMatches || !digestEvidence.sourceRevisionMatches) {
      plans.push({ sourceRef, classification: 'BLOCKED_SOURCE_BYTES_MISMATCH', blockers: ['SOURCE_BYTES_MISMATCH'], digestEvidence });
      continue;
    }

    const language = languageForSourceRef(sourceRef);
    const ast = await postAst(sourceBuffer.toString('utf8'), language, sourceRef, membership.code_source_revision);

    const chunkResult = await pool.query(
      `select id::text, chunk_id::text, source_ref, relative_path, content, content_hash,
              line_start, line_end
         from public.codebase_chunk_index
        where source_ref = $1 or relative_path = $1
        order by id`,
      [sourceRef],
    );
    const packetResultRows = await pool.query(
      `select packet_key::text, source_ref, content_hash, sha256
         from public.atlas_packets
        where source_ref = $1 or canonical_source_ref = $1
        order by updated_at desc nulls last, created_at desc nulls last`,
      [sourceRef],
    );
    const lineageResult = await pool.query(
      `select packet_key::text, canonical_chunk_id::text, chunk_row_id::text, source_ref,
              source_revision, membership_status, revision_status
         from public.atlas_packet_chunk_lineage
        where source_ref = $1`,
      [sourceRef],
    );

    const observationMatches = ast.chunks.map((chunk) => matchObservationToCanonicalChunkRows(sourceBuffer, chunk, chunkResult.rows));
    const packetResult = classifyPacketRows(membership, packetResultRows.rows);
    const plan = classifySourceMaterializerPlan({
      membership,
      packetResult,
      observationMatches,
      existingLineageRows: lineageResult.rows,
    });
    plans.push({
      ...plan,
      language,
      sourceByteLength: sourceBuffer.length,
      sourceDigest: digestEvidence.digest,
      sidecar: {
        schema: ast.schema,
        engine: ast.engine ?? null,
        engineVersion: ast.engine_version ?? null,
        syntaxStatus: ast.syntax_status ?? null,
      },
      canonicalChunkRowsObserved: chunkResult.rows.length,
      currentPacketRowsObserved: packetResultRows.rows.length,
      existingLineageRowsObserved: lineageResult.rows.length,
      observationMatches: observationMatches.map((row) => ({ evidence: row.evidence, classification: row.classification, candidates: row.candidates })),
    });
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await pool.end();
}

const counts = {
  selectedSources: plans.length,
  readyLineageFill: plans.filter((row) => row.classification === 'READY_LINEAGE_FILL_EXISTING_PACKET_EXISTING_CHUNKS').length,
  alreadyComplete: plans.filter((row) => row.classification === 'ALREADY_COMPLETE_FOR_OBSERVED_CHUNKS').length,
  needsChunkMaterializer: plans.filter((row) => row.classification === 'NEEDS_CURRENT_CHUNK_MATERIALIZER').length,
  needsPacketMaterializer: plans.filter((row) => row.classification === 'NEEDS_CURRENT_PACKET_MATERIALIZER').length,
  ambiguousOrBlocked: plans.filter((row) => String(row.classification).startsWith('BLOCKED') || row.classification === 'BLOCKED_AMBIGUOUS_OR_UNPROVEN').length,
  proposedMissingLineageRows: plans.reduce((sum, row) => sum + Number(row.missingLineageCount || 0), 0),
};

let status = 'PACKET_CHUNK_MATERIALIZER_PLAN_BLOCKED';
let nextGate = 'REVIEW_BLOCKERS';
if (!error && counts.selectedSources > 0) {
  if (counts.readyLineageFill > 0 && counts.needsChunkMaterializer === 0 && counts.needsPacketMaterializer === 0 && counts.ambiguousOrBlocked === 0) {
    status = 'LINEAGE_FILL_CANARY_READY';
    nextGate = 'EXPLICIT_BOUNDED_LINEAGE_FILL_AUTHORIZATION';
  } else if (counts.needsChunkMaterializer > 0) {
    status = 'CURRENT_CHUNK_MATERIALIZER_REQUIRED';
    nextGate = 'CURRENT_CHUNK_MATERIALIZER_DRY_RUN';
  } else if (counts.needsPacketMaterializer > 0) {
    status = 'CURRENT_PACKET_MATERIALIZER_REQUIRED';
    nextGate = 'CURRENT_PACKET_MATERIALIZER_DRY_RUN';
  } else if (counts.alreadyComplete === counts.selectedSources) {
    status = 'BOUNDED_PACKET_CHUNK_LINEAGE_ALREADY_COMPLETE';
    nextGate = 'EXPAND_BOUNDED_COHORT';
  }
}

const deterministic = {
  schema: 'atlas.snapshot-packet-chunk-materializer-plan.v1',
  gate: 'CURRENT-PACKET-CHUNK-MATERIALIZER-PLAN-01',
  mode: 'READ_ONLY_BOUNDED_PLAN',
  selectedExecutionId: readback.executionId,
  selectedWorkspaceRevision: readback.workspaceRevision,
  selectedSnapshotRevision: readback.snapshotRevision,
  sidecarUrl: SIDECAR_URL,
  materializedRoot,
  limit: LIMIT,
  onlySource: ONLY_SOURCE,
  counts,
  status,
  nextGate,
  plans,
  error,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphify: false },
  canonicalAuthority: false,
  materializationAuthorized: false,
};
const report = {
  ...deterministic,
  generatedAt: new Date().toISOString(),
  reportChecksum: `sha256:${sha256(JSON.stringify(deterministic))}`,
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status, nextGate, counts, reportPath: path.relative(ROOT, REPORT_PATH), writesPerformed: false }, null, 2));
if (error || counts.selectedSources === 0) process.exitCode = 2;
