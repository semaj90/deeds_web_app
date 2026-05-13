/**
 * src/lib/server/ace/token-aware-context-packer.ts
 *
 * Compatibility adapter from the canonical packed-context engine to the legacy
 * ACE packet shape used by context-assembler callers.
 */

import { packContext } from './token-aware-packer.js';

export type AceContextPacket = {
  query: string;
  tokenBudget: {
    maxInputTokens: number;
    reservedOutputTokens: number;
    estimatedInputTokens: number;
  };
  activeClusterIds: number[];
  selectedSources: Array<{
    id: string;
    type: 'chunk' | 'cluster_summary' | 'graph_triple' | 'wiki_note' | 'file';
    score: number;
    tokenEstimate: number;
    reason: string;
  }>;
  excludedSources: Array<{
    id: string;
    reason: 'duplicate' | 'over_budget' | 'low_score' | 'missing_text' | 'unsafe';
    score?: number;
  }>;
  clusterLenses: Array<{
    clusterId: number;
    summary: string;
    authorityScore?: number;
    topFiles?: string[];
  }>;
  graphTriples: [string, string, string][];
  contextMarkdown: string;
  packedContextJSON: string;
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function num(...values: Array<unknown>): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function scoreByType(type: AceContextPacket['selectedSources'][number]['type']): number {
  switch (type) {
    case 'cluster_summary': return 0.92;
    case 'graph_triple': return 0.84;
    case 'chunk': return 0.68;
    case 'wiki_note': return 0.58;
    case 'file': return 0.46;
  }
}

export function scoreContextCandidate(candidate: any): number {
  const dagOrder = clamp01(num(candidate.dagOrderScore, candidate.dag_order_score));
  const qdrant = clamp01(num(candidate.qdrantScore, candidate.qdrant_score, candidate.score));
  const autoencoder = clamp01(
    num(
      candidate.autoencoderScore,
      candidate.autoencoder_score,
      candidate.encoded64Score,
      candidate.encodedSimilarity
    )
  );
  const pagerank = clamp01(
    num(candidate.pagerankScore, candidate.pagerank_score, candidate.pageRankScore, candidate.authorityScore)
  );
  const attention = clamp01(num(candidate.attentionScore, candidate.attention_score));
  const graph = clamp01(num(candidate.graphProximity, candidate.graph_proximity, candidate.graphDistance));
  const freshness = clamp01(num(candidate.cacheFreshness, candidate.cache_freshness, candidate.freshness));

  return clamp01(
    dagOrder * 0.10 +
    qdrant * 0.15 +
    autoencoder * 0.20 +
    pagerank * 0.15 +
    attention * 0.25 +
    graph * 0.10 +
    freshness * 0.05
  );
}

export interface PackerInput {
  query: string;
  maxTokens?: number;
  clusterSummaries?: Array<{
    clusterId: number;
    summary: string;
    authorityScore?: number;
    clusterPagerank?: number;
    karpathyBlend?: number;
    topFiles?: string[];
    score?: number;
  }>;
  graphTriples?: Array<[string, string, string]>;
  chunks?: Array<{
    id: string;
    text: string;
    filePath?: string;
    clusterId?: number;
    dagOrderScore?: number;
    autoencoderScore?: number;
    attentionScore?: number;
    graphProximity?: number;
    cacheFreshness?: number;
    [key: string]: any;
  }>;
  wikiRows?: Array<{
    id: string;
    text: string;
    score?: number;
    clusterId?: number;
    dagOrderScore?: number;
    autoencoderScore?: number;
    attentionScore?: number;
    graphProximity?: number;
    cacheFreshness?: number;
    [key: string]: any;
  }>;
  rawCode?: Array<{
    id: string;
    text: string;
    score?: number;
    [key: string]: any;
  }>;
  grpoCheckpoints?: Array<{
    hyperedgeHash: string;
    gradeScore: number;
    loraHint?: string;
  }>;
}

export function packAceContext(input: PackerInput): AceContextPacket {
  const maxInputTokens = input.maxTokens || 8192;
  const reservedOutputTokens = 1024;
  // Adapter layer: reuse the canonical token packer, then project its output
    // Project the canonical slots back into the older ACE packet fields.
  const canonical = packContext({
    query: input.query,
    budget: { maxInputTokens, reservedOutputTokens },
    activeClusterIds: [],
    clusterSummaries: input.clusterSummaries?.map((summary) => ({
      clusterId: summary.clusterId,
      label: `Cluster ${summary.clusterId}`,
      summary: summary.summary,
      authorityScore: summary.authorityScore,
      clusterPagerank: summary.clusterPagerank,
      karpathyBlend: summary.karpathyBlend,
      topFiles: summary.topFiles,
    })),
    graphTriples: input.graphTriples,
    chunks: input.chunks,
    wikiRows: input.wikiRows,
    rawCode: input.rawCode,
    grpoCheckpoints: input.grpoCheckpoints,
  });

  const clusterLensById = new Map(
    (input.clusterSummaries ?? []).map((summary) => [summary.clusterId, summary])
  );

  const packet: AceContextPacket = {
    query: input.query,
    tokenBudget: {
      maxInputTokens,
      reservedOutputTokens,
      estimatedInputTokens: canonical.tokenUsed,
    },
    // Preserve the legacy packet fields by translating canonical slots back to
    // ACE's older source/lens model.
    activeClusterIds: canonical.activeClusterIds,
    selectedSources: [
      ...canonical.context.clusterSummaries.map((summary) => ({
        id: `cluster:${summary.clusterId}`,
        type: 'cluster_summary' as const,
        score: summary.score,
        tokenEstimate: summary.tokenCost,
        reason: 'authority_weighted' as const,
      })),
      ...canonical.context.graphTriples.map((triple) => ({
        id: `triple:${triple.triple.join('|')}`,
        type: 'graph_triple' as const,
        score: triple.score,
        tokenEstimate: triple.tokenCost,
        reason: 'budget_allowed' as const,
      })),
      ...canonical.context.directEvidence.map((evidence) => ({
        id: evidence.id,
        type: 'chunk' as const,
        score: evidence.score,
        tokenEstimate: evidence.tokenCost,
        reason: 'budget_allowed' as const,
      })),
      ...canonical.context.priorCaseSummaries.map((priorCase) => ({
        id: priorCase.id,
        type: 'wiki_note' as const,
        score: priorCase.score,
        tokenEstimate: priorCase.tokenCost,
        reason: 'budget_allowed' as const,
      })),
      ...canonical.context.couchViewGroups.map((group) => ({
        id: `couch:${group.view}:${String(group.key)}`,
        type: 'file' as const,
        score: group.score,
        tokenEstimate: group.tokenCost,
        reason: 'budget_allowed' as const,
      })),
    ],
    excludedSources: canonical.telemetry.excludedSourceIds.map((entry) => ({
      id: entry.id,
      reason: 'over_budget' as const,
      score: undefined,
    })),
    clusterLenses: canonical.context.clusterSummaries.map((summary) => {
      const original = clusterLensById.get(summary.clusterId);
      return {
        clusterId: summary.clusterId,
        summary: summary.summary,
        authorityScore: original?.authorityScore,
        topFiles: original?.topFiles,
      };
    }),
    graphTriples: canonical.context.graphTriples.map((triple) => triple.triple),
    contextMarkdown: '',
    packedContextJSON: '',
  };

  const markdownSections: string[] = [];
  if (packet.clusterLenses.length) {
    markdownSections.push('## Cluster Lenses');
    for (const lens of packet.clusterLenses) {
      const meta = [
        lens.authorityScore != null ? `authority=${lens.authorityScore.toFixed(3)}` : '',
        lens.topFiles?.length ? `topFiles=${lens.topFiles.slice(0, 5).join(', ')}` : '',
      ].filter(Boolean).join(' · ');
      markdownSections.push(`- Cluster ${lens.clusterId}${meta ? ` (${meta})` : ''}: ${lens.summary}`);
    }
  }
  if (packet.graphTriples.length) {
    markdownSections.push('## Graph Triples');
    for (const triple of packet.graphTriples) {
      markdownSections.push(`- ${triple[0]} ${triple[1]} ${triple[2]}`);
    }
  }
  if (packet.selectedSources.length) {
    markdownSections.push('## Selected Sources');
    for (const source of packet.selectedSources) {
      markdownSections.push(`- ${source.type}: ${source.id} (score=${source.score.toFixed(3)}, tokens=${source.tokenEstimate})`);
    }
  }
  if (canonical.context.directEvidence.length || canonical.context.priorCaseSummaries.length || canonical.context.couchViewGroups.length) {
    markdownSections.push('## Packed Content');
    for (const s of canonical.context.clusterSummaries) {
      markdownSections.push(`### Cluster ${s.clusterId} — ${s.label}`);
      markdownSections.push(s.summary);
    }
    for (const triple of canonical.context.graphTriples) {
      markdownSections.push(`### Graph Triples`);
      markdownSections.push(`- ${triple.triple[0]} ${triple.triple[1]} ${triple.triple[2]}`);
    }
    for (const e of canonical.context.directEvidence) {
      markdownSections.push(`### Chunk: ${e.id}`);
      markdownSections.push('```');
      markdownSections.push(e.text);
      markdownSections.push('```');
    }
    for (const p of canonical.context.priorCaseSummaries) {
      markdownSections.push(`### Prior Case: ${p.id}`);
      markdownSections.push(p.text);
    }
  }

  packet.contextMarkdown = markdownSections.join('\n');
  packet.packedContextJSON = JSON.stringify({
    // Preserve the compact legacy cache payload for downstream consumers.
    c: packet.activeClusterIds,
    grpo: input.grpoCheckpoints?.map((cp) => ({ id: cp.hyperedgeHash, r: cp.gradeScore, l: cp.loraHint })) || [],
    srcs: packet.selectedSources.map((s) => ({
      t: s.type === 'cluster_summary' ? 'sum' : s.type === 'wiki_note' ? 'wiki' : s.type === 'graph_triple' ? 'tri' : s.type === 'chunk' ? 'chk' : 'file',
      id: s.id,
      s: Number(s.score.toFixed(3)),
    })),
    g: packet.graphTriples,
  });

  return packet;
}
