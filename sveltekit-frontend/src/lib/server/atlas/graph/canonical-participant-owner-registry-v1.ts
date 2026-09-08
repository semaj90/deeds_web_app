import { compareUtf8 } from '../features/canonical-candidate-v1.js';
import type { ConceptDefinitionV1 } from '../contracts/concept-fabric-v1.js';
import type { CanonicalCandidateV1 } from '../features/canonical-candidate-v1.js';
import {
  CanonicalParticipantOwnerV1Schema,
  type CanonicalParticipantOwnerV1,
} from './participant-resolver-v1.js';

export interface CanonicalParticipantOwnerSourceV1 {
  source: string;
  owners: readonly CanonicalParticipantOwnerV1[];
}

export interface CanonicalParticipantOwnerRegistryV1 {
  owners: readonly CanonicalParticipantOwnerV1[];
  duplicateCanonicalIds: readonly string[];
  sourceNames: readonly string[];
}

/** Adapts the existing canonical concept-definition owner; recognitions are not accepted here. */
export function canonicalOwnerFromConceptDefinitionV1(
  concept: ConceptDefinitionV1,
): CanonicalParticipantOwnerV1 {
  return {
    canonicalId: concept.conceptId,
    entityType: 'CONCEPT',
    entityRevision: concept.definitionRevision,
  };
}

export interface CanonicalPacketOwnerRowV1 {
  packetKey: string | null;
  sourceRef: string | null;
  sourceRevision: string | null;
}

export interface CanonicalConceptOwnerRowV1 {
  conceptId: string | null;
  definitionRevision: string | null;
}

export interface CanonicalSymbolOwnerRowV1 {
  symbolVersionId: string | null;
  sourceRef: string | null;
  repositoryRevision: string | null;
}

/** Maps a packet row only when exact source-content lineage exists. */
export function canonicalOwnerFromPacketRowV1(
  row: CanonicalPacketOwnerRowV1,
): CanonicalParticipantOwnerV1 | null {
  if (!row.packetKey) return null;
  if (!row.sourceRevision) throw new Error(`PACKET_OWNER_SOURCE_REVISION_REQUIRED:${row.packetKey}`);
  return {
    canonicalId: row.packetKey,
    entityType: 'PACKET',
    entityRevision: row.sourceRevision,
    ...(row.sourceRef ? { sourceRef: row.sourceRef } : {}),
  };
}

/** Maps a concept row only when its definition revision exists. */
export function canonicalOwnerFromConceptRowV1(
  row: CanonicalConceptOwnerRowV1,
): CanonicalParticipantOwnerV1 | null {
  if (!row.conceptId) return null;
  if (!row.definitionRevision) throw new Error(`CONCEPT_OWNER_DEFINITION_REVISION_REQUIRED:${row.conceptId}`);
  return {
    canonicalId: row.conceptId,
    entityType: 'CONCEPT',
    entityRevision: row.definitionRevision,
  };
}

/** Maps a symbol row using repository/compiler lineage, which is its own axis. */
export function canonicalOwnerFromSymbolRowV1(
  row: CanonicalSymbolOwnerRowV1,
): CanonicalParticipantOwnerV1 | null {
  if (!row.symbolVersionId) return null;
  if (!row.repositoryRevision) throw new Error(`SYMBOL_OWNER_REPOSITORY_REVISION_REQUIRED:${row.symbolVersionId}`);
  return {
    canonicalId: row.symbolVersionId,
    entityType: 'SYMBOL',
    entityRevision: row.repositoryRevision,
    ...(row.sourceRef ? { sourceRef: row.sourceRef } : {}),
  };
}

export function createCanonicalParticipantOwnerRegistryFromRowsV1(input: {
  packetRows: readonly CanonicalPacketOwnerRowV1[];
  conceptRows: readonly CanonicalConceptOwnerRowV1[];
  symbolRows?: readonly CanonicalSymbolOwnerRowV1[];
  symbolOwners?: readonly CanonicalParticipantOwnerV1[];
}): CanonicalParticipantOwnerRegistryV1 {
  const packetOwners = input.packetRows.flatMap((row) => {
    const owner = canonicalOwnerFromPacketRowV1(row);
    return owner ? [owner] : [];
  });
  const conceptOwners = input.conceptRows.flatMap((row) => {
    const owner = canonicalOwnerFromConceptRowV1(row);
    return owner ? [owner] : [];
  });
  const symbolRowOwners = (input.symbolRows ?? []).flatMap((row) => {
    const owner = canonicalOwnerFromSymbolRowV1(row);
    return owner ? [owner] : [];
  });
  return createCanonicalParticipantOwnerRegistryV1([
    { source: 'atlas_packets', owners: packetOwners },
    { source: 'atlas_symbol_versions', owners: [...(input.symbolOwners ?? []), ...symbolRowOwners] },
    { source: 'atlas_ontology_concepts', owners: conceptOwners },
  ]);
}

/** Adapts only identities already present on a canonical candidate; null fields stay absent. */
export function canonicalOwnersFromCandidateV1(
  candidate: Pick<CanonicalCandidateV1, 'packetKey' | 'symbolVersionId' | 'sourceRef' | 'sourceRevision'>,
): CanonicalParticipantOwnerV1[] {
  const sourceRef = candidate.sourceRef ?? undefined;
  const owners: CanonicalParticipantOwnerV1[] = [];
  if (candidate.packetKey !== null) {
    owners.push({ canonicalId: candidate.packetKey, entityType: 'PACKET', entityRevision: candidate.sourceRevision, ...(sourceRef ? { sourceRef } : {}) });
  }
  if (candidate.symbolVersionId !== null) {
    owners.push({ canonicalId: candidate.symbolVersionId, entityType: 'SYMBOL', entityRevision: candidate.sourceRevision, ...(sourceRef ? { sourceRef } : {}) });
  }
  return owners;
}

/**
 * Combines explicit owners from existing authorities without assigning
 * authority or resolving collisions. A collision stays visible so the
 * participant resolver can fail closed rather than choose a source by order.
 */
export function createCanonicalParticipantOwnerRegistryV1(
  sources: readonly CanonicalParticipantOwnerSourceV1[],
): CanonicalParticipantOwnerRegistryV1 {
  const parsed = sources.flatMap((source) => source.owners.map((owner) => CanonicalParticipantOwnerV1Schema.parse(owner)));
  const counts = new Map<string, number>();
  for (const owner of parsed) counts.set(owner.canonicalId, (counts.get(owner.canonicalId) ?? 0) + 1);

  const owners = [...parsed].sort((left, right) =>
    compareUtf8(left.canonicalId, right.canonicalId)
    || compareUtf8(left.entityType, right.entityType)
    || compareUtf8(left.entityRevision ?? '', right.entityRevision ?? '')
    || compareUtf8(left.sourceRef ?? '', right.sourceRef ?? '')
  );

  return {
    owners,
    duplicateCanonicalIds: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([canonicalId]) => canonicalId)
      .sort(compareUtf8),
    sourceNames: [...new Set(sources.map((source) => source.source.trim()).filter(Boolean))].sort(compareUtf8),
  };
}
