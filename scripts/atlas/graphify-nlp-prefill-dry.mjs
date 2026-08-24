#!/usr/bin/env node

/**
 * Read-only daily Graphify NLP/AST prefill chain.
 *
 * The chain refreshes rebuildable JSONL artifacts only. It does not invoke
 * canonical symbol promotion, ORF materialization, embedding writes, or
 * projection writers.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 1000;
const exportArgs = Number.isFinite(limit) && limit > 0 ? [`--limit=${limit}`] : ['--all'];
const startedAt = Date.now();
const steps = [];

function run(label, command, commandArgs) {
  const started = Date.now();
  try {
    execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit', windowsHide: true });
    steps.push({ label, status: 'PASS', elapsedMs: Date.now() - started });
  } catch (error) {
    steps.push({ label, status: 'FAIL', elapsedMs: Date.now() - started, error: String(error?.message ?? error) });
    throw error;
  }
}

run('graphify-file-export', process.execPath, [
  path.join(root, 'scripts/atlas/export-graphify-file-index-v1.mjs'),
  ...exportArgs,
]);
run('ast-identity-enrichment', process.execPath, [
  path.join(root, 'scripts/atlas/enrich-ast-entity-prefill-identity.mjs'),
]);
run('okf-domain-classification', process.execPath, [
  path.join(root, 'node_modules/tsx/dist/cli.mjs'),
  path.join(root, 'scripts/atlas/classify-ast-entities-okf-dry-run.mts'),
]);
run('observation-feature-aggregation', process.execPath, [
  path.join(root, 'scripts/atlas/aggregate-observation-feature-plan.mjs'),
]);

const report = {
  schema: 'atlas.graphify-nlp-prefill-dry-receipt.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: false,
  qdrantWrites: false,
  valkeyWrites: false,
  canonicalPromotion: false,
  requestedLimit: Number.isFinite(limit) && limit > 0 ? limit : 'all',
  steps,
  status: steps.every((step) => step.status === 'PASS') ? 'PASS' : 'FAIL',
  elapsedMs: Date.now() - startedAt,
};
const reportPath = path.join(root, 'docs/reports/atlas-graphify-nlp-prefill-dry-v1.json');
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
