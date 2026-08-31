import { describe, expect, it } from 'vitest';
import { buildAtlasOntologyKernelSchemaV1, atlasOntologyKernelSchemaV1Schema } from './ontology-kernel-schema-v1.js';
import { buildKernelOperatorLibraryV1, buildKernelOperatorV1, type KernelOperatorV1 } from './kernel-operator-library-v1.js';
import { buildAtlasKernelFunctionV1 } from './kernel-function-v1.js';
import { buildAtlasOntologyKernelManifestV1, atlasOntologyKernelManifestV1Schema } from './ontology-kernel-manifest-v1.js';

/**
 * Proves the OaK-derived contract chain runs end to end for one real task
 * class (symbol-change impact analysis), wired to infrastructure verified
 * live elsewhere in this repo during the 2026-08-31 session:
 *   - atlas_symbol_registry / atlas_symbol_versions (Postgres, confirmed
 *     live this session while fixing PACKET_TO_SYMBOL_LINEAGE)
 *   - graph_expand_neighborhood (live TRACE MCP tool)
 * This is deliberately a narrow, real slice — NOT the full 24-operator
 * library, NOT OWL/HermiT verification, NOT the judge/repair loop. Those
 * remain out of scope per parent-atlas-ontology-kernel/tasks.md.
 */

const PRODUCER_REVISION = 'ontology-kernel-v0:2026-08-31';

function symbolRepairSchema() {
  return buildAtlasOntologyKernelSchemaV1({
    schemaId: 'kernel-schema:symbol-repair:v0',
    taskClass: 'symbol_change_impact_analysis',
    entityTypes: [
      { entityTypeId: 'stable_symbol', label: 'Stable Symbol', sourceContract: 'symbol-registry', identityFields: ['stable_symbol_id'] },
      { entityTypeId: 'symbol_version', label: 'Symbol Version', sourceContract: 'symbol-registry', identityFields: ['symbol_version_id'] },
    ],
    relationTypes: [
      { relationTypeId: 'calls', label: 'Calls', arity: 'binary', sourceContract: 'hyperedge-contract', participantRoles: ['caller', 'callee'] },
    ],
    constraints: [
      { constraintId: 'calls_domain_range', kind: 'DOMAIN_RANGE', appliesTo: ['calls', 'stable_symbol'], description: 'calls relates stable_symbol to stable_symbol' },
    ],
    identityRules: ['stable_symbol_id is immutable across revisions'],
    producerRevision: PRODUCER_REVISION,
  });
}

