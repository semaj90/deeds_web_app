/**
 * Token-aware ACE context packer.
 *
 * Staged compression loop:
 *   1. Fetch candidate IDs + summaries (cheap)
 *   2. Fetch raw chunks only for top-scored candidates
 *   3. Compress graph to triples
 *   4. Group CouchDB rows into counts
 *   5. Reserve output tokens
 *   6. Rank all slots by context_score formula
 *   7. Fill budget greedily, coarsest → finest grain
 *
 * context_score = qdrant*0.30 + encoded64*0.15 + graph*0.20 + couch*0.10 + cluster*0.15 + case*0.10
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TokenBudget {
  maxInputTokens:     number;   // e.g. 6000
  reservedOutputTokens: number; // e.g. 1200
}

export interface EvidenceSlot {
  id:           string;
  text:         string;
  score:        number;
  tokenCost:    number;
  source:       'qdrant' | 'postgres' | 'prior_case';
}

export interface ClusterSummarySlot {
  clusterId:    number;
  label:        string;
  summary:      string;
  score:        number;
  tokenCost:    number;
}

export interface GraphTripleSlot {
  triple:       [string, string, string];
  score:        number;
  tokenCost:    number;
}

export interface CouchViewGroup {
  view:         string;
  key:          unknown;
  count:        number;
  score:        number;
  tokenCost:    number;
}

export interface RetrievalPacket {
  query:              string;
  budget:             TokenBudget;
  tokenUsed:          number;
  activeClusterIds:   number[];
  telemetry: {
    selectedSourceIds: string[];
    excludedSourceIds: Array<{ id: string; reason: string }>;
  };
  context: {
    directEvidence:   EvidenceSlot[];
    clusterSummaries: ClusterSummarySlot[];
    graphTriples:     GraphTripleSlot[];
    couchViewGroups:  CouchViewGroup[];
    priorCaseSummaries: EvidenceSlot[];
  };
}

// ── Token estimator ───────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  // ~4 chars per token (conservative BPE estimate)
  return Math.ceil(text.length / 4);
}

// ── Slot builders ─────────────────────────────────────────────────────────────

function buildEvidenceSlots(
  qdrantHits: Array<{
    filePath?: string;
    content?: string;
    text?: string;
    score?: number;
    qdrantScore?: number;
    encoded64Score?: number;
    pagerankScore?: number;
    graphProximity?: number;
    clusterId?: number;
    somCluster?: number;
  }>,
  clusterScoreMap: Map<number, number>,
  maxSlots: number
): EvidenceSlot[] {
  // Blend retrieval, embedding, pagerank, and cluster affinity into one score.
  return qdrantHits
    .slice(0, maxSlots * 2)
    .map((h) => {
      const qdrantScore   = h.qdrantScore ?? h.score ?? 0;
      const encoded64Score = h.encoded64Score ?? 0;
      const pagerankScore = h.pagerankScore ?? 0;
      const graphProximity = h.graphProximity ?? 0;
      const clusterMatch  = clusterScoreMap.get(h.clusterId ?? h.somCluster ?? -1) ?? 0;
      const contextScore  = qdrantScore * 0.30 + encoded64Score * 0.15 + pagerankScore * 0.10 + graphProximity * 0.20 + clusterMatch * 0.15;
      const text          = String(h.content ?? h.text ?? '').trim().slice(0, 800);
      // Emit a compact evidence slot that preserves the highest-signal fields.
      return {
        id:        h.filePath ?? 'unknown',
        text,
        score:     contextScore,
        tokenCost: estimateTokens(text) + 4, // +4 for label overhead
        source:    'qdrant' as const,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSlots);
}

function buildClusterSummarySlots(
  summaries: Array<{
    clusterId: number;
    label: string;
    summary: string;
    authorityScore?: number;
    clusterPagerank?: number;
    karpathyBlend?: number;
    topFiles?: string[];
  }>,
  qdrantTagScore: Map<number, number>,
  maxSlots: number
): ClusterSummarySlot[] {
  // Boost summaries that line up with cluster authority signals.
  return summaries
    .slice(0, maxSlots * 2)
    .map((s) => {
      const authorityBoost = Math.max(s.authorityScore ?? 0, s.clusterPagerank ?? 0, s.karpathyBlend ?? 0);
      const score   = 0.15 + authorityBoost * 0.20 + (qdrantTagScore.get(s.clusterId) ?? 0) * 0.15;
      const text    = `Cluster ${s.clusterId} — ${s.label}: ${s.summary}`;
      // Emit one summary slot per cluster with the authority-derived score.
      return {
        clusterId: s.clusterId,
        label:     s.label,
        summary:   s.summary.slice(0, 300),
        score,
        tokenCost: estimateTokens(text),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSlots);
}

function buildGraphTripleSlots(
  triples: Array<[string, string, string]>,
  maxTriples: number
): GraphTripleSlot[] {
  // Keep graph triples cheap and slightly prefer earlier triples.
  return triples.slice(0, maxTriples).map((triple, i) => ({
    // Preserve the edge itself and attach a gentle position bias.
    triple,
    score:     0.20 - i * 0.005,
    tokenCost: estimateTokens(`[${triple[0]}] —${triple[1]}→ [${triple[2]}]`),
  }));
}

function buildCouchViewGroups(
  rows: Array<{ key: unknown; value: unknown }>,
  view: string,
  maxGroups: number
): CouchViewGroup[] {
  // Group by first key element; count members per group.
  const groups = new Map<string, number>();
  for (const row of rows) {
    const groupKey = JSON.stringify(Array.isArray(row.key) ? row.key[0] : row.key).slice(0, 40);
    groups.set(groupKey, (groups.get(groupKey) ?? 0) + 1);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]).slice(0, maxGroups);
  const maxCount = sorted[0]?.[1] ?? 1;
  // Collapse repeated keys into one group slot with relative frequency.
  return sorted.map(([key, count]) => ({
    view,
    key,
    count,
    score: (count / maxCount) * 0.10,   // 0.10 weight for couch lane, scaled by relative frequency
    tokenCost: estimateTokens(`${view}[${key}] ×${count}`),
  }));
}

// ── Budget-aware greedy packer ─────────────────────────────────────────────────

function greedyPack<T extends { score: number; tokenCost: number; id?: string }>(
  items:     T[],
  remaining: { tokens: number },
  excluded:  Array<{ id: string; reason: string }>
): T[] {
  // Highest-value slots win until the remaining token budget is exhausted.
  const selected: T[] = [];
  for (const item of items.sort((a, b) => b.score - a.score)) {
    if (remaining.tokens - item.tokenCost < 0) {
      if (item.id) excluded.push({ id: item.id, reason: 'token_budget_exceeded' });
      continue;
    }
    selected.push(item);
    remaining.tokens -= item.tokenCost;
  }
  return selected;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PackerInput {
  query:         string;
  budget:        TokenBudget;
  activeClusterIds?: number[];

  // Raw tool results — all optional (packer is tolerant of missing lanes).
  qdrantHits?:       Array<{ filePath?: string; content?: string; score?: number; somCluster?: number }>;
  chunks?:           Array<{
    id: string;
    text: string;
    filePath?: string;
    clusterId?: number;
    qdrantScore?: number;
    pagerankScore?: number;
    encoded64Score?: number;
    graphProximity?: number;
    somCluster?: number;
    [key: string]: unknown;
  }>;
  clusterSummaries?: Array<{
    clusterId: number;
    label?: string;
    summary: string;
    authorityScore?: number;
    clusterPagerank?: number;
    karpathyBlend?: number;
    topFiles?: string[];
  }>;
  graphTriples?:     Array<[string, string, string]>;
  couchRows?:        Array<{ view: string; rows: Array<{ key: unknown; value: unknown }> }>;
  priorCaseTexts?:   Array<{ id: string; text: string; score: number }>;
  wikiRows?:         Array<{ id: string; text: string; score?: number; clusterId?: number }>;
  rawCode?:          Array<{ id: string; text: string; score?: number }>;
  grpoCheckpoints?:  Array<{ hyperedgeHash: string; gradeScore: number; loraHint?: string }>;
}

/**
 * Build a token-safe RetrievalPacket from heterogeneous retrieval results.
 * Never exceeds budget.maxInputTokens - budget.reservedOutputTokens.
 */
