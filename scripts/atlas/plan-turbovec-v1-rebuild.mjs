#!/usr/bin/env node
/** Read-only plan for rebuilding the legacy TurboVec evidence index. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const artifact = path.resolve(REPO_ROOT, 'sveltekit-frontend/.cache/turbovec/evidence_text.tvim');
const auditReportPath = path.resolve(REPO_ROOT, 'docs/reports/turbovec-idmap-migration-v1.json');
const builder = path.resolve(REPO_ROOT, 'sveltekit-frontend/scripts/atlas/build-turbovec-768-4bit.mts');
const output = path.resolve(REPO_ROOT, 'docs/reports/turbovec-v1-rebuild-plan-v1.json');
const qdrantUrl = process.env.QDRANT_URL ?? `http://${process.env.QDRANT_HOST ?? '127.0.0.1'}:${process.env.QDRANT_PORT ?? '6333'}`;
const collection = process.env.CODEBASE_QDRANT_COLLECTION ?? 'codebase_chunks_768';

async function fileStatus(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return { exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch (error) {
    return { exists: false, error: error.code ?? String(error) };
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function qdrantProbe() {
  try {
    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}`, {
      signal: AbortSignal.timeout(2500),
    });
    const body = await response.json().catch(() => null);
    return {
      status: response.ok ? 'REACHABLE' : 'HTTP_ERROR',
      httpStatus: response.status,
      points: body?.result?.points_count ?? null,
      vectors: body?.result?.config?.params?.vectors ?? null,
    };
  } catch (error) {
    return { status: 'UNAVAILABLE', error: error?.message ?? String(error) };
  }
}

async function qdrantPayloadProbe() {
  try {
    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit: 1000,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { status: 'HTTP_ERROR', httpStatus: response.status };
    const points = Array.isArray(body?.result?.points) ? body.result.points : [];
    const hasOrdinal = points.filter((point) => Number.isInteger(point?.payload?.candidateOrdinal)
      || Number.isInteger(point?.payload?.candidate_ordinal)).length;
    const hasSourceRef = points.filter((point) => typeof point?.payload?.source_ref === 'string').length;
    return {
      status: 'READ_OK',
      sampled: points.length,
      candidateOrdinalField: hasOrdinal ? 'PRESENT' : 'ABSENT',
      candidateOrdinalRows: hasOrdinal,
      sourceRefRows: hasSourceRef,
      nextPage: body?.result?.next_page_offset ?? null,
    };
  } catch (error) {
    return { status: 'UNAVAILABLE', error: error?.message ?? String(error) };
  }
}

const [artifactStatus, builderStatus, audit, qdrant, qdrantPayload] = await Promise.all([
  fileStatus(artifact),
  fileStatus(builder),
  readJson(auditReportPath),
  qdrantProbe(),
  qdrantPayloadProbe(),
]);

const report = {
  schema: 'atlas.turbovec-v1-rebuild-plan.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writes: false,
  sourceContract: {
    owner: 'sveltekit-frontend/scripts/atlas/build-turbovec-768-4bit.mts',
    collection,
    vectorName: 'content',
    dimension: 768,
    bits: 4,
    identity: 'CandidateOrdinal when present; otherwise source payload identity remains projection metadata',
    canonicalStore: 'Qdrant semantic_768 projection; Postgres remains canonical provenance authority',
  },
  legacyArtifact: {
    path: path.relative(REPO_ROOT, artifact),
    ...artifactStatus,
    auditStatus: audit?.persistedFormatStatus ?? 'AUDIT_REPORT_UNAVAILABLE',
  },
  sourceBuilder: { path: path.relative(REPO_ROOT, builder), ...builderStatus },
  qdrant,
  qdrantPayload,
  decision: qdrant.status === 'REACHABLE' && qdrantPayload.candidateOrdinalField === 'PRESENT'
    ? 'SOURCE_AVAILABLE_REBUILD_CAN_BE_RUN_AS_BOUNDED_APPLY'
    : qdrant.status !== 'REACHABLE'
      ? 'BLOCKED_SOURCE_SERVICE_UNAVAILABLE'
      : 'BLOCKED_CANDIDATE_ORDINAL_BRIDGE_MISSING',
  nextApply: {
    dryRun: 'npm --prefix sveltekit-frontend run atlas:turbovec:768:4bit:build:dry -- --limit=1000',
    applyAfterReview: 'npm --prefix sveltekit-frontend run atlas:turbovec:768:4bit:build -- --limit=1000',
    requiredChecks: [
      'Do not delete or overwrite evidence_text.tvim in place',
      'Write a versioned output artifact or rebuild from canonical Qdrant vectors',
      'Bind external IDs to CandidateOrdinal and record the ordinal checksum',
      'Compare native allowlist recall against the semantic_768 oracle',
      'Promote only after full-corpus load and recall evidence',
    ],
  },
  promotion: 'BLOCKED_PENDING_CANDIDATE_ORDINAL_BRIDGE_AND_FULL_CORPUS_ALLOWLIST_RECALL',
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
