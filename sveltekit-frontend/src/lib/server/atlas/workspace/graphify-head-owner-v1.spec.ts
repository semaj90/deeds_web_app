import { describe, expect, it } from 'vitest';
import { resolveGraphifyHeadOwnerV1 } from './graphify-head-owner-v1.js';

const checksum = (n: string) => `sha256:${n.repeat(64)}`;
const candidate = (id: string, head: string | null, graph = 'graph-v1') => ({
  executionId: id,
  workspaceId: 'repo:deeds-web-app',
  workspaceHeadRevision: head,
  sourceMembershipChecksum: checksum('1'),
  sourceContentChecksum: checksum('2'),
  graphRevision: graph,
  packetRevision: 'packet-v1',
  terminal: true as const,
  producerRevision: 'graphify-v1',
});

describe('head-scoped Graphify owner v1', () => {
  it('does not infer a head from historical workspace-only candidates', () => {
    const result = resolveGraphifyHeadOwnerV1([candidate('00000000-0000-4000-8000-000000000001', null)]);
    expect(result.status).toBe('HEAD_SCOPE_UNRESOLVED');
    expect(result.readOnlyExecutionId).toBeNull();
    expect(result.mutationAuthorityExecutionId).toBeNull();
  });

  it('permits read-only evidence selection for equivalent executions at one head', () => {
    const head = checksum('a');
    const result = resolveGraphifyHeadOwnerV1([
      candidate('00000000-0000-4000-8000-000000000001', head),
      candidate('00000000-0000-4000-8000-000000000002', head),
    ]);
    expect(result.status).toBe('EVIDENCE_OWNER_AVAILABLE_MUTATION_AUTHORITY_UNCHANGED');
    expect(result.evidenceEquivalent).toBe(true);
    expect(result.readOnlyExecutionId).toBe('00000000-0000-4000-8000-000000000001');
    expect(result.mutationAuthorityExecutionId).toBeNull();
  });

  it('blocks mixed evidence at one head', () => {
    const head = checksum('a');
    const result = resolveGraphifyHeadOwnerV1([
      candidate('00000000-0000-4000-8000-000000000001', head),
      candidate('00000000-0000-4000-8000-000000000002', head, 'graph-v2'),
    ]);
    expect(result.status).toBe('HEAD_OWNER_AMBIGUOUS');
    expect(result.readOnlyExecutionId).toBeNull();
  });
});
