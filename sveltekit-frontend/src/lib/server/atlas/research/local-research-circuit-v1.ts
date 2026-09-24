import type { AceCardV2, AceCardSelectionV2Result } from '../context/ace-card-selection-v2.js';
import { selectAceCardsV2 } from '../context/ace-card-selection-v2.js';
import { assertResearchSessionRevision, createResearchKernelSession, sha256, type ResearchKernelSessionV1, type ResearchOperationV1 } from './research-kernel-contract-v1.js';

export type ResearchCoverageV1 = { sufficient: boolean; missing: string[] };

export type ResearchFetchRequestV1 = {
  query: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
};

export type ResearchFetchPlanV1 = {
  schema: 'atlas.research-fetch-plan.v1';
  requests: {
    requestId: string;
    normalizedQuery: string;
    sourceQueries: string[];
    workspaceRevision: string;
    candidateSnapshotRevision: string;
    ordinalMapChecksum: string;
  }[];
  queryPayloadRefs: { query: string; requestId: string }[];
  checksum: string;
  canonicalAuthority: false;
};

function normalizeFetchQuery(query: string): string {
  return query.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** Group only semantically equivalent request tuples; preserve case and all revision coordinates. */
export function buildResearchFetchPlanV1(requests: ResearchFetchRequestV1[]): ResearchFetchPlanV1 {
  const groups = new Map<string, ResearchFetchPlanV1['requests'][number]>();
  const queryPayloadRefs: ResearchFetchPlanV1['queryPayloadRefs'] = [];
  for (const request of requests) {
    const normalizedQuery = normalizeFetchQuery(request.query);
    if (!normalizedQuery) continue;
    const tuple = {
      normalizedQuery,
      workspaceRevision: request.workspaceRevision,
      candidateSnapshotRevision: request.candidateSnapshotRevision,
      ordinalMapChecksum: request.ordinalMapChecksum,
    };
    const requestId = sha256({ schema: 'atlas.research-fetch-request.v1', ...tuple });
    const existing = groups.get(requestId);
    if (existing) {
      if (!existing.sourceQueries.includes(request.query)) existing.sourceQueries.push(request.query);
    } else {
      groups.set(requestId, { requestId, ...tuple, sourceQueries: [request.query] });
    }
    queryPayloadRefs.push({ query: request.query, requestId });
  }
  const body = { schema: 'atlas.research-fetch-plan.v1' as const, requests: [...groups.values()], queryPayloadRefs, canonicalAuthority: false as const };
  return { ...body, checksum: sha256(body), canonicalAuthority: false };
}

export type LocalResearchCircuitInputV1 = {
  session: ResearchKernelSessionV1;
  query: string;
  querySynthesis?: (query: string) => string[];
  search: (request: ResearchFetchPlanV1['requests'][number]) => Promise<{ candidateOrdinals: number[]; cards: AceCardV2[] }>;
  coverage: (cards: AceCardV2[]) => ResearchCoverageV1;
};

export type LocalResearchCircuitResultV1 = {
  schema: 'atlas.local-research-circuit.v1';
  sessionId: string;
  rounds: number;
  subqueries: string[];
  fetchPlan: ResearchFetchPlanV1;
  fetchedPayloads: { requestId: string; payloadChecksum: string; cardIds: string[]; candidateOrdinals: number[] }[];
  candidateOrdinals: number[];
  selection: AceCardSelectionV2Result;
  coverage: ResearchCoverageV1;
  operations: ResearchOperationV1[];
  status: 'SUCCEEDED' | 'BUDGET_EXCEEDED' | 'REVISION_REJECTED';
  checksum: string;
  canonicalAuthority: false;
};

function operation(session: ResearchKernelSessionV1, operationId: string, kind: ResearchOperationV1['kind'], input: unknown, output: unknown, status: ResearchOperationV1['status'] = 'SUCCEEDED'): ResearchOperationV1 {
  return { schema: 'atlas.research-operation.v1', operationId, sessionId: session.sessionId, kind, inputChecksum: sha256(input), outputChecksum: sha256(output), status, canonicalAuthority: false };
}

export async function runLocalResearchCircuitV1(input: LocalResearchCircuitInputV1): Promise<LocalResearchCircuitResultV1> {
  const started = Date.now();
  const session = input.session;
  const ops: ResearchOperationV1[] = [];
  const synthesized = [...new Set((input.querySynthesis?.(input.query) ?? [input.query]).map((value) => value.trim()).filter(Boolean))].slice(0, session.budget.maxSubqueries);
  const fetchPlan = buildResearchFetchPlanV1(synthesized.map((query) => ({
    query,
    workspaceRevision: session.workspaceRevision,
    candidateSnapshotRevision: session.candidateSnapshotRevision,
    ordinalMapChecksum: session.ordinalMapChecksum,
  })));
  const fetchedPayloadByRequestId = new Map<string, { candidateOrdinals: number[]; cards: AceCardV2[] }>();
  const cardsById = new Map<string, AceCardV2>();
  const ordinals = new Set<number>();
  let coverage: ResearchCoverageV1 = { sufficient: false, missing: [] };
  let rounds = 0;
  for (const request of fetchPlan.requests) {
    if (rounds >= session.budget.maxRounds || ops.length >= session.budget.maxOperations || Date.now() - started > session.budget.maxWallTimeMs) break;
    rounds += 1;
    if (ops.length >= session.budget.maxOperations) break;
    const result = await input.search(request);
    fetchedPayloadByRequestId.set(request.requestId, result);
    for (const ordinal of result.candidateOrdinals) if (Number.isInteger(ordinal) && ordinal >= 0) ordinals.add(ordinal);
    for (const card of result.cards) cardsById.set(card.cardId, card);
    ops.push(operation(session, `op:${ops.length + 1}`, 'SEARCH', { requestId: request.requestId, subquery: request.normalizedQuery, sourceQueries: request.sourceQueries }, { candidateOrdinals: [...result.candidateOrdinals].sort((a, b) => a - b), cardIds: result.cards.map((card) => card.cardId).sort() }));
    const selected = selectAceCardsV2({ cards: [...cardsById.values()], query: input.query, workspaceRevision: session.workspaceRevision, candidateSnapshotRevision: session.candidateSnapshotRevision, ordinalMapChecksum: session.ordinalMapChecksum, maxCards: session.budget.maxCards, tokenBudget: session.budget.tokenBudget });
    coverage = input.coverage(selected.selected);
    if (coverage.sufficient) break;
  }
  const selection = selectAceCardsV2({ cards: [...cardsById.values()], query: input.query, workspaceRevision: session.workspaceRevision, candidateSnapshotRevision: session.candidateSnapshotRevision, ordinalMapChecksum: session.ordinalMapChecksum, maxCards: session.budget.maxCards, tokenBudget: session.budget.tokenBudget });
  const fetchedPayloads = fetchPlan.requests.flatMap((request) => {
    const payload = fetchedPayloadByRequestId.get(request.requestId);
    return payload ? [{ requestId: request.requestId, payloadChecksum: sha256({ candidateOrdinals: payload.candidateOrdinals, cardIds: payload.cards.map((card) => card.cardId).sort() }), cardIds: payload.cards.map((card) => card.cardId).sort(), candidateOrdinals: [...payload.candidateOrdinals].sort((a, b) => a - b) }] : [];
  });
  ops.push(operation(session, `op:${ops.length + 1}`, 'SELECT_CARDS', { query: input.query }, { selected: selection.selected.map((card) => card.cardId), checksum: selection.checksum }));
  ops.push(operation(session, `op:${ops.length + 1}`, 'COVERAGE', { cardIds: selection.selected.map((card) => card.cardId) }, coverage));
  const body = { schema: 'atlas.local-research-circuit.v1' as const, sessionId: session.sessionId, rounds, subqueries: fetchPlan.requests.slice(0, rounds).map((request) => request.normalizedQuery), fetchPlan, fetchedPayloads, candidateOrdinals: [...ordinals].sort((a, b) => a - b), selection, coverage, operations: ops, status: rounds >= session.budget.maxRounds && !coverage.sufficient ? 'BUDGET_EXCEEDED' as const : 'SUCCEEDED' as const, canonicalAuthority: false as const };
  return { ...body, checksum: sha256(body), canonicalAuthority: false };
}

export { assertResearchSessionRevision, createResearchKernelSession };