export function packContext(input: PackerInput): RetrievalPacket {
  const available = input.budget.maxInputTokens - input.budget.reservedOutputTokens;
  const remaining = { tokens: Math.max(available, 0) };
  const excludedSourceIds: Array<{ id: string; reason: string }> = [];

  // Carry forward any cluster signal already attached to the request.
  const activeClusterIds = Array.from(new Set([
    ...(input.activeClusterIds ?? []),
    ...(input.clusterSummaries ?? []).map((s) => s.clusterId),
    ...(input.qdrantHits ?? []).flatMap((hit) => [hit.clusterId, hit.somCluster]).filter((n): n is number => typeof n === 'number'),
    ...(input.chunks ?? []).flatMap((chunk) => [chunk.clusterId, chunk.somCluster]).filter((n): n is number => typeof n === 'number'),
    ...(input.wikiRows ?? []).map((row) => row.clusterId).filter((n): n is number => typeof n === 'number'),
  ]));

  // Per-slot cluster score map for cross-signal boosting
  const clusterScoreMap = new Map<number, number>(
    (input.clusterSummaries ?? []).map((s, i) => [s.clusterId, 1 - i * 0.05])
  );
  const qdrantTagScore = clusterScoreMap;

  // Build candidate pools (unbudgeted)
  const qdrantHits: Array<{
    filePath?: string;
    content?: string;
    score?: number;
    qdrantScore?: number;
    encoded64Score?: number;
    pagerankScore?: number;
    graphProximity?: number;
    clusterId?: number;
    somCluster?: number;
  }> = [...(input.qdrantHits ?? [])];

  // Normalize chunk lanes into the evidence pool.
  for (const chunk of input.chunks ?? []) {
    const text = String(chunk.text ?? '').trim();
    if (!text) {
      excludedSourceIds.push({ id: chunk.id, reason: 'missing_text' });
      continue;
    }
    qdrantHits.push({
      filePath: chunk.filePath ?? chunk.id,
      content: text,
      score: chunk.qdrantScore ?? chunk.pagerankScore ?? 0,
      qdrantScore: chunk.qdrantScore,
      encoded64Score: chunk.encoded64Score,
      pagerankScore: chunk.pagerankScore,
      graphProximity: chunk.graphProximity,
      somCluster: chunk.somCluster ?? chunk.clusterId,
      clusterId: chunk.clusterId ?? chunk.somCluster,
    });
  }

  // Normalize raw code into the same evidence pool as chunks.
  for (const code of input.rawCode ?? []) {
    const text = String(code.text ?? '').trim();
    if (!text) {
      excludedSourceIds.push({ id: code.id, reason: 'missing_text' });
      continue;
    }
    qdrantHits.push({
      filePath: code.id,
      content: text,
      score: code.score ?? 0,
      qdrantScore: code.score ?? 0,
    });
  }

  // Deduplicate graph triples before slot scoring.
  const normalizedGraphTriples: Array<[string, string, string]> = [];
  const seenGraphTriples = new Set<string>();
  for (const triple of input.graphTriples ?? []) {
    const key = triple.join('|');
    if (seenGraphTriples.has(key)) {
      excludedSourceIds.push({ id: `triple:${key}`, reason: 'duplicate' });
      continue;
    }
    seenGraphTriples.add(key);
    normalizedGraphTriples.push(triple);
  }

  // Convert normalized lanes into ranked slots.
  const evidenceCandidates    = buildEvidenceSlots(qdrantHits, clusterScoreMap, 12);
  const summarySlots          = buildClusterSummarySlots(
    (input.clusterSummaries ?? []).map((summary) => ({
      ...summary,
      label: summary.label ?? `Cluster ${summary.clusterId}`,
    })),
    qdrantTagScore,
    8
  );
  const tripleSlots           = buildGraphTripleSlots(normalizedGraphTriples, 20);
  const couchGroups: CouchViewGroup[] = (input.couchRows ?? []).flatMap(({ view, rows }) =>
    buildCouchViewGroups(rows, view, 6)
  );
  // Fold wiki notes and GRPO checkpoints into the lower-cost memory lane.
  const priorCases: EvidenceSlot[]    = [
    ...(input.priorCaseTexts ?? []).map((p) => ({
      ...p,
      tokenCost: estimateTokens(p.text),
      source: 'prior_case' as const,
    })),
    ...(input.wikiRows ?? []).map((p) => ({
      id: p.id,
      text: p.text,
      score: p.score ?? 0,
      tokenCost: estimateTokens(p.text),
      source: 'prior_case' as const,
    })),
    ...(input.grpoCheckpoints ?? []).map((p) => ({
      id: p.hyperedgeHash,
      text: `GRPO checkpoint ${p.hyperedgeHash} (grade ${p.gradeScore.toFixed(3)}${p.loraHint ? `, ${p.loraHint}` : ''})`,
      score: p.gradeScore,
      tokenCost: estimateTokens(p.hyperedgeHash) + estimateTokens(p.loraHint ?? '') + 12,
      source: 'prior_case' as const,
    })),
  ].filter((p) => Boolean(p.text.trim()));

  // Greedy fill from coarsest to finest granularity.
  const clusterSummaries = greedyPack(summarySlots, remaining, excludedSourceIds);
  const graphTriples     = greedyPack(tripleSlots, remaining, excludedSourceIds);
  const couchViewGroups  = greedyPack(couchGroups, remaining, excludedSourceIds);
  const directEvidence   = greedyPack(evidenceCandidates, remaining, excludedSourceIds);
  const priorCaseSummaries = greedyPack(priorCases, remaining, excludedSourceIds);

  const tokenUsed = available - remaining.tokens;

  // Return the final packed packet with selected slots and excluded overflow.
  return {
    query:     input.query,
    budget:    input.budget,
    tokenUsed,
    activeClusterIds,
    telemetry: {
      selectedSourceIds: directEvidence.map(e => e.id),
      excludedSourceIds,
    },
    context: {
      directEvidence,
      clusterSummaries,
      graphTriples,
      couchViewGroups,
      priorCaseSummaries,
    },
  };
}

