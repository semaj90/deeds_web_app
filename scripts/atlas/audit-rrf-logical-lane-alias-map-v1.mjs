#!/usr/bin/env node

/** Read-only comparison of the existing lane vocabularies and alias contract. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ALIASES = resolve(ROOT, 'sveltekit-frontend/src/lib/server/retrieval/retrieval-lane-aliases.ts');
const CONTRACT = resolve(ROOT, 'sveltekit-frontend/src/lib/server/retrieval/rrf-contract.ts');
const RUNTIME = resolve(ROOT, 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts');
const REPORT = resolve(ROOT, 'docs/reports/rrf-logical-lane-alias-map-v1.json');
const text = `${await readFile(ALIASES, 'utf8')}\n${await readFile(CONTRACT, 'utf8')}\n${await readFile(RUNTIME, 'utf8')}`;
const vocabulary = ['dense', 'dense_384', 'dense_768', 'bm25', 'postgres_trigram', 'lexical', 'bm42', 'rg', 'exact', 'ast', 'schema', 'topology', 'authority', 'dispatcher', 'turbovec'];
const rawNames = [...new Set(vocabulary.filter((name) => new RegExp(`['"]${name}['"]|\\b${name}\\b`, 'i').test(text)))];
const explicit = new Map([
  ['dense', ['dense', 'LOGICAL_LANE']], ['dense_384', ['dense', 'LEGACY_ALIAS']], ['dense_768', ['dense', 'LOGICAL_LANE']],
  ['bm25', ['lexical', 'LEGACY_ALIAS']], ['postgres_trigram', ['lexical', 'EXECUTOR_NAME_NOT_LANE']], ['lexical', ['lexical', 'LOGICAL_LANE']],
  ['bm42', ['bm42', 'LOGICAL_LANE']], ['rg', ['rg', 'LOGICAL_LANE']], ['exact', ['exact', 'LOGICAL_LANE']], ['ast', ['ast', 'LOGICAL_LANE']],
  ['schema', ['schema', 'LOGICAL_LANE']], ['topology', ['other', 'DIAGNOSTIC_ONLY']], ['authority', ['other', 'DIAGNOSTIC_ONLY']],
  ['dispatcher', ['other', 'DIAGNOSTIC_ONLY']], ['turbovec', ['dense', 'EXECUTOR_NAME_NOT_LANE']],
]);
const mappings = rawNames.sort().map((rawLaneName) => { const [logicalLaneId, classification] = explicit.get(rawLaneName) ?? [null, 'UNMAPPED']; return { rawLaneName, logicalLaneId, classification }; });
const executorAsLane = mappings.filter((mapping) => mapping.classification === 'EXECUTOR_NAME_NOT_LANE');
const unmapped = mappings.filter((mapping) => mapping.classification === 'UNMAPPED');
const logicalLanes = [...new Set(mappings.map((mapping) => mapping.logicalLaneId).filter(Boolean))].sort().map((logicalLaneId) => ({ logicalLaneId, aliases: mappings.filter((mapping) => mapping.logicalLaneId === logicalLaneId).map((mapping) => mapping.rawLaneName), voteCount: 1 }));
const report = {
  schema: 'atlas.rrf-logical-lane-alias-map.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: unmapped.length || executorAsLane.length ? 'ALIAS_MAP_PARTIAL_MIGRATION_BLOCKED' : 'ALIAS_MAP_PROVEN_REPLAY_REQUIRED',
  authority: false, migrationAuthorized: false, writesPerformed: false, workspaceRevision: null,
  sourceFiles: [rel(ALIASES), rel(CONTRACT), rel(RUNTIME)], mappings, logicalLanes,
  conflicts: executorAsLane.map((mapping) => ({ type: 'EXECUTOR_AS_LANE', rawLaneName: mapping.rawLaneName, logicalLaneId: mapping.logicalLaneId })),
  metrics: { rawLaneCount: mappings.length, logicalLaneCount: logicalLanes.length, unmappedCount: unmapped.length, executorAsLaneCount: executorAsLane.length, oneVotePerLogicalLane: logicalLanes.every((lane) => lane.voteCount === 1) },
  blockers: [...new Set([...(unmapped.length ? ['UNMAPPED_RAW_LANE'] : []), ...(executorAsLane.length ? ['EXECUTOR_AS_LANE_REQUIRES_CALLER_REVIEW'] : []), 'CALLER_BASELINE_REPLAY_REQUIRED', 'RUNTIME_CONSOLIDATION_NOT_AUTHORIZED'])],
  nextGate: 'RWC-CENSUS-03_BOUNDED_CALLER_REPLAY', safeNextCommand: 'npm run atlas:rrf:caller-baseline',
};
function rel(file) { return file.replace(`${ROOT}/`, '').replaceAll('\\', '/'); }
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, migrationAuthorized: false, rawLaneCount: mappings.length, logicalLaneCount: logicalLanes.length, unmappedCount: unmapped.length, executorAsLaneCount: executorAsLane.length, reportPath: REPORT }, null, 2));
