import {
  buildResearchFetchPlanV1,
  type ResearchFetchPlanV1,
  type ResearchFetchRequestV1,
} from '../atlas/research/local-research-circuit-v1.js';
import type { AceCardV2 } from '../atlas/context/ace-card-selection-v2.js';

export interface AdaptiveDagFetchInput {
  queries: string[];
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  searchFn: (request: ResearchFetchPlanV1['requests'][number]) => Promise<{
    candidateOrdinals: number[];
    cards: AceCardV2[];
  }>;
}

export interface AdaptiveDagFetchResult {
  fetchPlan: ResearchFetchPlanV1;
  uniqueFetchCount: number;
  totalSubqueries: number;
  resultsByQuery: Map<string, { candidateOrdinals: number[]; cards: AceCardV2[] }>;
  allCards: AceCardV2[];
  allCandidateOrdinals: number[];
}

/**
 * Executes multi-query DAG fetch-plan coalescing while strictly preserving distinct card identity.
 * Conforms to DAG-FETCH-01 in openspec/changes/parent-atlas-adaptive-dag-fabric/tasks.md.
 */
export async function executeAdaptiveDagFetch(
  input: AdaptiveDagFetchInput
): Promise<AdaptiveDagFetchResult> {
  const requests: ResearchFetchRequestV1[] = input.queries.map((query) => ({
    query,
    workspaceRevision: input.workspaceRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
  }));

  const fetchPlan = buildResearchFetchPlanV1(requests);
  const payloadByRequestId = new Map<string, { candidateOrdinals: number[]; cards: AceCardV2[] }>();

  // Upstream fetch executes only once per coalesced request ID
  for (const req of fetchPlan.requests) {
    const searchResult = await input.searchFn(req);
    payloadByRequestId.set(req.requestId, searchResult);
  }

  // Map results back to each original query alias
  const resultsByQuery = new Map<string, { candidateOrdinals: number[]; cards: AceCardV2[] }>();
  const cardMap = new Map<string, AceCardV2>();
  const ordinalSet = new Set<number>();

  for (const ref of fetchPlan.queryPayloadRefs) {
    const payload = payloadByRequestId.get(ref.requestId);
    if (payload) {
      resultsByQuery.set(ref.query, payload);
      for (const card of payload.cards) {
        // Distinct card identity preserved by cardId
        cardMap.set(card.cardId, card);
      }
      for (const ord of payload.candidateOrdinals) {
        if (Number.isInteger(ord) && ord >= 0) {
          ordinalSet.add(ord);
        }
      }
    }
  }

  return {
    fetchPlan,
    uniqueFetchCount: fetchPlan.requests.length,
    totalSubqueries: input.queries.length,
    resultsByQuery,
    allCards: [...cardMap.values()],
    allCandidateOrdinals: [...ordinalSet].sort((a, b) => a - b),
  };
}
