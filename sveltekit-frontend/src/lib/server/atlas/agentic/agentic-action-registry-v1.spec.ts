import { describe, expect, it } from 'vitest';
import {
  AGENTIC_ACTION_REGISTRY_V1_SEED,
  findAgenticActionV1,
  filterAgenticActionsV1,
} from './agentic-action-registry-v1.js';

describe('AR-03: agentic action registry', () => {
  it('seeds exactly the 13 operator-specified example moves', () => {
    expect(AGENTIC_ACTION_REGISTRY_V1_SEED).toHaveLength(13);
    const ids = AGENTIC_ACTION_REGISTRY_V1_SEED.map((a) => a.actionId).sort();
    expect(ids).toEqual(
      [
        'APPLY_SOURCE_PATCH',
        'AST_EXPAND',
        'AWAIT_OPERATOR',
        'BM25_SEARCH',
        'HYPERGRAPH_EXPAND',
        'OAK_RESOLVE',
        'RETRY_WITH_MORE_CONTEXT',
        'RG_EXACT_SEARCH',
        'RUN_TESTS',
        'RUN_TYPECHECK',
        'SEMANTIC_SEARCH',
        'STOP_BLOCKED',
        'STOP_SUCCESS',
      ].sort()
    );
  });

  it('looks up a single action by id', () => {
    const action = findAgenticActionV1('RUN_TYPECHECK');
    expect(action).not.toBeNull();
    expect(action?.mutability).toBe('READ_ONLY');
    expect(action?.requiresHumanApproval).toBe(false);
  });

  it('returns null for an unknown action id (never invents one)', () => {
    expect(findAgenticActionV1('DELETE_PRODUCTION_DATABASE')).toBeNull();
  });

  it('classifies the only source-mutating action distinctly from read-only actions', () => {
    const patch = findAgenticActionV1('APPLY_SOURCE_PATCH');
    expect(patch?.mutability).toBe('SOURCE_WRITE');
    expect(patch?.requiresHumanApproval).toBe(true);

    const search = findAgenticActionV1('RG_EXACT_SEARCH');
    expect(search?.mutability).toBe('READ_ONLY');
  });

  it('filters by mutability', () => {
    const readOnly = filterAgenticActionsV1({ mutability: 'READ_ONLY' });
    const sourceWrite = filterAgenticActionsV1({ mutability: 'SOURCE_WRITE' });
    expect(readOnly.length).toBe(12);
    expect(sourceWrite.length).toBe(1);
    expect(sourceWrite[0].actionId).toBe('APPLY_SOURCE_PATCH');
  });

  it('filters by kind', () => {
    const stops = filterAgenticActionsV1({ kind: 'STOP' });
    expect(stops.map((a) => a.actionId).sort()).toEqual(['STOP_BLOCKED', 'STOP_SUCCESS']);
  });
});
