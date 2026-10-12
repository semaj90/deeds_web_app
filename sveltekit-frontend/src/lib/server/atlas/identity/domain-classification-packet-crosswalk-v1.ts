import {
  DomainClassificationV1Schema,
  type DomainClassificationV1,
} from '../contracts/okf-cross-domain-v1.js';
import type { PacketKeyResolutionV2 } from './packet-key-resolution-v2.js';

export interface DomainClassificationPacketRowV1 {
  packet_key: string;
  source_ref: string | null;
  source_revision: string | null;
  workspace_revision_key: string | null;
}

export type DomainClassificationPacketCrosswalkStatusV1 =
  | 'MATCHED_NOT_ADMITTED'
  | 'PACKET_NOT_FOUND'
  | 'SOURCE_REVISION_MISMATCH'
  | 'WORKSPACE_REVISION_MISMATCH'
  | 'AMBIGUOUS_PACKET_MATCH'
  | 'PACKET_IDENTITY_UNRESOLVED';

export interface DomainClassificationPacketCrosswalkRowV1 {
  classificationId: string;
  subjectRef: string;
  subjectKind: DomainClassificationV1['subjectKind'];
  sourceRef: string | null;
  sourceRevision: string;
  workspaceRevision: string;
  packetKey: string | null;
  canonicalPacketKey: string | null;
  status: DomainClassificationPacketCrosswalkStatusV1;
}

export interface DomainClassificationPacketCrosswalkV1 {
  schema: 'atlas.domain-classification-packet-crosswalk.v1';
  status: 'MATCHED_NOT_ADMITTED' | 'BLOCKED';
  workspaceRevision: string;
  rows: DomainClassificationPacketCrosswalkRowV1[];
  canonicalAuthority: false;
  evidenceAdmission: false;
  persistenceAuthorized: false;
  writesPerformed: false;
}

export async function resolveDomainClassificationPacketCrosswalkV1(input: {
  rows: readonly DomainClassificationV1[];
  packetRows: readonly DomainClassificationPacketRowV1[];
  workspaceRevision: string;
  resolvePacketKey: (packetKey: string) => Promise<PacketKeyResolutionV2>;
}): Promise<DomainClassificationPacketCrosswalkV1> {
  const workspaceRevision = input.workspaceRevision.trim();
  if (!workspaceRevision) throw new Error('DOMAIN_CLASSIFICATION_WORKSPACE_REVISION_REQUIRED');
  if (input.rows.length > 10_000) throw new Error('DOMAIN_CLASSIFICATION_CROSSWALK_ROW_LIMIT_EXCEEDED');

  const parsedRows = input.rows.map((row) => DomainClassificationV1Schema.parse(row));
  const classificationIds = parsedRows.map((row) => row.classificationId);
  if (new Set(classificationIds).size !== classificationIds.length) {
    throw new Error('DOMAIN_CLASSIFICATION_CROSSWALK_DUPLICATE_CLASSIFICATION_ID');
  }

  const packetIdentityRows = new Map<string, DomainClassificationPacketRowV1[]>();
  for (const packetRow of input.packetRows) {
    const packetKey = packetRow.packet_key?.trim();
    const sourceRef = packetRow.source_ref?.trim();
    if (!packetKey || !sourceRef) continue;
    const rows = packetIdentityRows.get(sourceRef) ?? [];
    rows.push(packetRow);
    packetIdentityRows.set(sourceRef, rows);
  }

  const rows: DomainClassificationPacketCrosswalkRowV1[] = [];
  for (const proposal of parsedRows) {
    const evidenceRefs = [...new Set(proposal.evidenceRefs.map((ref) => ref.trim()).filter(Boolean))];
    const sourceRows = evidenceRefs.flatMap((sourceRef) => packetIdentityRows.get(sourceRef) ?? []);
    const exactRows = sourceRows.filter((packetRow) =>
      packetRow.workspace_revision_key === workspaceRevision
      && packetRow.source_revision === proposal.sourceRevision,
    );

    let status: DomainClassificationPacketCrosswalkStatusV1;
    let selectedPacket: DomainClassificationPacketRowV1 | null = null;
    let canonicalPacketKey: string | null = null;

    if (exactRows.length > 1) {
      status = 'AMBIGUOUS_PACKET_MATCH';
    } else if (exactRows.length === 0) {
      if (sourceRows.some((packetRow) => packetRow.workspace_revision_key !== workspaceRevision)) {
        status = 'WORKSPACE_REVISION_MISMATCH';
      } else if (sourceRows.some((packetRow) => packetRow.source_revision !== proposal.sourceRevision)) {
        status = 'SOURCE_REVISION_MISMATCH';
      } else {
        status = 'PACKET_NOT_FOUND';
      }
    } else {
      selectedPacket = exactRows[0];
      try {
        const resolution = await input.resolvePacketKey(selectedPacket.packet_key);
        if (resolution.storagePacketKey !== selectedPacket.packet_key
          || !resolution.canonicalPacketKey.trim()) {
          status = 'PACKET_IDENTITY_UNRESOLVED';
        } else {
          canonicalPacketKey = resolution.canonicalPacketKey;
          status = 'MATCHED_NOT_ADMITTED';
        }
      } catch {
        status = 'PACKET_IDENTITY_UNRESOLVED';
      }
    }

    rows.push({
      classificationId: proposal.classificationId,
      subjectRef: proposal.subjectRef,
      subjectKind: proposal.subjectKind,
      sourceRef: selectedPacket?.source_ref?.trim() ?? null,
      sourceRevision: proposal.sourceRevision,
      workspaceRevision,
      packetKey: status === 'MATCHED_NOT_ADMITTED' ? selectedPacket?.packet_key ?? null : null,
      canonicalPacketKey: status === 'MATCHED_NOT_ADMITTED' ? canonicalPacketKey : null,
      status,
    });
  }

  return {
    schema: 'atlas.domain-classification-packet-crosswalk.v1',
    status: rows.length > 0 && rows.every((row) => row.status === 'MATCHED_NOT_ADMITTED')
      ? 'MATCHED_NOT_ADMITTED'
      : 'BLOCKED',
    workspaceRevision,
    rows,
    canonicalAuthority: false,
    evidenceAdmission: false,
    persistenceAuthorized: false,
    writesPerformed: false,
  };
}
