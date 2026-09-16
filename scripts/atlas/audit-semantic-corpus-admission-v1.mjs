#!/usr/bin/env node
/**
 * SEMANTIC-CORPUS-ADMISSION-01 read-only measurement.
 *
 * Scrolls actual points in Qdrant codebase_chunks_768 (declared owner) and
 * codebase_chunks_768_v2 (declared comparison challenger -- kept in a fully
 * separate section, never summed with the owner), reads their workspace_id/
 * workspace_revision/source_revision/representation_revision/canonical-id
 * payload fields, and joins the owner cohort against Postgres
 * atlas_workspace_source_bindings for the currently-admitted workspace
 * revision. Populates the fields left null in docs/reports/promotion-board-
 * reconcile-v2.json's board.semanticCorpus, into a NEW, separate receipt
 * (this script never writes to that file).
 *
 * STRICTLY READ-ONLY: no Qdrant setPayload/upsert/delete, no Postgres
 * INSERT/UPDATE/DELETE. See openspec/changes/parent-atlas-ace-rlm-bitfrost-
 * integration/tasks.md's SEMANTIC-CORPUS-ADMISSION-01 entry.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'docs/reports/semantic-corpus-admission-v1.json');
const env = loadRepoEnv(process.env);
const QDRANT_URL = (env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const SHA256_RE = /^sha256:[a-f0-9]{64}$/i;

// Consume the current authoritative tournament receipt. A hard-coded revision
// is unsafe because a newer immutable workspace admission supersedes it.
const ADMISSION_PATH = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const admission = JSON.parse(readFileSync(ADMISSION_PATH, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_RECEIPT_REQUIRED');
}
const ADMITTED_WORKSPACE_REVISION = admission.workspaceRevision;
if (!SHA256_RE.test(ADMITTED_WORKSPACE_REVISION)) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_RECEIPT_INVALID');
}
const OWNER_COLLECTION = 'codebase_chunks_768';
const CHALLENGER_COLLECTION = 'codebase_chunks_768_v2';
const SCROLL_PAGE_SIZE = 1000;
const REPO_ID = 'deeds-web-app';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Practical canonical-identity resolution: the "compliant" schema-v2 writer
 * (buildQdrantSyncPayload) emits canonical_id, but the majority of legacy-
 * written points (verified live, 2026-09-12) use canonical_source_ref /
 * source_ref_key / packet_key instead. Fall through in priority order and
 * record which field actually resolved it, per point, for transparency. */
function resolveCanonicalId(payload) {
  if (payload.canonical_id) return { id: String(payload.canonical_id), field: 'canonical_id' };
  if (payload.canonical_source_ref) return { id: String(payload.canonical_source_ref), field: 'canonical_source_ref' };
  if (payload.source_ref_key) return { id: String(payload.source_ref_key), field: 'source_ref_key' };
  if (payload.packet_key) return { id: String(payload.packet_key), field: 'packet_key' };
  if (payload.source_ref) return { id: String(payload.source_ref), field: 'source_ref' };
  return { id: null, field: null };
}

function resolveWorkspaceRevision(payload) {
  const raw = payload.workspace_revision ?? payload.workspaceRevision;
  if (raw === undefined || raw === null || raw === '') return { present: false, valid: false, value: null };
  const str = String(raw);
  if (SHA256_RE.test(str)) return { present: true, valid: true, value: str };
  // Legacy numeric/epoch workspace_cache_revision-shaped values are present
  // but not a valid content-addressed workspace revision per the canonical
  // contract (qdrant-sync-payload.ts) -- tracked separately from "missing".
  return { present: true, valid: false, value: str };
}

function resolveSourceRevision(payload) {
  const raw = payload.source_revision ?? payload.sourceRevision;
  return raw === undefined || raw === null || raw === '' ? null : String(raw);
}

function resolveRepresentationRevision(payload) {
  const raw = payload.representation_revision ?? payload.representationRevision;
  return raw === undefined || raw === null || raw === '' ? null : raw;
}

