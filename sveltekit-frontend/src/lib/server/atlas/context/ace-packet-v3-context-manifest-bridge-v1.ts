import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type { CurrentCandidateFeatureAdmissionV1 } from '../features/candidate-feature-snapshot-v1.js';
import { verifyAcePacketV3, type AcePacketV3 } from '../../../../../../packages/parent-atlas/src/core/ace-packet-v3.js';
import { buildAceContextManifestAdmissionV1, type AceContextManifestAdmissionV1 } from './ace-context-manifest-admission-v1.js';

/**
 * ACE3-06A: pure, no-I/O join of already-SELECTED candidate ordinals to revision-qualified AcePacketV3 evidence.
 * Selection stays owned by CandidateFeatureSnapshot; ContextManifestV2 stays the request-context owner (unchanged).
 * This bridge only proves "these ordinals = these exact packet versions = this manifest identity" via a receipt.
 * Missing/unproven revisions stay null (=> strict BitFrost admission downstream fails closed); nothing is inferred,
 * and a HINT/PENDING semantic or topology section is never promoted to a CURRENT representation/graph revision.
 * Distinct from ace-route-context-manifest-bridge-v1.ts, which goes the opposite direction (manifest -> cache identity).
 */
export interface AcePacketV3ContextManifestBridgeInputV1 {
  featureAdmission: CurrentCandidateFeatureAdmissionV1;
  selectedOrdinals: readonly number[];
  /** one packet per selected ordinal, same order as selectedOrdinals */
  packets: readonly unknown[];
  requestId: string;
  tokenBudget: number;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
}

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const acePacketV3ContextManifestBridgeReceiptV1Schema = z.object({
  schema: z.literal('atlas.ace-packet-context-manifest-bridge.v1'),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().min(1),
  featureRevision: z.string().min(1),
  selectedOrdinals: z.array(z.number().int().nonnegative()),
  selectedPacketSetChecksum: sha256,
  contextManifestIdentityChecksum: z.string().min(1),
  representationRevision: z.string().nullable(),
  graphRevision: z.string().nullable(),
  packetCount: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();
export type AcePacketV3ContextManifestBridgeReceiptV1 = z.infer<typeof acePacketV3ContextManifestBridgeReceiptV1Schema>;

export interface AcePacketV3ContextManifestBridgeResultV1 {
  receipt: AcePacketV3ContextManifestBridgeReceiptV1;
  admission: AceContextManifestAdmissionV1;
}

/** null when every packet is null or its section is not CURRENT; the shared value when all agree; throws on mix. */
function aggregateRevision(kind: string, values: (string | null)[]): string | null {
  const distinct = new Set(values);
  if (distinct.size === 1) return values[0];
  throw new Error(`ACE3_BRIDGE_MIXED_${kind}_REVISION`);
}

export function bridgeAcePacketsToContextManifestV1(input: AcePacketV3ContextManifestBridgeInputV1): AcePacketV3ContextManifestBridgeResultV1 {
  const fa = input.featureAdmission;
  if (fa.status !== 'ADMITTED' || fa.snapshot === null) throw new Error(`ACE3_BRIDGE_FEATURE_SNAPSHOT_NOT_ADMITTED:${fa.status}`);
  const snapshot = fa.snapshot;
  const ordinals = [...input.selectedOrdinals];
  if (new Set(ordinals).size !== ordinals.length) throw new Error('ACE3_BRIDGE_DUPLICATE_ORDINAL');
  if (input.packets.length !== ordinals.length) throw new Error(`ACE3_BRIDGE_PACKET_COUNT_MISMATCH:${input.packets.length}:${ordinals.length}`);

  const seenKeys = new Set<string>();
  const items = ordinals.map((ordinal, i) => {
    const row = snapshot.rows.find((r) => r.candidateOrdinal === ordinal);
    if (!row) throw new Error(`ACE3_BRIDGE_ORDINAL_NOT_IN_SNAPSHOT:${ordinal}`);
    const packet: AcePacketV3 = verifyAcePacketV3(input.packets[i]);
    const id = packet.identity;
    if (seenKeys.has(id.packet_key)) throw new Error(`ACE3_BRIDGE_DUPLICATE_PACKET:${id.packet_key}`);
    seenKeys.add(id.packet_key);
    if (row.packetKey !== null && row.packetKey !== id.packet_key) throw new Error(`ACE3_BRIDGE_PACKET_KEY_MISMATCH:${ordinal}`);
    if (row.sourceRef !== null && row.sourceRef !== id.source_ref) throw new Error(`ACE3_BRIDGE_SOURCE_REF_MISMATCH:${ordinal}`);
    if (row.sourceRevision !== id.source_revision) throw new Error(`ACE3_BRIDGE_SOURCE_REVISION_MISMATCH:${ordinal}`);
    if (row.workspaceRevision !== id.workspace_revision || snapshot.workspaceRevision !== id.workspace_revision) throw new Error(`ACE3_BRIDGE_WORKSPACE_REVISION_MISMATCH:${ordinal}`);
    // Only a CURRENT section may contribute a revision; a HINT/STALE/PENDING section contributes null.
    const rep = packet.semantic.status === 'CURRENT' ? id.representation_revision : null;
    const graph = packet.topology.status === 'CURRENT' ? id.graph_revision : null;
    if (row.graphRevision !== null && graph !== null && row.graphRevision !== graph) throw new Error(`ACE3_BRIDGE_GRAPH_REVISION_MISMATCH:${ordinal}`);
    return { ordinal, id, rep, graph, checksum: packet.integrity.packet_checksum };
  });

  const representationRevision = items.length ? aggregateRevision('REPRESENTATION', items.map((x) => x.rep)) : null;
  const graphRevision = items.length ? aggregateRevision('GRAPH', items.map((x) => x.graph)) : null;

  const admission = buildAceContextManifestAdmissionV1({
    snapshot,
    requestId: input.requestId,
    selectedOrdinals: ordinals,
    tokenBudget: input.tokenBudget,
    retrievalPolicyRevision: input.retrievalPolicyRevision,
    acePlaybookRevision: input.acePlaybookRevision,
    representationRevision,
    graphRevision,
    modelRevision: input.modelRevision ?? null,
    promptTemplateRevision: input.promptTemplateRevision ?? null,
  });

  const projection = [...items].sort((a, b) => a.ordinal - b.ordinal).map((x) => ({
    candidateOrdinal: x.ordinal,
    packetKey: x.id.packet_key,
    sourceRevision: x.id.source_revision,
    workspaceRevision: x.id.workspace_revision,
    representationRevision: x.rep,
    graphRevision: x.graph,
    packetChecksum: x.checksum,
  }));
  const receipt = acePacketV3ContextManifestBridgeReceiptV1Schema.parse({
    schema: 'atlas.ace-packet-context-manifest-bridge.v1',
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    featureRevision: snapshot.featureRevision,
    selectedOrdinals: projection.map((p) => p.candidateOrdinal),
    selectedPacketSetChecksum: canonicalSha256V1({ schema: 'atlas.ace-context-selected-packet-set.v1', packets: projection }),
    contextManifestIdentityChecksum: admission.manifest.identityChecksum,
    representationRevision,
    graphRevision,
    packetCount: items.length,
    canonicalAuthority: false,
    writesPerformed: false,
  });
  return { receipt, admission };
}
