import { describe, expect, it } from 'vitest';
import { buildSymbolRepairOperatorLibraryV0 } from './kernel-operator-library-symbol-repair-v0.js';
import { buildAtlasKernelFunctionCatalogV1, findAtlasKernelFunctionV1 } from './kernel-function-catalog-v1.js';

const library = buildSymbolRepairOperatorLibraryV0();
const base = {
  inputSchemaId: 'input:evidence',
  outputSchemaId: 'output:evidence',
  preconditions: ['source_revision_exact'],
  postconditions: ['canonical_writes_zero'],
  requiredEvidenceKinds: ['source_span'],
  // Required as of the 2026-08-31 F02 field-gap extension (see
  // kernel-function-v1.ts) — added here to keep this fixture valid rather
  // than leave it broken by a schema change made in a different file.
  allowedEvidenceClasses: ['source_span'],
  mutationPolicy: 'READ_ONLY' as const,
  producerRevision: 'catalog-test:v1',
};

function makeCatalog() {
  return buildAtlasKernelFunctionCatalogV1({
    catalogId: 'catalog:symbol-repair', catalogRevision: 'kernel:symbol-repair:v1',
    taskClass: 'symbol_change_impact_analysis', operatorLibrary: library,
    producerRevision: 'catalog-test:v1',
    functions: [
      { ...base, functionId: 'trace_packet_to_symbol_to_source', operatorGraph: [
        { stepId: 'packet', operatorId: 'op:lookup_packet', dependsOnStepIds: [] },
        { stepId: 'symbol', operatorId: 'op:lookup_symbol', dependsOnStepIds: ['packet'] },
        { stepId: 'span', operatorId: 'op:get_source_span', dependsOnStepIds: ['symbol'] },
      ] },
      { ...base, functionId: 'find_impacted_callers_for_symbol_change', operatorGraph: [
        { stepId: 'symbol', operatorId: 'op:lookup_symbol', dependsOnStepIds: [] },
        { stepId: 'span', operatorId: 'op:get_source_span', dependsOnStepIds: ['symbol'] },
        { stepId: 'callers', operatorId: 'op:get_callers', dependsOnStepIds: ['symbol'] },
      ] },
    ],
  });
}

describe('kernel-function-catalog-v1', () => {
  it('sorts functions and replays with the same checksum', () => {
    const first = makeCatalog();
    const second = makeCatalog();
    expect(first.functions.map((fn) => fn.functionId)).toEqual([
      'find_impacted_callers_for_symbol_change', 'trace_packet_to_symbol_to_source',
    ]);
    expect(first.catalogChecksum).toBe(second.catalogChecksum);
    expect(findAtlasKernelFunctionV1(first, 'trace_packet_to_symbol_to_source')).toBeDefined();
  });

  it('rejects an operator outside the trusted library', () => {
    expect(() => buildAtlasKernelFunctionCatalogV1({
      catalogId: 'catalog:symbol-repair', catalogRevision: 'kernel:symbol-repair:v1',
      taskClass: 'symbol_change_impact_analysis', operatorLibrary: library,
      producerRevision: 'catalog-test:v1',
      functions: [{ ...base, functionId: 'invalid', operatorGraph: [{ stepId: 'bad', operatorId: 'op:not-declared', dependsOnStepIds: [] }] }],
    })).toThrow('KERNEL_FUNCTION_UNDECLARED_OPERATOR:op:not-declared');
  });
});
