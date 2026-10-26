import { createHash } from 'node:crypto';
import {
  PacketRepresentationManifestV1Schema,
  type PacketRepresentationManifestV1,
} from './packet-representation-manifest-v1.js';

export type PacketRepresentationExpectedIdentityV1 = Pick<
  PacketRepresentationManifestV1,
  'packetKey' | 'packetRevisionId' | 'sourceRevision' | 'workspaceRevision' | 'representationRevision'
>;

export type PacketRepresentationReadbackResultV1 =
  | {
      status: 'VERIFIED';
      manifest: PacketRepresentationManifestV1;
      bytes: Uint8Array;
      receipt: {
        schema: 'atlas.packet-representation-readback.v1';
        packetKey: string;
        packetRevisionId: string;
        representationRevision: string;
        contentDigest: string;
        byteLength: number;
        canonicalAuthority: false;
      };
    }
  | {
      status: 'NOT_FOUND' | 'STALE_REVISION' | 'DIGEST_MISMATCH' | 'UNSUPPORTED_CODEC'
        | 'BYTE_LENGTH_MISMATCH' | 'BYTE_BUDGET_EXCEEDED' | 'INVALID_MANIFEST';
      reason: string;
    };

const SUPPORTED_READBACK_CODECS = new Set([
  'raw-f32-le',
  'raw-f16-le',
  'raw-i8',
  'arrow-ipc',
  'mmap-raw',
]);

export function verifyPacketRepresentationReadbackV1(input: {
  manifest: unknown;
  expected: PacketRepresentationExpectedIdentityV1;
  bytes: Uint8Array | null;
  maximumBytes: number;
}): PacketRepresentationReadbackResultV1 {
  if (input.bytes === null) return { status: 'NOT_FOUND', reason: 'ARTIFACT_BYTES_MISSING' };
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes <= 0) {
    return { status: 'BYTE_BUDGET_EXCEEDED', reason: 'INVALID_BYTE_BUDGET' };
  }

  if (
    typeof input.manifest === 'object' && input.manifest !== null
    && 'codec' in input.manifest
    && typeof input.manifest.codec === 'string'
    && !SUPPORTED_READBACK_CODECS.has(input.manifest.codec)
  ) {
    return { status: 'UNSUPPORTED_CODEC', reason: 'CODEC_NOT_ALLOWLISTED' };
  }

  const parsed = PacketRepresentationManifestV1Schema.safeParse(input.manifest);
  if (!parsed.success) return { status: 'INVALID_MANIFEST', reason: 'MANIFEST_SCHEMA_INVALID' };
  const manifest = parsed.data;
  if (
    manifest.packetKey !== input.expected.packetKey
    || manifest.packetRevisionId !== input.expected.packetRevisionId
    || manifest.sourceRevision !== input.expected.sourceRevision
    || manifest.workspaceRevision !== input.expected.workspaceRevision
    || manifest.representationRevision !== input.expected.representationRevision
  ) {
    return { status: 'STALE_REVISION', reason: 'EXPECTED_IDENTITY_OR_REVISION_MISMATCH' };
  }
  if (manifest.byteLength > input.maximumBytes || input.bytes.byteLength > input.maximumBytes) {
    return { status: 'BYTE_BUDGET_EXCEEDED', reason: 'ARTIFACT_EXCEEDS_BYTE_BUDGET' };
  }
  if (input.bytes.byteLength !== manifest.byteLength) {
    return { status: 'BYTE_LENGTH_MISMATCH', reason: 'ARTIFACT_LENGTH_DIFFERS_FROM_MANIFEST' };
  }

  const actualDigest = `sha256:${createHash('sha256').update(input.bytes).digest('hex')}`;
  if (actualDigest !== manifest.contentDigest.toLowerCase()) {
    return { status: 'DIGEST_MISMATCH', reason: 'ARTIFACT_DIGEST_DIFFERS_FROM_MANIFEST' };
  }

  return {
    status: 'VERIFIED',
    manifest,
    bytes: input.bytes,
    receipt: {
      schema: 'atlas.packet-representation-readback.v1',
      packetKey: manifest.packetKey,
      packetRevisionId: manifest.packetRevisionId,
      representationRevision: manifest.representationRevision,
      contentDigest: actualDigest,
      byteLength: input.bytes.byteLength,
      canonicalAuthority: false,
    },
  };
}
