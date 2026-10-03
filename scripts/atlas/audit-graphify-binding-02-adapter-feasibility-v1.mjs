#!/usr/bin/env node
/**
 * GRAPHIFY-BINDING-02 -- read-only feasibility probe, NO writes.
 *
 * Question: can the EXISTING binding builders (buildWorkspaceRevisionRecordV1 /
 * buildWorkspaceSourceBindingsV1, sveltekit-frontend/src/lib/server/atlas/identity/
 * workspace-source-binding-v1.ts) construct a valid, schema-passing WorkspaceRevisionRecordV1 +
 * WorkspaceSourceBindingV1[] set from the ALREADY-ADMITTED workspace-source-snapshot manifest,
 * with the recomputed digest exactly matching the tournament-admitted workspaceRevision?
 *
 * If yes: no new adapter needed for identity/digest construction -- the missing piece is only a
 * thin wrapper that (a) loads the admitted snapshot instead of scanning the live worktree, and
 * (b) narrows to a target selectedSourceRefs set before calling the writer.
 * If no: recorded as a real finding, not papered over.
 *
 * Never calls writeGraphifySourceInventoryV2 / writeGraphifySourceInventoryInTransactionV2.
 * Never opens a Postgres connection. Never writes any file except the receipt below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(REPO_ROOT, 'docs/reports/graphify-binding-02-adapter-feasibility-v1.json');

const modPath = path.resolve(REPO_ROOT, 'sveltekit-frontend/src/lib/server/atlas/identity/workspace-source-binding-v1.ts');
const { buildWorkspaceRevisionRecordV1, buildWorkspaceSourceBindingsV1 } = await import(`file:///${modPath.replace(/\\/g, '/')}`);

const admission = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('NO_ADMITTED_WORKSPACE_REVISION');
}
const snapshot = JSON.parse(fs.readFileSync(path.resolve(admission.manifestPath), 'utf8'));

const report = {
  schema: 'atlas.graphify-binding-02-adapter-feasibility.v1',
  task: 'GRAPHIFY-BINDING-02',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_FEASIBILITY_PROBE',
  writesPerformed: false,
  admittedWorkspaceRevision: admission.workspaceRevision,
  snapshotRevision: snapshot.snapshotRevision,
  snapshotSourceCount: snapshot.sources.length,
  errors: [],
};

// ---- Step 1: map admitted snapshot sources -> WorkspaceSourceManifestEntryV1 candidates ----
let entries;
try {
  entries = snapshot.sources.map((s) => ({
    sourceRef: s.sourceRef,
    sourceRevision: s.sourceRevision,
    contentDigest: s.contentDigest,
    byteLength: s.byteLength,
    gitBlobOid: null,
  }));
  report.entriesMapped = entries.length;
} catch (error) {
  report.errors.push({ step: 'MAP_ENTRIES', message: error instanceof Error ? error.message : String(error) });
}

// ---- Step 2: build WorkspaceRevisionRecordV1 via the EXISTING owner, no reimplementation ----
let record = null;
if (entries) {
  const repo = snapshot.repositories.find((r) => r.relativePath === '') ?? snapshot.repositories[0];
  try {
    const built = buildWorkspaceRevisionRecordV1({
      repositoryId: 'repo:root',
      gitObjectFormat: 'sha1',
      baseCommitOid: repo.head,
      baseTreeOid: repo.trackedTree,
      gitHeadRef: repo.branch ?? null,
      dirty: repo.dirty,
      entries,
      generatedAt: report.generatedAt,
      producerRevision: 'GRAPHIFY-BINDING-02:v1',
    });
    record = built.record;
    entries = built.entries;
    report.recordBuilt = true;
    report.recomputedWorkspaceRevision = record.workspaceRevision;
    report.recomputedMatchesAdmitted = record.workspaceRevision === admission.workspaceRevision;
  } catch (error) {
    report.recordBuilt = false;
    report.errors.push({ step: 'BUILD_RECORD', message: error instanceof Error ? error.message : String(error) });
  }
}

// ---- Step 3: build WorkspaceSourceBindingV1[] via the EXISTING owner ----
let bindings = null;
if (record) {
  try {
    bindings = buildWorkspaceSourceBindingsV1({
      record,
      entries,
      trackedAtBaseCommit: new Map(),
      dirtyRelativeToBaseCommit: new Map(),
      producerRevision: 'GRAPHIFY-BINDING-02:v1',
    });
    report.bindingsBuilt = true;
    report.bindingsCount = bindings.length;
  } catch (error) {
    report.bindingsBuilt = false;
    report.errors.push({ step: 'BUILD_BINDINGS', message: error instanceof Error ? error.message : String(error) });
  }
}

report.sampleEntries = (entries ?? []).slice(0, 2);
report.sampleBindings = (bindings ?? []).slice(0, 2);
report.verdict = report.recomputedMatchesAdmitted && report.bindingsBuilt
  ? 'ADAPTER_FEASIBLE_NO_NEW_IDENTITY_LOGIC_NEEDED'
  : report.recordBuilt && !report.recomputedMatchesAdmitted
    ? 'DIGEST_MISMATCH_INVESTIGATE_BEFORE_PROCEEDING'
    : 'BLOCKED_SEE_ERRORS';

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ out: path.relative(REPO_ROOT, OUT), verdict: report.verdict, recomputedMatchesAdmitted: report.recomputedMatchesAdmitted, errors: report.errors }, null, 2));
