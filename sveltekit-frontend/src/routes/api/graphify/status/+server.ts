/**
 * GET /api/graphify/status
 *
 * Lane readiness aggregation for graphify daily pipeline.
 *
 * Aggregates all 6 stages of graphify:daily and splits status into:
 *   - coreStructural (required for operation)
 *   - optionalEnrichment (recommended, not blocking)
 *   - gatedIntegrations (auth/config required to enable)
 *
 * Returns:
 *   {
 *     status: { coreStructural: PASS|WARN|FAIL, optionalEnrichment: ..., gatedIntegrations: ... },
 *     blockingLanes: [...],
 *     nonBlockingLanes: [{ lane, state, reason }, ...],
 *     pipeline: { stage, ready, message },
 *     nextSafeActions: [...]
 *   }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

type EvidenceState = 'ACTIVE_VERIFIED' | 'ACTIVE_DEGRADED' | 'GATED' | 'REFERENCE_ONLY' | 'SUPERSEDED' | 'FAILED';

interface LanePolicy {
  requiredForStructuralReady: boolean;
  requiredForProductionReady: boolean;
  state: EvidenceState;
  reason?: string;
  expectedGate?: string;
}

const lanePolicies: Record<string, LanePolicy> = {
  treeSitterAstFacts: {
    requiredForStructuralReady: true,
    requiredForProductionReady: true,
    state: 'ACTIVE_VERIFIED',
    reason: 'AST extraction from TypeScript, JavaScript, Svelte files',
  },
  socraticodeGraphFacts: {
    requiredForStructuralReady: true,
    requiredForProductionReady: true,
    state: 'ACTIVE_VERIFIED',
    reason: 'Graph relationships from codebase structure',
  },
  usedConceptEdgeProjection: {
    requiredForStructuralReady: true,
    requiredForProductionReady: true,
    state: 'ACTIVE_VERIFIED',
    reason: '173K+ USED_CONCEPT edges in Neo4j',
  },
  topologyAuthorityBackfill: {
    requiredForStructuralReady: true,
    requiredForProductionReady: true,
    state: 'ACTIVE_VERIFIED',
    reason: 'PageRank + community detection topology',
  },
  okfExport: {
    requiredForStructuralReady: false,
    requiredForProductionReady: false,
    state: 'REFERENCE_ONLY',
    reason: 'Optional export surface; no runtime dependency',
  },
  knowledgeLayerContract: {
    requiredForStructuralReady: false,
    requiredForProductionReady: false,
    state: 'REFERENCE_ONLY',
    reason: 'Optional knowledge-layer export not yet introduced',
  },
  bitfrostAudit: {
    requiredForStructuralReady: false,
    requiredForProductionReady: false,
    state: 'GATED',
    reason: 'Authentication intentionally unavailable',
    expectedGate: 'authentication',
  },
};

interface GraphifyPipelineStage {
  name: string;
  command: string;
  ready: boolean;
  message: string;
}

async function probeService(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

function aggregateStatus(
  lanes: Record<string, { state: EvidenceState }>,
  mode: 'structural' | 'production'
): { status: 'PASS' | 'WARN' | 'FAIL'; blockingLanes: string[]; nonBlockingLanes: Array<{ lane: string; state: EvidenceState; reason: string }> } {
  const policy = mode === 'structural' ? (p: LanePolicy) => p.requiredForStructuralReady : (p: LanePolicy) => p.requiredForProductionReady;

  const required = Object.entries(lanePolicies).filter(([_, pol]) => policy(pol));
  const optional = Object.entries(lanePolicies).filter(([_, pol]) => !policy(pol));

  const blockingFailed = required.filter(([name]) => lanes[name]?.state === 'FAILED');
  const blockingDegraded = required.filter(([name]) => ['ACTIVE_DEGRADED', 'GATED'].includes(lanes[name]?.state));

  const nonBlockingStates = optional.map(([name, pol]) => ({
    lane: name,
    state: (lanes[name]?.state ?? pol.state) as EvidenceState,
    reason: pol.reason ?? '',
  }));

  return {
    status: blockingFailed.length > 0 ? 'FAIL' : blockingDegraded.length > 0 ? 'WARN' : 'PASS',
    blockingLanes: blockingFailed.map(([name]) => name),
    nonBlockingLanes: nonBlockingStates,
  };
}

async function checkGraphifyStages(): Promise<GraphifyPipelineStage[]> {
  const gemma4Ok = await probeService(`${ENV.LOCAL_OPENAI_BASE_URL}/health`, 2000);
  const ollamaOk = await probeService(`${ENV.OLLAMA_BASE_URL}/api/tags`, 2000);
  const qdrantOk = await probeService(`${ENV.QDRANT_URL}`, 2000);
  const postgresOk = await probeService(`http://127.0.0.1:5434`, 2000).catch(() => false);

  return [
    {
      name: 'validate',
      command: 'npm run graphify:validate',
      ready: gemma4Ok && ollamaOk && qdrantOk && postgresOk,
      message: gemma4Ok && ollamaOk && qdrantOk && postgresOk ? 'All services healthy' : 'Service health check failed',
    },
    {
      name: 'materialize',
      command: 'npm run graphify:materialize:apply',
      ready: postgresOk,
      message: postgresOk ? 'Postgres available' : 'Postgres unavailable',
    },
    {
      name: 'summarize',
      command: 'node daily-graphify-cold-processing.mjs',
      ready: ollamaOk && qdrantOk,
      message: ollamaOk && qdrantOk ? 'Ollama + Qdrant ready' : 'Summarization backends unavailable',
    },
    {
      name: 'fanout',
      command: 'npm run atlas:phase8:fanout:apply',
      ready: postgresOk,
      message: postgresOk ? 'Postgres available' : 'Postgres unavailable',
    },
    {
      name: 'qdrant-tag-mirror',
      command: 'npm run atlas:qdrant:tag-mirror:apply',
      ready: qdrantOk,
      message: qdrantOk ? 'Qdrant ready' : 'Qdrant unavailable',
    },
    {
      name: 'qdrant-feature-sync',
      command: 'npm run atlas:qdrant:feature-map-sync:apply',
      ready: qdrantOk,
      message: qdrantOk ? 'Qdrant ready' : 'Qdrant unavailable',
    },
  ];
}

export const GET: RequestHandler = async () => {
  const stages = await checkGraphifyStages();

  // Map stages to lanes
  const lanes: Record<string, { state: EvidenceState }> = {
    treeSitterAstFacts: { state: stages[1]?.ready ? 'ACTIVE_VERIFIED' : 'ACTIVE_DEGRADED' },
    socraticodeGraphFacts: { state: stages[1]?.ready ? 'ACTIVE_VERIFIED' : 'ACTIVE_DEGRADED' },
    usedConceptEdgeProjection: { state: stages[3]?.ready ? 'ACTIVE_VERIFIED' : 'ACTIVE_DEGRADED' },
    topologyAuthorityBackfill: { state: stages[3]?.ready ? 'ACTIVE_VERIFIED' : 'ACTIVE_DEGRADED' },
    okfExport: { state: 'REFERENCE_ONLY' },
    knowledgeLayerContract: { state: 'REFERENCE_ONLY' },
    bitfrostAudit: { state: 'GATED' },
  };

  const agg = aggregateStatus(lanes, 'structural');

  const allStagesReady = stages.every((s) => s.ready);

  return json(
    {
      status: {
        coreStructural: agg.status,
        optionalEnrichment: agg.nonBlockingLanes.some((l) => l.state === 'REFERENCE_ONLY') ? 'REFERENCE_ONLY' : 'PASS',
        gatedIntegrations: agg.nonBlockingLanes.some((l) => l.state === 'GATED') ? 'GATED' : 'PASS',
      },
      blockingLanes: agg.blockingLanes,
      nonBlockingLanes: agg.nonBlockingLanes,
      pipeline: {
        allReady: allStagesReady,
        stages,
        readyToRun: stages.slice(0, 1).every((s) => s.ready),
        nextSafeAction: allStagesReady ? 'npm run graphify:daily' : 'Fix service health first',
      },
      recommendations: {
        coreStructuralPass: agg.status === 'PASS',
        canProceedWithGraphify: stages.slice(0, 1).every((s) => s.ready),
        warnings: agg.blockingLanes.length > 0 ? agg.blockingLanes : [],
      },
      timestamp: new Date().toISOString(),
    },
    { headers: cacheControl.short }
  );
};
