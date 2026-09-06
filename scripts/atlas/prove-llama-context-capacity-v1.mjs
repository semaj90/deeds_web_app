#!/usr/bin/env node
/**
 * LANGGRAPH-LLAMA-CONTEXT-01
 *
 * Read-only live proof of the llama-server context allocation used by local
 * LangGraph/agent execution. It reads /slots and /v1/models only; it never
 * submits a prompt and never writes application or model state.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const baseUrl = (process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const expectedContextTokens = Number.parseInt(process.env.ATLAS_EXPECTED_CONTEXT_TOKENS ?? '65536', 10);
const expectedModel = process.env.ATLAS_EXPECTED_CHAT_MODEL ?? 'ornith-1.5-9b';
const reportPath = path.resolve(root, 'docs/reports/langgraph-llama-context-capacity-v1.json');

async function getJson(endpoint) {
  const response = await fetch(`${baseUrl}${endpoint}`, { signal: AbortSignal.timeout(5_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${endpoint}:HTTP_${response.status}:${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const report = {
  schema: 'atlas.langgraph-llama-context-capacity-proof.v1',
  gate: 'LANGGRAPH-LLAMA-CONTEXT-01',
  generatedAt: new Date().toISOString(),
  endpoint: baseUrl,
  expectedContextTokens,
  expectedModel,
  readOnly: true,
  canonicalWrites: false,
  datastoreWrites: false,
  modelCalls: false,
  status: 'LIVE_CONTEXT_CAPACITY_UNAVAILABLE',
  slots: [],
  models: [],
  checks: {
    serverReachable: false,
    expectedModelLoaded: false,
    oneSlotForInitialProof: false,
    everySlotMeetsExpectedContext: false,
    noGenerationRequestSent: true,
  },
  blockers: [],
};

try {
  const [slots, modelsEnvelope] = await Promise.all([getJson('/slots'), getJson('/v1/models')]);
  const models = Array.isArray(modelsEnvelope?.data)
    ? modelsEnvelope.data
    : Array.isArray(modelsEnvelope?.models) ? modelsEnvelope.models : [];
  report.slots = Array.isArray(slots)
    ? slots.map((slot) => ({ id: slot?.id ?? null, n_ctx: slot?.n_ctx ?? null, is_processing: slot?.is_processing ?? null }))
    : [];
  report.models = models.map((model) => ({ id: model?.id ?? model?.name ?? null, ownedBy: model?.owned_by ?? null }));
  report.checks.serverReachable = true;
  report.checks.expectedModelLoaded = report.models.some((model) => model.id === expectedModel);
  report.checks.oneSlotForInitialProof = report.slots.length === 1;
  report.checks.everySlotMeetsExpectedContext = report.slots.length > 0
    && report.slots.every((slot) => Number(slot.n_ctx) >= expectedContextTokens);

  if (!report.checks.expectedModelLoaded) report.blockers.push('EXPECTED_MODEL_NOT_LOADED');
  if (!report.checks.oneSlotForInitialProof) report.blockers.push('INITIAL_PROOF_REQUIRES_ONE_PARALLEL_SLOT');
  if (!report.checks.everySlotMeetsExpectedContext) report.blockers.push('SLOT_CONTEXT_BELOW_EXPECTED');

  report.status = report.checks.expectedModelLoaded
    && report.checks.oneSlotForInitialProof
    && report.checks.everySlotMeetsExpectedContext
    ? 'LIVE_CONTEXT_CAPACITY_PROVEN'
    : 'LIVE_CONTEXT_CAPACITY_PARTIAL';
} catch (error) {
  report.blockers.push(error instanceof Error ? error.message : String(error));
}

const canonical = JSON.stringify(report, Object.keys(report).sort());
report.reportChecksum = `sha256:${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  endpoint: report.endpoint,
  expectedModel: report.expectedModel,
  expectedContextTokens: report.expectedContextTokens,
  slots: report.slots,
  checks: report.checks,
  blockers: report.blockers,
  reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/'),
  readOnly: true,
  modelCalls: false,
}, null, 2));
