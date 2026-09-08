import { describe, expect, it } from 'vitest';
import {
  canonicalOwnerFromConceptDefinitionV1,
  canonicalOwnerFromConceptRowV1,
  canonicalOwnerFromPacketRowV1,
  canonicalOwnerFromSymbolRowV1,
  canonicalOwnersFromCandidateV1,
  createCanonicalParticipantOwnerRegistryV1,
  createCanonicalParticipantOwnerRegistryFromRowsV1,
} from './canonical-participant-owner-registry-v1.js';

describe('CanonicalParticipantOwnerRegistryV1', () => {
  it('maps packet and concept rows only with dedicated lineage fields', () => {
    expect(canonicalOwnerFromPacketRowV1({ packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source' })).toMatchObject({
      canonicalId: 'packet:a', entityType: 'PACKET', entityRevision: 'sha256:source', sourceRef: 'src/a.ts',
    });
    expect(canonicalOwnerFromConceptRowV1({ conceptId: 'concept:a', definitionRevision: 'definition:r1' })).toMatchObject({
      canonicalId: 'concept:a', entityType: 'CONCEPT', entityRevision: 'definition:r1',
    });
  });

  it('fails closed when a row lacks its required lineage field', () => {
    expect(() => canonicalOwnerFromPacketRowV1({ packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: null })).toThrow('PACKET_OWNER_SOURCE_REVISION_REQUIRED');
    expect(() => canonicalOwnerFromConceptRowV1({ conceptId: 'concept:a', definitionRevision: null })).toThrow('CONCEPT_OWNER_DEFINITION_REVISION_REQUIRED');
    expect(() => canonicalOwnerFromSymbolRowV1({ symbolVersionId: 'symbol:a', sourceRef: 'src/a.ts', repositoryRevision: null })).toThrow('SYMBOL_OWNER_REPOSITORY_REVISION_REQUIRED');
  });

  it('composes row owners with symbol owners without creating a second authority', () => {
    const registry = createCanonicalParticipantOwnerRegistryFromRowsV1({
      packetRows: [{ packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source' }],
      conceptRows: [{ conceptId: 'concept:a', definitionRevision: 'definition:r1' }],
      symbolRows: [{ symbolVersionId: 'symbol:a', sourceRef: 'src/a.ts', repositoryRevision: 'repo:r1' }],
    });
    expect(registry.sourceNames).toEqual(['atlas_ontology_concepts', 'atlas_packets', 'atlas_symbol_versions']);
    expect(registry.owners.map((owner) => owner.canonicalId)).toEqual(['concept:a', 'packet:a', 'symbol:a']);
  });

  it('adapts existing packet and symbol identities without using ordinals or paths as IDs', () => {
    const owners = canonicalOwnersFromCandidateV1({
      packetKey: 'packet:search',
      symbolVersionId: 'symbol:search',
      sourceRef: 'src/routes.ts',
      sourceRevision: 'source:rev-1',
    });

    expect(owners).toEqual([
      { canonicalId: 'packet:search', entityType: 'PACKET', entityRevision: 'source:rev-1', sourceRef: 'src/routes.ts' },
      { canonicalId: 'symbol:search', entityType: 'SYMBOL', entityRevision: 'source:rev-1', sourceRef: 'src/routes.ts' },
    ]);
  });

  it('adapts an existing canonical concept definition without promoting recognition data', () => {
    const owner = canonicalOwnerFromConceptDefinitionV1({
      schema: 'atlas.concept-definition.v1',
      conceptId: 'concept:domain:retrieval',
      canonicalLabel: 'retrieval',
      definition: 'Indexed candidate search.',
      conceptType: 'domain',
      namespace: 'domain',
      aliases: [],
      definitionRevision: 'sha256:definition-v1',
      schemaVersion: 1,
      sourceOwner: 'taxonomy',
      evidenceRefs: ['src/taxonomy.ts'],
      status: 'PROPOSED',
      canonicalAuthority: true,
    });

    expect(owner).toEqual({
      canonicalId: 'concept:domain:retrieval',
      entityType: 'CONCEPT',
      entityRevision: 'sha256:definition-v1',
    });
  });

  it('merges explicit owners deterministically and exposes collisions', () => {
    const registry = createCanonicalParticipantOwnerRegistryV1([
      { source: 'concepts', owners: [{ canonicalId: 'concept:z', entityType: 'CONCEPT' }] },
      { source: 'symbols', owners: [{ canonicalId: 'symbol:a', entityType: 'SYMBOL' }] },
      { source: 'duplicate', owners: [{ canonicalId: 'symbol:a', entityType: 'SYMBOL', sourceRef: 'src/a.ts' }] },
    ]);

    expect(registry.owners.map((owner) => owner.canonicalId)).toEqual(['concept:z', 'symbol:a', 'symbol:a']);
    expect(registry.duplicateCanonicalIds).toEqual(['symbol:a']);
    expect(registry.sourceNames).toEqual(['concepts', 'duplicate', 'symbols']);
  });

  it('does not create owners from source names or empty records', () => {
    const registry = createCanonicalParticipantOwnerRegistryV1([
      { source: 'concepts', owners: [] },
      { source: '  ', owners: [] },
    ]);

    expect(registry.owners).toEqual([]);
    expect(registry.duplicateCanonicalIds).toEqual([]);
    expect(registry.sourceNames).toEqual(['concepts']);
  });
});
