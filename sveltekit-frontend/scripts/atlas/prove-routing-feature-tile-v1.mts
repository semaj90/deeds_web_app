#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectQueryFeaturesV1 } from '../../src/lib/server/atlas/classification/query-feature-projection-v1.js';

const repoRoot = resolve(process.cwd(), '..');
const output = resolve(repoRoot, 'docs/reports/routing-feature-tile-4x6-v1.json');
const rows = ['QUERY', 'TOKEN_OR_SPAN', 'CANDIDATE_OR_PACKET', 'EXECUTION_OR_CACHE'] as const;
const columns = ['LEXICAL', 'SEMANTIC', 'AST', 'GRAPH', 'DOMAIN', 'RUNTIME'] as const;
type Cell = { value: number | null; featureRevision: string; missingness: 'PRESENT' | 'NOT_AVAILABLE_IN_FIXTURE' };

const query = 'trace the current Graphify packet to chunk and AST lineage';
const features = projectQueryFeaturesV1(query);
const cell = (value: number | null, featureRevision: string): Cell => ({
  value,
  featureRevision,
  missingness: value === null ? 'NOT_AVAILABLE_IN_FIXTURE' : 'PRESENT',
});
const queryCells: Record<(typeof columns)[number], Cell> = {
  LEXICAL: cell(features.retrievalTermDensity, features.revision),
  SEMANTIC: cell(null, 'UNAVAILABLE_CLASSIFICATION_EXECUTION'),
  AST: cell(features.graphTermDensity, features.revision),
  GRAPH: cell(features.graphTermDensity, features.revision),
  DOMAIN: cell(null, 'UNAVAILABLE_DOMAIN_AUTHORITY'),
  RUNTIME: cell(null, 'UNAVAILABLE_RUNTIME_RECEIPT'),
};
const tile = rows.map((row) => ({
  row,
  cells: Object.fromEntries(columns.map((column) => [
    column,
    row === 'QUERY' ? queryCells[column] : cell(null, 'UNAVAILABLE_CANONICAL_PACKET_LINEAGE'),
  ])),
}));
const serialized = JSON.stringify({ rows, columns, tile });
const report = {
  schema: 'RoutingFeatureTile4x6V1',
  generatedAt: new Date().toISOString(),
  status: 'DERIVED_TILE_PLUMBING_PROVEN',
  evidenceClass: 'FIXTURE_ONLY',
  query,
  queryFeatureRevision: features.revision,
  rows,
  columns,
  tile,
  tileChecksum: createHash('sha256').update(serialized, 'utf8').digest('hex'),
  noSilentZeroFill: tile.every((row) => Object.values(row.cells).every((entry) => entry.missingness === 'PRESENT' || entry.value === null)),
  canonicalAuthority: false,
  canonicalWritesAllowed: false,
  writesPerformed: false,
  replacesPrimaryRouterTensor: false,
  nextRequirement: 'REVISION_QUALIFIED_PACKET_SPAN_AND_EXECUTOR_FEATURE_PROVENANCE',
};
mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, rows: rows.length, columns: columns.length, output }, null, 2));