function operatorLibrary() {
  const operators: KernelOperatorV1[] = [
    buildKernelOperatorV1({
      operatorId: 'op:get_callers', operatorRevision: 'op-rev:test:v1', kind: 'GET_CALLERS',
      inputSchemaId: 'input:stable_symbol_id', outputSchemaId: 'output:stable_symbol_id_list',
      parameterSchemaRef: null, executorClass: 'GRAPH_TRAVERSAL_EXECUTOR',
      requiredRevisionAxes: ['graphRevision'], allowedArtifactKinds: ['graph_edge'],
      implementationRef: 'graph_expand_neighborhood', implementationKind: 'mcp_tool',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:get_source_span', operatorRevision: 'op-rev:test:v1', kind: 'GET_SOURCE_SPAN',
      inputSchemaId: 'input:symbol_version_id', outputSchemaId: 'output:byte_span',
      parameterSchemaRef: null, executorClass: 'DB_QUERY_EXECUTOR',
      requiredRevisionAxes: ['sourceRevision'], allowedArtifactKinds: ['symbol_version_row'],
      implementationRef: 'atlas_symbol_versions', implementationKind: 'postgres_table',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:lookup_symbol', operatorRevision: 'op-rev:test:v1', kind: 'LOOKUP_SYMBOL',
      inputSchemaId: 'input:qualified_name', outputSchemaId: 'output:stable_symbol_id',
      parameterSchemaRef: null, executorClass: 'DB_QUERY_EXECUTOR',
      requiredRevisionAxes: ['workspaceRevision'], allowedArtifactKinds: ['symbol_registry_row'],
      implementationRef: 'atlas_symbol_registry', implementationKind: 'postgres_table',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
  ];
  return buildKernelOperatorLibraryV1({ libraryRevision: 'operator-library:symbol-repair:v0', operators });
}

describe('OaK-derived ontology kernel — end-to-end vertical slice', () => {
  it('builds a schema that refuses hand-set VERIFIED (OAK-03 not implemented)', () => {
    const schema = symbolRepairSchema();
    expect(schema.verificationStatus).toBe('UNVERIFIED');
    expect(() => atlasOntologyKernelSchemaV1Schema.parse({ ...schema, verificationStatus: 'VERIFIED' })).toThrow();
  });

  it('rejects a constraint referencing an undeclared type', () => {
    expect(() => buildAtlasOntologyKernelSchemaV1({
      schemaId: 'bad', taskClass: 'x',
      entityTypes: [{ entityTypeId: 'a', label: 'A', sourceContract: 'other', identityFields: ['id'] }],
      constraints: [{ constraintId: 'c1', kind: 'DOMAIN_RANGE', appliesTo: ['nonexistent'], description: 'bad ref' }],
      producerRevision: PRODUCER_REVISION,
    })).toThrow(/undeclared type/);
  });

  it('builds a real operator library and composes a task-specific function over it', () => {
    const library = operatorLibrary();
    expect(library.operators).toHaveLength(3);

    const fn = buildAtlasKernelFunctionV1({
      functionId: 'fn:find_impacted_callers_for_symbol_change',
      kernelRevision: 'kernel:symbol-repair:v0',
      inputSchemaId: 'input:qualified_name',
      outputSchemaId: 'output:impacted_callers_report',
      operatorLibrary: library,
      operatorGraph: [
        { stepId: 'step:1', operatorId: 'op:lookup_symbol' },
        { stepId: 'step:2', operatorId: 'op:get_source_span', dependsOnStepIds: ['step:1'] },
        { stepId: 'step:3', operatorId: 'op:get_callers', dependsOnStepIds: ['step:1'] },
      ],
      preconditions: ['qualified_name resolves to exactly one stable_symbol_id'],
      postconditions: ['every returned caller has a resolvable symbol_version_id'],
      requiredEvidenceKinds: ['symbol_registry_row', 'graph_edge'],
      allowedEvidenceClasses: ['test_evidence'], mutationPolicy: 'READ_ONLY',
      producerRevision: PRODUCER_REVISION,
    });

    expect(fn.operatorGraph).toHaveLength(3);
    expect(fn.mutationPolicy).toBe('READ_ONLY');
    expect(fn.canonicalAuthority).toBe(false);
  });

  it('refuses to build a function that references an operator not in the library', () => {
    const library = operatorLibrary();
    expect(() => buildAtlasKernelFunctionV1({
      functionId: 'fn:bad',
      kernelRevision: 'kernel:symbol-repair:v0',
      inputSchemaId: 'in', outputSchemaId: 'out',
      operatorLibrary: library,
      operatorGraph: [{ stepId: 'step:1', operatorId: 'op:does_not_exist' }],
      allowedEvidenceClasses: ['test_evidence'], mutationPolicy: 'READ_ONLY',
      producerRevision: PRODUCER_REVISION,
    })).toThrow(/KERNEL_FUNCTION_UNDECLARED_OPERATOR:op:does_not_exist/);
  });

  it('rejects a step depending on itself or an undeclared step', () => {
    const library = operatorLibrary();
    expect(() => buildAtlasKernelFunctionV1({
      functionId: 'fn:self-dep',
      kernelRevision: 'k1', inputSchemaId: 'in', outputSchemaId: 'out',
      operatorLibrary: library,
      operatorGraph: [{ stepId: 'step:1', operatorId: 'op:lookup_symbol', dependsOnStepIds: ['step:1'] }],
      allowedEvidenceClasses: ['test_evidence'], mutationPolicy: 'READ_ONLY', producerRevision: PRODUCER_REVISION,
    })).toThrow();
  });

  it('freezes a manifest binding schema + operator library + function set under one checksum', () => {
    const schema = symbolRepairSchema();
    const library = operatorLibrary();
    const fn = buildAtlasKernelFunctionV1({
      functionId: 'fn:find_impacted_callers_for_symbol_change',
      kernelRevision: 'kernel:symbol-repair:v0',
      inputSchemaId: 'input:qualified_name', outputSchemaId: 'output:impacted_callers_report',
      operatorLibrary: library,
      operatorGraph: [
        { stepId: 'step:1', operatorId: 'op:lookup_symbol' },
        { stepId: 'step:2', operatorId: 'op:get_callers', dependsOnStepIds: ['step:1'] },
      ],
      allowedEvidenceClasses: ['test_evidence'], mutationPolicy: 'READ_ONLY',
      producerRevision: PRODUCER_REVISION,
    });

    const manifest = buildAtlasOntologyKernelManifestV1({
      kernelId: 'kernel:symbol-repair',
      kernelRevision: 'kernel:symbol-repair:v0',
      schema, operatorLibrary: library, functions: [fn],
      producerRevision: PRODUCER_REVISION,
    });

    expect(manifest.state).toBe('DRAFT');
    expect(manifest.functionIds).toEqual(['fn:find_impacted_callers_for_symbol_change']);
    expect(manifest.taskClass).toBe('symbol_change_impact_analysis');
    expect(() => atlasOntologyKernelManifestV1Schema.parse({ ...manifest, state: 'FROZEN' })).toThrow();
  });

  it('refuses to freeze a manifest mixing functions from a different kernel revision', () => {
    const schema = symbolRepairSchema();
    const library = operatorLibrary();
    const fn = buildAtlasKernelFunctionV1({
      functionId: 'fn:x', kernelRevision: 'kernel:OTHER:v9',
      inputSchemaId: 'in', outputSchemaId: 'out', operatorLibrary: library,
      operatorGraph: [{ stepId: 'step:1', operatorId: 'op:lookup_symbol' }],
      allowedEvidenceClasses: ['test_evidence'], mutationPolicy: 'READ_ONLY', producerRevision: PRODUCER_REVISION,
    });
    expect(() => buildAtlasOntologyKernelManifestV1({
      kernelId: 'kernel:symbol-repair', kernelRevision: 'kernel:symbol-repair:v0',
      schema, operatorLibrary: library, functions: [fn], producerRevision: PRODUCER_REVISION,
    })).toThrow(/KERNEL_MANIFEST_REVISION_MISMATCH/);
  });

  it('is deterministic: same inputs produce the same manifest checksum', () => {
    const build = () => {
      const schema = symbolRepairSchema();
      const library = operatorLibrary();
      const fn = buildAtlasKernelFunctionV1({
        functionId: 'fn:find_impacted_callers_for_symbol_change',
        kernelRevision: 'kernel:symbol-repair:v0',
        inputSchemaId: 'input:qualified_name', outputSchemaId: 'output:impacted_callers_report',
        operatorLibrary: library,
        operatorGraph: [{ stepId: 'step:1', operatorId: 'op:lookup_symbol' }],
        allowedEvidenceClasses: ['test_evidence'], mutationPolicy: 'READ_ONLY', producerRevision: PRODUCER_REVISION,
      });
      return buildAtlasOntologyKernelManifestV1({
        kernelId: 'kernel:symbol-repair', kernelRevision: 'kernel:symbol-repair:v0',
        schema, operatorLibrary: library, functions: [fn], producerRevision: PRODUCER_REVISION,
      });
    };
    const a = build();
    const b = build();
    expect(a.kernelChecksum).toBe(b.kernelChecksum);
    expect(a.schemaChecksum).toBe(b.schemaChecksum);
  });
});
