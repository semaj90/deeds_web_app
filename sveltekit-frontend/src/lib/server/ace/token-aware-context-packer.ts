/**
 * src/lib/server/ace/token-aware-context-packer.ts
 *
 * Token-aware ACE Context Packer v1 using GraphRAG and PageRank signals.
 * Compresses codebase/wiki chunks into a final prompt payload under a token budget.
 */

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
  const budget = Math.max(0, maxInputTokens - reservedOutputTokens);

  const packet: AceContextPacket = {
    query: input.query,
    tokenBudget: {
      maxInputTokens,
      reservedOutputTokens,
      estimatedInputTokens: 0,
    },
    activeClusterIds: [],
    selectedSources: [],
    excludedSources: [],
    clusterLenses: [],
    graphTriples: [],
    contextMarkdown: '',
    packedContextJSON: '',
  };

  const dedupeKeys = new Set<string>();
  const mdParts: string[] = [];
  const clusterById = new Map<number, { clusterId: number; summary: string; authorityScore?: number; topFiles?: string[]; score: number }>();

  function addActiveClusterId(clusterId?: number | null): void {
    if (typeof clusterId !== 'number' || !Number.isFinite(clusterId)) return;
    if (!packet.activeClusterIds.includes(clusterId)) packet.activeClusterIds.push(clusterId);
  }

  function rememberCluster(summary: { clusterId: number; summary: string; authorityScore?: number; topFiles?: string[]; score: number }): void {
    const existing = clusterById.get(summary.clusterId);
    if (!existing || summary.score > existing.score) clusterById.set(summary.clusterId, summary);
  }

  function tryAdd(
    type: 'chunk' | 'cluster_summary' | 'graph_triple' | 'wiki_note' | 'file',
    id: string,
    text: string,
    score: number,
    dedupeKey?: string,
    tokenEstimateOverride?: number,
    explicitScore?: number,
  ) {
    if (dedupeKey && dedupeKeys.has(dedupeKey)) {
      packet.excludedSources.push({ id, reason: 'duplicate', score });
      return;
    }
    if (!text || text.trim() === '') {
      packet.excludedSources.push({ id, reason: 'missing_text', score });
      return;
    }

    const tokenEstimate = tokenEstimateOverride ?? estimateTokens(text);
    if (packet.tokenBudget.estimatedInputTokens + tokenEstimate > budget) {
      packet.excludedSources.push({ id, reason: 'over_budget', score });
      return;
    }

    packet.tokenBudget.estimatedInputTokens += tokenEstimate;
    if (dedupeKey) dedupeKeys.add(dedupeKey);

    packet.selectedSources.push({
      id,
      type,
      score,
      tokenEstimate,
      reason: score >= 0.8 ? 'authority_weighted' : explicitScore != null ? 'budget_allowed' : 'fallback_selected',
    });

    mdParts.push(text);
  }

  // 1. Pack Cluster Summaries
  if (input.clusterSummaries) {
    const sortedSummaries = [...input.clusterSummaries]
      .map((summary) => {
        const score = Math.max(
          scoreContextCandidate(summary),
          summary.score ?? 0,
          summary.authorityScore ?? 0,
          summary.clusterPagerank ?? 0,
          summary.karpathyBlend ?? 0,
          scoreByType('cluster_summary'),
        );
        return { ...summary, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const sum of sortedSummaries) {
      addActiveClusterId(sum.clusterId);
      rememberCluster(sum);
      const meta = [
        sum.authorityScore != null ? `authority=${sum.authorityScore.toFixed(3)}` : '',
        sum.clusterPagerank != null ? `clusterPagerank=${sum.clusterPagerank.toFixed(3)}` : '',
        sum.karpathyBlend != null ? `karpathy=${sum.karpathyBlend.toFixed(3)}` : '',
        sum.topFiles?.length ? `topFiles=${sum.topFiles.slice(0, 5).join(', ')}` : '',
      ].filter(Boolean).join(' · ');
      const text = `### Cluster ${sum.clusterId}${meta ? ` (${meta})` : ''}\n${sum.summary}`;
      tryAdd('cluster_summary', `cluster:${sum.clusterId}`, text, sum.score, `cluster:${sum.clusterId}`, undefined, sum.score);
    }
  }

  // 2. Pack Graph Triples
  if (input.graphTriples && input.graphTriples.length > 0) {
    const uniqueTriples = new Set<string>();
    const compactTriples: [string, string, string][] = [];
    for (const triple of input.graphTriples) {
      const key = triple.join('|');
      if (uniqueTriples.has(key)) {
        packet.excludedSources.push({ id: `triple:${key}`, reason: 'duplicate' });
        continue;
      }
      uniqueTriples.add(key);
      compactTriples.push(triple);
      packet.graphTriples.push(triple);
    }
    const tripleLines = compactTriples.map((triple) => `- ${triple[0]} ${triple[1]} ${triple[2]}`);
    const text = `### Graph Triples\n${tripleLines.join('\n')}`;
    tryAdd('graph_triple', 'graph_triples', text, scoreByType('graph_triple'), 'graph_triples_block', undefined, scoreByType('graph_triple'));
  }

  // 3. Pack Chunks
  if (input.chunks) {
    const sortedChunks = [...input.chunks]
      .map((chunk) => {
        const score = Math.max(
          scoreContextCandidate(chunk),
          chunk.score ?? 0,
          chunk.qdrantScore ?? 0,
          chunk.pagerankScore ?? 0,
          chunk.authorityScore ?? 0,
          chunk.clusterPagerank ?? 0,
          chunk.karpathyBlend ?? 0,
          scoreByType('chunk'),
        );
        return { ...chunk, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const chunk of sortedChunks) {
      addActiveClusterId(chunk.clusterId);
      const fileKey = chunk.filePath ?? chunk.id;
      const dedupeKey = [chunk.id, chunk.filePath, chunk.clusterId].filter(Boolean).join('|');
      const text = `### Chunk: ${fileKey}\n\`\`\`\n${chunk.text}\n\`\`\``;
      tryAdd('chunk', chunk.id, text, chunk.score, dedupeKey, undefined, chunk.score);
    }
  }

  // 4. Pack CouchDB Wiki Notes
  if (input.wikiRows) {
    const sortedWiki = [...input.wikiRows]
      .map((row) => {
        const score = Math.max(scoreContextCandidate(row), row.score ?? 0, scoreByType('wiki_note'));
        return { ...row, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const row of sortedWiki) {
      const text = `### Wiki Note: ${row.id}\n${row.text}`;
      tryAdd('wiki_note', row.id, text, row.score, `wiki:${row.id}`, undefined, row.score);
    }
  }

  // 5. Pack Raw Code (if budget remains)
  if (input.rawCode) {
    const sortedCode = [...input.rawCode]
      .map((row) => {
        const score = Math.max(scoreContextCandidate(row), row.score ?? 0, scoreByType('file'));
        return { ...row, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const row of sortedCode) {
      const text = `### File: ${row.id}\n\`\`\`\n${row.text}\n\`\`\``;
      tryAdd('file', row.id, text, row.score, `file:${row.id}`, undefined, row.score);
    }
  }

  packet.clusterLenses = Array.from(clusterById.values())
    .sort((a, b) => b.score - a.score)
    .map(({ clusterId, summary, authorityScore, topFiles }) => ({
      clusterId,
      summary,
      authorityScore,
      topFiles,
    }));

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
  if (mdParts.length) {
    markdownSections.push('## Packed Content');
    markdownSections.push(...mdParts);
  }

  packet.contextMarkdown = markdownSections.join('\n');

  // Minified JSON payload for agentic tool calling memory assistance
  const minifiedJSON = {
    c: packet.activeClusterIds, // clusters
    grpo: input.grpoCheckpoints?.map(cp => ({ id: cp.hyperedgeHash, r: cp.gradeScore, l: cp.loraHint })) || [], // GRPO injections
    srcs: packet.selectedSources.map(s => ({ t: s.type === 'cluster_summary' ? 'sum' : s.type === 'wiki_note' ? 'wiki' : 'chk', id: s.id, s: Number(s.score.toFixed(3)) })), // selected sources
    g: packet.graphTriples // graph triples
  };
  packet.packedContextJSON = JSON.stringify(minifiedJSON);

  return packet;
}
