#!/usr/bin/env node

/**
 * WORKSTATION-ORNITH-LIVE-FIXTURE-01
 *
 * The dry-run boundary (run-parent-atlas-workstation-ornith-synthesis-dry-v1.mjs)
 * proves live model discovery and fail-closed behavior, but never actually
 * calls /v1/chat/completions -- that code path does not exist there because
 * the real plan-only path must never generate while there is no executable
 * candidate (see prove-parent-atlas-workstation-plan-only-v1.mjs, which
 * asserts generated === false / modelCalls === 0 against that receipt).
 *
 * This script proves the Workstation synthesis adapter's OTHER half: that a
 * real generation call through the same shared discovery boundary
 * (lib/workstation-ornith-adapter.mjs) actually works, using a small
 * hardcoded synthetic fixture -- never the real backlog/task content from
 * parent-atlas-workstation-ace-context-v1.json -- so nothing real ever
 * leaves this workstation while upstream lineage is unresolved.
 *
 * This is capability evidence only. It does NOT make the production
 * Workstation synthesis path live; that remains BLOCKED_CURRENT_LINEAGE
 * (PKT-LINEAGE-08 / SOURCE-SELECTION-AUTHORITY-01) regardless of this
 * script's result. Output is not required to be bit-reproducible across
 * runs -- fixtureChecksum/requestChecksum are the deterministic identity;
 * outputChecksum/responseChecksum are execution evidence, not a replay
 * contract.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverOrnithModel, streamChatCompletion } from './lib/workstation-ornith-adapter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-fixture-v1.json');
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...value] = arg.slice(2).split('=');
  return [key, value.join('=') || 'true'];
}));
const endpoint = String(args.get('endpoint') ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

// Fixed, deterministic, non-production fixture -- never real backlog content.
const PROMPT_TEMPLATE_REVISION = 'atlas.workstation-ornith-fixture-prompt.v1';
const FIXTURE = {
  taskRef: 'FIXTURE-TASK-DO-NOT-PROMOTE',
  evidenceRefs: ['docs/reports/parent-atlas-workstation-openspec-workboard-v2.json'],
  systemPrompt: 'Reply with exactly one line: ORNITH_FIXTURE_OK',
  userPrompt: 'Confirm the workstation synthesis boundary is live.',
};
const fixtureChecksum = sha256(JSON.stringify(FIXTURE));

const startedAt = new Date().toISOString();
let status = 'RUNTIME_UNAVAILABLE';
let loadedModel = null;
let modelIds = [];
let modelCalls = 0;
let generation = null;
let error = null;

try {
  const discovery = await discoverOrnithModel(endpoint);
  modelIds = discovery.modelIds;
  loadedModel = discovery.loadedModel;

  generation = await streamChatCompletion(
    endpoint,
    loadedModel,
    [
      { role: 'system', content: FIXTURE.systemPrompt },
      { role: 'user', content: FIXTURE.userPrompt },
    ],
    { maxTokens: 32, temperature: 0 },
  );
  modelCalls = 1;
  status = generation.assembled.length > 0 ? 'LIVE_FIXTURE_PROVEN' : 'GENERATION_EMPTY_RESPONSE';
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause);
  status = 'RUNTIME_UNAVAILABLE';
}

const receiptBody = {
  schema: 'atlas.parent-atlas-workstation-ornith-synthesis-fixture-receipt.v1',
  gate: 'WORKSTATION-ORNITH-LIVE-FIXTURE-01',
  status,
  purpose: 'LIVE_GENERATION_BOUNDARY_PROOF_ONLY',
  dryRun: false,
  generated: modelCalls === 1 && (generation?.assembled?.length ?? 0) > 0,
  modelCalls,
  endpoint,
  modelId: loadedModel,
  loadedModel,
  observedModelIds: modelIds,
  runtimeSelectionPolicy: 'EXISTING_LLAMA_SERVER_MODEL_RESOLVER; ORNITH_1_5_ALLOWLIST; FAIL_CLOSED',
  fixture: FIXTURE,
  fixtureChecksum,
  promptTemplateRevision: PROMPT_TEMPLATE_REVISION,
  streamed: generation?.streamed ?? true,
  requestChecksum: generation?.requestChecksum ?? null,
  responseChecksum: generation?.responseChecksum ?? null,
  finishReason: generation?.finishReason ?? null,
  outputPreview: (generation?.assembled ?? '').slice(0, 200),
  outputChecksum: generation?.assembled ? sha256(generation.assembled) : null,
  startedAt,
  completedAt: new Date().toISOString(),
  error,
  canonicalAuthority: false,
  productionPlanPath: false,
  note: 'Capability evidence only. Isolated from the production dry-run/plan-only path. Selects no real task and mutates no ledger. Does not unblock PKT-LINEAGE-08 / production Workstation synthesis.',
};
const receipt = { ...receiptBody, receiptChecksum: sha256(JSON.stringify(receiptBody)), writes: { taskLedgers: 0, sourceFiles: 0, databases: 0, qdrant: 0, neo4j: 0, cache: 0, modelCalls } };
fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: receipt.schema, gate: receipt.gate, status: receipt.status, generated: receipt.generated, modelCalls: receipt.modelCalls, loadedModel: receipt.loadedModel, outputPreview: receipt.outputPreview, error: receipt.error, receiptChecksum: receipt.receiptChecksum, writes: receipt.writes, out: outPath }, null, 2));
if (status !== 'LIVE_FIXTURE_PROVEN') process.exitCode = 1;
