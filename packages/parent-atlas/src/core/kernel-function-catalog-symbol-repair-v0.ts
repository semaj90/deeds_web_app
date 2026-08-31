import { buildAtlasKernelFunctionCatalogV1, type AtlasKernelFunctionCatalogV1, type KernelFunctionCatalogEntryInput } from './kernel-function-catalog-v1.js';
import { buildSymbolRepairOperatorLibraryV0 } from './kernel-operator-library-symbol-repair-v0.js';
import type { KernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';

const KERNEL_REVISION = 'kernel:symbol-repair:v0';
const PRODUCER_REVISION = 'kernel-function-catalog:symbol-repair:v0:2026-08-31';

/**
 * `F_symbol_repair` catalog (OAK-05 continuation).
 *
 * IMPORTANT: this file was rewritten mid-implementation after discovering
 * `kernel-function-catalog-v1.ts` already exists on disk — built
 * concurrently by a different process while this pass was in progress
 * (confirmed via file mtime: newer than this session's own
 * `kernel-function-v1.ts`, which it imports from). That file already
 * defines `AtlasKernelFunctionCatalogV1` (a checksum-sealed catalog
 * contract wrapping `buildAtlasKernelFunctionV1`) — a better version of
 * what this file originally tried to build as a flat array. This file now
 * consumes that catalog builder instead of duplicating it, per this
 * change's own audit-first rule.
 *
 * Three composed functions, chosen because each is a distinct composition
 * shape (linear chain, fan-out, cross-signal join) and each maps to a real
 * example already named in spec.md's OaK operator-composition section.
 */
export function buildSymbolRepairFunctionCatalogV0(
  operatorLibrary: KernelOperatorLibraryV1 = buildSymbolRepairOperatorLibraryV0(),
): AtlasKernelFunctionCatalogV1 {
  const entries: KernelFunctionCatalogEntryInput[] = [
    {
      functionId: 'fn:find_impacted_callers_for_symbol_change',
      inputSchemaId: 'input:qualified_name',
      outputSchemaId: 'output:impacted_callers_report',
      operatorGraph: [
        { stepId: 'step:1', operatorId: 'op:lookup_symbol' },
        { stepId: 'step:2', operatorId: 'op:get_source_span', dependsOnStepIds: ['step:1'] },
        { stepId: 'step:3', operatorId: 'op:get_callers', dependsOnStepIds: ['step:1'] },
      ],
      preconditions: ['qualified_name resolves to exactly one stable_symbol_id'],
      postconditions: ['every returned caller has a resolvable symbol_version_id'],
      requiredEvidenceKinds: ['symbol_registry_row', 'graph_edge'],
      requiredRelationTypes: ['calls'],
      allowedEvidenceClasses: ['symbol_registry_row', 'graph_edge'],
      graphRevisionPolicy: 'QUERY_SCOPED',
      mutationPolicy: 'READ_ONLY',
      producerRevision: PRODUCER_REVISION,
    },
    {
      functionId: 'fn:trace_packet_to_symbol_to_source',
      inputSchemaId: 'input:packet_key',
      outputSchemaId: 'output:source_span_report',
      operatorGraph: [
        { stepId: 'step:1', operatorId: 'op:lookup_packet' },
        { stepId: 'step:2', operatorId: 'op:get_references', dependsOnStepIds: ['step:1'] },
        { stepId: 'step:3', operatorId: 'op:get_ast_evidence', dependsOnStepIds: ['step:2'] },
        { stepId: 'step:4', operatorId: 'op:get_source_span', dependsOnStepIds: ['step:2'] },
      ],
      preconditions: ['packet_key resolves to a live atlas_packets row'],
      postconditions: ['returned source span is bound to the same source_revision as the packet'],
      requiredEvidenceKinds: ['packet_row', 'source_ref_row', 'ast_node_row'],
      allowedEvidenceClasses: ['packet_row', 'source_ref_row', 'ast_node_row'],
      graphRevisionPolicy: 'EXACT',
      mutationPolicy: 'READ_ONLY',
      producerRevision: PRODUCER_REVISION,
    },
    {
      functionId: 'fn:find_evidence_for_failed_typecheck',
      inputSchemaId: 'input:changed_source_refs',
      outputSchemaId: 'output:typecheck_evidence_bundle',
      operatorGraph: [
        { stepId: 'step:1', operatorId: 'op:run_typecheck' },
        { stepId: 'step:2', operatorId: 'op:search_lexical', dependsOnStepIds: ['step:1'] },
        { stepId: 'step:3', operatorId: 'op:search_semantic', dependsOnStepIds: ['step:1'] },
        { stepId: 'step:4', operatorId: 'op:rerank', dependsOnStepIds: ['step:2', 'step:3'] },
        { stepId: 'step:5', operatorId: 'op:build_context', dependsOnStepIds: ['step:4'] },
      ],
      preconditions: ['run_typecheck produced at least one diagnostic'],
      postconditions: ['context manifest is token-budgeted and evidence-cited'],
      requiredEvidenceKinds: ['typecheck_diagnostics', 'ranked_chunks'],
      allowedEvidenceClasses: ['typecheck_diagnostics', 'ranked_chunks'],
      graphRevisionPolicy: 'EXACT',
      mutationPolicy: 'READ_ONLY',
      producerRevision: PRODUCER_REVISION,
    },
  ];

  return buildAtlasKernelFunctionCatalogV1({
    catalogId: 'catalog:symbol-repair',
    catalogRevision: KERNEL_REVISION,
    taskClass: 'symbol_change_impact_analysis',
    operatorLibrary,
    functions: entries,
    producerRevision: PRODUCER_REVISION,
  });
}
