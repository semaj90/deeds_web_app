#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/+$/, '');
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = resolve(repoRoot, 'docs/reports');
const jsonPath = resolve(reportDir, 'ast-sidecar-capability-proof.json');
const mdPath = resolve(reportDir, 'ast-sidecar-capability-proof.md');

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const startedAt = new Date().toISOString();
const health = await get('/health');
const capabilities = await get('/capabilities');
const evidence = await post('/ast/chunk', {
  source: "import { helper } from './helper';\nexport function hello() { return helper(); }",
  language: 'typescript',
  filePath: 'src/example.ts',
  sourceRevision: 'ast-sidecar-proof-v1',
});

const edgeTypes = new Set((evidence.edges ?? []).map((edge) => edge.type));
const typedEdgeEvidence = ['DEFINES', 'IMPORTS', 'EXPORTS', 'CALLS'].every((type) => edgeTypes.has(type));
const noFakeCallSymbols = evidence.chunks.every((chunk) => !String(chunk.name ?? '').startsWith('call_'));

const report = {
  schemaVersion: 'atlas.ast.sidecar.proof.v1',
  generatedAt: startedAt,
  endpoint: baseUrl,
  status: health.status === 'ok' && capabilities.ast?.available === true && evidence.schema === 'atlas.ast.evidence.v1' && evidence.diagnostics.length === 0 && typedEdgeEvidence && noFakeCallSymbols ? 'PROVEN' : 'DEGRADED',
  gates: {
    SIDECAR_HEALTH_PASS: health.status === 'ok',
    SIDECAR_CAPABILITY_DISCOVERY: capabilities.ast?.available === true,
    TREESITTER_CHUNKER_IMPORTABLE: capabilities.ast?.engine === 'treesitter-chunker',
    AST_EVIDENCE_ENDPOINT: evidence.schema === 'atlas.ast.evidence.v1',
    AST_EVIDENCE_DIAGNOSTICS_EMPTY: evidence.diagnostics.length === 0,
    UPSTREAM_CHUNK_ID_ONLY: evidence.chunks.every((chunk) => typeof chunk.upstream_chunk_id === 'string'),
    TYPED_EDGE_EVIDENCE: typedEdgeEvidence,
    NO_FAKE_CALL_SYMBOLS: noFakeCallSymbols,
  },
  runtime: {
    health: { status: health.status, model: health.model },
    ast: capabilities.ast,
    engine: evidence.engine,
    engineVersion: evidence.engine_version,
    chunks: evidence.chunks.length,
    edges: evidence.edges?.length ?? 0,
    edgeTypes: [...edgeTypes],
    diagnostics: evidence.diagnostics,
  },
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(mdPath, [
  '# AST sidecar capability proof',
  '',
  `- status: **${report.status}**`,
  `- endpoint: ${baseUrl}`,
  `- engine: ${evidence.engine} ${evidence.engine_version}`,
  `- chunks: ${evidence.chunks.length}`,
  `- edges: ${evidence.edges?.length ?? 0}`,
  `- diagnostics: ${evidence.diagnostics.length}`,
  '',
  ...Object.entries(report.gates).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`),
  '',
  'The sidecar emits structural evidence only. Parent Atlas identity and persistence remain downstream owners.',
  '',
].join('\n'));

console.log(JSON.stringify({ status: report.status, jsonPath, mdPath, gates: report.gates }, null, 2));
if (report.status !== 'PROVEN') process.exitCode = 2;
