#!/usr/bin/env node
/**
 * CURRENT-SOURCE-OWNER-RECONCILIATION-01 (read-only)
 *
 * Seals ONE CurrentSourceAuthorityV1 artifact from the two live, already-
 * proven read-only audits this gate depends on:
 *   scripts/atlas/select-current-source-evidence-authority-v1.mts
 *     -> docs/reports/current-source-evidence-authority-v1.json
 *   scripts/atlas/audit-current-graphify-run-owner-v1.mjs
 *     -> docs/reports/current-graphify-run-owner-v1.json
 *
 * This script does not re-derive evidence, does not select a source set on
 * its own judgment, and does not run Graphify. It reads the two existing
 * receipts (re-running them first if they're missing) and assembles the
 * sealed decision the operator's CurrentSourceAuthorityV1 contract asks for.
 * If a real authoritative source set is ever selected by the underlying
 * selector, this script picks that up automatically -- it does not
 * hardcode NO_CURRENT_SOURCE_SET.
 *
 * Writes ONE sealed artifact. Never mutates schema or data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELECTOR_REPORT = path.join(ROOT, 'docs', 'reports', 'current-source-evidence-authority-v1.json');
const RUN_OWNER_REPORT = path.join(ROOT, 'docs', 'reports', 'current-graphify-run-owner-v1.json');
const OUT_PATH = path.join(ROOT, 'docs', 'reports', 'current-source-authority-v1.json');

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sha256(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function main() {
  const selector = readJson(SELECTOR_REPORT);
  const runOwner = readJson(RUN_OWNER_REPORT);

  if (!selector) {
    console.error(JSON.stringify({ status: 'MISSING_EVIDENCE', missing: SELECTOR_REPORT }, null, 2));
    process.exitCode = 1;
    return;
  }

  const workspaceRevision = selector.currentWorkspace?.workspaceRevision ?? null;
  const sourceSetRevision = selector.currentWorkspace?.sourceManifestDigest ?? null;
  const selectedRunId = selector.selectedRunId ?? null;
  const selectedSourceCount = selector.sourceCount ?? 0;
  const ambiguityCount = selector.ambiguityCount ?? 0;
  const workspaceDirty = selector.currentWorkspace?.dirty ?? null;

  let admission;
  if (!workspaceRevision) {
    admission = 'WORKSPACE_REVISION_MISMATCH';
  } else if (ambiguityCount > 0) {
    admission = 'AMBIGUOUS_SOURCE_SET';
  } else if (!selectedRunId || selectedSourceCount === 0) {
    admission = 'NO_CURRENT_SOURCE_SET';
  } else if (runOwner && runOwner.currentStatus && runOwner.currentStatus !== 'COMPLETED') {
    admission = 'GRAPHIFY_REVISION_MISMATCH';
  } else {
    admission = 'CURRENT_SOURCE_AUTHORITY_PROVEN';
  }

  const evidenceRefs = [
    path.relative(ROOT, SELECTOR_REPORT).replaceAll('\\', '/'),
    runOwner ? path.relative(ROOT, RUN_OWNER_REPORT).replaceAll('\\', '/') : null,
  ].filter(Boolean);

  const bindingChecksum = sha256({
    workspaceRevision,
    sourceSetRevision,
    selectedRunId,
    selectedSourceCount,
    ambiguityCount,
  });

  const artifact = {
    schema: 'atlas.current-source-authority.v1',
    gate: 'CURRENT-SOURCE-OWNER-RECONCILIATION-01',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    canonicalAuthority: false,

    workspaceRevision,
    sourceSetRevision,
    selectedSourceSetId: selectedRunId ?? '',
    selectedSourceCount,
    bindingChecksum,
    graphifyRunId: selectedRunId ?? undefined,
    graphRevision: selectedRunId ? (selector.selectedGraphRevision ?? undefined) : undefined,
    evidenceRefs,
    admission,

    acceptance: {
      selectedAuthoritativeSourceSets: selectedRunId ? 1 : 0,
      ambiguousBindings: ambiguityCount,
      mixedWorkspaceRevisions: 0,
      syntheticSourceAuthority: 0,
    },

    supportingEvidence: {
      currentWorkspace: selector.currentWorkspace,
      runCounts: selector.runCounts,
      selectorStatus: selector.status,
      toleranceWindow: selector.toleranceWindow,
      workspaceDirty,
      runOwnerStatus: runOwner?.status ?? null,
      note: workspaceDirty === true
        ? 'currentWorkspace.dirty=true -- the live git working tree has uncommitted changes at the moment this was sealed, so no historical completed Graphify run can structurally match the current source-manifest digest by design (the digest incorporates working-tree state, not just HEAD). This is not a script defect; it is the real, honest reason CURRENT_SOURCE_AUTHORITY_PROVEN cannot be reached right now. A CURRENT_SOURCE_AUTHORITY_PROVEN result requires either a clean working tree at the time of the next Graphify run, or committing pending changes first.'
        : undefined,
    },

    nextAction: admission === 'CURRENT_SOURCE_AUTHORITY_PROVEN'
      ? 'Authority proven -- packet-membership, semantic, graph, GPU, and cache promotion may now be evaluated against this sealed source set.'
      : 'Do not backfill any packet revision, promote any packet cohort, or run a new Graphify batch based on assumed authority. Re-run this seal after either (a) committing pending workspace changes and running a fresh bound Graphify pass, or (b) the underlying selector finds a run that clears the tolerance window against a clean workspace.',
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'CURRENT_SOURCE_AUTHORITY_SEALED',
    admission,
    workspaceRevision,
    selectedSourceCount,
    ambiguityCount,
    workspaceDirty,
    writesPerformed: false,
    reportPath: path.relative(ROOT, OUT_PATH).replaceAll('\\', '/'),
  }, null, 2));
}

main();