/**
 * Serialize a RetrievalPacket into the compact prompt string injected before Gemma4.
 */
export function serializePacket(packet: RetrievalPacket): string {
  // Emit a compact, human-readable prompt block for Gemma4.
  const lines: string[] = [
    `# Retrieval context for: ${packet.query}`,
    `Budget: ${packet.tokenUsed}/${packet.budget.maxInputTokens - packet.budget.reservedOutputTokens} tokens used`,
    '',
  ];

  if (packet.context.clusterSummaries.length) {
    lines.push('## Cluster summaries');
    for (const s of packet.context.clusterSummaries) {
      lines.push(`- Cluster ${s.clusterId} — ${s.label}: ${s.summary}`);
    }
    lines.push('');
  }

  if (packet.context.graphTriples.length) {
    lines.push('## Graph relationships');
    for (const t of packet.context.graphTriples) {
      lines.push(`- [${t.triple[0]}] —${t.triple[1]}→ [${t.triple[2]}]`);
    }
    lines.push('');
  }

  if (packet.context.couchViewGroups.length) {
    lines.push('## Knowledge index groups');
    for (const g of packet.context.couchViewGroups) {
      lines.push(`- ${g.view}[${g.key}]: ${g.count} documents`);
    }
    lines.push('');
  }

  if (packet.context.directEvidence.length) {
    lines.push('## Relevant code / evidence chunks');
    for (const e of packet.context.directEvidence) {
      lines.push(`### ${e.id} (score ${e.score.toFixed(3)})`);
      lines.push(e.text);
      lines.push('');
    }
  }

  if (packet.context.priorCaseSummaries.length) {
    lines.push('## Prior case context');
    for (const p of packet.context.priorCaseSummaries) {
      lines.push(`- ${p.id}: ${p.text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
