import { describe, expect, it } from 'vitest';
import { planPacketChunkRepairBatchV1, planPacketChunkRepairV1 } from './packet-chunk-repair-plan-v1.js';

const checksum = (n: string) => `sha256:${n.repeat(64)}`;
const event = (kind: 'PACKET' | 'CHUNK') => ({ schema: 'atlas.workspace-invalidation.v1' as const, eventId: '00000000-0000-4000-8000-000000000031', workspaceHeadRevision: checksum('a'), canonicalId: kind === 'PACKET' ? 'packet:p1' : 'chunk:c1', artifactKind: kind, reason: 'SOURCE_UPDATED', previousRevision: 'packet-r1', requiredRevision: checksum('b'), writesPerformed: false as const });
const evidence = { sourceRef: 'repo:root:src/a.ts', sourceRevision: checksum('c'), workspaceRevision: checksum('d'), packetKey: 'packet:p1', packetContentDigest: checksum('e'), chunkIds: ['chunk:c1'], chunkRevision: 'chunk-r2', lineageChecksum: checksum('f'), candidateCount: 1 };

describe('packet chunk repair planning v1', () => {
  it('admits only exact packet and chunk lineage evidence', () => {
    const plan = planPacketChunkRepairV1({ invalidation: event('PACKET'), sourceRef: evidence.sourceRef, expectedSourceRevision: evidence.sourceRevision, expectedWorkspaceRevision: evidence.workspaceRevision, expectedContentDigest: evidence.packetContentDigest, evidence });
    expect(plan.status).toBe('READY_FOR_BOUNDED_REPAIR');
    expect(plan.repairScope).toEqual(['packet:p1', 'chunk:c1']);
    expect(plan.writesPerformed).toBe(false);
  });
  it('classifies missing, mismatch, and ambiguous lineage', () => {
    const base = { invalidation: event('PACKET'), sourceRef: evidence.sourceRef, expectedSourceRevision: evidence.sourceRevision, expectedWorkspaceRevision: evidence.workspaceRevision, expectedContentDigest: evidence.packetContentDigest };
    expect(planPacketChunkRepairV1({ ...base, evidence: null }).status).toBe('MISSING_PACKET');
    expect(planPacketChunkRepairV1({ ...base, evidence: { ...evidence, packetContentDigest: checksum('1') } }).status).toBe('PACKET_DIGEST_MISMATCH');
    expect(planPacketChunkRepairV1({ ...base, evidence: { ...evidence, candidateCount: 2 } }).status).toBe('AMBIGUOUS_LINEAGE');
  });
  it('reports batch counts without applying repair', () => {
    const base = { invalidation: event('PACKET'), sourceRef: evidence.sourceRef, expectedSourceRevision: evidence.sourceRevision, expectedWorkspaceRevision: evidence.workspaceRevision, expectedContentDigest: evidence.packetContentDigest };
    const result = planPacketChunkRepairBatchV1([{ ...base, evidence }, { ...base, evidence: null }]);
    expect(result.counts.READY_FOR_BOUNDED_REPAIR).toBe(1);
    expect(result.counts.MISSING_PACKET).toBe(1);
    expect(result.writesPerformed).toBe(false);
  });
});
