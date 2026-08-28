import type { AceCardV2, AceCardSelectionV2Result } from '../context/ace-card-selection-v2.js';
import { selectAceCardsV2 } from '../context/ace-card-selection-v2.js';
import { assertResearchSessionRevision, createResearchKernelSession, sha256, type ResearchKernelSessionV1, type ResearchOperationV1 } from './research-kernel-contract-v1.js';

export type ResearchCoverageV1 = { sufficient: boolean; missing: string[] };

export type LocalResearchCircuitInputV1 = {
  session: ResearchKernelSessionV1;
  query: string;
  querySynthesis?: (query: string) => string[];
  search: (subquery: string) => Promise<{ candidateOrdinals: number[]; cards: AceCardV2[] }>;
  coverage: (cards: AceCardV2[]) => ResearchCoverageV1;
};

export type LocalResearchCircuitResultV1 = {
  schema: 'atlas.local-research-circuit.v1';
  sessionId: string;
  rounds: number;
  subqueries: string[];
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
  const cardsById = new Map<string, AceCardV2>();
  const ordinals = new Set<number>();
  let coverage: ResearchCoverageV1 = { sufficient: false, missing: [] };
  let rounds = 0;
  for (const subquery of synthesized) {
    if (rounds >= session.budget.maxRounds || ops.length >= session.budget.maxOperations || Date.now() - started > session.budget.maxWallTimeMs) break;
    rounds += 1;
    if (ops.length >= session.budget.maxOperations) break;
    const result = await input.search(subquery);
    for (const ordinal of result.candidateOrdinals) if (Number.isInteger(ordinal) && ordinal >= 0) ordinals.add(ordinal);
    for (const card of result.cards) cardsById.set(card.cardId, card);
    ops.push(operation(session, `op:${ops.length + 1}`, 'SEARCH', { subquery }, { candidateOrdinals: [...result.candidateOrdinals].sort((a, b) => a - b), cardIds: result.cards.map((card) => card.cardId).sort() }));
    const selected = selectAceCardsV2({ cards: [...cardsById.values()], query: input.query, workspaceRevision: session.workspaceRevision, candidateSnapshotRevision: session.candidateSnapshotRevision, ordinalMapChecksum: session.ordinalMapChecksum, maxCards: session.budget.maxCards, tokenBudget: session.budget.tokenBudget });
    coverage = input.coverage(selected.selected);
    if (coverage.sufficient) break;
  }
  const selection = selectAceCardsV2({ cards: [...cardsById.values()], query: input.query, workspaceRevision: session.workspaceRevision, candidateSnapshotRevision: session.candidateSnapshotRevision, ordinalMapChecksum: session.ordinalMapChecksum, maxCards: session.budget.maxCards, tokenBudget: session.budget.tokenBudget });
  ops.push(operation(session, `op:${ops.length + 1}`, 'SELECT_CARDS', { query: input.query }, { selected: selection.selected.map((card) => card.cardId), checksum: selection.checksum }));
  ops.push(operation(session, `op:${ops.length + 1}`, 'COVERAGE', { cardIds: selection.selected.map((card) => card.cardId) }, coverage));
  const body = { schema: 'atlas.local-research-circuit.v1' as const, sessionId: session.sessionId, rounds, subqueries: synthesized.slice(0, rounds), candidateOrdinals: [...ordinals].sort((a, b) => a - b), selection, coverage, operations: ops, status: rounds >= session.budget.maxRounds && !coverage.sufficient ? 'BUDGET_EXCEEDED' as const : 'SUCCEEDED' as const, canonicalAuthority: false as const };
  return { ...body, checksum: sha256(body), canonicalAuthority: false };
}

export { assertResearchSessionRevision, createResearchKernelSession };
