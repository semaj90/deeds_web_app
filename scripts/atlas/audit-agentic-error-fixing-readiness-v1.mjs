#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const readJson = (relativePath) => JSON.parse(readFileSync(path.resolve(ROOT, relativePath), 'utf8'));
const readText = (relativePath) => readFileSync(path.resolve(ROOT, relativePath), 'utf8');
const options = parseArgs({ options: {
  'route-review': { type: 'string', default: '.tmp/review/qa-route-label-review-v1.json' },
  'shared-review': { type: 'string', default: '.tmp/review/qa-route-shared-family-source-review-v1.json' },
  'lookup-eval': { type: 'string', default: '.tmp/review/frozen-qa-symbol-qa-lexical-evaluation-v1.json' },
  'workspace-receipt': { type: 'string', default: '.tmp/review/current-workspace-frame-admission-v1.json' },
  output: { type: 'string', default: '.tmp/review/agentic-error-fixing-readiness-v1.json' },
} }).values;

function resolveScratch(relativePath) {
  const target = path.resolve(ROOT, relativePath);
  const scratch = path.resolve(ROOT, '.tmp/review');
  const rel = path.relative(scratch, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('OUTPUT_MUST_STAY_UNDER_TMP_REVIEW');
  return target;
}

function findTaskLine(file, token) {
  const lines = readText(file).split(/\r?\n/);
  const matches = lines.filter((entry) => entry.includes(token));
  const line = matches.find((entry) => /^\s*-\s*\[(?:x| )\]/i.test(entry)) ?? matches[0];
  if (!line) return { file, token, status: 'TASK_NOT_FOUND', sourceLine: null };
  const checked = /^\s*-\s*\[x\]/i.test(line);
  const open = /^\s*-\s*\[ \]/.test(line);
  return { file, token, status: checked ? 'CHECKED_CLAIM' : open ? 'OPEN_CLAIM' : 'UNCLASSIFIED_CLAIM', sourceLine: line.trim() };
}

function countRetrievalCallsites(symbol) {
  const base = path.resolve(ROOT, 'sveltekit-frontend/src/lib/server/retrieval');
  let matches = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(?:ts|js|mjs)$/.test(entry.name) && readFileSync(full, 'utf8').includes(symbol)) matches += 1;
    }
  };
  visit(base);
  return matches;
}

const routePath = options['route-review'];
const sharedPath = options['shared-review'];
const evalPath = options['lookup-eval'];
const workspacePath = options['workspace-receipt'];
const routeReview = readJson(routePath);
const sharedReview = readJson(sharedPath);
const lookup = readJson(evalPath);
const workspace = readJson(workspacePath);
const routeCounts = Object.fromEntries(['REVIEW_PROPOSED_LABEL', 'REVIEW_SHARED_FAMILY', 'UNMAPPED']
  .map((status) => [status, routeReview.routes.filter((row) => row.status === status).length]));
const sharedCounts = sharedReview.counts;

const bindingPath = 'simd-bridge/cpp/binding.cc';
const binding = readText(bindingPath);
const fallbackEnum = binding.match(/enum\s*:\s*uint8_t\s*\{[^}]*napi_float32_array[^}]*\}/)?.[0] ?? null;
const fallbackValues = Object.fromEntries([...(fallbackEnum ?? '').matchAll(/(napi_\w+_array)\s*=\s*(\d+)/g)]
  .map(([, name, value]) => [name, Number(value)]));
const expectedNodeApiValues = {
  napi_uint8_array: 1,
  napi_int32_array: 5,
  napi_uint32_array: 6,
  napi_float32_array: 7,
};
const fallbackMismatches = Object.fromEntries(Object.entries(expectedNodeApiValues)
  .filter(([name, expected]) => fallbackValues[name] !== expected)
  .map(([name, expected]) => [name, { observed: fallbackValues[name] ?? null, expected }]));