async function scrollCollection(name) {
  const points = [];
  let offset = null;
  let available = true;
  let pointsCount = null;
  try {
    const infoRes = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(5000) });
    if (infoRes.ok) pointsCount = (await infoRes.json())?.result?.points_count ?? null;
  } catch {
    available = false;
  }
  if (!available) return { available: false, pointsCount: null, points: [] };
  for (;;) {
    const body = { limit: SCROLL_PAGE_SIZE, with_payload: true, with_vector: false };
    if (offset !== null) body.offset = offset;
    const res = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(name)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { available = false; break; }
    const json = await res.json();
    const batch = json?.result?.points ?? [];
    for (const point of batch) points.push({ id: point.id, payload: point.payload ?? {} });
    offset = json?.result?.next_page_offset ?? null;
    if (!offset || batch.length === 0) break;
  }
  return { available, pointsCount, points };
}

function summarizeCollection(scrollResult, { checkAdmittedRevision }) {
  const { points } = scrollResult;
  const canonicalIdField = {};
  const canonicalIdCounts = new Map();
  let missingCanonicalId = 0;
  let missingSourceRevision = 0;
  let missingWorkspaceRevision = 0;
  let invalidWorkspaceRevisionFormat = 0;
  let mixedWorkspaceRevision = 0; // valid format, but != admitted revision
  const representationRevisions = new Set();
  let missingRepresentationRevision = 0;

  for (const point of points) {
    const { id: canonicalId, field } = resolveCanonicalId(point.payload);
    if (canonicalId === null) {
      missingCanonicalId += 1;
    } else {
      canonicalIdCounts.set(canonicalId, (canonicalIdCounts.get(canonicalId) ?? 0) + 1);
      canonicalIdField[field] = (canonicalIdField[field] ?? 0) + 1;
    }

    const sourceRevision = resolveSourceRevision(point.payload);
    if (sourceRevision === null) missingSourceRevision += 1;

    const workspaceRevision = resolveWorkspaceRevision(point.payload);
    if (!workspaceRevision.present) {
      missingWorkspaceRevision += 1;
    } else if (!workspaceRevision.valid) {
      invalidWorkspaceRevisionFormat += 1;
    } else if (checkAdmittedRevision && workspaceRevision.value !== ADMITTED_WORKSPACE_REVISION) {
      mixedWorkspaceRevision += 1;
    }

    const representationRevision = resolveRepresentationRevision(point.payload);
    if (representationRevision === null) missingRepresentationRevision += 1;
    else representationRevisions.add(JSON.stringify(representationRevision));
  }

  const duplicateCanonicalIds = [...canonicalIdCounts.values()].filter((count) => count > 1).length;
  const sortedEligibleCanonicalIds = [...canonicalIdCounts.keys()].filter((id) => canonicalIdCounts.get(id) === 1).sort();

  return {
    candidateCount: points.length,
    canonicalIdCount: canonicalIdCounts.size,
    canonicalIdFieldBreakdown: canonicalIdField,
    missingCanonicalId,
    duplicateCanonicalIds,
    missingSourceRevision,
    missingWorkspaceRevision,
    invalidWorkspaceRevisionFormat,
    // mixedWorkspaceRevision counts BOTH valid-but-different-from-admitted
    // AND invalid-format points, per the plan's definition -- reported
    // together here, broken out individually above for diagnosis.
    mixedWorkspaceRevision: checkAdmittedRevision ? mixedWorkspaceRevision + invalidWorkspaceRevisionFormat : null,
    missingRepresentationRevision,
    representationRevisionAgreement: representationRevisions.size,
    representationRevision: representationRevisions.size === 1 ? JSON.parse([...representationRevisions][0]) : null,
    mixedRepresentationRevision: representationRevisions.size > 1 ? representationRevisions.size : 0,
    admittedCohortChecksum: sha256(JSON.stringify(sortedEligibleCanonicalIds)),
    admittedCohortCount: sortedEligibleCanonicalIds.length,
  };
}

