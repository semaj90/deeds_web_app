import { buildAcePacket } from '../context/ace-builder';
import { estimateTokenBudget } from '../context/token-budget';
import type { AceQueryPacket } from '../contracts/ace-query-packet';
import type { QueryAnalysis } from '../contracts/query-analysis';
import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import { fuseCandidatesByRrf } from '../retrieval/candidate-fusion';
import { planQuery } from '../query/query-planner';
import { explainScore } from '../ranking/score-explanation';

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
  ace: AceQueryPacket;
  candidates: RetrievalCandidate[];
  token_budget: number;
  evidence_render: string;
};

export class SearchRuntime {
  constructor(private readonly deps: SearchRuntimeDependencies = {}) {}

  async search(query: string, topK = 20): Promise<SearchRuntimeResult> {
    const analysis = planQuery(query, topK);
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

    const ace = buildAcePacket({
      query,
      intent: analysis.intent,
      mode: analysis.mode,
      candidates,
    });

    return {
      analysis,
      ace,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        metadata: {
          ...candidate.metadata,
          score_explanation: explainScore(candidate),
        },
      })),
      token_budget: estimateTokenBudget(query),
      evidence_render: candidates.map((candidate) => `${candidate.lane}:${candidate.packet_key}`).join('\n'),
    };
  }
}

export function createSearchRuntime(deps: SearchRuntimeDependencies = {}): SearchRuntime {
  return new SearchRuntime(deps);
}

