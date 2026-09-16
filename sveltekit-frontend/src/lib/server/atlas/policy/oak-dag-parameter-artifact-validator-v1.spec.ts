import { describe, expect, it } from 'vitest';
import { buildParameterArtifactV1 } from '@deeds/parent-atlas';
import { validateOakDagParameterArtifactV1 } from './oak-dag-parameter-artifact-validator-v1.js';

const graphArguments = {
  packetKey: 'packet:a',
  maxHops: 2,
  graphRevision: 'graph:v1',
  workspaceRevision: 'workspace:v1',
  graphOrdinalMapChecksum: 'a'.repeat(64),
};

describe('OaK DAG parameter artifact validator', () => {
  it('admits exact top-k, token-budget, and graph-hop artifacts', () => {
    expect(validateOakDagParameterArtifactV1(buildParameterArtifactV1({
      actionId: 'search', actionKind: 'FETCH_QDRANT', schemaRef: 'param:top-k', schemaRevision: 'param:v1', boundArguments: { topK: 20 },
    })).boundArguments).toEqual({ topK: 20 });
    expect(validateOakDagParameterArtifactV1(buildParameterArtifactV1({
      actionId: 'context', actionKind: 'BUILD_CONTEXT', schemaRef: 'param:token-budget', schemaRevision: 'param:v1', boundArguments: { tokenBudget: 8192 },
    })).boundArguments).toEqual({ tokenBudget: 8192 });
    expect(validateOakDagParameterArtifactV1(buildParameterArtifactV1({
      actionId: 'graph', actionKind: 'GRAPH_EXPAND', schemaRef: 'param:graph-hop-bound', schemaRevision: 'param:v1', boundArguments: graphArguments,
    })).boundArguments).toEqual(graphArguments);
  });

  it('rejects unsupported, malformed, or out-of-range parameter artifacts', () => {
    const base = { actionId: 'search', actionKind: 'FETCH_QDRANT', schemaRevision: 'param:v1' };
    expect(() => validateOakDagParameterArtifactV1(buildParameterArtifactV1({ ...base, schemaRef: 'param:top-k', boundArguments: { topK: 101 } }))).toThrow();
    expect(() => validateOakDagParameterArtifactV1(buildParameterArtifactV1({ ...base, schemaRef: 'param:token-budget', boundArguments: { tokenBudget: 0 } }))).toThrow();
    expect(() => validateOakDagParameterArtifactV1(buildParameterArtifactV1({ ...base, schemaRef: 'param:unknown', boundArguments: { topK: 2 } }))).toThrow('OAK_DAG_PARAMETER_SCHEMA_UNSUPPORTED:param:unknown');
  });
});
