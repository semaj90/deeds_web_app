/**
 * @file atlas-tile-envelope-v1.ts
 * @brief Versioned, length-delimited cryptographic envelope for Arrow feature tiles.
 *
 * Implements the Parent Atlas ADMIT-01 Cryptographic Envelope Contract:
 * - Deterministic, fixed-size binary header
 * - Explicit lengths (header, payload, max decoded bytes)
 * - 6 SHA-256 digests (schema, workspace, source, representation, model, payload)
 * - Expiration timestamp and replay protection (run_id)
 * - Optional HMAC-SHA256 sender authentication tag
 * - Maximum byte bounds enforcement (default 64 MiB limit)
 * - Fail-closed validation before buffer parsing or memory allocation
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const ATLS_MAGIC = 0x534c5441; // 'ATLS' in little-endian ASCII (0x41, 0x54, 0x4C, 0x53)
export const ATLS_VERSION_1 = 1;

export const MAX_ENVELOPE_PAYLOAD_BYTES = 64 * 1024 * 1024; // 64 MiB
export const DEFAULT_ENVELOPE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const FLAG_HAS_HMAC = 0x01;
export const FLAG_COMPRESSED_PAYLOAD = 0x02;

/**
 * Binary layout offsets:
 * 0..3:    Magic (4B uint32)
 * 4..5:    Version (2B uint16)
 * 6..7:    Header Length (2B uint16)
 * 8..11:   Flags (4B uint32)
 * 12..19:  Payload Length (8B uint64)
 * 20..27:  Max Decoded Length (8B uint64)
 * 28..35:  Expires At (8B uint64 epoch ms)
 * 36..67:  Schema Digest (32B)
 * 68..99:  Workspace Revision SHA256 (32B)
 * 100..131: Source Revision SHA256 (32B)
 * 132..163: Representation Revision SHA256 (32B)
 * 164..195: Model Artifact SHA256 (32B)
 * 196..227: Payload SHA256 (32B)
 * 228..243: Producer ID (16B UUID)
 * 244..259: Run ID (16B UUID)
 * 260..291: Auth Tag / HMAC-SHA256 (32B)
 * Total header = 292 bytes
 */
export const ATLS_HEADER_V1_SIZE = 292;

export interface AtlasTileEnvelopeHeaderV1 {
  version: number;
  flags: number;
  payloadLength: number;
  maxDecodedLength: number;
  expiresAt: number;
  schemaDigest: string; // sha256:<64hex> or <64hex>
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  modelArtifactSha256: string;
  payloadSha256: string;
  producerId: string; // UUID string
  runId: string; // UUID string
  hasHmac: boolean;
}

export interface AtlasTileEnvelopeV1 {
  header: AtlasTileEnvelopeHeaderV1;
  payload: Buffer;
}

export class AtlasEnvelopeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`ATLAS_ENVELOPE_${code}: ${message}`);
    this.name = 'AtlasEnvelopeError';
  }
}

function normalizeSha256ToBuffer(hexOrPrefixed: string, fieldName: string): Buffer {
  const cleanHex = hexOrPrefixed.replace(/^sha256:/i, '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new AtlasEnvelopeError('INVALID_DIGEST_FORMAT', `${fieldName} must be a 64-character hexadecimal SHA-256 digest`);
  }
  return Buffer.from(cleanHex, 'hex');
}

function bufferToPrefixedSha256(buf: Buffer): string {
  return `sha256:${buf.toString('hex')}`;
}

function parseUuidToBuffer(uuidStr: string, fieldName: string): Buffer {
  const clean = uuidStr.replace(/-/g, '').trim();
  if (!/^[0-9a-fA-F]{32}$/.test(clean)) {
    throw new AtlasEnvelopeError('INVALID_UUID_FORMAT', `${fieldName} must be a valid 32-hex or 36-char UUID`);
  }
  return Buffer.from(clean, 'hex');
}

