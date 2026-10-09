import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { resolveAdmittedSourceRevisionV1 } from './admitted-source-revision-resolver-v1.js';
import { resolvePacketKeyResolutionV2 } from './packet-identity-resolver.js';
import type { PacketKeyResolutionV2 } from './packet-key-resolution-v2.js';
import type { AdmittedSourceRevisionV1 } from './admitted-source-revision-resolver-v1.js';

export type GroundedExtractionSourceBindingReceiptV1 = {
  schema: 'atlas.grounded-extraction-source-binding-receipt.v1';
  status: 'VERIFIED_SOURCE_BINDING';
  canonicalPacketKey: string;
  storagePacketKey: string;
  packetResolutionSource: PacketKeyResolutionV2['resolutionSource'];
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  sourceBindingChecksum: string;
  submittedTextChecksum: string;
  byteLength: number;
  checksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
};

export class GroundedExtractionSourceBindingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GroundedExtractionSourceBindingError';
  }
}

export function validateGroundedExtractionSourceBindingV1(input: {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  submittedText: string;
  packetResolution: PacketKeyResolutionV2;
  packetRows: Array<{ packetKey: string | null; sourceRef: string; sourceRevision: string | null }>;
  admittedSource: AdmittedSourceRevisionV1;
}): GroundedExtractionSourceBindingReceiptV1 {
  const submittedBytes = Buffer.from(input.submittedText, 'utf8');
  const submittedTextChecksum = `sha256:${createHash('sha256').update(submittedBytes).digest('hex')}`;
  if (input.packetRows.length !== 1) throw new GroundedExtractionSourceBindingError('PACKET_ROW_MISSING_OR_AMBIGUOUS');
  const packet = input.packetRows[0]!;
  if (packet.packetKey !== input.packetResolution.storagePacketKey) {
    throw new GroundedExtractionSourceBindingError('PACKET_STORAGE_IDENTITY_MISMATCH');
  }
  if (packet.sourceRef !== input.sourceRef || input.admittedSource.sourceRef !== input.sourceRef) {
    throw new GroundedExtractionSourceBindingError('PACKET_SOURCE_REF_MISMATCH');
  }
  if (
    !input.sourceRevision
    || input.sourceRevision !== submittedTextChecksum
    || packet.sourceRevision !== input.sourceRevision
    || input.admittedSource.sourceRevision !== input.sourceRevision
  ) {
    throw new GroundedExtractionSourceBindingError('SOURCE_REVISION_BINDING_MISMATCH');
  }
  if (input.admittedSource.workspaceRevision !== input.workspaceRevision) {
    throw new GroundedExtractionSourceBindingError('WORKSPACE_REVISION_BINDING_MISMATCH');
  }

  const content = {
    schema: 'atlas.grounded-extraction-source-binding-receipt.v1' as const,
    status: 'VERIFIED_SOURCE_BINDING' as const,
    canonicalPacketKey: input.packetResolution.canonicalPacketKey,
    storagePacketKey: input.packetResolution.storagePacketKey,
    packetResolutionSource: input.packetResolution.resolutionSource,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    sourceBindingChecksum: input.admittedSource.bindingChecksum,
    submittedTextChecksum,
    byteLength: submittedBytes.byteLength,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return {
    ...content,
    checksum: `sha256:${createHash('sha256').update(JSON.stringify(content), 'utf8').digest('hex')}`,
  };
}

export async function resolveGroundedExtractionSourceBindingV1(input: {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  submittedText: string;
}): Promise<GroundedExtractionSourceBindingReceiptV1> {
  const [packetResolution, admittedSource] = await Promise.all([
    resolvePacketKeyResolutionV2(input.packetKey),
    resolveAdmittedSourceRevisionV1({
      sourceRef: input.sourceRef,
      workspaceRevision: input.workspaceRevision,
    }),
  ]);
  const packetRows = await db.select({
    packetKey: atlasPackets.packetKey,
    sourceRef: atlasPackets.sourceRef,
    sourceRevision: atlasPackets.sourceRevision,
  }).from(atlasPackets).where(eq(atlasPackets.packetKey, packetResolution.storagePacketKey)).limit(2);

  return validateGroundedExtractionSourceBindingV1({
    ...input,
    packetResolution,
    packetRows,
    admittedSource,
  });
}
