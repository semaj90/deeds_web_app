#!/usr/bin/env node

/** Read-only static census. It recommends no ranking or fusion change. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_ROOT = resolve(ROOT, 'sveltekit-frontend/src');
const REPORT = resolve(ROOT, 'docs/reports/rrf-lane-weight-census-v1.json');
const patterns = /RRF_LANE_WEIGHTS|FUSION_WEIGHTS|RRF_WEIGHTS_BY_LANE_KIND|RRF_DEFAULT_WEIGHTS|laneConfig\.weight|weightsOrOptions|laneWeight|rrfK/i;
const executorPattern = /qdrant|cuvs|cagra|turbovec|turbo_vec/i;
const fusionPattern = /rrf|fusion|reciprocal/i;
const rerankPattern = /rerank|feature-envelope|gpu-reranker/i;
const routingPattern = /lane-registry|search-lanes|router|routing/i;
const extensions = new Set(['.ts', '.mts', '.js', '.mjs']);

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(file));
    else if (extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) result.push(file);
  }
  return result;
}
function classify(file, line) {
  if (executorPattern.test(line) || executorPattern.test(file)) return ['EXECUTOR_NAME_NOT_LANE', 'EXECUTOR_LOCAL_WEIGHT'];
  if (rerankPattern.test(file) || /feature|score/i.test(line) && !fusionPattern.test(line)) return ['RERANK_FEATURE_ONLY', 'RERANK_FEATURE'];
  if (routingPattern.test(file) || /route|prior|hotness/i.test(line)) return ['ROUTING_WEIGHT', 'ROUTING_PRIOR'];
  if (fusionPattern.test(file) || fusionPattern.test(line)) return ['LOGICAL_LANE', 'RRF_FUSION_WEIGHT'];
  return ['UNCLASSIFIED', 'UNKNOWN'];
}
function applicationStage(file, line) {
  if (rerankPattern.test(file)) return 'POST_FUSION_RERANK';
  if (routingPattern.test(file)) return 'LANE_ROUTING';
  if (fusionPattern.test(file) || /rrf/i.test(line)) return 'RRF_FUSION';
  return 'UNKNOWN';
}
function policyScope(line) {
  if (/identifier/i.test(line)) return 'IDENTIFIER_QUERY';
  if (/concept/i.test(line)) return 'CONCEPTUAL_QUERY';
  if (/error/i.test(line)) return 'ERROR_QUERY';
  return 'UNKNOWN';
}

const entries = [];
const sourceFiles = (await files(SOURCE_ROOT)).filter((file) => !file.endsWith('audit-rrf-lane-weight-census-v1.mjs'));
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!patterns.test(line)) return;
    const [classification, semanticClass] = classify(file, line);
    const numericWeights = [...line.matchAll(/(?:[A-Za-z][\w-]*|['"][^'"]+['"])\s*:\s*(-?\d+(?:\.\d+)?)/g)].map((match) => ({ rawLaneName: match[0].split(':')[0].trim().replace(/^['"]|['"]$/g, ''), numericWeight: Number(match[1]) }));
    entries.push({
      sourceId: `${relative(ROOT, file).replaceAll('\\', '/')}:${index + 1}`,
      file: relative(ROOT, file).replaceAll('\\', '/'), symbol: line.trim().slice(0, 160), consumers: [],
      entries: numericWeights.length ? numericWeights : [{ rawLaneName: 'UNPARSED', numericWeight: null }],
      classification, semanticClass, applicationStage: applicationStage(file, line), policyScope: policyScope(line),
      canonicalLogicalLaneId: classification === 'LOGICAL_LANE' ? (executorPattern.test(line) ? null : 'UNRESOLVED_RRF_LANE') : null,
    });
  });
}
const logicalLaneEntries = entries.filter((entry) => entry.classification === 'LOGICAL_LANE');
const executorAsLane = entries.filter((entry) => entry.classification === 'EXECUTOR_NAME_NOT_LANE');
const unclassified = entries.filter((entry) => entry.classification === 'UNCLASSIFIED');
const conflicts = [
  ...executorAsLane.map((entry) => ({ type: 'EXECUTOR_AS_LANE', refs: [entry.sourceId], evidence: entry.symbol })),
  ...unclassified.map((entry) => ({ type: 'UNMAPPABLE', refs: [entry.sourceId], evidence: entry.symbol })),
];
const report = {
  schema: 'atlas.rrf-lane-weight-census.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: unclassified.length || executorAsLane.length ? 'CENSUS_COMPLETE_MIGRATION_BLOCKED' : 'CENSUS_COMPLETE_MIGRATION_NOT_AUTHORIZED',
  authority: false, migrationAuthorized: false, writesPerformed: false, datastoreWritesPerformed: false,
  weightSources: entries, logicalLanes: [], conflicts,
  metrics: { sourceCount: entries.length, rawLaneNameCount: new Set(entries.flatMap((entry) => entry.entries.map((item) => item.rawLaneName))).size, canonicalLaneCount: logicalLaneEntries.length, unclassifiedCount: unclassified.length, executorAsLaneCount: executorAsLane.length, semanticConflictCount: conflicts.length },
  blockers: [...new Set(['MIGRATION_REQUIRES_EXPLICIT_LOGICAL_LANE_MAPPING', ...conflicts.map((conflict) => conflict.type), 'BASELINE_PARITY_REQUIRED_PER_CALLER'])],
  nextGate: 'RWC-CENSUS-02_CALLER_BASELINE_AND_EXPLICIT_LANE_MAPPING', safeNextCommand: 'npm run atlas:rrf:lane-weight:census',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, migrationAuthorized: false, sourceCount: report.metrics.sourceCount, unclassifiedCount: report.metrics.unclassifiedCount, executorAsLaneCount: report.metrics.executorAsLaneCount, reportPath: REPORT }, null, 2));
