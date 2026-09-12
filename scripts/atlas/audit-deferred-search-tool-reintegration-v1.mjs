#!/usr/bin/env node
/**
 * SEARCH-REINTEGRATION-01..07
 *
 * Static/read-only inventory of auxiliary search/tool surfaces that are
 * intentionally NOT part of the current Parent Atlas logic critical path.
 *
 * This audit does not call MCP servers, does not enable tools, and does not
 * authorize retrieval, identity, cache, model, graph, or datastore writes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT = path.join(ROOT, 'docs/reports/deferred-search-tool-reintegration-v1.json');
const noReport = process.argv.includes('--no-report');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

function collectMcpConfiguration() {
  const config = readJson('opencode.json');
  const servers = config?.mcp ?? config?.mcpServers ?? {};
  const rows = [];
  for (const [name, value] of Object.entries(servers)) {
    rows.push({
      name,
      enabled: value?.enabled !== false,
      type: value?.type ?? null,
      url: value?.url ?? value?.command ?? null,
      classification:
        name === 'trace'
          ? 'OBSERVABILITY_DEFERRED_FROM_LOGIC_CRITICAL_PATH'
          : name === 'atlas-task-kernel'
            ? 'DISABLED_REENABLE_GATE_REQUIRED'
            : name === 'atlas-tools'
              ? 'AUXILIARY_TOOL_SURFACE'
              : 'REVIEW_REQUIRED',
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function rg(pattern) {
  try {
    const stdout = execFileSync(
      'rg',
      [
        '-n', '--no-heading', '--color', 'never',
        '--glob', '!node_modules/**',
        '--glob', '!dist/**',
        '--glob', '!build/**',
        '--glob', '!.tmp/**',
        '--glob', '!docs/reports/**',
        pattern,
        'opencode.json', 'scripts', 'services', 'python', 'packages', 'sveltekit-frontend/src', 'openspec/changes',
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout.trim().split(/\r?\n/).filter(Boolean).slice(0, 250);
  } catch (error) {
    if (error?.status === 1) return [];
    return [`RG_ERROR:${error instanceof Error ? error.message : String(error)}`];
  }
}

const placeholderPatterns = [
  'semantic_search',
  'map_dependencies',
  'find_similar_code',
  'turbo-search',
  'nlp_search',
];

const challengerPatterns = [
  'vibreti',
  'VibeRetriever',
  'TurboVec',
  'turbovec',
];

const nlpPatterns = [
  '/ast/chunk',
  'chunk/keywords',
  'chunk/nouns',
  'chunk/concepts',
  'chunk/domain',
  'chunk/summary',
  '8095',
];

const mcp = collectMcpConfiguration();
const placeholderHits = Object.fromEntries(placeholderPatterns.map((pattern) => [pattern, rg(pattern)]));
const challengerHits = Object.fromEntries(challengerPatterns.map((pattern) => [pattern, rg(pattern)]));
const nlpSidecarHits = Object.fromEntries(nlpPatterns.map((pattern) => [pattern, rg(pattern)]));

const trace = mcp.find((row) => row.name === 'trace') ?? null;
const taskKernel = mcp.find((row) => row.name === 'atlas-task-kernel') ?? null;
const atlasTools = mcp.find((row) => row.name === 'atlas-tools') ?? null;

const gates = {
  SEARCH_REINTEGRATION_01: {
    status: 'INVENTORIED_DEFERRED',
    rule: 'Inventory disabled/unregistered/auxiliary search surfaces without enabling or calling them.',
  },
  SEARCH_REINTEGRATION_02: {
    status: 'FUTURE_GATE',
    requiredIdentity: [
      'workspaceRevision',
      'sourceRevision',
      'sourceRef',
      'packetKey',
      'canonicalChunkId',
      'evidenceRefs',
      'producerRevision',
    ],
    rule: 'No reintegrated tool may synthesize canonical IDs or revisions.',
  },
  SEARCH_REINTEGRATION_03: {
    status: trace?.enabled ? 'TRACE_PRESENT_OBSERVABILITY_ONLY' : 'TRACE_DISABLED',
    rule: 'Trace MCP may observe execution but may not own retrieval, relevance, canonical identity, or evidence authority.',
  },
  SEARCH_REINTEGRATION_04: {
    status: 'NLP_SIDECAR_DEFERRED_EXECUTOR',
    required: ['grounded spans', 'producerRevision', 'revision-qualified input', 'zero canonical ID minting', 'zero datastore writes'],
    rule: 'NLP sidecar remains an enrichment/AST executor, not current logic priority.',
  },
  SEARCH_REINTEGRATION_05: {
    status: 'VIBRETI_TURBOVEC_CHALLENGER_DEFERRED',
    rule: 'Vibreti/TurboVec-like search/ranking may execute over admitted candidates or semantic_768, but may not become a new RRF lane.',
  },
  SEARCH_REINTEGRATION_06: {
    status: taskKernel?.enabled === false ? 'TASK_KERNEL_DISABLED_AS_EXPECTED' : 'TASK_KERNEL_REVIEW_REQUIRED',
    rule: 'atlas-task-kernel remains disabled until non-placeholder handlers, deterministic replay, fail-closed identity, and health receipts exist.',
  },
  SEARCH_REINTEGRATION_07: {
    status: 'FUTURE_REENABLE_PREFLIGHT',
    rule: 'Before any enablement, rerun startup/unreachable/tool-response audits and prove outages only degrade the optional surface.',
  },
};

const logicPivot = [
  {
    priority: 0,
    owner: 'parent-atlas-retrieval-lineage-dag-convergence',
    gate: 'CURRENT_SOURCE_PACKET_CHUNK_RECONCILIATION',
    action: 'Run the bounded selected-snapshot packet/chunk v2 planner and classify the exact identity/lineage blocker.',
  },
  {
    priority: 1,
    owner: 'parent-atlas-candidate-feature-execution-fabric',
    gate: 'CANDIDATE_IDENTITY_AND_SNAPSHOT_BINDING',
    action: 'Bind CandidateOrdinal to a revision-qualified CandidateFeatureSnapshot; CandidateOrdinal remains derived execution identity only.',
  },
  {
    priority: 1,
    owner: 'parent-atlas-retrieval-fusion-reachability',
    gate: 'RRF_LOGICAL_LANE_CONVERGENCE',
    action: 'Eliminate executor-as-lane vote inflation; one semantic logical vote, one lexical logical vote, with within-lane dedupe before RRF.',
  },
  {
    priority: 1,
    owner: 'parent-atlas-query-routing-classifier',
    gate: 'REVISION_QUALIFIED_QUERY_ROUTING',
    action: 'Make routing/classifier outputs revision-qualified evidence only; routing must not mint source/chunk authority.',
  },
  {
    priority: 2,
    owner: 'parent-atlas-ontology-kernel',
    gate: 'ONTOLOGY_ADMISSION',
    action: 'Resolve classifier/concept evidence through canonical concept registry before OntologyLinkedTupleV1 admission; labels remain evidence.',
  },
  {
    priority: 2,
    owner: 'parent-atlas-retrieval-lod-algorithm-taxonomy',
    gate: 'CHUNK_FILE_DIRECTORY_PROFILE_NORMALIZATION',
    action: 'Normalize existing chunk features into ChunkRetrievalProfileV1 then derive FileProfileV1 and DirectoryProfileV1 without adding a datastore.',
  },
  {
    priority: 2,
    owner: 'parent-atlas-ace-rlm-bitfrost-integration',
    gate: 'CANDIDATE_MANIFEST_PAGINATION',
    action: 'Freeze ordered candidate universe using candidateSetChecksum + rankingRevision and use cursor pagination after reranking.',
  },
  {
    priority: 3,
    owner: 'parent-atlas-neural-prefill-encoder',
    gate: 'CONTEXT_MANIFEST_EXACT_BINDING',
    action: 'Bind ContextManifest to exact CandidateFeature/FEAT-04 cohort checksums; keep neural caller shadow-only until quality gates pass.',
  },
];

const deterministic = {
  schema: 'atlas.deferred-search-tool-reintegration.v1',
  gate: 'DEFERRED-SEARCH-TOOL-REINTEGRATION-01',
  mode: 'STATIC_READ_ONLY',
  mcp,
  observed: {
    trace,
    atlasTools,
    taskKernel,
    placeholderHits,
    challengerHits,
    nlpSidecarHits,
  },
  gates,
  currentPriority: {
    externalToolPlumbing: 'DEFERRED_NON_BLOCKING',
    logicContracts: 'ACTIVE',
    logicPivot,
  },
  authorization: {
    enableTools: false,
    callExternalTools: false,
    promoteExecutorToLane: false,
    mutateDatastores: false,
    mutateModels: false,
  },
  writesPerformed: false,
};

const report = {
  ...deterministic,
  generatedAt: new Date().toISOString(),
  checksum: `sha256:${sha256(JSON.stringify(deterministic))}`,
};

if (!noReport) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  status: 'DEFERRED_SEARCH_TOOL_REINTEGRATION_AUDIT_COMPLETE',
  trace: gates.SEARCH_REINTEGRATION_03.status,
  taskKernel: gates.SEARCH_REINTEGRATION_06.status,
  currentPriority: deterministic.currentPriority.externalToolPlumbing,
  nextLogicGate: logicPivot[0],
  reportPath: noReport ? null : path.relative(ROOT, REPORT),
  writesPerformed: false,
}, null, 2));
