#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { QueryAdaptiveFeatureRowV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-feature-compiler.js';
import {
  adaptQasRowToImportanceRankInput,
  rankImportanceBatch,
} from '../../sveltekit-frontend/src/lib/server/atlas/ranking/importance-ranker-v1.js';

const ROOT = resolve(import.meta.dirname, '../..');
const inputIndex = process.argv.indexOf('--input');
const outputIndex = process.argv.indexOf('--output');
const inputPath = resolve(ROOT, inputIndex >= 0 ? process.argv[inputIndex + 1] : 'docs/reports/atlas-qas-candidate-features.jsonl');
const outputPath = resolve(ROOT, outputIndex >= 0 ? process.argv[outputIndex + 1] : 'docs/reports/atlas-importance-ranker-v1.ndjson');
const reportPath = resolve(ROOT, 'docs/reports/atlas-importance-ranker-v1.json');

const report = {
  schema: 'atlas.importance-ranker-report.v1',
  inputPath,
  outputPath,
  status: 'MISSING_INPUT' as 'MISSING_INPUT' | 'PROVEN_FIXTURE_INPUT' | 'DEGRADED',
  rowsRead: 0,
  rowsAccepted: 0,
  rowsRejected: 0,
  requestIds: [] as string[],
  workspaceRevisions: [] as string[],
  graphRevisions: [] as string[],
  featureRevisions: [] as string[],
  canonicalWrites: false,
  cacheWrites: false,
  graphWrites: false,
  notes: [
    'ImportanceRankerV1 consumes existing QAS features; it is not a retriever or feature owner.',
    'PageRank/PPR raw signals are optional in this harness; existing graphAuthority is used as fallback.',
    'No exact-promotion, Qdrant, Neo4j, Valkey, Postgres, or Kanban mutation occurs.',
  ],
};

if (existsSync(inputPath)) {
  const rows = [];
  const rejected: Array<{ line: number; reason: string }> = [];
  const lines = readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean);
  report.rowsRead = lines.length;

  for (const [index, line] of lines.entries()) {
    try {
      const row = QueryAdaptiveFeatureRowV1Schema.parse(JSON.parse(line));
      rows.push(row);
    } catch (error) {
      rejected.push({ line: index + 1, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const requestIds = [...new Set(rows.map((row) => row.requestId))];
  const workspaceRevisions = [...new Set(rows.map((row) => row.workspaceRevision))];
  const graphRevisions = [...new Set(rows.map((row) => row.graphRevision))];
  const featureRevisions = [...new Set(rows.map((row) => row.featureRevision))];

  report.requestIds = requestIds;
  report.workspaceRevisions = workspaceRevisions;
  report.graphRevisions = graphRevisions;
  report.featureRevisions = featureRevisions;
  report.rowsAccepted = rows.length;
  report.rowsRejected = rejected.length;

  if (rows.length > 0) {
    const ranked = rankImportanceBatch(rows.map((row, ordinal) => adaptQasRowToImportanceRankInput({ row, ordinal })));
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${ranked.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    report.status = rejected.length === 0 && requestIds.length === 1 && workspaceRevisions.length === 1
      ? 'PROVEN_FIXTURE_INPUT'
      : 'DEGRADED';
  }

  (report as typeof report & { rejected?: Array<{ line: number; reason: string }> }).rejected = rejected;
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
