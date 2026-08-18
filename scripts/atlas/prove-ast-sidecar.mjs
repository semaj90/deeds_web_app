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
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const startedAt = new Date().toISOString();
const health = await get('/health');
const capabilities = await get('/capabilities');
const evidence = await post('/ast/chunk', {
  source: "import { helper } from './helper';\nexport function hello() { return helper(); }",
  language: 'typescript', filePath: 'src/example.ts', sourceRevision: 'ast-sidecar-proof-v2',
});

let grounded = null;
try {
  grounded = await post('/analyze', {
    text: 'Alice calls helper from the service.', source_type: 'plain_text', extraction_mode: 'entities',
    document_id: 'langextract-grounding-proof-v1', passes: ['grounded'], grounded_extraction_required: true,
  });
} catch (error) {
  grounded = { error: error instanceof Error ? error.message : String(error) };
}

const chunks = Array.isArray(evidence.chunks) ? evidence.chunks : [];
const edgeTypes = new Set((evidence.edges ?? []).map((edge) => edge.type));
const typedEdgeEvidence = ['DEFINES', 'IMPORTS', 'EXPORTS', 'CALLS'].every((type) => edgeTypes.has(type));
const noFakeCallSymbols = chunks.every((chunk) => !String(chunk.name ?? '').startsWith('call_'));
const nativeNodeIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.node_id === 'string' && chunk.node_id.length > 0);
const nativeFileIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.file_id === 'string' && chunk.file_id.length > 0);
const nativeChunkIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.chunk_id === 'string' && chunk.chunk_id.length > 0);
const hierarchyPresent = chunks.length > 0 && chunks.every((chunk) => Array.isArray(chunk.parent_route) && Array.isArray(chunk.route));
const namedChunks = chunks.filter((chunk) => String(chunk.name ?? '').trim().length > 0);
const namedSymbolIds = namedChunks.length === 0 || namedChunks.every((chunk) => typeof chunk.symbol_id === 'string' && chunk.symbol_id.length > 0);
const langEntities = Array.isArray(grounded?.entities) ? grounded.entities : [];
const langextractGroundingExposed = langEntities.length === 0
  ? false
  : langEntities.every((entity) => Object.prototype.hasOwnProperty.call(entity, 'char_interval') && Object.prototype.hasOwnProperty.call(entity, 'alignment_status'));
const langextractAllGrounded = langextractGroundingExposed && langEntities.every((entity) => entity.char_interval !== null);

const gates = {
  SIDECAR_HEALTH_PASS: health.status === 'ok',
  SIDECAR_CAPABILITY_DISCOVERY: capabilities.ast?.available === true,
  TREESITTER_CHUNKER_IMPORTABLE: capabilities.ast?.engine === 'treesitter-chunker',
  AST_EVIDENCE_ENDPOINT: evidence.schema === 'atlas.ast.evidence.v1',
  AST_EVIDENCE_DIAGNOSTICS_EMPTY: Array.isArray(evidence.diagnostics) && evidence.diagnostics.length === 0,
  NATIVE_NODE_ID_PROVENANCE: nativeNodeIds,
  NATIVE_FILE_ID_PROVENANCE: nativeFileIds,
  NATIVE_CHUNK_ID_PROVENANCE: nativeChunkIds,
  NATIVE_HIERARCHY_PROVENANCE: hierarchyPresent,
  NATIVE_SYMBOL_ID_FOR_NAMED_CHUNKS: namedSymbolIds,
  TYPED_EDGE_EVIDENCE: typedEdgeEvidence,
  NO_FAKE_CALL_SYMBOLS: noFakeCallSymbols,
  LANGEXTRACT_GROUNDING_FIELDS_EXPOSED: langextractGroundingExposed,
  LANGEXTRACT_GROUNDED_PROBE: langextractAllGrounded,
};

const requiredForProven = [
  'SIDECAR_HEALTH_PASS','SIDECAR_CAPABILITY_DISCOVERY','TREESITTER_CHUNKER_IMPORTABLE','AST_EVIDENCE_ENDPOINT',
  'AST_EVIDENCE_DIAGNOSTICS_EMPTY','NATIVE_NODE_ID_PROVENANCE','NATIVE_FILE_ID_PROVENANCE','NATIVE_CHUNK_ID_PROVENANCE',
  'NATIVE_HIERARCHY_PROVENANCE','TYPED_EDGE_EVIDENCE','NO_FAKE_CALL_SYMBOLS','LANGEXTRACT_GROUNDING_FIELDS_EXPOSED',
];
const status = requiredForProven.every((key) => gates[key]) ? 'PROVEN_NATIVE_PROVENANCE' : 'DEGRADED';

const report = {
  schemaVersion: 'atlas.ast.sidecar.proof.v2', generatedAt: startedAt, endpoint: baseUrl, status, gates,
  runtime: {
    health: { status: health.status, model: health.model }, ast: capabilities.ast, engine: evidence.engine,
    engineVersion: evidence.engine_version, chunks: chunks.length, namedChunks: namedChunks.length,
    edges: evidence.edges?.length ?? 0, edgeTypes: [...edgeTypes], diagnostics: evidence.diagnostics,
    langextract: { entityCount: langEntities.length, error: grounded?.error ?? null },
  },
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(mdPath, [
  '# AST sidecar native-provenance capability proof','',`- status: **${report.status}**`,`- endpoint: ${baseUrl}`,
  `- engine: ${evidence.engine} ${evidence.engine_version}`,`- chunks: ${chunks.length}`,`- edges: ${evidence.edges?.length ?? 0}`,'',
  ...Object.entries(gates).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`),'',
  'PROVEN now requires native node/file/chunk provenance, hierarchy, typed XRefs, and LangExtract grounding fields.',
  'Native symbol IDs for named chunks are recorded separately so missing symbol provenance cannot be hidden by a compatibility hash.',
  'Canonical GIS identity and persistence remain downstream owners.','',
].join('\n'));

console.log(JSON.stringify({ status: report.status, jsonPath, mdPath, gates: report.gates }, null, 2));
if (report.status !== 'PROVEN_NATIVE_PROVENANCE') process.exitCode = 2;
