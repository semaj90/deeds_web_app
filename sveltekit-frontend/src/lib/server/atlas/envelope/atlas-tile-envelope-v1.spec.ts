import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  serializeAtlasTileEnvelopeV1,
  deserializeAtlasTileEnvelopeV1,
  AtlasEnvelopeError,
  ATLS_HEADER_V1_SIZE,
} from './atlas-tile-envelope-v1.js';

describe('AtlasTileEnvelopeV1 Cryptographic Envelope Contract', () => {
  const dummyPayload = Buffer.from('TEST_ARROW_IPC_PAYLOAD_BYTES_XYZ_123456');
  const dummySha256 = 'sha256:' + 'a'.repeat(64);
  const producerId = randomUUID();
  const runId = randomUUID();

  it('serializes and deserializes a valid envelope cleanly', () => {
    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: dummySha256,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: dummySha256,
      producerId,
      runId,
      ttlMs: 60000,
    });

    expect(raw.length).toBe(ATLS_HEADER_V1_SIZE + dummyPayload.length);

    const decoded = deserializeAtlasTileEnvelopeV1(raw);
    expect(decoded.header.version).toBe(1);
    expect(decoded.header.payloadLength).toBe(dummyPayload.length);
    expect(decoded.header.producerId).toBe(producerId);
    expect(decoded.header.runId).toBe(runId);
    expect(decoded.payload.toString()).toBe('TEST_ARROW_IPC_PAYLOAD_BYTES_XYZ_123456');
  });

  it('rejects expired envelope', () => {
    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: dummySha256,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: dummySha256,
      producerId,
      runId,
      ttlMs: -1000, // already expired
    });

    expect(() => deserializeAtlasTileEnvelopeV1(raw)).toThrow(
      /ATLAS_ENVELOPE_EXPIRED/
    );
  });

  it('detects payload tampering / checksum mismatch', () => {
    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: dummySha256,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: dummySha256,
      producerId,
      runId,
    });

    // Tamper with one byte in the payload
    raw[raw.length - 1] ^= 0xff;

    expect(() => deserializeAtlasTileEnvelopeV1(raw)).toThrow(
      /ATLAS_ENVELOPE_PAYLOAD_CHECKSUM_MISMATCH/
    );
  });

  it('verifies HMAC signature and rejects forged payload or wrong secret', () => {
    const secretKey = 'test-secret-salt-123';
    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: dummySha256,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: dummySha256,
      producerId,
      runId,
      secretKey,
    });

    // Valid secret passes
    const valid = deserializeAtlasTileEnvelopeV1(raw, { secretKey });
    expect(valid.header.hasHmac).toBe(true);

    // Wrong secret throws
    expect(() =>
      deserializeAtlasTileEnvelopeV1(raw, { secretKey: 'wrong-secret' })
    ).toThrow(/ATLAS_ENVELOPE_HMAC_AUTHENTICATION_FAILED/);
  });

  it('enforces expected workspace and model revision matching', () => {
    const rev1 = 'sha256:' + '1'.repeat(64);
    const rev2 = 'sha256:' + '2'.repeat(64);

    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: rev1,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: rev1,
      producerId,
      runId,
    });

    expect(() =>
      deserializeAtlasTileEnvelopeV1(raw, { expectedWorkspaceRevision: rev2 })
    ).toThrow(/ATLAS_ENVELOPE_STALE_WORKSPACE_REVISION/);

    expect(() =>
      deserializeAtlasTileEnvelopeV1(raw, { expectedModelArtifactSha256: rev2 })
    ).toThrow(/ATLAS_ENVELOPE_STALE_MODEL_REVISION/);
  });

  it('rejects truncated header and oversized buffers', () => {
    const truncated = Buffer.alloc(50);
    expect(() => deserializeAtlasTileEnvelopeV1(truncated)).toThrow(
      /ATLAS_ENVELOPE_TRUNCATED_HEADER/
    );

    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: dummySha256,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: dummySha256,
      producerId,
      runId,
    });

    expect(() =>
      deserializeAtlasTileEnvelopeV1(raw, { maxAllowedPayloadBytes: 10 })
    ).toThrow(/ATLAS_ENVELOPE_PAYLOAD_TOO_LARGE/);
  });

  it('rejects envelope with unknown flags', () => {
    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: dummySha256,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: dummySha256,
      producerId,
      runId,
    });

    // Set unknown flag bit 0x08
    raw.writeUInt32LE(0x08, 8);

    expect(() => deserializeAtlasTileEnvelopeV1(raw)).toThrow(
      /ATLAS_ENVELOPE_UNKNOWN_FLAGS/
    );
  });

  it('rejects envelope with zero-filled workspace or source digest', () => {
    const zeroSha256 = 'sha256:' + '0'.repeat(64);
    const raw = serializeAtlasTileEnvelopeV1({
      payload: dummyPayload,
      schemaDigest: dummySha256,
      workspaceRevision: zeroSha256,
      sourceRevision: dummySha256,
      representationRevision: dummySha256,
      modelArtifactSha256: dummySha256,
      producerId,
      runId,
    });

    expect(() => deserializeAtlasTileEnvelopeV1(raw)).toThrow(
      /ATLAS_ENVELOPE_ZERO_DIGEST_FORBIDDEN/
    );
  });
});
