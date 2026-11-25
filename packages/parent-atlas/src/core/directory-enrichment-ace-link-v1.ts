import { z } from 'zod';
import { verifyAcePacketV3 } from './ace-packet-v3.js';
import { sha256HexV1 } from './knowledge/stable-json-v1.js';

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const directoryEnrichmentHintV2Schema = z.object({
  schema: z.literal('atlas.directory-enrichment-hint.v2'),
  directory_path: z.string(),
  status: z.literal('HINT'),
  packet_identity: z.null(),
  workspace_revision: z.string().min(1),
  inventory_manifest_digest: sha256,
  producer_revision: z.string().min(1),
  kv: z.record(z.string(), z.union([z.string(), z.number()])),
  evidence_digest: sha256,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

const directoryEnrichmentAceLinkBodyV1Schema = z.object({
  schema: z.literal('atlas.ace-directory-enrichment-link.v1'),
  status: z.literal('HINT'),
  packet_key: z.string().min(1),
  packet_checksum: sha256,
  source_ref: z.string().min(1),
  directory_path: z.string(),
  workspace_revision: z.string().min(1),
  inventory_manifest_digest: sha256,
  producer_revision: z.string().min(1),
  directory_evidence_digest: sha256,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export const directoryEnrichmentAceLinkV1Schema = directoryEnrichmentAceLinkBodyV1Schema.extend({
  proposal_checksum: sha256,
}).strict();

export type DirectoryEnrichmentHintV2 = z.infer<typeof directoryEnrichmentHintV2Schema>;
export type DirectoryEnrichmentAceLinkV1 = z.infer<typeof directoryEnrichmentAceLinkV1Schema>;

const sourcePath = z.string().min(1).refine((value) =>
  !/[\\:\x00-\x1f]/.test(value)
  && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'));
const directoryInventorySchema = z.object({
  schema: z.literal('atlas.directory-source-inventory.v1'),
  repositoryScope: z.string().min(1),
  workspace_revision: sha256,
  members: z.array(z.object({
    sourceIdentityKey: z.string().min(1),
    sourceRef: sourcePath,
    sourceRevision: sha256,
    contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
    byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).strict()).min(1),
  exclusions: z.array(z.object({ path: sourcePath, reason: z.string().min(1) }).strict()),
}).strict();

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const parentDirectory = (sourceRef: string) => sourceRef.slice(0, Math.max(0, sourceRef.lastIndexOf('/')));

export function computeDirectoryEnrichmentDigestsV1(inventoryInput: unknown, hintInput: unknown) {
  const inventory = directoryInventorySchema.parse(inventoryInput);
  const hint = directoryEnrichmentHintV2Schema.parse(hintInput);
  if (inventory.workspace_revision !== hint.workspace_revision) throw new Error('WORKSPACE_REVISION_MISMATCH');

  const members = [...inventory.members].sort((a, b) => compareText(a.sourceRef, b.sourceRef));
  const exclusions = [...inventory.exclusions].sort((a, b) => compareText(a.path, b.path) || compareText(a.reason, b.reason));
  const memberRefs = new Set(members.map((member) => member.sourceRef));
  if (memberRefs.size !== members.length
    || new Set(members.map((member) => member.sourceIdentityKey)).size !== members.length
    || exclusions.some((exclusion) => memberRefs.has(exclusion.path))
    || new Set(exclusions.map((exclusion) => exclusion.path)).size !== exclusions.length) {
    throw new Error('DIRECTORY_INVENTORY_MEMBERSHIP_CONFLICT');
  }
  if (members.some((member) => member.sourceRevision !== `sha256:${member.contentDigest}`)) {
    throw new Error('SOURCE_REVISION_CONTENT_DIGEST_MISMATCH');
  }
  const directoryMembers = members.filter((member) => parentDirectory(member.sourceRef) === hint.directory_path);
  if (!directoryMembers.length) throw new Error('DIRECTORY_MEMBERSHIP_NOT_EXACT');

  const inventoryManifestDigest = `sha256:${sha256HexV1({ ...inventory, members, exclusions })}`;
  const evidenceDigest = `sha256:${sha256HexV1({
    directory_path: hint.directory_path,
    workspace_revision: hint.workspace_revision,
    inventory_manifest_digest: inventoryManifestDigest,
    members: directoryMembers,
    producer_revision: hint.producer_revision,
    structural_card_digest: `sha256:${sha256HexV1(hint.kv)}`,
  })}`;
  return { inventoryManifestDigest, evidenceDigest, directoryMembers };
}

/** The caller supplies the digest pinned by the admitted inventory owner and its manifest readback. */
export function verifyDirectoryEnrichmentAceLinkV1(
  packetInput: unknown,
  hintInput: unknown,
  inventoryReadback: unknown,
  admittedInventoryDigest: string,
): DirectoryEnrichmentAceLinkV1 {
  const packet = verifyAcePacketV3(packetInput);
  const hint = directoryEnrichmentHintV2Schema.parse(hintInput);
  const link = proposeDirectoryEnrichmentAceLinkV1(packet, hint);
  const digests = computeDirectoryEnrichmentDigestsV1(inventoryReadback, hint);
  if (digests.inventoryManifestDigest !== admittedInventoryDigest
    || digests.inventoryManifestDigest !== hint.inventory_manifest_digest) {
    throw new Error('DIRECTORY_INVENTORY_DIGEST_MISMATCH');
  }
  if (digests.evidenceDigest !== hint.evidence_digest) throw new Error('DIRECTORY_EVIDENCE_DIGEST_MISMATCH');
  if (!digests.directoryMembers.some((member) =>
    member.sourceRef === packet.identity.source_ref && member.sourceRevision === packet.identity.source_revision)) {
    throw new Error('DIRECTORY_SOURCE_BINDING_MISMATCH');
  }
  return link;
}

export function proposeDirectoryEnrichmentAceLinkV1(packetInput: unknown, hintInput: unknown): DirectoryEnrichmentAceLinkV1 {
  const packet = verifyAcePacketV3(packetInput);
  const hint = directoryEnrichmentHintV2Schema.parse(hintInput);
  const packetDirectory = packet.identity.source_ref.includes('/')
    ? packet.identity.source_ref.slice(0, packet.identity.source_ref.lastIndexOf('/'))
    : '';

  if (packet.identity.workspace_revision !== hint.workspace_revision) {
    throw new Error('WORKSPACE_REVISION_MISMATCH');
  }
  if (packetDirectory !== hint.directory_path) {
    throw new Error('DIRECTORY_MEMBERSHIP_NOT_EXACT');
  }

  const body = directoryEnrichmentAceLinkBodyV1Schema.parse({
    schema: 'atlas.ace-directory-enrichment-link.v1',
    status: 'HINT',
    packet_key: packet.identity.packet_key,
    packet_checksum: packet.integrity.packet_checksum,
    source_ref: packet.identity.source_ref,
    directory_path: hint.directory_path,
    workspace_revision: hint.workspace_revision,
    inventory_manifest_digest: hint.inventory_manifest_digest,
    producer_revision: hint.producer_revision,
    directory_evidence_digest: hint.evidence_digest,
    canonicalAuthority: false,
    writesPerformed: false,
  });

  return directoryEnrichmentAceLinkV1Schema.parse({
    ...body,
    proposal_checksum: `sha256:${sha256HexV1(body)}`,
  });
}
