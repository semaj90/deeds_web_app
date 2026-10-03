import { z } from 'zod';
import { sha256HexV1 } from './knowledge/stable-json-v1.js';
import { acePacketV3Schema, verifyAcePacketV3, type AcePacketV3 } from './ace-packet-v3.js';

const revision = z.string().min(1);
const ordinalMapChecksum = z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/);

/**
 * atlas.ace-packet.v4 — a stored V3 packet bound to one CandidateOrdinalMapV1
 * coordinate. CandidateOrdinal remains a snapshot-scoped execution coordinate,
 * never packet identity. The consumer must still resolve this tuple against
 * the pinned canonical map before using a referenced vector.
 */
export const acePacketV4CoordinatesSchema = z.object({
  candidateOrdinal: z.number().int().nonnegative().max(0xffff_ffff),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: revision,
  workspaceRevision: revision,
  candidateSnapshotRevision: revision,
  ordinalMapChecksum,
}).strict();

const acePacketV4FieldsSchema = z.object({
  schema: z.literal('atlas.ace-packet.v4'),
  packet: acePacketV3Schema,
  coordinates: acePacketV4CoordinatesSchema,
}).strict();

function refineCoordinates(value: { packet: AcePacketV3; coordinates: AcePacketV4Coordinates }, ctx: z.RefinementCtx) {
  const { packet, coordinates } = value;
  const same = (a: string, b: string, path: (string | number)[], message: string) => {
    if (a !== b) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  };

  same(coordinates.packetKey, packet.identity.packet_key, ['coordinates', 'packetKey'], 'PACKET_KEY_COORDINATE_MISMATCH');
  same(coordinates.canonicalId, coordinates.packetKey, ['coordinates', 'canonicalId'], 'PACKET_CANONICAL_ID_MUST_USE_PACKET_KEY');
  same(coordinates.sourceRef, packet.identity.source_ref, ['coordinates', 'sourceRef'], 'SOURCE_REF_COORDINATE_MISMATCH');
  same(coordinates.sourceRevision, packet.identity.source_revision, ['coordinates', 'sourceRevision'], 'SOURCE_REVISION_COORDINATE_MISMATCH');
  same(coordinates.workspaceRevision, packet.identity.workspace_revision, ['coordinates', 'workspaceRevision'], 'WORKSPACE_REVISION_COORDINATE_MISMATCH');

  const vectorRef = packet.semantic.data.embedding.data.vector_ref;
  if (vectorRef?.kind === 'CANDIDATE_ORDINAL') {
    const parsedOrdinal = /^(0|[1-9][0-9]*)$/.test(vectorRef.value) ? Number(vectorRef.value) : NaN;
    if (!Number.isSafeInteger(parsedOrdinal) || parsedOrdinal !== coordinates.candidateOrdinal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['packet', 'semantic', 'data', 'embedding', 'data', 'vector_ref'], message: 'VECTOR_ORDINAL_COORDINATE_MISMATCH' });
    }
  }
}

const acePacketV4BodySchema = acePacketV4FieldsSchema.superRefine(refineCoordinates);

export const acePacketV4Schema = acePacketV4FieldsSchema.extend({
  integrity: z.object({ envelopeChecksum: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict(),
}).superRefine((value, ctx) => {
  refineCoordinates(value, ctx);
  const { integrity, ...body } = value;
  const expected = `sha256:${sha256HexV1(body)}`;
  if (integrity.envelopeChecksum !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['integrity', 'envelopeChecksum'], message: 'ACE_PACKET_V4_CHECKSUM_MISMATCH' });
  }
});

export type AcePacketV4Coordinates = z.infer<typeof acePacketV4CoordinatesSchema>;
export type AcePacketV4 = z.infer<typeof acePacketV4Schema>;

export function buildAcePacketV4(input: { packet: AcePacketV3 | unknown; coordinates: AcePacketV4Coordinates }): AcePacketV4 {
  const packet = verifyAcePacketV3(input.packet);
  const body = acePacketV4BodySchema.parse({ schema: 'atlas.ace-packet.v4', packet, coordinates: input.coordinates });
  return acePacketV4Schema.parse({ ...body, integrity: { envelopeChecksum: `sha256:${sha256HexV1(body)}` } });
}

export function verifyAcePacketV4(value: unknown): AcePacketV4 {
  return acePacketV4Schema.parse(value);
}
