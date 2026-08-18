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
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function groundedRows(analysis) {
  const metadata = analysis?.metadata ?? {};
  return Array.isArray(metadata.grounded_extractions) ? metadata.grounded_extractions : [];
}

function hasGroundedInterval(row) {
  const interval = row?.char_interval;
  return Boolean(
    interval
    && Number.isInteger(interval.start_pos)
    && Number.isInteger(interval.end_pos)
    && interval.end_pos > interval.start_pos,
  );
}

const startedAt = new Date().toISOString();
const health = await get('/health');
const capabilities = await get('/capabilities');
const evidence = await post('/ast/chunk', {
  source: "import { helper } from './helper';\nexport function hello() { return helper(); }",
  language: 'typescript',
  filePath: 'src/example.ts',
  sourceRevision: 'ast-sidecar-proof-v3',
});

let groundedAnalysis = null;
let groundedProbeError = null;
try {
  groundedAnalysis = await post('/analyze', {
    text: 'The PATCH /api/cases/42 route is protected by the case owner policy.',
    source_type: 'plain_text',
    extraction_mode: 'full',
    document_id: 'grounding-proof-v1',
    source_ref: 'proof://grounding',
    model_id: 'grounding-proof-v1',
    passes: ['grounded'],
    grounded_extraction_required: true,
  });
} catch (error) {
  groundedProbeError = error instanceof Error ? error.message : String(error);
}

const edges = Array.isArray(evidence.edges) ? evidence.edges : [];
const edgeTypes = new Set(edges.map((edge) => edge.type));
const hasDefinitionEvidence = edgeTypes.has('DEFINES');
const hasReferenceEvidence = ['IMPORTS', 'EXPORTS', 'CALLS', 'REFERENCES'].some((type) => edgeTypes.has(type));
const allEdgeTypesRecognized = edges.every((edge) => ['DEFINES', 'IMPORTS', 'EXPORTS', 'CALLS', 'REFERENCES'].includes(edge.type));
const noFakeCallSymbols = evidence.chunks.every((chunk) => !String(chunk.name ?? '').startsWith('call_'));
const chunks = Array.isArray(evidence.chunks) ? evidence.chunks : [];
const namedChunks = chunks.filter((chunk) => String(chunk.name ?? '').trim().length > 0);

const nativeChunkIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.upstream_chunk_id === 'string' && chunk.upstream_chunk_id.length > 0);
const nativeNodeIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.upstream_node_id === 'string' && chunk.upstream_node_id.length > 0);
const nativeFileIds = chunks.length > 0 && chunks.every((chunk) => typeof chunk.upstream_file_id === 'string' && chunk.upstream_file_id.length > 0);
const nativeSymbolIdsForNamedChunks = namedChunks.every((chunk) => typeof chunk.upstream_symbol_id === 'string' && chunk.upstream_symbol_id.length > 0);
const hierarchyPreserved = chunks.length > 0 && chunks.every((chunk) => Array.isArray(chunk.parent_route) && Object.hasOwn(chunk, 'parent_context'));

const grounded = groundedRows(groundedAnalysis);
const nativeGrounding = grounded.length > 0 && grounded.every(hasGroundedInterval);
const alignmentStatusVisible = grounded.length > 0 && grounded.every((row) =>
  row.alignment_status === null
  || ['match_exact', 'match_greater', 'match_lesser', 'match_fuzzy'].includes(row.alignment_status),
);

const gates = {
  SIDECAR_HEALTH_PASS: health.status === 'ok',
  PROVENANCE_V2_CONTRACT: health.contract === 'provenance-v2',
  SIDECAR_CAPABILITY_DISCOVERY: capabilities.ast?.available === true,
  TREESITTER_CHUNKER_IMPORTABLE: capabilities.ast?.engine === 'treesitter-chunker',
  AST_EVIDENCE_ENDPOINT: evidence.schema === 'atlas.ast.evidence.v1',
  AST_EVIDENCE_DIAGNOSTICS_EMPTY: evidence.diagnostics.length === 0,
  STRUCTURAL_CHUNKS_NONEMPTY: chunks.length > 0,
  NATIVE_CHUNK_IDS: nativeChunkIds,
  NATIVE_NODE_IDS: nativeNodeIds,
  NATIVE_FILE_IDS: nativeFileIds,
  NATIVE_SYMBOL_IDS_FOR_NAMED_CHUNKS: nativeSymbolIdsForNamedChunks,
  HIERARCHY_PRESERVED: hierarchyPreserved,
  DEFINES_EDGE_EVIDENCE: hasDefinitionEvidence,
  REFERENCE_EDGE_EVIDENCE: hasReferenceEvidence,
  EDGE_TYPES_RECOGNIZED: allEdgeTypesRecognized,
  NO_FAKE_CALL_SYMBOLS: noFakeCallSymbols,
  GROUNDED_PROBE_COMPLETED: groundedProbeError === null,
  LANGEXTRACT_NATIVE_CHAR_INTERVAL: nativeGrounding,
  LANGEXTRACT_ALIGNMENT_STATUS_VISIBLE: alignmentStatusVisible,
};

