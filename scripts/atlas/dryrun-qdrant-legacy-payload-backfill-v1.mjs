#!/usr/bin/env node
/**
 * QDRANT-LEGACY-PAYLOAD-BACKFILL-01 dry-run measurement.
 *
 * Computes exactly what a workspace_revision/source_revision setPayload
 * backfill onto the legacy-written points in codebase_chunks_768 WOULD do,
 * without doing it. No Qdrant setPayload/upsert/delete calls anywhere in
 * this file.
 *
 * Critical finding this script surfaces rather than papers over: per
 * docs/reports/semantic-corpus-admission-v1.json, the "admitted" workspace
 * revision (ADMITTED_WORKSPACE_REVISION below) has ZERO rows in
 * atlas_workspace_source_bindings. The only revision with any Postgres
 * bindings at all is a DIFFERENT one. That means assigning the admitted
 * revision to the legacy points -- the only assignment strategy anyone has
 * proposed so far -- would write a workspace_revision value with no
 * corresponding Postgres source binding. This script computes the patch
 * under that assumption anyway (so the shape/size of the write is visible),
 * but flags it as BLOCKED_ON_UNGROUNDED_REVISION rather than presenting it
 * as ready to execute.
 *
 * See openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md's
 * QDRANT-LEGACY-PAYLOAD-BACKFILL-01 entry.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'docs/reports/qdrant-legacy-payload-backfill-dryrun-v1.json');
const env = loadRepoEnv(process.env);
const QDRANT_URL = (env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');

const ADMITTED_WORKSPACE_REVISION = 'sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf';
const OWNER_COLLECTION = 'codebase_chunks_768';
const SHA256_RE = /^sha256:[a-f0-9]{64}$/i;
const SCROLL_PAGE_SIZE = 1000;
const REPO_ID = 'deeds-web-app';

function resolveCanonicalId(payload) {
  if (payload.canonical_id) return { id: String(payload.canonical_id), field: 'canonical_id' };
  if (payload.canonical_source_ref) return { id: String(payload.canonical_source_ref), field: 'canonical_source_ref' };
  if (payload.source_ref_key) return { id: String(payload.source_ref_key), field: 'source_ref_key' };
  if (payload.packet_key) return { id: String(payload.packet_key), field: 'packet_key' };
  if (payload.source_ref) return { id: String(payload.source_ref), field: 'source_ref' };
  return { id: null, field: null };
}

function hasValidWorkspaceRevision(payload) {
  const raw = payload.workspace_revision ?? payload.workspaceRevision;
  return typeof raw === 'string' && SHA256_RE.test(raw);
}

async function scrollCollection(name) {
  const points = [];
  let offset = null;
  for (;;) {
    const body = { limit: SCROLL_PAGE_SIZE, with_payload: true, with_vector: false };
    if (offset !== null) body.offset = offset;
    const res = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(name)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) break;
    const json = await res.json();
    const batch = json?.result?.points ?? [];
    for (const point of batch) points.push({ id: point.id, payload: point.payload ?? {} });
    offset = json?.result?.next_page_offset ?? null;
    if (!offset || batch.length === 0) break;
  }
  return points;
}

async function main() {
  const report = {
    schema: 'atlas.qdrant-legacy-payload-backfill-dryrun.v1',
    generatedAt: new Date().toISOString(),
    mode: 'DRY_RUN_NO_MUTATION',
    admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    ownerCollection: OWNER_COLLECTION,
    readOnlyInvariants: { writesPerformed: false, qdrantModified: false, postgresModified: false },
  };

  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 30000 });
  let admittedRevisionBindingCount = 0;
  try {
    const r = await pool.query(
      'SELECT count(*)::int AS count FROM atlas_workspace_source_bindings WHERE repo_id = $1 AND workspace_revision = $2',
      [REPO_ID, ADMITTED_WORKSPACE_REVISION],
    );
    admittedRevisionBindingCount = r.rows[0].count;
  } finally {
    await pool.end();
  }

  const points = await scrollCollection(OWNER_COLLECTION);
  let alreadyValid = 0;
  let wouldBePatched = 0;
  let unresolvableCanonicalId = 0;
  const canonicalIdFieldBreakdown = {};
  const samplePatchPreview = [];

  for (const point of points) {
    if (hasValidWorkspaceRevision(point.payload)) {
      alreadyValid += 1;
      continue;
    }
    const { id: canonicalId, field } = resolveCanonicalId(point.payload);
    if (canonicalId === null) {
      unresolvableCanonicalId += 1;
      continue;
    }
    canonicalIdFieldBreakdown[field] = (canonicalIdFieldBreakdown[field] ?? 0) + 1;
    wouldBePatched += 1;
    if (samplePatchPreview.length < 10) {
      samplePatchPreview.push({
        pointId: point.id,
        canonicalId,
        resolvedVia: field,
        currentWorkspaceRevision: point.payload.workspace_revision ?? point.payload.workspaceRevision ?? null,
        wouldSetWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
      });
    }
  }

  report.pointsScanned = points.length;
  report.alreadyValidWorkspaceRevision = alreadyValid;
  report.wouldBePatched = wouldBePatched;
  report.unresolvableCanonicalId = unresolvableCanonicalId;
  report.canonicalIdFieldBreakdown = canonicalIdFieldBreakdown;
  report.samplePatchPreview = samplePatchPreview;
  report.postgresBindingCheck = {
    admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    admittedRevisionBindingCount,
    grounded: admittedRevisionBindingCount > 0,
  };

  if (admittedRevisionBindingCount === 0) {
    report.status = 'BLOCKED_ON_UNGROUNDED_REVISION';
    report.explanation = `The patch shown above is computed for visibility only. It assigns workspace_revision=${ADMITTED_WORKSPACE_REVISION} to ${wouldBePatched} points, but that revision has ZERO rows in atlas_workspace_source_bindings for repo_id=${REPO_ID} -- there is no Postgres-side source binding to justify writing this value onto these points. Executing this patch as-is would write false provenance, not just stale-but-honest metadata. Do not execute until either (a) Graphify is run end-to-end and produces real bindings for this revision (P0 in next_steps/active/2026-09-12_promotion-board-real-work.md), or (b) a different, actually-bound revision is chosen as the assignment target and re-justified.`;
  } else {
    report.status = 'DRY_RUN_COMPUTED_READY_FOR_REVIEW';
    report.explanation = `${wouldBePatched} points would be patched with workspace_revision=${ADMITTED_WORKSPACE_REVISION}, which has ${admittedRevisionBindingCount} Postgres source bindings. Still requires explicit operator sign-off before any live setPayload call.`;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    pointsScanned: report.pointsScanned,
    alreadyValidWorkspaceRevision: report.alreadyValidWorkspaceRevision,
    wouldBePatched: report.wouldBePatched,
    unresolvableCanonicalId: report.unresolvableCanonicalId,
    admittedRevisionBindingCount,
    reportPath: 'docs/reports/qdrant-legacy-payload-backfill-dryrun-v1.json',
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
  process.exit(1);
});
