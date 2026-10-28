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
