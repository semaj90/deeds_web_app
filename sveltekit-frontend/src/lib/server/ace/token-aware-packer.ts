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
  qdrantHits: Array<{ filePath?: string; content?: string; score?: number; somCluster?: number }>,
  clusterScoreMap: Map<number, number>,
  maxSlots: number
): EvidenceSlot[] {
  return qdrantHits
    .slice(0, maxSlots * 2)
    .map((h) => {
      const qdrantScore   = h.score ?? 0;
      const clusterMatch  = clusterScoreMap.get(h.somCluster ?? -1) ?? 0;
      const contextScore  = qdrantScore * 0.30 + clusterMatch * 0.15;
      const text          = String(h.content ?? '').slice(0, 800);
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
  summaries: Array<{ clusterId: number; label: string; summary: string }>,
  qdrantTagScore: Map<number, number>,
  maxSlots: number
): ClusterSummarySlot[] {
  return summaries
    .slice(0, maxSlots * 2)
    .map((s) => {
      const score   = 0.15 + (qdrantTagScore.get(s.clusterId) ?? 0) * 0.15;
      const text    = `Cluster ${s.clusterId} — ${s.label}: ${s.summary}`;
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
  return triples.slice(0, maxTriples).map((triple, i) => ({
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
  // Group by first key element; count members per group
  const groups = new Map<string, number>();
  for (const row of rows) {
    const groupKey = JSON.stringify(Array.isArray(row.key) ? row.key[0] : row.key).slice(0, 40);
    groups.set(groupKey, (groups.get(groupKey) ?? 0) + 1);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]).slice(0, maxGroups);
  const maxCount = sorted[0]?.[1] ?? 1;
  return sorted.map(([key, count]) => ({
    view,
    key,
    count,
    score: (count / maxCount) * 0.10,   // 0.10 weight for couch lane, scaled by relative frequency
    tokenCost: estimateTokens(`${view}[${key}] ×${count}`),
  }));
}

// ── Budget-aware greedy packer ─────────────────────────────────────────────────

function greedyPack<T extends { score: number; tokenCost: number }>(
  items:     T[],
  remaining: { tokens: number }
): T[] {
  const selected: T[] = [];
  for (const item of items.sort((a, b) => b.score - a.score)) {
    if (remaining.tokens - item.tokenCost < 0) break;
    selected.push(item);
    remaining.tokens -= item.tokenCost;
  }
  return selected;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PackerInput {
  query:         string;
  budget:        TokenBudget;

  // Raw tool results — all optional (packer is tolerant of missing lanes)
  qdrantHits?:       Array<{ filePath?: string; content?: string; score?: number; somCluster?: number }>;
  clusterSummaries?: Array<{ clusterId: number; label: string; summary: string }>;
  graphTriples?:     Array<[string, string, string]>;
  couchRows?:        Array<{ view: string; rows: Array<{ key: unknown; value: unknown }> }>;
  priorCaseTexts?:   Array<{ id: string; text: string; score: number }>;
}

/**
 * Build a token-safe RetrievalPacket from heterogeneous retrieval results.
 * Never exceeds budget.maxInputTokens - budget.reservedOutputTokens.
 */
export function packContext(input: PackerInput): RetrievalPacket {
  const available = input.budget.maxInputTokens - input.budget.reservedOutputTokens;
  const remaining = { tokens: Math.max(available, 0) };

  // Per-slot cluster score map for cross-signal boosting
  const clusterScoreMap = new Map<number, number>(
    (input.clusterSummaries ?? []).map((s, i) => [s.clusterId, 1 - i * 0.05])
  );
  const qdrantTagScore = clusterScoreMap;

  // Build candidate pools (unbudgeted)
  const evidenceCandidates    = buildEvidenceSlots(input.qdrantHits ?? [], clusterScoreMap, 12);
  const summarySlots          = buildClusterSummarySlots(input.clusterSummaries ?? [], qdrantTagScore, 8);
  const tripleSlots           = buildGraphTripleSlots(input.graphTriples ?? [], 20);
  const couchGroups: CouchViewGroup[] = (input.couchRows ?? []).flatMap(({ view, rows }) =>
    buildCouchViewGroups(rows, view, 6)
  );
  const priorCases: EvidenceSlot[]    = (input.priorCaseTexts ?? []).map((p) => ({
    ...p,
    tokenCost: estimateTokens(p.text),
    source: 'prior_case' as const,
  }));

  // Greedy fill: summaries → triples → couchdb groups → evidence chunks → prior cases
  const clusterSummaries = greedyPack(summarySlots, remaining);
  const graphTriples     = greedyPack(tripleSlots, remaining);
  const couchViewGroups  = greedyPack(couchGroups, remaining);
  const directEvidence   = greedyPack(evidenceCandidates, remaining);
  const priorCaseSummaries = greedyPack(priorCases, remaining);

  const tokenUsed = available - remaining.tokens;

  return {
    query:     input.query,
    budget:    input.budget,
    tokenUsed,
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