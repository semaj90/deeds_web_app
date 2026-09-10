#!/usr/bin/env node

/**
 * OPENSPEC-ACTIVE-OWNER-CENSUS-01
 *
 * Read-only governance census. Uses `openspec status --all --json` as the
 * authoritative artifact-state source and classifies active changes into a
 * small set of owner portfolios. This script never generates tasks, archives
 * changes, edits specs, or mutates runtime/canonical stores.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const REPORT = path.resolve(ROOT, 'docs/reports/openspec-active-owner-census-v1.json');
const STATUS_CAPTURE = path.resolve(ROOT, 'docs/reports/openspec-active-status-v1.json');
const CHANGE_ROOT = path.resolve(ROOT, 'openspec/changes');

const PRIMARY_OWNERS = Object.freeze({
  SOURCE_WORKSPACE_LINEAGE: 'parent-atlas-retrieval-lineage-dag-convergence',
  RETRIEVAL_RRF: 'parent-atlas-retrieval-fusion-reachability',
  CANDIDATE_FEATURES_RANKING: 'parent-atlas-candidate-feature-execution-fabric',
  ONTOLOGY_NARY_FACTS: 'parent-atlas-ontology-kernel',
  GRAPH_SNAPSHOT_VALIDATION: 'parent-atlas-graph-validation-fabric',
  ACE_CONTEXT_RESIDENCY: 'parent-atlas-ace-rlm-bitfrost-integration',
  NEURAL_PREFILL: 'parent-atlas-neural-prefill-encoder',
  PASS_EXECUTION_GOVERNANCE: 'parent-atlas-pass-fabric',
  NATIVE_GPU_ABI: 'parent-atlas-native-acceleration-cabi',
  AGENTIC_EXECUTION: 'parent-atlas-agentic-repair-bundle-integration',
});

const COLLISION_CONCEPTS = [
  'workspaceRevision',
  'sourceRevision',
  'packetId',
  'packetKey',
  'CandidateOrdinalMapV1',
  'semantic_768',
  'representationRevision',
  'graphRevision',
  'GraphProjectionManifestV1',
  'HyperedgeV1',
  'OntologyLinkedTupleV1',
  'SearchRuntime',
  'RRF',
  'ContextManifestV2',
  'ACE',
  'BitFrost',
  'run identity',
  'pass identity',
  'projection admission',
];

function runStatusAll() {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const stdout = execFileSync(executable, ['openspec', 'status', '--all', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const parsed = JSON.parse(stdout);
  mkdirSync(path.dirname(STATUS_CAPTURE), { recursive: true });
  writeFileSync(STATUS_CAPTURE, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
}

function activeRows(statusPayload) {
  if (Array.isArray(statusPayload)) return statusPayload;
  for (const key of ['changes', 'items', 'results']) {
    if (Array.isArray(statusPayload?.[key])) return statusPayload[key];
  }
  throw new Error('OPENSPEC_STATUS_ALL_JSON_UNRECOGNIZED_SHAPE');
}

function changeName(row) {
  return String(row?.change ?? row?.name ?? row?.id ?? '').trim();
}

function artifactState(raw) {
  const text = String(raw ?? '').toUpperCase();
  if (['DONE', 'COMPLETE', 'COMPLETED'].includes(text)) return 'DONE';
  if (['READY', 'AVAILABLE'].includes(text)) return 'READY';
  if (['BLOCKED', 'WAITING'].includes(text)) return 'BLOCKED';
  if (['ABSENT', 'MISSING', 'NONE', ''].includes(text)) return 'ABSENT';
  return 'UNKNOWN';
}

function readArtifactStates(row) {
  const source = row?.artifacts ?? row?.artifactStatus ?? row?.artifact_status ?? {};
  const lookup = (name) => {
    const candidate = source?.[name]
      ?? source?.find?.((item) => String(item?.name ?? item?.artifact ?? '').toLowerCase() === name)?.status
      ?? row?.[name];
    return artifactState(typeof candidate === 'object' ? candidate?.status ?? candidate?.state : candidate);
  };
  return {
    proposal: lookup('proposal'),
    design: lookup('design'),
    specs: lookup('specs'),
    tasks: lookup('tasks'),
  };
}

function readTaskProgress(row) {
  const progress = row?.taskProgress ?? row?.task_progress ?? row?.tasksProgress ?? row?.progress ?? null;
  const completed = Number(progress?.completed ?? progress?.done ?? row?.completedTasks);
  const total = Number(progress?.total ?? row?.totalTasks);
  return Number.isInteger(completed) && Number.isInteger(total)
    ? { completed, total }
    : null;
}

function readChangeText(change) {
  const directory = path.resolve(CHANGE_ROOT, change);
  const candidates = [
    'proposal.md',
    'design.md',
    'tasks.md',
    path.join('specs', 'runtime-ownership-precall', 'spec.md'),
  ];
  let text = '';
  for (const relative of candidates) {
    const file = path.join(directory, relative);
    if (existsSync(file)) {
      try { text += `\n${readFileSync(file, 'utf8')}`; } catch {}
    }
  }
  // Bounded generic specs scan is intentionally omitted here. Unknown concepts
  // remain REVIEW_REQUIRED rather than pretending to have exhaustively read a
  // large nested spec tree.
  return text;
}

function portfolioFor(change) {
  for (const [portfolio, owner] of Object.entries(PRIMARY_OWNERS)) {
    if (change === owner) return portfolio;
  }
  const name = change.toLowerCase();
  if (/lineage|source|workspace|directory-ingestion/.test(name)) return 'SOURCE_WORKSPACE_LINEAGE';
  if (/retrieval|fusion|rrf|search/.test(name)) return 'RETRIEVAL_RRF';
  if (/candidate|ranking|best-fit|score/.test(name)) return 'CANDIDATE_FEATURES_RANKING';
  if (/ontology|hyperedge|kag|concept/.test(name)) return 'ONTOLOGY_NARY_FACTS';
  if (/graph-validation|graph-snapshot|graph-projection/.test(name)) return 'GRAPH_SNAPSHOT_VALIDATION';
  if (/ace|rlm|bitfrost|residency|memory/.test(name)) return 'ACE_CONTEXT_RESIDENCY';
  if (/neural|prefill|encoder/.test(name)) return 'NEURAL_PREFILL';
  if (/pass-fabric|governed-compute|adaptive-dag|runtime-ownership/.test(name)) return 'PASS_EXECUTION_GOVERNANCE';
  if (/native|gpu|cabi|abi|cuda|cuvs|cutile/.test(name)) return 'NATIVE_GPU_ABI';
  if (/agentic|repair-bundle/.test(name)) return 'AGENTIC_EXECUTION';
  return 'UNCLASSIFIED';
}

function definitions(text) {
  const lower = text.toLowerCase();
  return COLLISION_CONCEPTS.filter((concept) => lower.includes(concept.toLowerCase()));
}

function roleFor(change, portfolio, artifacts, taskProgress) {
  const owner = PRIMARY_OWNERS[portfolio];
  if (owner === change) return 'PRIMARY_OWNER';
  if (artifacts.tasks === 'READY') return 'RESEARCH_ONLY';
  if (artifacts.tasks === 'BLOCKED') return 'BLOCKED_DEPENDENT';
  if (artifacts.tasks === 'DONE' && taskProgress && taskProgress.total > 0 && taskProgress.completed === taskProgress.total) return 'EXECUTABLE_DEPENDENT';
  return 'RESEARCH_ONLY';
}

let payload;
let fatalError = null;
try { payload = runStatusAll(); }
catch (error) { fatalError = error instanceof Error ? error.message : String(error); payload = []; }

let rows = [];
try { rows = activeRows(payload); }
catch (error) { fatalError = fatalError ?? (error instanceof Error ? error.message : String(error)); }

const records = rows.map((row) => {
  const change = changeName(row);
  const artifacts = readArtifactStates(row);
  const taskProgress = readTaskProgress(row);
  const portfolio = portfolioFor(change);
  const primaryOwner = PRIMARY_OWNERS[portfolio] ?? null;
  const text = change ? readChangeText(change) : '';
  const defines = definitions(text);
  const role = roleFor(change, portfolio, artifacts, taskProgress);
  const ownershipDispositionRequired = artifacts.tasks === 'READY' || portfolio === 'UNCLASSIFIED';
  const mayDefineCanonicalAuthority = role === 'PRIMARY_OWNER';
  const mayExecuteNow = role === 'PRIMARY_OWNER'
    && artifacts.tasks === 'DONE'
    && Boolean(taskProgress && taskProgress.total > 0 && taskProgress.completed < taskProgress.total);
  const disposition = ownershipDispositionRequired
    ? 'REVIEW_REQUIRED'
    : role === 'PRIMARY_OWNER'
      ? 'KEEP_ACTIVE'
      : artifacts.tasks === 'DONE' && taskProgress?.total === taskProgress?.completed
        ? 'ARCHIVE_PREFLIGHT'
        : 'KEEP_BLOCKED';
  return {
    change,
    schema: String(row?.schema ?? row?.schemaName ?? 'unknown'),
    artifacts,
    taskProgress,
    portfolio,
    role,
    primaryOwner,
    defines,
    dependsOn: primaryOwner && primaryOwner !== change ? [primaryOwner] : [],
    blockedBy: ownershipDispositionRequired ? ['OWNERSHIP_DISPOSITION_REQUIRED'] : [],
    mayExecuteNow,
    mayDefineCanonicalAuthority,
    disposition,
    artifactState: artifacts.tasks === 'READY' ? 'TASKS_READY' : null,
    governanceState: ownershipDispositionRequired ? 'OWNERSHIP_DISPOSITION_REQUIRED' : null,
    implementationState: artifacts.tasks === 'READY' ? 'NOT_STARTED' : null,
  };
});

const collisions = COLLISION_CONCEPTS.map((concept) => {
  const claimants = records.filter((record) => record.defines.includes(concept)).map((record) => record.change);
  const primaryClaimants = records.filter((record) => record.defines.includes(concept) && record.role === 'PRIMARY_OWNER').map((record) => record.change);
  return { concept, claimants, primaryClaimants, ambiguousPrimaryOwnership: primaryClaimants.length > 1 };
});

const noTaskLike = records.filter((record) => record.artifacts.tasks === 'READY' || record.taskProgress?.total === 0);
const complete = records.filter((record) => record.taskProgress && record.taskProgress.total > 0 && record.taskProgress.completed === record.taskProgress.total);
const blockers = [];
if (fatalError) blockers.push('OPENSPEC_STATUS_ALL_CAPTURE_FAILED');
if (!fatalError && records.length === 0) blockers.push('OPENSPEC_ACTIVE_CHANGE_SET_EMPTY_OR_UNREADABLE');
if (collisions.some((item) => item.ambiguousPrimaryOwnership)) blockers.push('MULTIPLE_PRIMARY_OWNER_COLLISION');

const report = {
  schema: 'atlas.openspec-active-owner-census.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_GOVERNANCE_CENSUS',
  status: blockers.length ? 'OPENSPEC_ACTIVE_OWNER_CENSUS_BLOCKED' : 'OPENSPEC_ACTIVE_OWNER_CENSUS_READY_FOR_REVIEW',
  proofLevel: blockers.length ? 'BLOCKED' : 'PARTIAL_PROVEN',
  authority: false,
  canonicalAuthority: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  runtimeWritesPerformed: false,
  tasksGenerated: false,
  changesArchived: false,
  statusSourceCommand: 'npx openspec status --all --json',
  statusCapturePath: STATUS_CAPTURE,
  activeChangeCount: records.length,
  primaryOwners: PRIMARY_OWNERS,
  ownerInvariant: 'ONE_CANONICAL_CONCEPT_ONE_ACTIVE_AUTHORITY_OWNER',
  records,
  collisionCensus: collisions,
  summaries: {
    tasksReadyOrZeroTaskCount: noTaskLike.length,
    tasksReadyOrZeroTaskChanges: noTaskLike.map((record) => record.change),
    completeTaskSetCount: complete.length,
    completeTaskSetChanges: complete.map((record) => record.change),
    ownershipDispositionRequiredCount: records.filter((record) => record.governanceState === 'OWNERSHIP_DISPOSITION_REQUIRED').length,
    unclassifiedPortfolioCount: records.filter((record) => record.portfolio === 'UNCLASSIFIED').length,
  },
  fatalError,
  blockers,
  firstBlockingInvariant: blockers[0] ?? null,
  nextGate: blockers.length ? 'REPAIR_OPENSPEC_OWNER_CENSUS_INPUT' : 'OPENSPEC-OWNERSHIP-DISPOSITION-REVIEW-01',
  safeNextCommand: 'npx openspec status --all --json',
};

mkdirSync(path.dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  activeChangeCount: report.activeChangeCount,
  tasksReadyOrZeroTaskCount: report.summaries.tasksReadyOrZeroTaskCount,
  completeTaskSetCount: report.summaries.completeTaskSetCount,
  ownershipDispositionRequiredCount: report.summaries.ownershipDispositionRequiredCount,
  unclassifiedPortfolioCount: report.summaries.unclassifiedPortfolioCount,
  firstBlockingInvariant: report.firstBlockingInvariant,
  writesPerformed: false,
  reportPath: REPORT,
}, null, 2));

if (blockers.length) process.exitCode = 3;
