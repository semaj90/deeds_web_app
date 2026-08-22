import { buildAcePacket } from '../context/ace-builder';
import { estimateTokenBudget } from '../context/token-budget';
import type { AceQueryPacket } from '../contracts/ace-query-packet';
import type { QueryAnalysis } from '../contracts/query-analysis';
import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import { fuseCandidatesByRrf } from '../retrieval/candidate-fusion';
import { planQuery } from '../query/query-planner';
import { explainScore } from '../ranking/score-explanation';
import { classifyDomainFromText } from '../../classifier/domain-classifier';

export type SearchRuntimeDomainAnalysis = ReturnType<typeof classifyDomainFromText>;

export interface SearchRuntimeDependencies {
  exactRetriever?: { retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]> };
  sparseRetriever?: { retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]> };
  denseRetriever?: { retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]> };
  astRetriever?: { retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]> };
  graphRetriever?: { retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]> };
  crossEncoder?: { rerank(query: string, candidates: RetrievalCandidate[]): Promise<RetrievalCandidate[]> };
}

export type SearchRuntimeResult = {
  analysis: QueryAnalysis;
  domain_analysis: SearchRuntimeDomainAnalysis;
  ace: AceQueryPacket;
  candidates: RetrievalCandidate[];
  token_budget: number;
  evidence_render: string;
};

function pickCandidateDomainText(candidate: RetrievalCandidate): string {
  const metadata = candidate.metadata ?? {};
  const values = [
    candidate.source_ref,
    metadata.summary,
    metadata.content,
    metadata.title,
    metadata.semantic_title,
    metadata.symbol,
    metadata.kind,
    Array.isArray(metadata.keywords) ? metadata.keywords.join(' ') : null,
  ];

  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .slice(0, 8_192);
}

/**
 * Attach deterministic domain evidence without changing retrieval identity,
 * lane membership, rank, or score.
 *
 * A pre-existing domain_class remains authoritative for this boundary. The
 * keyword classifier is retained as an observation so disagreement is visible
 * rather than silently overwriting persisted/enriched metadata.
 */
export function attachDomainEvidence(candidate: RetrievalCandidate): RetrievalCandidate {
  const observed = classifyDomainFromText(pickCandidateDomainText(candidate));
  const metadata = candidate.metadata ?? {};
  const existingDomain = typeof metadata.domain_class === 'string' && metadata.domain_class.trim()
    ? metadata.domain_class.trim()
    : null;

  return {
    ...candidate,
    metadata: {
      ...metadata,
      domain_class: existingDomain ?? observed.domain,
      domain_class_source: existingDomain
        ? (typeof metadata.domain_class_source === 'string' ? metadata.domain_class_source : 'preexisting')
        : 'keyword_classifier',
      domain_classifier_observation: {
        domain: observed.domain,
        confidence: observed.confidence,
        counts: observed.counts,
      },
    },
  };
}

export class SearchRuntime {
  constructor(private readonly deps: SearchRuntimeDependencies = {}) {}

  async search(query: string, topK = 20): Promise<SearchRuntimeResult> {
    const analysis = planQuery(query, topK);
    const domainAnalysis = classifyDomainFromText(query);
    const lanes: Record<string, RetrievalCandidate[]> = {
      exact: await this.deps.exactRetriever?.retrieve(analysis) ?? [],
      sparse: await this.deps.sparseRetriever?.retrieve(analysis) ?? [],
      dense: await this.deps.denseRetriever?.retrieve(analysis) ?? [],
      ast: await this.deps.astRetriever?.retrieve(analysis) ?? [],
      graph: await this.deps.graphRetriever?.retrieve(analysis) ?? [],
    };

    let candidates = fuseCandidatesByRrf(lanes).slice(0, topK);
    if (this.deps.crossEncoder) {
      candidates = await this.deps.crossEncoder.rerank(query, candidates);
    }

    // Domain classification is feature evidence only. It intentionally happens
    // after RRF and cross-encoder ordering so it cannot become another retrieval
    // lane or an implicit reranking vote.
    const classifiedCandidates = candidates.map(attachDomainEvidence);

    const ace = buildAcePacket({
      query,
      intent: analysis.intent,
      mode: analysis.mode,
      candidates: classifiedCandidates,
    });

    return {
      analysis,
      domain_analysis: domainAnalysis,
      ace,
      candidates: classifiedCandidates.map((candidate) => ({
        ...candidate,
        metadata: {
          ...candidate.metadata,
          score_explanation: explainScore(candidate),
        },
      })),
      token_budget: estimateTokenBudget(query),
      evidence_render: classifiedCandidates.map((candidate) => `${candidate.lane}:${candidate.packet_key}`).join('\n'),
    };
  }
}

export function createSearchRuntime(deps: SearchRuntimeDependencies = {}): SearchRuntime {
  return new SearchRuntime(deps);
}