function bufferToUuid(buf: Buffer): string {
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Serializes an envelope header + payload into a length-delimited binary buffer.
 */
export function serializeAtlasTileEnvelopeV1(input: {
  payload: Buffer;
  schemaDigest: string;
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  modelArtifactSha256: string;
  producerId: string;
  runId: string;
  ttlMs?: number;
  maxDecodedLength?: number;
  secretKey?: string;
  compressed?: boolean;
}): Buffer {
  const { payload } = input;
  const payloadLength = payload.length;

  if (payloadLength === 0) {
    throw new AtlasEnvelopeError('EMPTY_PAYLOAD', 'Payload cannot be zero bytes');
  }
  if (payloadLength > MAX_ENVELOPE_PAYLOAD_BYTES) {
    throw new AtlasEnvelopeError('PAYLOAD_LIMIT_EXCEEDED', `Payload length ${payloadLength} exceeds maximum ${MAX_ENVELOPE_PAYLOAD_BYTES} bytes`);
  }

  const maxDecodedLength = input.maxDecodedLength ?? payloadLength;
  if (maxDecodedLength > MAX_ENVELOPE_PAYLOAD_BYTES) {
    throw new AtlasEnvelopeError('DECODED_LIMIT_EXCEEDED', `Max decoded length ${maxDecodedLength} exceeds maximum allowed`);
  }

  const payloadSha256Buf = createHash('sha256').update(payload).digest();
  const schemaDigestBuf = normalizeSha256ToBuffer(input.schemaDigest, 'schemaDigest');
  const workspaceRevBuf = normalizeSha256ToBuffer(input.workspaceRevision, 'workspaceRevision');
  const sourceRevBuf = normalizeSha256ToBuffer(input.sourceRevision, 'sourceRevision');
  const repRevBuf = normalizeSha256ToBuffer(input.representationRevision, 'representationRevision');
  const modelArtifactBuf = normalizeSha256ToBuffer(input.modelArtifactSha256, 'modelArtifactSha256');

  const producerIdBuf = parseUuidToBuffer(input.producerId, 'producerId');
  const runIdBuf = parseUuidToBuffer(input.runId, 'runId');

  const now = Date.now();
  const expiresAt = now + (input.ttlMs ?? DEFAULT_ENVELOPE_TTL_MS);

  let flags = 0;
  if (input.secretKey) flags |= FLAG_HAS_HMAC;
  if (input.compressed) flags |= FLAG_COMPRESSED_PAYLOAD;

  const headerBuf = Buffer.alloc(ATLS_HEADER_V1_SIZE);

  headerBuf.writeUInt32LE(ATLS_MAGIC, 0);
  headerBuf.writeUInt16LE(ATLS_VERSION_1, 4);
  headerBuf.writeUInt16LE(ATLS_HEADER_V1_SIZE, 6);
  headerBuf.writeUInt32LE(flags, 8);
  headerBuf.writeBigUInt64LE(BigInt(payloadLength), 12);
  headerBuf.writeBigUInt64LE(BigInt(maxDecodedLength), 20);
  headerBuf.writeBigUInt64LE(BigInt(expiresAt), 28);

  schemaDigestBuf.copy(headerBuf, 36);
  workspaceRevBuf.copy(headerBuf, 68);
  sourceRevBuf.copy(headerBuf, 100);
  repRevBuf.copy(headerBuf, 132);
  modelArtifactBuf.copy(headerBuf, 164);
  payloadSha256Buf.copy(headerBuf, 196);

  producerIdBuf.copy(headerBuf, 228);
  runIdBuf.copy(headerBuf, 244);

  // Compute HMAC over header[0..259] + payload if secretKey provided
  if (input.secretKey) {
    const hmac = createHmac('sha256', input.secretKey);
    hmac.update(headerBuf.subarray(0, 260));
    hmac.update(payload);
    const hmacBuf = hmac.digest();
    hmacBuf.copy(headerBuf, 260);
  } else {
    headerBuf.fill(0, 260, 292);
  }

  return Buffer.concat([headerBuf, payload]);
}

/**
 * Validates and decodes an envelope from a raw binary buffer without allocating unnecessary memory.
 */
export function deserializeAtlasTileEnvelopeV1(
  rawBuffer: Buffer,
  options?: {
    nowMs?: number;
    secretKey?: string;
    requireHmac?: boolean;
    expectedWorkspaceRevision?: string;
    expectedModelArtifactSha256?: string;
    maxAllowedPayloadBytes?: number;
  }
): AtlasTileEnvelopeV1 {
  if (rawBuffer.length < ATLS_HEADER_V1_SIZE) {
    throw new AtlasEnvelopeError('TRUNCATED_HEADER', `Buffer length ${rawBuffer.length} is less than header size ${ATLS_HEADER_V1_SIZE}`);
  }

  const magic = rawBuffer.readUInt32LE(0);
  if (magic !== ATLS_MAGIC) {
    throw new AtlasEnvelopeError('INVALID_MAGIC', `Expected magic 0x${ATLS_MAGIC.toString(16)}, got 0x${magic.toString(16)}`);
  }

  const version = rawBuffer.readUInt16LE(4);
  if (version !== ATLS_VERSION_1) {
    throw new AtlasEnvelopeError('UNSUPPORTED_VERSION', `Expected version ${ATLS_VERSION_1}, got ${version}`);
  }

  const headerLength = rawBuffer.readUInt16LE(6);
  if (headerLength !== ATLS_HEADER_V1_SIZE) {
    throw new AtlasEnvelopeError('INVALID_HEADER_LENGTH', `Expected header length ${ATLS_HEADER_V1_SIZE}, got ${headerLength}`);
  }

  const flags = rawBuffer.readUInt32LE(8);
  const KNOWN_FLAGS_MASK = FLAG_HAS_HMAC | FLAG_COMPRESSED_PAYLOAD;
  if ((flags & ~KNOWN_FLAGS_MASK) !== 0) {
    throw new AtlasEnvelopeError('UNKNOWN_FLAGS', `Header contains unknown flags: 0x${(flags & ~KNOWN_FLAGS_MASK).toString(16)}`);
  }

  const payloadLength = Number(rawBuffer.readBigUInt64LE(12));
  const maxDecodedLength = Number(rawBuffer.readBigUInt64LE(20));
  const expiresAt = Number(rawBuffer.readBigUInt64LE(28));

  if ((flags & FLAG_COMPRESSED_PAYLOAD) === 0 && maxDecodedLength < payloadLength) {
    throw new AtlasEnvelopeError('DECODED_LENGTH_BOUND', `Uncompressed payload maxDecodedLength ${maxDecodedLength} cannot be less than payloadLength ${payloadLength}`);
  }

  const maxAllowed = options?.maxAllowedPayloadBytes ?? MAX_ENVELOPE_PAYLOAD_BYTES;
  if (payloadLength > maxAllowed) {
    throw new AtlasEnvelopeError('PAYLOAD_TOO_LARGE', `Payload length ${payloadLength} exceeds allowed limit ${maxAllowed}`);
  }
  if (maxDecodedLength > maxAllowed) {
    throw new AtlasEnvelopeError('DECODED_TOO_LARGE', `Max decoded length ${maxDecodedLength} exceeds allowed limit ${maxAllowed}`);
  }

  const expectedTotalLength = ATLS_HEADER_V1_SIZE + payloadLength;
  if (rawBuffer.length !== expectedTotalLength) {
    throw new AtlasEnvelopeError('LENGTH_MISMATCH', `Buffer total size ${rawBuffer.length} does not match expected header+payload length ${expectedTotalLength}`);
  }

  const now = options?.nowMs ?? Date.now();
  if (expiresAt < now) {
    throw new AtlasEnvelopeError('EXPIRED', `Envelope expired at ${new Date(expiresAt).toISOString()} (current: ${new Date(now).toISOString()})`);
  }

  const schemaDigest = bufferToPrefixedSha256(rawBuffer.subarray(36, 68));
  const workspaceRevision = bufferToPrefixedSha256(rawBuffer.subarray(68, 100));
  const sourceRevision = bufferToPrefixedSha256(rawBuffer.subarray(100, 132));
  const representationRevision = bufferToPrefixedSha256(rawBuffer.subarray(132, 164));
  const modelArtifactSha256 = bufferToPrefixedSha256(rawBuffer.subarray(164, 196));
  const expectedPayloadSha256 = bufferToPrefixedSha256(rawBuffer.subarray(196, 228));

  const ZERO_SHA256 = 'sha256:' + '0'.repeat(64);
  if (workspaceRevision === ZERO_SHA256 || sourceRevision === ZERO_SHA256) {
    throw new AtlasEnvelopeError('ZERO_DIGEST_FORBIDDEN', 'Workspace and source revisions cannot be zero-filled digests');
  }

  const producerId = bufferToUuid(rawBuffer.subarray(228, 244));
  const runId = bufferToUuid(rawBuffer.subarray(244, 260));

  if (options?.expectedWorkspaceRevision && workspaceRevision !== options.expectedWorkspaceRevision) {
    throw new AtlasEnvelopeError('STALE_WORKSPACE_REVISION', `Envelope workspace revision ${workspaceRevision} does not match expected ${options.expectedWorkspaceRevision}`);
  }
  if (options?.expectedModelArtifactSha256 && modelArtifactSha256 !== options.expectedModelArtifactSha256) {
    throw new AtlasEnvelopeError('STALE_MODEL_REVISION', `Envelope model artifact ${modelArtifactSha256} does not match expected ${options.expectedModelArtifactSha256}`);
  }

  const payload = rawBuffer.subarray(ATLS_HEADER_V1_SIZE);

  // Validate payload checksum
  const actualPayloadSha256 = `sha256:${createHash('sha256').update(payload).digest('hex')}`;
  if (actualPayloadSha256 !== expectedPayloadSha256) {
    throw new AtlasEnvelopeError('PAYLOAD_CHECKSUM_MISMATCH', `Payload checksum ${actualPayloadSha256} does not match header ${expectedPayloadSha256}`);
  }

  const hasHmac = (flags & FLAG_HAS_HMAC) !== 0;

  if (options?.requireHmac && !options.secretKey) {
    throw new AtlasEnvelopeError('HMAC_VERIFIER_REQUIRED', 'A secret key is required for authenticated envelope verification');
  }

  if (options?.requireHmac && !hasHmac) {
    throw new AtlasEnvelopeError('MISSING_HMAC', 'Authenticated envelope verification requires an HMAC tag');
  }

  if (hasHmac && !options?.secretKey) {
    throw new AtlasEnvelopeError('HMAC_VERIFIER_REQUIRED', 'Envelope contains an HMAC tag but no verification key was provided');
  }

  if (options?.secretKey) {
    if (!hasHmac) {
      throw new AtlasEnvelopeError('MISSING_HMAC', 'Secret key provided for verification but envelope does not contain an HMAC tag');
    }
    const hmac = createHmac('sha256', options.secretKey);
    hmac.update(rawBuffer.subarray(0, 260));
    hmac.update(payload);
    const expectedAuthTag = hmac.digest();
    const actualAuthTag = rawBuffer.subarray(260, 292);

    if (!timingSafeEqual(expectedAuthTag, actualAuthTag)) {
      throw new AtlasEnvelopeError('HMAC_AUTHENTICATION_FAILED', 'Envelope HMAC signature verification failed');
    }
  }

  return {
    header: {
      version,
      flags,
      payloadLength,
      maxDecodedLength,
      expiresAt,
      schemaDigest,
      workspaceRevision,
      sourceRevision,
      representationRevision,
      modelArtifactSha256,
      payloadSha256: expectedPayloadSha256,
      producerId,
      runId,
      hasHmac,
    },
    payload,
  };
}
