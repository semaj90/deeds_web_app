import { describe, expect, it } from 'vitest';
import { buildParameterArtifactV1 } from './parameter-artifact-v1.js';

describe('ParameterArtifactV1', () => {
  it('deterministically seals one operator parameter set', () => {
    const input = {
      actionId: 'plan:1:step:1',
      actionKind: 'FETCH_POSTGRES',
      schemaRef: 'input:symbol',
      schemaRevision: 'operator:v1',
      boundArguments: { limit: 5, symbol: 'foo' },
    };
    const first = buildParameterArtifactV1(input);
    const second = buildParameterArtifactV1({ ...input, boundArguments: { symbol: 'foo', limit: 5 } });
    expect(second).toEqual(first);
    expect(first.artifactId).toMatch(/^parameter:v1:[a-f0-9]{64}$/);
    expect(first.parameterChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesPerformed).toBe(false);
  });

  it('changes identity when the operator schema changes', () => {
    const base = { actionId: 'a', actionKind: 'FETCH_FILE', schemaRef: 'input:v1', boundArguments: { sourceRef: 'x' } };
    const first = buildParameterArtifactV1({ ...base, schemaRevision: 'operator:v1' });
    const second = buildParameterArtifactV1({ ...base, schemaRevision: 'operator:v2' });
    expect(second.artifactChecksum).not.toBe(first.artifactChecksum);
  });
});
