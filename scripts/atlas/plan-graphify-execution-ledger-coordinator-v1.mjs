#!/usr/bin/env node

/** GRAPHIFY-DAILY-COORDINATOR-01: read-only coordinator plan. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = path.join(root, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
const outputPath = path.join(root, 'docs/reports/graphify-execution-ledger-coordinator-plan-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const requiredStages = ['OPEN', 'SOURCE_SELECTION', 'INVENTORY', 'AST_PARSE', 'STRUCTURAL_EXTRACT', 'SEMANTIC_ENRICH', 'GRAPH_BUILD', 'PROJECT', 'VALIDATE', 'CLOSE'];
const validInput = input.readOnly === true
  && input.graphifyRunsWritten === false
  && input.writesPerformed === false
  && /^sha256:[0-9a-f]{64}$/i.test(input.workspaceRevision ?? '')
  && Number(input.bindingCount) === Number(input.sourceCount)
  && Number(input.bindingCount) > 0;
const plan = {
  schema: 'atlas.graphify-execution-ledger-coordinator-plan.v1',
  status: validInput ? 'READY_FOR_EXPLICIT_LEDGER_AUTHORIZATION' : 'BLOCKED_SOURCE_SELECTION_INPUT',
  sourceReceipt: 'docs/reports/graphify-lifecycle-entrypoint-v1.json',
  workspaceRevision: input.workspaceRevision ?? null,
  sourceManifestDigest: input.sourceManifestDigest ?? null,
  sourceCount: input.sourceCount ?? null,
  bindingCount: input.bindingCount ?? null,
  executionIdentity: 'NEW_UUID_PER_ATTEMPT',
  legacyGraphifyRunId: null,
  advisoryLock: { function: 'pg_try_advisory_lock', namespace: 119041, key: 641934821, scope: 'dedicated connection for one execution' },
  stages: requiredStages,
  writesPlanned: { graphifyExecutions: true, graphifyExecutionFiles: true, graphifyExecutionStages: true, graphifyRuns: false, graphifyFiles: false, neo4j: false, qdrant: false, valkey: false },
  authorizationRequired: true,
  migrationApplied: false,
  canaryRequiredBeforeBroadRun: true,
  canonicalAuthority: false,
  writesPerformed: false,
};
plan.planChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(plan, Object.keys(plan).sort()), 'utf8').digest('hex')}`;
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...plan, reportPath: outputPath }, null, 2));
if (!validInput) process.exitCode = 1;
