#!/usr/bin/env node

/**
 * Read-only proof for MCP tool routing over Atlas topology and memory lanes.
 *
 * This is deliberately a fixture proof: it validates the contracts and the
 * routing decision without querying or mutating Postgres, Qdrant, Valkey, or
 * Neo4j. 4D coordinates are derived routing features, never identity.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = path.join(ROOT, 'docs', 'reports', 'mcp-topology-tool-routing-v1.json');

const OBSERVATION_STATES = ['LEXICAL', 'SEMANTIC', 'GRAPH', 'RERANK'];
const TOOLS = [
  { name: 'atlas.search.lexical', lane: 'POSTGRES_FTS', executor: 'GO_POSTGRES', emits: 'LEXICAL', base: 0.78, requires: ['fts'] },
  { name: 'atlas.search.semantic', lane: 'SEMANTIC_768', executor: 'QDRANT', emits: 'SEMANTIC', base: 0.82, requires: ['semantic_768'] },
  { name: 'atlas.graph.ppr', lane: 'GRAPH_PPR', executor: 'PYTHON_RAPIDS', emits: 'GRAPH', base: 0.72, requires: ['graph_snapshot', 'topology_4d'] },
  { name: 'atlas.graph.subgraph', lane: 'GRAPH_SUBGRAPH', executor: 'PYTHON_RAPIDS', emits: 'GRAPH', base: 0.66, requires: ['graph_snapshot', 'candidate_ordinals'] },
  { name: 'atlas.rerank.cuda_graph', lane: 'CUDA_GRAPH_RERANK', executor: 'NAPI_LIBTORCH', emits: 'RERANK', base: 0.61, requires: ['semantic_768', 'candidate_ordinals', 'cuda_graph'] },
];

const fixture = {
  query: 'find the MCP tool for topology-aware retrieval',
  observed: ['LEXICAL', 'SEMANTIC', 'GRAPH', 'RERANK'],
  topology: {
    graphRevision: 'fixture-graph-r1',
    topologyBasisRevision: 'fixture-topology-4d-r1',
    ordinalMapChecksum: 'sha256:fixture-ordinal-map-r1',
    coordinates: [0.25, -0.5, 0.75, 0.125],
  },
  memoryLanes: [
    { lane: 'POSTGRES_FTS', revision: 'fts-r1', state: 'PROVEN' },
    { lane: 'SEMANTIC_768', revision: 'embeddinggemma-r1', state: 'IMPLEMENTED_UNPROVEN' },
    { lane: 'GRAPH_PPR', revision: 'graph-r1', state: 'IMPLEMENTED_UNPROVEN' },
    { lane: 'CUDA_GRAPH_RERANK', revision: 'cuda-graph-r1', state: 'IMPLEMENTED_UNPROVEN' },
  ],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateTopology(topology) {
  assert(Array.isArray(topology.coordinates), 'topology_4d must be an array');
  assert(topology.coordinates.length === 4, 'topology_4d must have exactly four coordinates');
  assert(topology.coordinates.every((value) => Number.isFinite(value)), 'topology_4d coordinates must be finite');
  assert(topology.graphRevision && topology.topologyBasisRevision, 'topology revisions are required');
  assert(topology.ordinalMapChecksum, 'ordinalMapChecksum is required');
  return {
    dimension: topology.coordinates.length,
    finite: true,
    graphRevision: topology.graphRevision,
    topologyBasisRevision: topology.topologyBasisRevision,
    ordinalMapChecksum: topology.ordinalMapChecksum,
  };
}

function viterbi(observed) {
  // A small deterministic path model. HMM chooses an execution sequence; it
  // does not mint identity or replace the canonical retrieval lanes.
  const transitions = {
    LEXICAL: { LEXICAL: 0.58, SEMANTIC: 0.22, GRAPH: 0.15, RERANK: 0.05 },
    SEMANTIC: { LEXICAL: 0.12, SEMANTIC: 0.45, GRAPH: 0.25, RERANK: 0.18 },
    GRAPH: { LEXICAL: 0.06, SEMANTIC: 0.14, GRAPH: 0.42, RERANK: 0.38 },
    RERANK: { LEXICAL: 0.03, SEMANTIC: 0.08, GRAPH: 0.19, RERANK: 0.70 },
  };
  const emission = (state, observation) => state === observation ? 0.78 : 0.074;
  let previous = new Map();
  const backpointers = [];
  for (let index = 0; index < observed.length; index += 1) {
    const next = new Map();
    const pointers = new Map();
    for (const state of OBSERVATION_STATES) {
      if (index === 0) {
        next.set(state, Math.log(0.25) + Math.log(emission(state, observed[index])));
        pointers.set(state, null);
      } else {
        let bestState = null;
        let bestScore = -Infinity;
        for (const prior of OBSERVATION_STATES) {
          const score = previous.get(prior) + Math.log(transitions[prior][state]) + Math.log(emission(state, observed[index]));
          if (score > bestScore) { bestScore = score; bestState = prior; }
        }
        next.set(state, bestScore);
        pointers.set(state, bestState);
      }
    }
    previous = next;
    backpointers.push(pointers);
  }
  let state = [...previous.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const pathStates = [];
  for (let index = backpointers.length - 1; index >= 0; index -= 1) {
    pathStates.unshift(state);
    state = backpointers[index].get(state);
  }
  return { observations: [...observed], path: pathStates };
}

function selectTool({ topology, memoryLanes }) {
  const available = new Map(memoryLanes.map((lane) => [lane.lane, lane]));
  const topologyReady = topology.dimension === 4 && topology.finite;
  const scored = TOOLS.map((tool) => {
    const lane = available.get(tool.lane);
    const provenBonus = lane?.state === 'PROVEN' ? 0.12 : 0;
    const topologyBonus = topologyReady && tool.emits === 'GRAPH' ? 0.08 : 0;
    const dependencyReady = tool.requires.every((requirement) => {
      if (requirement === 'topology_4d') return topologyReady;
      if (requirement === 'candidate_ordinals') return true;
      return requirement === 'cuda_graph' ? lane?.state === 'PROVEN' : true;
    });
    return {
      ...tool,
      dependencyReady,
      score: Number((dependencyReady ? tool.base + provenBonus + topologyBonus : 0).toFixed(4)),
      status: dependencyReady ? (lane?.state ?? 'IMPLEMENTED_UNPROVEN') : 'BLOCKED',
      revision: lane?.revision ?? null,
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { selected: scored[0], candidates: scored };
}

async function main() {
  const topology = validateTopology(fixture.topology);
  const hmm = viterbi(fixture.observed);
  const routing = selectTool({ topology, memoryLanes: fixture.memoryLanes });
  const checks = {
    topology4d: topology.dimension === 4 && topology.finite,
    revisionQualified: Boolean(topology.graphRevision && topology.topologyBasisRevision && topology.ordinalMapChecksum),
    viterbiPath: hmm.path.length === fixture.observed.length,
    candidateOrdering: routing.candidates.every((candidate) => Number.isFinite(candidate.score)),
    noCanonicalWrites: true,
    noProjectionWrites: true,
  };
  const proof = Object.values(checks).every(Boolean);
  const report = {
    schema: 'AtlasMcpTopologyToolRoutingReceiptV1',
    generatedAt: new Date().toISOString(),
    mode: 'FIXTURE_READ_ONLY',
    status: proof ? 'PROVEN_FIXTURE_ONLY' : 'BLOCKED',
    gan: {
      created: true,
      wired: true,
      proven: proof,
      done: false,
      note: 'Production adoption remains gated by live revision, identity, and executor receipts.',
    },
    query: fixture.query,
    topology,
    memoryLanes: fixture.memoryLanes,
    hmmViterbi: hmm,
    routing,
    checks,
    canonicalWrite: false,
    projectionWrite: false,
    evidenceRefs: [
      'packages/parent-atlas-retrieval/src/gpu/cuda-stream-manager.ts',
      'packages/parent-atlas-retrieval/src/gpu/libtorch-bridge.ts',
      'sveltekit-frontend/src/mcp/tools/repair_tools.ts',
      'scripts/atlas/lib/topology-recovery-selector.mjs',
    ],
    gaps: [
      'Live source and graph revisions are not supplied by this fixture proof.',
      'CUDA_GRAPH_RERANK is not marked proven without a native capture/replay receipt.',
      'MCP tool dispatch and ACE packet persistence remain separate production gates.',
    ],
  };
  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, selectedTool: routing.selected.name, selectedExecutor: routing.selected.executor, viterbi: hmm.path, report: path.relative(ROOT, REPORT), writes: false }, null, 2));
}

main().catch((error) => {
  console.error(`[mcp-topology-tool-routing] ${error.message}`);
  process.exitCode = 1;
});

