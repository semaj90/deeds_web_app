import { describe, expect, it } from 'vitest';
import { buildQueryKernelGraphV1 } from './query-kernel-graph-v1.js';
import { buildSymbolRepairFunctionCatalogV0 } from './kernel-function-catalog-symbol-repair-v0.js';
import { findAtlasKernelFunctionV1 } from './kernel-function-catalog-v1.js';

const KERNEL_REVISION = 'kernel:symbol-repair:v0';

describe('buildQueryKernelGraphV1', () => {
  it('binds a real catalog function to typed arguments and grounded evidence', () => {
    const catalog = buildSymbolRepairFunctionCatalogV0();
    const fn = findAtlasKernelFunctionV1(catalog, 'fn:find_impacted_callers_for_symbol_change')!;

    const graph = buildQueryKernelGraphV1({
      queryGraphId: 'qgraph:test:1',
      kernelRevision: KERNEL_REVISION,
      queryText: 'what breaks if I change validateSession()?',
      selections: [{
        stepId: 'sel:1',
        calledFunction: fn,
        boundArguments: { qualified_name: 'validateSession' },
        groundedResult: { impactedCallers: ['handleRequest', 'checkAuth'] },
        groundedEvidence: [
          { evidenceKind: 'symbol_registry_row', evidenceRef: 'atlas_symbol_registry:validateSession' },
          { evidenceKind: 'graph_edge', evidenceRef: 'edge:validateSession->handleRequest' },
        ],
        status: 'SUCCEEDED',
      }],
      producerRevision: 'test:v1',
    });

    expect(graph.functionSelections).toHaveLength(1);
    expect(graph.canonicalAuthority).toBe(false);
    expect(graph.functionSelections[0]!.functionId).toBe('fn:find_impacted_callers_for_symbol_change');
  });

  it('refuses a selection whose function belongs to a different kernel revision', () => {
    const catalog = buildSymbolRepairFunctionCatalogV0();
    const fn = findAtlasKernelFunctionV1(catalog, 'fn:find_impacted_callers_for_symbol_change')!;

    expect(() => buildQueryKernelGraphV1({
      queryGraphId: 'qgraph:test:2',
      kernelRevision: 'kernel:SOME_OTHER:v9',
      queryText: 'x',
      selections: [{
        stepId: 'sel:1', calledFunction: fn, boundArguments: {}, groundedResult: null,
        groundedEvidence: [{ evidenceKind: 'x', evidenceRef: 'y' }], status: 'SUCCEEDED',
      }],
      producerRevision: 'test:v1',
    })).toThrow(/QUERY_KERNEL_GRAPH_FUNCTION_KERNEL_MISMATCH/);
  });

  it('rejects a SUCCEEDED selection with zero grounded evidence (OaK evidence-grounding rule)', () => {
    const catalog = buildSymbolRepairFunctionCatalogV0();
    const fn = findAtlasKernelFunctionV1(catalog, 'fn:find_impacted_callers_for_symbol_change')!;

    expect(() => buildQueryKernelGraphV1({
      queryGraphId: 'qgraph:test:3',
      kernelRevision: KERNEL_REVISION,
      queryText: 'x',
      selections: [{
        stepId: 'sel:1', calledFunction: fn, boundArguments: {}, groundedResult: 'result-with-no-evidence',
        groundedEvidence: [], status: 'SUCCEEDED',
      }],
      producerRevision: 'test:v1',
    })).toThrow(/cites zero grounded evidence/);
  });

  it('allows a FAILED selection with zero grounded evidence (a failure has nothing to ground)', () => {
    const catalog = buildSymbolRepairFunctionCatalogV0();
    const fn = findAtlasKernelFunctionV1(catalog, 'fn:find_impacted_callers_for_symbol_change')!;

    const graph = buildQueryKernelGraphV1({
      queryGraphId: 'qgraph:test:4',
      kernelRevision: KERNEL_REVISION,
      queryText: 'x',
      selections: [{
        stepId: 'sel:1', calledFunction: fn, boundArguments: {}, groundedResult: null,
        groundedEvidence: [], status: 'FAILED',
      }],
      producerRevision: 'test:v1',
    });
    expect(graph.functionSelections[0]!.status).toBe('FAILED');
  });
});