async function main() {
  const report = {
    schema: 'atlas.semantic-corpus-admission.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_AUDIT',
    admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    owner: { collection: OWNER_COLLECTION },
    challenger: { collection: CHALLENGER_COLLECTION },
    postgres: {},
    status: 'SEMANTIC_CORPUS_ADMISSION_BLOCKED',
    blockers: [],
    followUp: null,
    readOnlyInvariants: {
      writesPerformed: false,
      qdrantModified: false,
      postgresModified: false,
    },
  };

  // --- Qdrant owner + challenger scroll (read-only) ---
  const ownerScroll = await scrollCollection(OWNER_COLLECTION);
  const challengerScroll = await scrollCollection(CHALLENGER_COLLECTION);

  if (!ownerScroll.available) {
    report.status = 'SEMANTIC_CORPUS_ADMISSION_BLOCKED';
    report.blockers.push({
      code: 'OWNER_COLLECTION_UNAVAILABLE',
      lane: 'SEMANTIC_CORPUS',
      severity: 'CRITICAL',
      receiptRefs: [],
      explanation: `Qdrant collection ${OWNER_COLLECTION} could not be scrolled -- Qdrant unreachable or collection missing.`,
    });
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: report.status, reportPath: 'docs/reports/semantic-corpus-admission-v1.json' }, null, 2));
    return;
  }

  const ownerSummary = summarizeCollection(ownerScroll, { checkAdmittedRevision: true });
  report.owner = {
    collection: OWNER_COLLECTION,
    pointsCountLive: ownerScroll.pointsCount,
    pointsScrolled: ownerScroll.points.length,
    pointsCountMatchesScroll: ownerScroll.pointsCount === ownerScroll.points.length,
    ...ownerSummary,
  };

  if (challengerScroll.available) {
    const challengerSummary = summarizeCollection(challengerScroll, { checkAdmittedRevision: false });
    report.challenger = {
      collection: CHALLENGER_COLLECTION,
      pointsCountLive: challengerScroll.pointsCount,
      pointsScrolled: challengerScroll.points.length,
      pointsCountMatchesScroll: challengerScroll.pointsCount === challengerScroll.points.length,
      ...challengerSummary,
      note: 'Reported for visibility only. NEVER summed with, merged into, or compared as equivalent to the owner collection above -- codebase_chunks_768 and codebase_chunks_768_v2 are two distinct collections per this repo\'s Embedding Dimensions Policy hard rule.',
    };
  } else {
    report.challenger = { collection: CHALLENGER_COLLECTION, available: false };
  }

  // --- Postgres: does the admitted workspace revision have ANY bindings at all? ---
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 30000 });
  try {
    const totalChunks = await pool.query('SELECT count(*)::int AS count FROM codebase_chunk_index');
    const admittedBindings = await pool.query(
      'SELECT count(*)::int AS count FROM atlas_workspace_source_bindings WHERE repo_id = $1 AND workspace_revision = $2',
      [REPO_ID, ADMITTED_WORKSPACE_REVISION],
    );
    const anyBindings = await pool.query(
      'SELECT workspace_revision, count(*)::int AS count FROM atlas_workspace_source_bindings GROUP BY workspace_revision ORDER BY count(*) DESC LIMIT 10',
    );
    report.postgres = {
      codebaseChunkIndexCount: totalChunks.rows[0].count,
      workspaceSourceBindingsForAdmittedRevision: admittedBindings.rows[0].count,
      workspaceSourceBindingsByRevision: anyBindings.rows,
      admittedRevisionHasAnyBindings: admittedBindings.rows[0].count > 0,
    };
  } finally {
    await pool.end();
  }

  // --- Blockers + verdict ---
  const o = report.owner;
  if (o.duplicateCanonicalIds > 0) {
    report.blockers.push({
      code: 'SEMANTIC_CORPUS_DUPLICATE_CANONICAL_IDS',
      lane: 'SEMANTIC_CORPUS',
      severity: 'PROMOTION_BLOCKING',
      receiptRefs: ['docs/reports/semantic-corpus-admission-v1.json'],
      explanation: `${o.duplicateCanonicalIds} canonical IDs resolve to more than one point in ${OWNER_COLLECTION} (out of ${o.canonicalIdCount} distinct IDs across ${o.candidateCount} points).`,
    });
  }
  if (o.missingSourceRevision > 0) {
    report.blockers.push({
      code: 'SEMANTIC_CORPUS_MISSING_SOURCE_REVISION',
      lane: 'SEMANTIC_CORPUS',
      severity: 'PROMOTION_BLOCKING',
      receiptRefs: ['docs/reports/semantic-corpus-admission-v1.json'],
      explanation: `${o.missingSourceRevision}/${o.candidateCount} points in ${OWNER_COLLECTION} have no source_revision payload field.`,
    });
  }
  if (o.mixedWorkspaceRevision > 0) {
    report.blockers.push({
      code: 'SEMANTIC_CORPUS_MIXED_WORKSPACE_REVISION',
      lane: 'SEMANTIC_CORPUS',
      severity: 'PROMOTION_BLOCKING',
      receiptRefs: ['docs/reports/semantic-corpus-admission-v1.json'],
      explanation: `${o.mixedWorkspaceRevision}/${o.candidateCount} points in ${OWNER_COLLECTION} carry a workspace_revision that is either absent, malformed, or does not match the admitted revision ${ADMITTED_WORKSPACE_REVISION} (missing entirely: ${o.missingWorkspaceRevision}, invalid format: ${o.invalidWorkspaceRevisionFormat}).`,
    });
  }
  if (o.mixedRepresentationRevision > 0) {
    report.blockers.push({
      code: 'SEMANTIC_CORPUS_MIXED_REPRESENTATION_REVISION',
      lane: 'SEMANTIC_CORPUS',
      severity: 'PROMOTION_BLOCKING',
      receiptRefs: ['docs/reports/semantic-corpus-admission-v1.json'],
      explanation: `${o.representationRevisionAgreement} distinct representation_revision values found across ${OWNER_COLLECTION} points (expected exactly 1); ${o.missingRepresentationRevision} points have none at all.`,
    });
  }
  if (report.postgres.admittedRevisionHasAnyBindings === false) {
    report.blockers.push({
      code: 'CURRENT_WORKSPACE_REVISION_HAS_NO_SOURCE_BINDINGS',
      lane: 'SEMANTIC_CORPUS',
      severity: 'CRITICAL',
      receiptRefs: ['docs/reports/semantic-corpus-admission-v1.json'],
      explanation: `atlas_workspace_source_bindings has zero rows for the admitted workspace revision ${ADMITTED_WORKSPACE_REVISION} (repo_id=${REPO_ID}). All ${report.postgres.workspaceSourceBindingsByRevision.length ? report.postgres.workspaceSourceBindingsByRevision[0].count : 0} existing bindings are under a different revision (${report.postgres.workspaceSourceBindingsByRevision[0]?.workspace_revision ?? 'none found'}). Source-revision admission cannot be measured against Postgres truth until this is resolved -- this is a source-authority gap, not a Qdrant-only problem.`,
    });
  }

  const ready = o.duplicateCanonicalIds === 0
    && o.missingSourceRevision === 0
    && o.mixedWorkspaceRevision === 0
    && o.mixedRepresentationRevision === 0
    && report.postgres.admittedRevisionHasAnyBindings === true;
  report.status = ready ? 'SEMANTIC_CORPUS_ADMISSION_READY' : 'SEMANTIC_CORPUS_ADMISSION_BLOCKED';

  report.followUp = {
    code: 'QDRANT_LEGACY_PAYLOAD_BACKFILL_01',
    description: 'Patching workspace_revision/source_revision onto the legacy-written points in codebase_chunks_768 (via Qdrant setPayload, not re-embed) is a live-data mutation and is explicitly OUT OF SCOPE for this read-only measurement. Requires separate, explicit operator sign-off before execution -- same discipline as this repo\'s Drizzle Safety Rule for Postgres schema changes. See openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md\'s QDRANT-LEGACY-PAYLOAD-BACKFILL-01 entry.',
    mutationRequired: true,
    approvalRequired: true,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    ownerCandidateCount: o.candidateCount,
    ownerCanonicalIdCount: o.canonicalIdCount,
    ownerDuplicateCanonicalIds: o.duplicateCanonicalIds,
    ownerMissingSourceRevision: o.missingSourceRevision,
    ownerMixedWorkspaceRevision: o.mixedWorkspaceRevision,
    ownerMixedRepresentationRevision: o.mixedRepresentationRevision,
    admittedRevisionHasAnyBindings: report.postgres.admittedRevisionHasAnyBindings,
    blockerCount: report.blockers.length,
    reportPath: 'docs/reports/semantic-corpus-admission-v1.json',
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
  process.exit(1);
});