const requiredForNativeStructuralProof = [
  'SIDECAR_HEALTH_PASS',
  'PROVENANCE_V2_CONTRACT',
  'SIDECAR_CAPABILITY_DISCOVERY',
  'TREESITTER_CHUNKER_IMPORTABLE',
  'AST_EVIDENCE_ENDPOINT',
  'AST_EVIDENCE_DIAGNOSTICS_EMPTY',
  'STRUCTURAL_CHUNKS_NONEMPTY',
  'NATIVE_CHUNK_IDS',
  'NATIVE_NODE_IDS',
  'NATIVE_FILE_IDS',
  'HIERARCHY_PRESERVED',
  'DEFINES_EDGE_EVIDENCE',
  'REFERENCE_EDGE_EVIDENCE',
  'EDGE_TYPES_RECOGNIZED',
  'NO_FAKE_CALL_SYMBOLS',
];

const structuralProven = requiredForNativeStructuralProof.every((key) => gates[key]);
const groundingProven = gates.GROUNDED_PROBE_COMPLETED
  && gates.LANGEXTRACT_NATIVE_CHAR_INTERVAL
  && gates.LANGEXTRACT_ALIGNMENT_STATUS_VISIBLE;

const report = {
  schemaVersion: 'atlas.ast.sidecar.proof.v3',
  generatedAt: startedAt,
  endpoint: baseUrl,
  status: structuralProven ? 'PROVEN' : 'DEGRADED',
  structuralStatus: structuralProven ? 'PROVEN' : 'DEGRADED',
  groundingStatus: groundingProven ? 'PROVEN' : groundedProbeError ? 'UNAVAILABLE' : 'DEGRADED',
  gates,
  runtime: {
    health: { status: health.status, model: health.model, contract: health.contract ?? null },
    ast: capabilities.ast,
    structuralProvenance: capabilities.structuralProvenance ?? null,
    engine: evidence.engine,
    engineVersion: evidence.engine_version,
    chunks: chunks.length,
    namedChunks: namedChunks.length,
    edges: edges.length,
    edgeTypes: [...edgeTypes],
    diagnostics: evidence.diagnostics,
    nativeProvenance: {
      chunkIds: nativeChunkIds,
      nodeIds: nativeNodeIds,
      fileIds: nativeFileIds,
      symbolIdsForNamedChunks: nativeSymbolIdsForNamedChunks,
      hierarchy: hierarchyPreserved,
    },
    grounding: {
      extractionCount: grounded.length,
      nativeCharInterval: nativeGrounding,
      alignmentStatusVisible,
      error: groundedProbeError,
    },
  },
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(mdPath, [
  '# AST sidecar capability proof',
  '',
  `- structural status: **${report.structuralStatus}**`,
  `- LangExtract grounding status: **${report.groundingStatus}**`,
  `- endpoint: ${baseUrl}`,
  `- contract: ${health.contract ?? 'unknown'}`,
  `- engine: ${evidence.engine} ${evidence.engine_version}`,
  `- chunks: ${chunks.length}`,
  `- edges: ${edges.length}`,
  `- diagnostics: ${evidence.diagnostics.length}`,
  '',
  ...Object.entries(report.gates).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`),
  '',
  'The proof requires definition evidence plus at least one typed reference edge; it does not require every possible XRef edge kind to appear in one fixture.',
  'Native Consiliency IDs remain upstream provenance. This proof only establishes provenance completeness; GIS still owns canonical identity promotion.',
  '',
].join('\n'));

console.log(JSON.stringify({ status: report.status, groundingStatus: report.groundingStatus, jsonPath, mdPath, gates: report.gates }, null, 2));
if (report.status !== 'PROVEN') process.exitCode = 2;