const sourceInventory = {
  bindingSha256: sha(readFileSync(path.resolve(ROOT, bindingPath))),
  bindingHasUint8MaskInput: /lut_type\s*!=\s*napi_uint8_array/.test(binding),
  bindingHasUint32MaskOutput: /napi_create_typedarray\(env,\s*napi_uint32_array/.test(binding),
  gatherRequiresInt32CandidateIndices: /cand_ta_type\s*!=\s*napi_int32_array/.test(binding),
  gatherAllocatesFullCandidateEmbeddings: /candidate_count\)\s*\*\s*static_cast<size_t>\(dim\)\s*\*\s*sizeof\(float\)/.test(binding),
  fallbackEnumValues: fallbackValues,
  fallbackEnumMismatches: fallbackMismatches,
  maskKernelCallsitesInServerRetrieval: countRetrievalCallsites('matchNesLutMask'),
};
const labelsSource = readText('sveltekit-frontend/scripts/qa/error-fingerprint.mjs');
const labelBlock = labelsSource.match(/export const DESIGN_FEATURE_LABELS\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1] ?? '';
const designFeatureLabelCount = [...labelBlock.matchAll(/^\s*'[^']+'\s*:\s*\{\s*registryKey:/gm)].length;

const tasks = [
  findTaskLine('openspec/changes/e2e-error-intelligence-kanban/tasks.md', 'FEATURE-LABEL-MAP-01'),
  findTaskLine('openspec/changes/e2e-error-intelligence-kanban/tasks.md', 'QA-FULLSWEEP-01'),
  findTaskLine('openspec/changes/e2e-error-intelligence-kanban/tasks.md', 'SERVER-LOG-LINK-01'),
  findTaskLine('openspec/changes/parent-atlas-native-acceleration-cabi/tasks.md', 'P2.4 Add `batchCosineTopK`'),
  findTaskLine('openspec/changes/parent-atlas-native-acceleration-cabi/tasks.md', 'P2.5 Refactor `simd-bridge/cpp`'),
  ...['01','02','03','04','05','06'].map((suffix) => findTaskLine(
    'openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md', `CANDIDATE-TILE-${suffix}`)),
  findTaskLine('openspec/changes/parent-atlas-agentic-repair-bundle-integration/tasks.md', 'RF6 canonical RRF ownership decision'),
];

const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const report = {
  schema: 'atlas.agentic-error-fixing-readiness-audit.v1',
  status: 'PROPOSAL_ONLY',
  generatedAt: new Date().toISOString(),
  gitHead,
  scope: 'feature-label route review → offline lexical/dense candidate ranking → OpenSpec-linked repair proposal → verified source readback',
  readinessEstimate: {
    score: 32,
    outOf: 100,
    method: 'Explicit weighted gate estimate; not a calibrated production score.',
    gates: [
      { gate: 'route-label coverage and QA', weight: 20, points: 8, evidence: `${routeCounts.REVIEW_PROPOSED_LABEL} proposed, ${routeCounts.REVIEW_SHARED_FAMILY} shared-family review, ${routeCounts.UNMAPPED} unmapped across ${routeReview.routes.length} routes; eight route cohort is fixture-covered.` },
      { gate: 'offline lexical retrieval', weight: 20, points: 14, evidence: `exact ${lookup.byQueryKind.EXACT.exact.hitsAt1}/${lookup.byQueryKind.EXACT.exact.positiveQueries} at rank 1; QA-enriched prose ${lookup.byQueryKind.PROSE.exactThenQaLexical.hitsAt3}/${lookup.byQueryKind.PROSE.exactThenQaLexical.positiveQueries} in top 3; negative hits ${lookup.byQueryKind.NEGATIVE.exactThenQaLexical.negativeQueriesWithHits}/${lookup.cases.filter((row) => row.kind === 'NEGATIVE').length}. Small development set, not held out.` },
      { gate: 'qualified dense retrieval and hybrid evaluation', weight: 15, points: 0, evidence: 'No dense comparison on this frozen symbol corpus; no reviewed held-out relevance set.' },
      { gate: 'OpenSpec task binding and repair replay', weight: 15, points: 6, evidence: 'Workboard carries the exact QA-FULLSWEEP-01 reference; route-level task binding and independent patch tournament are not proven.' },
      { gate: 'native acceleration integration', weight: 10, points: 4, evidence: 'P2.4 batchCosineTopK has a four-vector fixture proof; candidate-mask path is not wired to retrieval and workload-scale performance is not proven.' },
      { gate: 'current source authority, PG18 readback, ACE handoff', weight: 20, points: 0, evidence: `Workspace receipt status is ${workspace.status}; current match counts are ${workspace.currentWorkspaceMatches ?? 'unknown'}. Live verified ACE handoff remains unproven.` },
    ],
  },
  gan: {
    created: ['route-label review artifact', 'shared-family source review artifact', 'bounded lexical evaluation receipt', 'this readiness audit helper'],
    wired: false,
    unitProven: 'QA fixture evidence is present in the supplied local receipt; this helper does not rerun Vitest.',
    liveProven: false,
    done: false,
  },
  routeReview: { artifact: routePath, sha256: sha(readFileSync(path.resolve(ROOT, routePath))), routeCount: routeReview.routes.length, counts: routeCounts, sharedFamilyArtifact: sharedPath, sharedFamilySha256: sha(readFileSync(path.resolve(ROOT, sharedPath))), sharedFamilyHints: sharedCounts, humanDecisions: routeReview.routes.filter((row) => row.reviewerDecision !== null).length },
  featureLabels: { count: designFeatureLabelCount, source: 'sveltekit-frontend/scripts/qa/error-fingerprint.mjs', openSpecClaim: 'FEATURE-LABEL-MAP-01 currently says 9 design labels; reconcile the ledger wording with the 17-label source before treating the mapping task as current.' },
  retrieval: { artifact: evalPath, sha256: sha(readFileSync(path.resolve(ROOT, evalPath))), exactHitsAt1: lookup.byQueryKind.EXACT.exact.hitsAt1, exactQueryCount: lookup.byQueryKind.EXACT.exact.positiveQueries, proseTop3: lookup.byQueryKind.PROSE.exactThenQaLexical.hitsAt3, proseQueryCount: lookup.byQueryKind.PROSE.exactThenQaLexical.positiveQueries, negativeHits: lookup.byQueryKind.NEGATIVE.exactThenQaLexical.negativeQueriesWithHits, negativeQueryCount: lookup.cases.filter((row) => row.kind === 'NEGATIVE').length, denseLaneEvaluated: false, heldOut: false },
  nativeBridge: sourceInventory,
  workspace: { artifact: workspacePath, sha256: sha(readFileSync(path.resolve(ROOT, workspacePath))), status: workspace.status, currentMatches: workspace.currentWorkspaceMatches ?? null, currentMismatches: workspace.workspaceMismatches ?? null },
  openspecTasks: tasks,
  blockers: [
    'Review proposed/shared route labels and decide the case-management, Kanban, and operational-health vocabulary gaps.',
    'Create a separately reviewed held-out query set before changing lexical terms or setting a dense score floor.',
    'Resolve the current-workspace authority readback and one exact PostgreSQL source/chunk citation.',
    'Keep the active binding.cc worktree diff intact; reconcile its fallback enum with the official Node-API enum before rebuilding.',
    'Define a packed candidate-mask Top-K contract and CPU oracle before connecting the mask kernel to retrieval.',
    'Do not add caller-owned output buffers or quantized embeddings until ownership, alignment, dtype, scale, aliasing, and parity contracts are specified.',
  ],
  commandsObserved: [
    { command: 'node scripts/atlas/plan-all-routes-qa-features-v1.mjs --workboard-snapshot .tmp/review/feature-label-workboard-readiness-v1.json', observed: `PROPOSAL_ONLY; ${routeReview.routes.length} route handlers; 150 proposed, 108 shared-family, 659 unmapped; exact QA-FULLSWEEP-01 reference is proposal-only and dispatch revalidation is required.` },
    { command: 'Read existing QA lexical evaluation receipt', observed: `exact 10/10 at rank 1; QA-enriched prose 9/10 top 3; guarded negative hits 0/5; not held out.` },
    { command: 'Read existing current workspace admission receipt', observed: `${workspace.status}; current matches and mismatches unknown.` },
  ],
  sideEffects: { postgresWrites: 0, qdrantWrites: 0, valkeyWrites: 0, modelCalls: 0, serviceRestarts: 0, productionRouteChanges: 0 },
  canonicalAuthority: false,
  writesPerformed: false,
  safeNextCommand: 'node scripts/atlas/audit-agentic-error-fixing-readiness-v1.mjs --output .tmp/review/agentic-error-fixing-readiness-v1.json',
  smokeCommand: 'node --check scripts/atlas/audit-agentic-error-fixing-readiness-v1.mjs',
  reportPath: '.tmp/review/agentic-error-fixing-readiness-v1.json',
};

const output = resolveScratch(options.output);
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, readinessScore: report.readinessEstimate.score, routeCount: report.routeReview.routeCount, openTasks: tasks.filter((task) => task.status === 'OPEN_CLAIM').length, reportPath: path.relative(ROOT, output), writesPerformed: false }, null, 2)}\n`);
