#!/usr/bin/env node
/**
 * Read-only boundary audit for the LangExtract/Ornith/classifier/OAK fanout.
 *
 * This proves transport and response-shape compatibility only. It never writes
 * Postgres, ontology tuples, GraphRAG artifacts, Qdrant points, or model state.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/langextract-ornith-classifier-fanout-v1.json');
const LLAMA = (process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090')
  .replace(/\/+$/, '').replace(/\/v1$/i, '');
const NLP = (process.env.LANGEXTRACT_URL || 'http://127.0.0.1:8095')
  .replace(/\/+$/, '');

const fixture = {
  text: 'The canonical Qdrant projection preserves packet identity and source revision.',
  source_type: 'codebase',
  extraction_mode: 'full',
  source_ref: 'fixture://parent-atlas/langextract-ornith-classifier',
  packet_key: 'fixture-packet-langextract-ornith',
  passes: ['classify'],
  grounded_extraction_required: true,
};

async function getJson(url, options) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: null, body: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function hasPass(response, predicate) {
  return Array.isArray(response?.pass_results) && response.pass_results.some(predicate);
}

async function main() {
  const modelResult = await getJson(`${LLAMA}/v1/models`);
  const modelId = modelResult.body?.data?.[0]?.id ?? modelResult.body?.models?.[0]?.model ?? null;
  const health = await getJson(`${NLP}/health`);
  const analysisResult = await getJson(`${NLP}/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fixture),
  });
  const analysis = analysisResult.body;
  const classifyPass = analysis?.pass_results?.find((p) => p.family === 'classify');
  const extractPass = analysis?.pass_results?.find((p) => p.family === 'grounded');
  const oakHealth = await getJson(`${NLP}/oak/health`);
  const okfPaths = [
    '.okf/manifest.yaml',
    '.okf/pipelines/ast-entity-prefill.yaml',
    '.okf/domains/feature-intelligence.yaml',
  ];
  const checks = {
    llamaModelsReachable: modelResult.ok,
    expectedModelObserved: modelId === 'ornith-1.5-9b',
    nlpHealthReachable: health.ok,
    langextractCapability: health.body?.capabilities?.langextract === true,
    oakHealthReachable: oakHealth.ok,
    analyzeReachable: analysisResult.ok,
    classifySucceeded: classifyPass?.status === 'succeeded',
    classifierBackendObserved: ['sklearn-lr', 'sklearn-nb'].includes(classifyPass?.backend),
    classifierModelRevisionPresent: Boolean(classifyPass?.artifacts?.model_revision),
    groundedPassPresent: Boolean(extractPass),
    sourceRevisionQualified: analysis?.pass_results?.every((p) => p.source_revision && p.source_revision !== 'unknown') === true,
    groundedEvidencePresent: Array.isArray(analysis?.entities) && analysis.entities.length > 0,
    okfInputsPresent: okfPaths.every((relative) => existsSync(resolve(ROOT, relative))),
  };
  const blockers = [];
  if (!checks.expectedModelObserved) blockers.push('ORNITH_MODEL_NOT_CONFIRMED');
  if (!checks.nlpHealthReachable || !checks.langextractCapability) blockers.push('LANGEXTRACT_SERVICE_NOT_READY');
  if (!checks.classifySucceeded || !checks.classifierBackendObserved) blockers.push('CLASSIFIER_EXECUTION_NOT_PROVEN');
  if (!checks.sourceRevisionQualified) blockers.push('SOURCE_REVISION_UNKNOWN');
  if (!checks.groundedEvidencePresent) blockers.push('NO_GROUNDED_ENTITY_FIXTURE');
  const status = blockers.length === 0 ? 'BOUNDARY_FANOUT_PROVEN' : 'BOUNDARY_REACHABLE_LINEAGE_BLOCKED';
  const report = {
    schema: 'atlas.langextract-ornith-classifier-fanout.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    status,
    proofLevel: status === 'BOUNDARY_FANOUT_PROVEN' ? 'BOUNDED_LIVE_PROVEN' : 'PARTIAL_PROVEN',
    authority: false,
    writesPerformed: false,
    endpoints: { llamaModels: `${LLAMA}/v1/models`, nlpHealth: `${NLP}/health`, analyze: `${NLP}/analyze`, oakHealth: `${NLP}/oak/health` },
    model: { configured: 'ornith-1.5-9b', observed: modelId, artifact: 'models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf' },
    checks,
    observed: {
      providerRevision: analysis?.provider_revision ?? null,
      sourceRevision: analysis?.pass_results?.map((p) => p.source_revision) ?? [],
      classifierBackend: classifyPass?.backend ?? null,
      classifierModelRevision: classifyPass?.artifacts?.model_revision ?? null,
      predictedLabel: classifyPass?.artifacts?.label ?? null,
      oak: oakHealth.body ?? null,
    },
    blockers,
    nextGate: blockers.includes('SOURCE_REVISION_UNKNOWN') ? 'CURRENT_SOURCE_LINEAGE-01' : 'ONTOLOGY_TUPLE_GROUNDED_ADMISSION-01',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status, proofLevel: report.proofLevel, blockers, report: REPORT }, null, 2));
}

main().catch((error) => {
  console.error(`[langextract-ornith-classifier-fanout] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
