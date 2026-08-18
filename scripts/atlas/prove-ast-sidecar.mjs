#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/+$/, '');
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = resolve(repoRoot, 'docs/reports');
const jsonPath = resolve(reportDir, 'ast-sidecar-capability-proof.json');
const mdPath = resolve(reportDir, 'ast-sidecar-capability-proof.md');
const upstreamManifestPath = resolve(repoRoot, 'docs/atlas/ast-upstream-contract-manifest.json');
const upstreamManifest = JSON.parse(readFileSync(upstreamManifestPath, 'utf8'));

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function verifyPinnedUpstreamContracts() {
  const results = [];
  for (const contract of upstreamManifest.contracts) {
    try {
      const response = await fetch(contract.rawUrl, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      const missingFragments = contract.requiredFragments.filter((fragment) => !source.includes(fragment));
      results.push({ id: contract.id, repository: contract.repository, revision: contract.revision, path: contract.path, status: missingFragments.length === 0 ? 'PASS' : 'FAIL', missingFragments });
    } catch (error) {
      results.push({ id: contract.id, repository: contract.repository, revision: contract.revision, path: contract.path, status: 'ERROR', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { status: results.every((result) => result.status === 'PASS') ? 'PROVEN_UPSTREAM_CONTRACTS' : 'DEGRADED', results };
}

const startedAt = new Date().toISOString();
const upstreamContracts = await verifyPinnedUpstreamContracts();
const health = await get('/health');
const capabilities = await get('/capabilities');
const evidence = await post('/ast/chunk', {
  source: "import { helper } from './helper';\nexport function hello() { return helper(); }",
  language: 'typescript', filePath: 'src/example.ts', sourceRevision: 'ast-sidecar-proof-v3',
});

let grounded;
try {
  grounded = await post('/analyze', {
    text: 'Alice calls helper from the service.', source_type: 'plain_text', extraction_mode: 'entities',
    document_id: 'langextract-grounding-proof-v1', passes: ['grounded'], grounded_extraction_required: true,
  });
} catch (error) {
  grounded = { error: error instanceof Error ? error.message : String(error) };
}

const chunks = Array.isArray(evidence.chunks) ? evidence.chunks : [];
const edges = Array.isArray(evidence.edges) ? evidence.edges : [];
const edgeTypes = new Set(edges.map((edge) => edge.type));
const typedEdgeEvidence = ['DEFINES', 'IMPORTS', 'EXPORTS', 'CALLS'].every((type) => edgeTypes.has(type));
const noFakeCallSymbols = chunks.every((chunk) => !String(chunk.name ?? '').startsWith('call_'));
const nativeNodeIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.node_id === 'string' && chunk.node_id.length > 0);
const nativeFileIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.file_id === 'string' && chunk.file_id.length > 0);
const nativeChunkIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.chunk_id === 'string' && chunk.chunk_id.length > 0);
const hierarchyPresent = chunks.length > 0 && chunks.every((chunk) => Array.isArray(chunk.parent_route) && Array.isArray(chunk.route));
const nativeByteSpans = chunks.length > 0 && chunks.every((chunk) => Number.isInteger(chunk.start_byte) && Number.isInteger(chunk.end_byte) && chunk.start_byte >= 0 && chunk.end_byte >= chunk.start_byte);
const namedChunks = chunks.filter((chunk) => String(chunk.name ?? '').trim().length > 0);
const namedSymbolIds = namedChunks.length > 0 && namedChunks.every((chunk) => typeof chunk.symbol_id === 'string' && chunk.symbol_id.length > 0);

const langEntities = Array.isArray(grounded?.entities) ? grounded.entities : [];
const allowedAlignmentStatuses = new Set(['match_exact', 'match_greater', 'match_lesser', 'match_fuzzy']);
const langextractGroundingExposed = langEntities.length > 0 && langEntities.every((entity) =>
  Object.prototype.hasOwnProperty.call(entity, 'char_interval') &&
  Object.prototype.hasOwnProperty.call(entity, 'alignment_status')
);
const langextractAllGrounded = langextractGroundingExposed && langEntities.every((entity) => {
  const interval = entity.char_interval;
  const alignment = entity.alignment_status;
  return interval !== null &&
    Number.isInteger(interval?.start_pos) && Number.isInteger(interval?.end_pos) &&
    interval.start_pos >= 0 && interval.end_pos >= interval.start_pos &&
    allowedAlignmentStatuses.has(String(alignment));
});

const gates = {
  CANONICAL_LIBRARY_CONTRACTS_VERIFIED: upstreamContracts.status === 'PROVEN_UPSTREAM_CONTRACTS',
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
  NATIVE_BYTE_SPAN_PROVENANCE: nativeByteSpans,
  TYPED_EDGE_EVIDENCE: typedEdgeEvidence,
  NO_FAKE_CALL_SYMBOLS: noFakeCallSymbols,
  LANGEXTRACT_GROUNDING_FIELDS_EXPOSED: langextractGroundingExposed,
  LANGEXTRACT_GROUNDED_PROBE: langextractAllGrounded,
};

const requiredForProven = [
  'CANONICAL_LIBRARY_CONTRACTS_VERIFIED',
  'SIDECAR_HEALTH_PASS',
  'SIDECAR_CAPABILITY_DISCOVERY',
  'TREESITTER_CHUNKER_IMPORTABLE',
  'AST_EVIDENCE_ENDPOINT',
  'AST_EVIDENCE_DIAGNOSTICS_EMPTY',
  'NATIVE_NODE_ID_PROVENANCE',
  'NATIVE_FILE_ID_PROVENANCE',
  'NATIVE_CHUNK_ID_PROVENANCE',
  'NATIVE_HIERARCHY_PROVENANCE',
  'NATIVE_SYMBOL_ID_FOR_NAMED_CHUNKS',
  'NATIVE_BYTE_SPAN_PROVENANCE',
  'TYPED_EDGE_EVIDENCE',
  'NO_FAKE_CALL_SYMBOLS',
  'LANGEXTRACT_GROUNDING_FIELDS_EXPOSED',
  'LANGEXTRACT_GROUNDED_PROBE',
];
const status = requiredForProven.every((key) => gates[key]) ? 'PROVEN_NATIVE_PROVENANCE' : 'DEGRADED';

const report = {
  schemaVersion: 'atlas.ast.sidecar.proof.v3',
  generatedAt: startedAt,
  endpoint: baseUrl,
  status,
  gates,
  canonicalContracts: {
    manifest: 'docs/atlas/ast-upstream-contract-manifest.json',
    status: upstreamContracts.status,
    results: upstreamContracts.results,
  },
  runtime: {
    health: { status: health.status, model: health.model },
    ast: capabilities.ast,
    engine: evidence.engine,
    engineVersion: evidence.engine_version,
    chunks: chunks.length,
    namedChunks: namedChunks.length,
    edges: edges.length,
    edgeTypes: [...edgeTypes],
    diagnostics: evidence.diagnostics,
    langextract: {
      entityCount: langEntities.length,
      allowedAlignmentStatuses: [...allowedAlignmentStatuses],
      error: grounded?.error ?? null,
    },
  },
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(mdPath, [
  '# AST sidecar native-provenance capability proof',
  '',
  `- status: **${report.status}**`,
  `- endpoint: ${baseUrl}`,
  `- canonical library contracts: **${upstreamContracts.status}**`,
  `- engine: ${evidence.engine} ${evidence.engine_version}`,
  `- chunks: ${chunks.length}`,
  `- edges: ${edges.length}`,
  '',
  '## Canonical upstream contracts',
  '',
  ...upstreamContracts.results.map((result) => `- ${result.id} @ ${result.revision}: ${result.status}`),
  '',
  '## Live conformance gates',
  '',
  ...Object.entries(gates).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`),
  '',
  'PROVEN_NATIVE_PROVENANCE requires every listed gate. Native IDs, hierarchy, byte spans, symbol provenance for named chunks, typed XRefs, and grounded LangExtract intervals all fail closed.',
  'Canonical GIS identity and persistence remain downstream owners; compatibility hashes are not accepted as canonical proof.',
  '',
].join('\n'));

console.log(JSON.stringify({ status: report.status, jsonPath, mdPath, canonicalContracts: upstreamContracts.status, gates: report.gates }, null, 2));
if (report.status !== 'PROVEN_NATIVE_PROVENANCE') process.exitCode = 2;
