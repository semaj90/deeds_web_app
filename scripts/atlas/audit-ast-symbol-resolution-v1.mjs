#!/usr/bin/env node

/**
 * Bounded AST-SYMBOL-03 census over the current planner, structural resolver,
 * and registry-resolution inputs. This is an aggregation/proof audit, not a
 * second resolver. It never performs canonical writes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertResourceHeadroom } from './lib/resource-headroom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assertResourceHeadroom(root, {
  ...process.env,
  ATLAS_MIN_FREE_DISK_BYTES: String(1 * 1024 ** 3),
  ATLAS_MIN_FREE_MEMORY_BYTES: String(512 * 1024 ** 2),
});

const planPath = path.resolve(root, '.tmp/atlas/current-tree-bound-symbol-registry-input-v1.ndjson');
const planReportPath = path.resolve(root, 'docs/reports/current-tree-bound-symbol-registry-input-v1.json');
const structuralPath = path.resolve(root, '.tmp/atlas/current-structural-symbol-resolution-v1.ndjson');
const structuralReportPath = path.resolve(root, 'docs/reports/current-structural-symbol-resolution-v1.json');
const registryPath = path.resolve(root, '.tmp/atlas/tree-bound-symbol-registry-resolution-v2.ndjson');
const registryReportPath = path.resolve(root, 'docs/reports/tree-bound-symbol-registry-resolution-v2.json');
const outputPath = path.resolve(root, 'docs/reports/ast-symbol-resolution-v1.json');

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const readJsonl = async (filePath) => (await fs.readFile(filePath, 'utf8'))
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const sha256File = async (filePath) => `sha256:${crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')}`;
const rel = (filePath) => path.relative(root, filePath).replaceAll('\\', '/');
const countBy = (rows, key) => rows.reduce((out, row) => {
  const value = String(row[key] ?? 'UNKNOWN');
  out[value] = (out[value] ?? 0) + 1;
  return out;
}, {});

const [plan, planReport, structural, structuralReport, registry, registryReport] = await Promise.all([
  readJsonl(planPath),
  readJson(planReportPath),
  readJsonl(structuralPath),
  readJson(structuralReportPath),
  readJsonl(registryPath).catch(() => []),
  readJson(registryReportPath).catch(() => null),
]);

const structuralById = new Map(structural.map((row) => [row.nominationId, row]));
const registryById = new Map(registry.map((row) => [row.nominationId, row]));
const counts = {
  inputDeclarations: plan.length,
  exact: 0,
  registryMissing: 0,
  ambiguous: 0,
  revisionMismatch: 0,
  pathMismatch: 0,
  parentMismatch: 0,
  signatureMismatch: 0,
  spanMismatch: 0,
  unresolved: 0,
};

for (const candidate of plan) {
  const structuralRow = structuralById.get(candidate.nominationId);
  const registryRow = registryById.get(candidate.nominationId);
  const structuralExact = String(structuralRow?.resolution ?? '').startsWith('EXACT');
  const registryExact = registryRow?.registryResolution === 'EXACT_CANONICAL_KEY';
  const versionExact = registryRow?.symbolVersionResolution === 'EXACT';
  if (structuralExact && registryExact && versionExact) {
    counts.exact += 1;
  }
  if (structuralRow?.workspaceRevisionMatch === false || structuralRow?.resolution === 'SOURCE_REVISION_MISMATCH') {
    counts.revisionMismatch += 1;
  }
  if (structuralRow?.resolution === 'NO_AST_MATCH' || structuralRow?.resolution === 'SOURCE_ONLY') {
    counts.pathMismatch += 1;
  }
  if (structuralRow?.resolution === 'AMBIGUOUS_AST_MATCH' || registryRow?.registryResolution === 'REGISTRY_AMBIGUOUS' || registryRow?.symbolVersionResolution === 'AMBIGUOUS') {
    counts.ambiguous += 1;
  }
  if (registryRow?.registryResolution === 'REGISTRY_MISSING' || !registryRow) {
    counts.registryMissing += 1;
  }
  if (!(structuralExact && registryExact && versionExact)) counts.unresolved += 1;
}

const planChecksum = planReport.planChecksum ?? null;
const planWorkspaceRevisions = [...new Set(plan.map((row) => String(row.workspaceRevision ?? '')))].filter(Boolean);
const planReportWorkspaceRevisionParity = planWorkspaceRevisions.length === 1
  && planWorkspaceRevisions[0] === planReport.currentWorkspaceRevision;
const structuralFreshForPlan = structuralReport.counts?.nominations === plan.length
  && structuralReport.expectedWorkspaceRevision === planWorkspaceRevisions[0]
  && planReportWorkspaceRevisionParity;
const registryPlanParity = registryReport?.inputRowCount === plan.length
  && registryReport?.inputPlanChecksum === planChecksum
  && registry.length === plan.length;
const registryFreshForStructural = registryPlanParity
  && registryReport?.structuralResolutionChecksum === structuralReport.resolutionChecksum
  && registryReport?.workspaceRevision === structuralReport.expectedWorkspaceRevision;
const cohortAligned = structuralFreshForPlan && registryFreshForStructural;
const resolutionAttempted = cohortAligned;
const status = structuralFreshForPlan && registryFreshForStructural && counts.exact === plan.length
  ? 'READ_ONLY_PROVEN_EXACT'
  : 'READ_ONLY_BLOCKED';

const report = {
  schema: 'atlas.ast-symbol-resolution.v1',
  gate: 'AST-SYMBOL-03',
  status,
  ownerScripts: [
    'scripts/atlas/prove-current-structural-symbol-resolution-v1.mjs',
    'scripts/atlas/prove-tree-bound-symbol-registry-resolution-v1.mjs',
    'scripts/atlas/plan-current-tree-bound-symbol-registry-input-v1.mjs',
  ],
  inputs: {
    plan: { path: rel(planPath), checksum: await sha256File(planPath), rowCount: plan.length, planChecksum },
    structural: { path: rel(structuralPath), checksum: await sha256File(structuralPath), rowCount: structural.length, reportChecksum: structuralReport.resolutionChecksum ?? null },
    registry: { path: rel(registryPath), checksum: registry.length ? await sha256File(registryPath) : null, rowCount: registry.length, reportInputPlanChecksum: registryReport?.inputPlanChecksum ?? null },
  },
  workspaceRevision: planWorkspaceRevisions.length === 1 ? planWorkspaceRevisions[0] : null,
  sourceRevisionPolicy: 'EXACT_SOURCE_AND_WORKSPACE_REVISION_REQUIRED',
  counts,
  resolutionRate: plan.length ? counts.exact / plan.length : 0,
  resolutionAttempted,
  classificationNote: resolutionAttempted
    ? 'Counts are comparable because plan, structural, and registry artifacts share one cohort envelope.'
    : 'Counts are diagnostic only because the plan, structural, and registry artifacts are not cohort-aligned; do not interpret pathMismatch or registryMissing as canonical resolution failures.',
  registryCountsStatus: registryFreshForStructural ? 'CURRENT' : 'STALE_NOT_PROMOTABLE',
  byLanguage: countBy(plan, 'language'),
  byNodeKind: countBy(plan, 'kind'),
  bySourceRevision: countBy(plan, 'sourceRevision'),
  freshness: {
    cohortAligned,
    resolutionAttempted,
    structuralFreshForPlan,
    registryFreshForStructural,
    registryPlanParity,
    planReportWorkspaceRevisionParity,
    planWorkspaceRevisions,
    structuralExpectedWorkspaceRevision: structuralReport.expectedWorkspaceRevision ?? null,
    registryInputPlanChecksum: registryReport?.inputPlanChecksum ?? null,
    registryStructuralInputChecksum: registryReport?.structuralResolutionChecksum ?? null,
    registryWorkspaceRevision: registryReport?.workspaceRevision ?? null,
  },
  canonicalAuthority: false,
  canonicalWrites: 0,
  databaseWrites: 0,
  promotionAuthorized: false,
  readOnly: true,
  nextGate: !structuralFreshForPlan
    ? 'REGENERATE_STRUCTURAL_INPUT_FROM_ADMITTED_WORKSPACE_OWNER'
    : !registryFreshForStructural
      ? 'REPLAY_REGISTRY_RESOLUTION_FROM_CURRENT_STRUCTURAL_INPUT'
      : 'AST_SYMBOL_EXACT_RESOLUTION_PROVEN',
};

const tempPath = `${outputPath}.tmp-${process.pid}`;
await fs.writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.rename(tempPath, outputPath);
console.log(JSON.stringify(report, null, 2));
