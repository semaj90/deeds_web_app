#!/usr/bin/env node

/**
 * Dry-run Ornith boundary for the Workstation planner.
 * It verifies the existing llama-server model resolver boundary but never
 * calls chat completions while the plan has no executable candidate.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverOrnithModel } from './lib/workstation-ornith-adapter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contextPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ace-context-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-dry-v1.json');
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...value] = arg.slice(2).split('=');
  return [key, value.join('=') || 'true'];
}));
const endpoint = String(args.get('endpoint') ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const startedAt = new Date().toISOString();
let status = 'RUNTIME_UNAVAILABLE';
let loadedModel = null;
let modelIds = [];
let error = null;
try {
  const discovery = await discoverOrnithModel(endpoint);
  modelIds = discovery.modelIds;
  loadedModel = discovery.loadedModel;
  status = context.status === 'NO_EXECUTABLE_CANDIDATE' ? 'SKIPPED_NO_EXECUTABLE_CANDIDATE' : 'DRY_RUN_READY_NO_GENERATION';
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause);
}
const receiptBody = {
  schema: 'atlas.parent-atlas-workstation-ornith-synthesis-receipt.v1',
  status,
  purpose: 'OPEN_SPEC_WORKSTATION_PLAN',
  dryRun: true,
  generated: false,
  modelCalls: 0,
  endpoint,
  loadedModel,
  observedModelIds: modelIds,
  runtimeSelectionPolicy: 'EXISTING_LLAMA_SERVER_MODEL_RESOLVER; ORNITH_1_5_ALLOWLIST; FAIL_CLOSED',
  contextChecksum: context.contextChecksum,
  planChecksum: context.planChecksum,
  workboardChecksum: context.workboardChecksum,
  selectedTaskRefs: context.selectedTaskRefs,
  evidenceRefs: context.selectedEvidenceRefs,
  promptRevision: 'atlas.openspec-workstation.prompt.v1',
  inputChecksum: sha256(JSON.stringify({ contextChecksum: context.contextChecksum, planChecksum: context.planChecksum })),
  outputChecksum: null,
  startedAt,
  completedAt: new Date().toISOString(),
  error,
  canonicalAuthority: false,
};
const receipt = { ...receiptBody, receiptChecksum: sha256(JSON.stringify(receiptBody)), writes: { taskLedgers: 0, sourceFiles: 0, databases: 0, qdrant: 0, neo4j: 0, cache: 0, modelCalls: 0 } };
fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: receipt.schema, status: receipt.status, dryRun: receipt.dryRun, generated: receipt.generated, loadedModel: receipt.loadedModel, modelCalls: receipt.modelCalls, error: receipt.error, receiptChecksum: receipt.receiptChecksum, writes: receipt.writes, out: outPath }, null, 2));
if (status === 'RUNTIME_UNAVAILABLE' || status === 'ORNITH_MODEL_NOT_LOADED') process.exitCode = 1;
