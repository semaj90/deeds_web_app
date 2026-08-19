import { createHash, randomUUID } from 'node:crypto';
import {
  PacketTopologyEnvelopeSchema,
  type PacketTopologyEnvelope,
} from '$lib/server/db/packet-topology-envelope.js';
import { encodePacketToMsgpack } from '$lib/server/serialization/packet-msgpack-codec.js';

export type CanonicalPacketTransportMode =
  | 'JSON_INLINE'
  | 'MSGPACK_INLINE'
  | 'PROTOBUF_INLINE'
  | 'ARROW_IPC_REF'
  | 'MMAP_REF'
  | 'OBJECT_REF'
  | 'PACKET_REF_ONLY';

export interface CanonicalPacketTransportV1 {
  schema: 'atlas.canonical-packet-transport.v1';
  transportId: string;
  requestId?: string;
  packetKey: string;
  sourceRef: string;
  canonicalId?: string;
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  featureRevision?: string;
  graphRevision?: string;
  ontologyRevision?: string;
  contextManifestId?: string;
  payload: {
    mode: CanonicalPacketTransportMode;
    mediaType: string;
    byteLength: number;
    contentChecksum: string;
    dataRefId?: string;
    inlineJson?: Record<string, unknown>;
    inlineBytesBase64?: string;
  };
  evidenceRefs: string[];
  ontologyIds: string[];
  conceptIds: string[];
  hyperedgeRefs: string[];
  validationReceiptId?: string;
  materializationReceiptId?: string;
  producerRevision: string;
  checksum: string;
}

export interface PacketTransportRevisionContext {
  workspaceRevision: string;
  sourceRevision: string;
  representationRevision: string;
  featureRevision?: string;
  graphRevision?: string;
  ontologyRevision?: string;
  producerRevision: string;
  requestId?: string;
  canonicalId?: string;
  contextManifestId?: string;
  validationReceiptId?: string;
  materializationReceiptId?: string;
  evidenceRefs?: string[];
  hyperedgeRefs?: string[];
}

function sha256(input: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

/**
 * Stable logical checksum input. This is intentionally independent from
 * MessagePack/protobuf encoder bytes; transport encoding is not canonical identity.
 */
function logicalChecksumInput(value: Omit<CanonicalPacketTransportV1, 'checksum'>): string {
  const stable = {
    schema: value.schema,
    transportId: value.transportId,
    requestId: value.requestId ?? null,
    packetKey: value.packetKey,
    sourceRef: value.sourceRef,
    canonicalId: value.canonicalId ?? null,
    workspaceRevision: value.workspaceRevision,
    sourceRevision: value.sourceRevision,
    representationRevision: value.representationRevision,
    featureRevision: value.featureRevision ?? null,
    graphRevision: value.graphRevision ?? null,
    ontologyRevision: value.ontologyRevision ?? null,
    contextManifestId: value.contextManifestId ?? null,
    payload: {
      mode: value.payload.mode,
      mediaType: value.payload.mediaType,
      byteLength: value.payload.byteLength,
      contentChecksum: value.payload.contentChecksum,
      dataRefId: value.payload.dataRefId ?? null,
    },
    evidenceRefs: [...value.evidenceRefs].sort(),
    ontologyIds: [...value.ontologyIds].sort(),
    conceptIds: [...value.conceptIds].sort(),
    hyperedgeRefs: [...value.hyperedgeRefs].sort(),
    validationReceiptId: value.validationReceiptId ?? null,
    materializationReceiptId: value.materializationReceiptId ?? null,
    producerRevision: value.producerRevision,
  };
  return JSON.stringify(stable);
}

export function packetToReferenceTransport(
  packetInput: unknown,
  revisions: PacketTransportRevisionContext,
): CanonicalPacketTransportV1 {
  const packet = PacketTopologyEnvelopeSchema.parse(packetInput);
  const base: Omit<CanonicalPacketTransportV1, 'checksum'> = {
    schema: 'atlas.canonical-packet-transport.v1',
    transportId: randomUUID(),
    requestId: revisions.requestId,
    packetKey: packet.packet_key,
    sourceRef: packet.source_ref,
    canonicalId: revisions.canonicalId,
    workspaceRevision: revisions.workspaceRevision,
    sourceRevision: revisions.sourceRevision,
    representationRevision: revisions.representationRevision,
    featureRevision: revisions.featureRevision,
    graphRevision: revisions.graphRevision,
    ontologyRevision: revisions.ontologyRevision,
    contextManifestId: revisions.contextManifestId,
    payload: {
      mode: 'PACKET_REF_ONLY',
      mediaType: 'application/vnd.parent-atlas.packet-ref+json',
      byteLength: 0,
      contentChecksum: sha256(''),
    },
    evidenceRefs: revisions.evidenceRefs ?? packet.runtime_evidence_refs ?? [],
    ontologyIds: packet.ontology_ids ?? [],
    conceptIds: packet.concept_ids ?? [],
    hyperedgeRefs: revisions.hyperedgeRefs ?? [],
    validationReceiptId: revisions.validationReceiptId,
    materializationReceiptId: revisions.materializationReceiptId,
    producerRevision: revisions.producerRevision,
  };
  return { ...base, checksum: sha256(logicalChecksumInput(base)) };
}

export function packetToJsonTransport(
  packetInput: unknown,
  revisions: PacketTransportRevisionContext,
): CanonicalPacketTransportV1 {
  const packet = PacketTopologyEnvelopeSchema.parse(packetInput);
  const json = JSON.stringify(packet);
  const base = packetToReferenceTransport(packet, revisions);
  const next: Omit<CanonicalPacketTransportV1, 'checksum'> = {
    ...base,
    payload: {
      mode: 'JSON_INLINE',
      mediaType: 'application/vnd.parent-atlas.packet+json',
      byteLength: Buffer.byteLength(json),
      contentChecksum: sha256(json),
      inlineJson: packet as unknown as Record<string, unknown>,
    },
  };
  return { ...next, checksum: sha256(logicalChecksumInput(next)) };
}

export function packetToMsgpackTransport(
  packetInput: unknown,
  revisions: PacketTransportRevisionContext,
): CanonicalPacketTransportV1 {
  const packet: PacketTopologyEnvelope = PacketTopologyEnvelopeSchema.parse(packetInput);
  const bytes = encodePacketToMsgpack(packet);
  const base = packetToReferenceTransport(packet, revisions);
  const next: Omit<CanonicalPacketTransportV1, 'checksum'> = {
    ...base,
    payload: {
      mode: 'MSGPACK_INLINE',
      mediaType: 'application/vnd.parent-atlas.packet+msgpack',
      byteLength: bytes.byteLength,
      contentChecksum: sha256(bytes),
      inlineBytesBase64: Buffer.from(bytes).toString('base64'),
    },
  };
  return { ...next, checksum: sha256(logicalChecksumInput(next)) };
}

export function packetToDataRefTransport(
  packetInput: unknown,
  revisions: PacketTransportRevisionContext,
  dataRef: {
    mode: 'ARROW_IPC_REF' | 'MMAP_REF' | 'OBJECT_REF';
    dataRefId: string;
    mediaType: string;
    byteLength: number;
    contentChecksum: string;
  },
): CanonicalPacketTransportV1 {
  const packet = PacketTopologyEnvelopeSchema.parse(packetInput);
  const base = packetToReferenceTransport(packet, revisions);
  const next: Omit<CanonicalPacketTransportV1, 'checksum'> = {
    ...base,
    payload: { ...dataRef },
  };
  return { ...next, checksum: sha256(logicalChecksumInput(next)) };
}
