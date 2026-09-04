import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';
import {
  buildKernelDagExecutionBindingV1,
  checksumKernelDagBoundArguments,
  resolveKernelDagParameterArtifactV1,
} from './kernel-dag-execution-binding-v1.js';
import { buildParameterArtifactV1 } from './parameter-artifact-v1.js';

const inputChecksum = createHash('sha256').update('input').digest('hex');
const args = { symbol: 'foo', maxDepth: 2 };

function makeAction() {
  return buildAdaptiveDagPlanV1({
    planId: 'plan:binding',
    queryId: 'query:binding',
    dagRevision: 'dag:v1',
    plannerRevision: 'planner:v1',
    classificationRevision: 'class:v1',
    actions: [{
      actionId: 'plan:binding:step:1',
      actionKind: 'FETCH_POSTGRES',
      parentActionIds: [],
      inputArtifactRefs: ['evidence:1'],
      inputChecksum,
      parameterArtifactRef: null,
      parameterChecksum: checksumKernelDagBoundArguments(args),
      outputContract: 'rows:v1',
      mutationPolicy: 'READ_ONLY',
      timeoutMs: 1000,
      failurePolicy: 'FAIL_CLOSED',
    }],
  }).actions[0];
}

describe('kernel DAG execution binding v1', () => {
  it('restores verified executable arguments and operator coordinates', () => {
    const binding = buildKernelDagExecutionBindingV1({
      action: makeAction(),
      functionId: 'function:symbol-repair',
      stepId: 'step:1',
      operatorId: 'operator:lookup-symbol',
      operatorKind: 'LOOKUP_SYMBOL',
      implementationRef: 'postgres:read-symbol',
      boundArguments: args,
      expectedOutputSchemaId: 'rows:v1',
    });
    expect(binding.boundArguments).toEqual(args);
    expect(binding.implementationRef).toBe('postgres:read-symbol');
  });

  it('rejects arguments whose checksum differs from the plan', () => {
    expect(() => buildKernelDagExecutionBindingV1({
      action: makeAction(),
      functionId: 'function:symbol-repair',
      stepId: 'step:1',
      operatorId: 'operator:lookup-symbol',
      operatorKind: 'LOOKUP_SYMBOL',
      implementationRef: 'postgres:read-symbol',
      boundArguments: { symbol: 'other' },
      expectedOutputSchemaId: 'rows:v1',
    })).toThrow('DAG_EXEC_BINDING_PARAMETER_CHECKSUM_MISMATCH');
  });

  it('rejects missing parameter checksums and output-schema drift', () => {
    const action = { ...makeAction(), parameterChecksum: null };
    expect(() => buildKernelDagExecutionBindingV1({
      action,
      functionId: 'function:symbol-repair',
      stepId: 'step:1',
      operatorId: 'operator:lookup-symbol',
      operatorKind: 'LOOKUP_SYMBOL',
      implementationRef: 'postgres:read-symbol',
      boundArguments: args,
      expectedOutputSchemaId: 'rows:v1',
    })).toThrow('DAG_EXEC_BINDING_PARAMETER_CHECKSUM_MISSING');

    expect(() => buildKernelDagExecutionBindingV1({
      action: makeAction(),
      functionId: 'function:symbol-repair',
      stepId: 'step:1',
      operatorId: 'operator:lookup-symbol',
      operatorKind: 'LOOKUP_SYMBOL',
      implementationRef: 'postgres:read-symbol',
      boundArguments: args,
      expectedOutputSchemaId: 'wrong:v1',
    })).toThrow('DAG_EXEC_BINDING_OUTPUT_SCHEMA_MISMATCH');
  });

  it('resolves and verifies the planner parameter artifact', () => {
    const artifact = buildParameterArtifactV1({
      actionId: 'plan:binding:step:artifact',
      actionKind: 'FETCH_POSTGRES',
      schemaRef: 'rows:input:v1',
      schemaRevision: 'schema:v1',
      boundArguments: args,
    });
    const action = buildAdaptiveDagPlanV1({
      planId: 'plan:binding:artifact', queryId: 'query:binding', dagRevision: 'dag:v1',
      plannerRevision: 'planner:v1', classificationRevision: 'class:v1', actions: [{
        actionId: artifact.actionId, actionKind: 'FETCH_POSTGRES', parentActionIds: [], inputArtifactRefs: ['evidence:1'],
        inputChecksum, parameterArtifactRef: artifact.artifactId, parameterChecksum: artifact.parameterChecksum,
        outputContract: 'rows:v1', mutationPolicy: 'READ_ONLY', timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED',
      }],
    }).actions[0];
    const binding = buildKernelDagExecutionBindingV1({
      action, functionId: 'function:symbol-repair', stepId: 'step:artifact', operatorId: 'operator:lookup-symbol',
      operatorKind: 'LOOKUP_SYMBOL', implementationRef: 'postgres:read-symbol', boundArguments: args,
      expectedOutputSchemaId: 'rows:v1',
    });
    expect(resolveKernelDagParameterArtifactV1({ action, binding, artifact })).toEqual(args);
  });
});
