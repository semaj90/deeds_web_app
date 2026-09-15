import { describe, expect, it } from 'vitest';
import { buildPacketDigestBridgeV1 } from './packet-digest-bridge-v1.js';
import { decidePacketWrite } from './packet-write-decision-v1.js';

const admission = {
  status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' as const,
  authority: true as const,
  workspaceRevision: 'sha256:' + 'a'.repeat(64),
  snapshotRevision: 'sha256:' + 'b'.repeat(64),
  sourceInventoryChecksum: 'sha256:' + 'c'.repeat(64),
  sourceSelectionChecksum: 'sha256:' + 'd'.repeat(64),
  admissionReceiptChecksum: 'sha256:' + 'e'.repeat(64),
};

const baseInput = {
  packetKey: 'packet:canonical:file:src/lib/example.ts',
  sourceRef: 'src/lib/example.ts',
  sourceContent: 'export const answer = 42;\n',
  admission,
};

describe('PacketDigestBridgeV1', () => {
  it('derives stable source revision/content identity from exact bytes', () => {
    const first = buildPacketDigestBridgeV1(baseInput);
    const second = buildPacketDigestBridgeV1(baseInput);

    expect(first).toEqual(second);
    expect(first.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sourceRevision).toBe(`sha256:${first.contentDigest}`);
    expect(first.byteLength).toBe(Buffer.byteLength(baseInput.sourceContent, 'utf8'));
    expect(first.bridgeChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesPerformed).toBe(false);
  });

  it('changes source revision and bridge checksum when exact source bytes change', () => {
    const first = buildPacketDigestBridgeV1(baseInput);
    const second = buildPacketDigestBridgeV1({
      ...baseInput,
      sourceContent: 'export const answer = 43;\n',
    });

    expect(second.sourceRevision).not.toBe(first.sourceRevision);
    expect(second.contentDigest).not.toBe(first.contentDigest);
    expect(second.bridgeChecksum).not.toBe(first.bridgeChecksum);
  });

  it('binds the same source bytes to the explicitly admitted workspace frame', () => {
    const first = buildPacketDigestBridgeV1(baseInput);
    const second = buildPacketDigestBridgeV1({
      ...baseInput,
      admission: {
        ...admission,
        workspaceRevision: 'sha256:' + 'f'.repeat(64),
      },
    });

    expect(second.sourceRevision).toBe(first.sourceRevision);
    expect(second.contentDigest).toBe(first.contentDigest);
    expect(second.workspaceRevision).not.toBe(first.workspaceRevision);
    expect(second.bridgeChecksum).not.toBe(first.bridgeChecksum);
  });

  it('rejects non-admitted workspace evidence', () => {
    expect(() => buildPacketDigestBridgeV1({
      ...baseInput,
      admission: {
        ...admission,
        authority: false as true,
      },
    })).toThrow('PACKET_DIGEST_BRIDGE_WORKSPACE_NOT_ADMITTED');
  });

  it('rejects a sourceRef that still needs path normalization', () => {
    expect(() => buildPacketDigestBridgeV1({
      ...baseInput,
      sourceRef: 'src\\lib\\example.ts',
    })).toThrow('PACKET_DIGEST_BRIDGE_SOURCE_REF_NOT_CANONICAL');
  });

  it('projects exactly into the existing packet write-decision request shape', () => {
    const bridge = buildPacketDigestBridgeV1(baseInput);
    expect(bridge.packetWriteRequest).toEqual({
      packetKey: bridge.packetKey,
      sourceRef: bridge.sourceRef,
      sourceRevision: bridge.sourceRevision,
      workspaceRevision: bridge.workspaceRevision,
      contentDigest: bridge.contentDigest,
    });

    const decision = decidePacketWrite(
      {
        exists: false,
        packetKey: bridge.packetKey,
        sourceRef: null,
        sourceRevision: null,
        workspaceRevision: null,
        contentDigest: null,
      },
      bridge.packetWriteRequest,
    );
    expect(decision.decision).toBe('INSERT_NEW');
  });

  it('exposes the exact observation identity without fabricating canonical authority', () => {
    const bridge = buildPacketDigestBridgeV1(baseInput);
    expect(bridge.observationIdentity).toEqual({
      packetKey: bridge.packetKey,
      sourceRef: bridge.sourceRef,
      sourceRevision: bridge.sourceRevision,
      workspaceRevision: bridge.workspaceRevision,
      contentDigest: bridge.contentDigest,
    });
    expect(bridge.canonicalAuthority).toBe(false);
  });
});
