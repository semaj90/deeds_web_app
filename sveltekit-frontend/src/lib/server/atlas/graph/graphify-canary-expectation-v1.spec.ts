import { describe, expect, it } from 'vitest';
import {
  buildGraphifyCanaryExpectationV1,
  verifyGraphifyCanaryExpectationV1,
} from './graphify-canary-expectation-v1.js';

const base = {
  workspaceRevision: `sha256:${'1'.repeat(64)}`,
  snapshotRevision: `sha256:${'2'.repeat(64)}`,
  sourceSelectionChecksum: `sha256:${'3'.repeat(64)}`,
  sourceCount: 25_271,
};

describe('GraphifyCanaryExpectationV1', () => {
  it('keeps workspace and snapshot revisions distinct and non-authoritative', () => {
    const expectation = buildGraphifyCanaryExpectationV1(base);
    expect(expectation.workspaceRevision).toBe(base.workspaceRevision);
    expect(expectation.snapshotRevision).toBe(base.snapshotRevision);
    expect(expectation.workspaceRevision).not.toBe(expectation.snapshotRevision);
    expect(expectation.graphifyExecutionAuthorized).toBe(false);
    expect(expectation.canonicalWritesAuthorized).toBe(false);
    expect(expectation.authority).toBe(false);
    expect(expectation.identityChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for identical input', () => {
    expect(buildGraphifyCanaryExpectationV1(base).identityChecksum)
      .toBe(buildGraphifyCanaryExpectationV1({ ...base }).identityChecksum);
  });

  it('changes identity when only snapshotRevision changes', () => {
    const first = buildGraphifyCanaryExpectationV1(base);
    const second = buildGraphifyCanaryExpectationV1({
      ...base,
      snapshotRevision: `sha256:${'4'.repeat(64)}`,
    });
    expect(second.identityChecksum).not.toBe(first.identityChecksum);
  });

  it('changes identity when only workspaceRevision changes', () => {
    const first = buildGraphifyCanaryExpectationV1(base);
    const second = buildGraphifyCanaryExpectationV1({
      ...base,
      workspaceRevision: `sha256:${'5'.repeat(64)}`,
    });
    expect(second.identityChecksum).not.toBe(first.identityChecksum);
  });

  it('detects checksum tampering', () => {
    const expectation = buildGraphifyCanaryExpectationV1(base);
    expect(verifyGraphifyCanaryExpectationV1(expectation)).toBe(true);
    expect(verifyGraphifyCanaryExpectationV1({
      ...expectation,
      identityChecksum: '0'.repeat(64),
    })).toBe(false);
  });
});
