#!/usr/bin/env node

/**
 * RWC-CENSUS-02: static caller baseline and explicit logical-lane mapping.
 * Read-only by construction: source text is inspected and a report is emitted.
 * It does not import retrieval code or execute ranking.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_ROOT = resolve(ROOT, 'sveltekit-frontend/src');
const REPORT = resolve(ROOT, 'docs/reports/rrf-caller-baseline-v1.json');
const extensions = new Set(['.ts', '.mts', '.js', '.mjs']);
const fusionCall = /(?:reciprocalRankFusion|combineViaRRF|fuseLanesViaRrf|fuseSearchRuntimeCandidates|combineRRFLanes|rrfFuse|computeRRFScore|laneContribution)\s*\(/i;
const weightReference = /RRF_LANE_WEIGHTS|FUSION_WEIGHTS|RRF_WEIGHTS_BY_LANE_KIND|RRF_DEFAULT_WEIGHTS|laneConfig\.weight|laneWeight|weightsOrOptions/i;
const logicalLane = /\b(dense|semantic|lexical|sparse|ast|structural|graph|ontology|external|cache|bm25|trigram)\b/i;
const executor = /qdrant|cuvs|cagra|turbovec|turbo_vec|postgres|neo4j|cugraph/i;

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) result.push(file);
  }
  return result;
}

function rel(file) {
  return relative(ROOT, file).replaceAll('\\', '/');
}

function inferMapping(line, file) {
  const value = `${file} ${line}`.toLowerCase();
  if (executor.test(value) && !logicalLane.test(value)) return { status: 'REJECTED_EXECUTOR_AS_LANE', logicalLaneId: null };
  const matches = ['dense', 'semantic', 'lexical', 'sparse', 'ast', 'structural', 'graph', 'ontology', 'external', 'cache', 'bm25', 'trigram']
    .filter((name) => new RegExp(`\\b${name}\\b`, 'i').test(value));
  if (matches.length === 1) return { status: 'EXPLICIT_CANDIDATE', logicalLaneId: matches[0] };
  if (matches.length > 1) return { status: 'AMBIGUOUS_MULTI_LANE', logicalLaneId: null };
  return { status: 'UNMAPPED', logicalLaneId: null };
}

const files = await walk(SOURCE_ROOT);
const callers = [];
for (const file of files) {
  if (/\.(spec|test)\.[cm]?[jt]s$/i.test(file)) continue;
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (/^(export\s+)?(async\s+)?function\s+\w*(rrf|fusion|lane)/i.test(trimmed)) return;
    if (!fusionCall.test(line) && !weightReference.test(line)) return;
    const mapping = inferMapping(line, rel(file));
    callers.push({
      callerId: `${rel(file)}:${index + 1}`,
      file: rel(file),
      line: index + 1,
      operation: fusionCall.test(line) ? 'FUSION_CALL' : 'WEIGHT_REFERENCE',
      excerpt: trimmed.slice(0, 220),
      mapping,
      baseline: { captured: false, replayStatus: 'NOT_RUN', outputChecksum: null },
      runtimeMutation: false,
    });
  });
}

const unmapped = callers.filter((caller) => caller.mapping.status === 'UNMAPPED');
const ambiguous = callers.filter((caller) => caller.mapping.status === 'AMBIGUOUS_MULTI_LANE');
const rejectedExecutors = callers.filter((caller) => caller.mapping.status === 'REJECTED_EXECUTOR_AS_LANE');
const fusionCallers = callers.filter((caller) => caller.operation === 'FUSION_CALL');
const report = {
  schema: 'atlas.rrf-caller-baseline.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status: unmapped.length || ambiguous.length || rejectedExecutors.length ? 'CALLER_BASELINE_INCOMPLETE_MIGRATION_BLOCKED' : 'CALLER_BASELINE_MISSING_REPLAY_MIGRATION_BLOCKED',
  authority: false,
  migrationAuthorized: false,
  writesPerformed: false,
  workspaceRevision: null,
  canonicalFusionOwner: 'SearchRuntime',
  callers,
  metrics: {
    callerCount: callers.length,
    fusionCallerCount: fusionCallers.length,
    unmappedCount: unmapped.length,
    ambiguousMappingCount: ambiguous.length,
    executorAsLaneCount: rejectedExecutors.length,
    baselineReplayCount: callers.filter((caller) => caller.baseline.captured).length,
  },
  blockers: [...new Set([
    ...(unmapped.length ? ['UNMAPPED_LOGICAL_LANE'] : []),
    ...(ambiguous.length ? ['AMBIGUOUS_LOGICAL_LANE_MAPPING'] : []),
    ...(rejectedExecutors.length ? ['EXECUTOR_AS_LANE'] : []),
    'CALLER_BASELINE_REPLAY_REQUIRED',
    'RUNTIME_CONSOLIDATION_NOT_AUTHORIZED',
  ])],
  nextGate: 'RWC-CENSUS-03_BOUNDED_CALLER_REPLAY',
  safeNextCommand: 'npm run atlas:rrf:caller-baseline',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  migrationAuthorized: report.migrationAuthorized,
  callerCount: report.metrics.callerCount,
  fusionCallerCount: report.metrics.fusionCallerCount,
  unmappedCount: report.metrics.unmappedCount,
  ambiguousMappingCount: report.metrics.ambiguousMappingCount,
  executorAsLaneCount: report.metrics.executorAsLaneCount,
  reportPath: REPORT,
}, null, 2));
