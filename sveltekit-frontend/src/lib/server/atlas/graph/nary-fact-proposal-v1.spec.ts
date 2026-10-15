import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createNaryFactProposalV1,
  NaryFactProposalV1Schema,
  verifyNaryFactProposalChecksumV1,
} from './nary-fact-proposal-v1.js';

describe('NaryFactProposalV1', () => {
  it('keeps the checked-in .okf JSON Schema aligned with the TypeScript owner', async () => {
    const schemaPath = resolve(process.cwd(), '..', '.okf', 'schemas', 'nary-fact-proposal-v1.schema.json');
    const publishedSchema = JSON.parse(await readFile(schemaPath, 'utf8')) as Record<string, unknown>;
    delete publishedSchema.$id;
    delete publishedSchema.title;
    expect(publishedSchema).toEqual(z.toJSONSchema(NaryFactProposalV1Schema));
  });

  it('creates a deterministic, non-canonical n-ary proposal', () => {
    const proposal = createNaryFactProposalV1({
      sourceRef: 'src/routes.ts',
      sourceRevision: 'source:1',
      workspaceRevision: 'workspace:1',
      packetKey: 'packet:1',
      graphRevision: 'graph:1',
      producerRevision: 'api-observer:1',
      predicate: 'API_CONTRACT_OBSERVED',
      participants: [
        { canonicalId: 'symbol:handler', role: 'handler', entityType: 'symbol' },
        { canonicalId: 'route:/users', role: 'route', entityType: 'route' },
        { canonicalId: 'packet:1', role: 'source', entityType: 'packet' },
      ],
      evidenceRefs: ['z:evidence', 'a:evidence', 'z:evidence'],
      admission: 'PROPOSED',
    });

    expect(proposal.schema).toBe('atlas.nary-fact-proposal.v1');
    expect(proposal.canonicalAuthority).toBe(false);
    expect(proposal.participants.map((participant) => participant.role)).toEqual(['handler', 'route', 'source']);
    expect(proposal.evidenceRefs).toEqual(['a:evidence', 'z:evidence']);
    expect(verifyNaryFactProposalChecksumV1(proposal)).toBe(true);
  });

  it('rejects duplicate role-labelled identities', () => {
    expect(() => createNaryFactProposalV1({
      sourceRef: 'src/a.ts', sourceRevision: 's1', workspaceRevision: 'w1', packetKey: 'p1',
      graphRevision: 'g1', producerRevision: 'p1', predicate: 'RELATES', admission: 'PROPOSED',
      evidenceRefs: ['e1'],
      participants: [
        { canonicalId: 'x', role: 'actor', entityType: 'symbol' },
        { canonicalId: 'x', role: 'actor', entityType: 'symbol' },
        { canonicalId: 'y', role: 'target', entityType: 'symbol' },
      ],
    })).toThrow('NARY_PROPOSAL_DUPLICATE_PARTICIPANT');
  });

  it('binds the ontology revision into the proposal checksum', () => {
    const base = {
      sourceRef: 'src/ontology.ts',
      sourceRevision: 'source:v1',
      workspaceRevision: 'workspace:v1',
      packetKey: 'packet:ontology',
      graphRevision: 'graph:v1',
      producerRevision: 'proposal:v1',
      predicate: 'ONTOLOGY_RELATION',
      participants: [
        { canonicalId: 'entity:a', role: 'subject', entityType: 'ENTITY' },
        { canonicalId: 'entity:b', role: 'object', entityType: 'ENTITY' },
        { canonicalId: 'entity:c', role: 'qualifier', entityType: 'ENTITY' },
      ],
      evidenceRefs: ['evidence:ontology'],
      admission: 'PROPOSED' as const,
    };
    const first = createNaryFactProposalV1({ ...base, ontologyRevision: 'ontology-revision:a' });
    const second = createNaryFactProposalV1({ ...base, ontologyRevision: 'ontology-revision:b' });

    expect(first.proposalChecksum).not.toBe(second.proposalChecksum);
  });

  it('binds the current predicate policy digests into the proposal checksum', () => {
    const policy = {
      schema: 'atlas.okf.predicate-policy-ref.v1' as const,
      registryDocumentSha256: 'a'.repeat(64),
      registrySchemaSha256: 'b'.repeat(64),
    };
    const first = createNaryFactProposalV1({ ...basePolicyFixture(), predicatePolicy: policy });
    const second = createNaryFactProposalV1({
      ...basePolicyFixture(),
      predicatePolicy: { ...policy, registryDocumentSha256: 'c'.repeat(64) },
    });

    expect(first.proposalChecksum).not.toBe(second.proposalChecksum);
  });
});

function basePolicyFixture() {
  return {
    sourceRef: 'src/policy.ts', sourceRevision: 'source:v1', workspaceRevision: 'workspace:v1',
    packetKey: 'packet:policy', graphRevision: 'graph:v1', producerRevision: 'policy-test:v1',
    predicate: 'uses_concept',
    participants: [
      { canonicalId: 'a', role: 'subject', entityType: 'SYMBOL' },
      { canonicalId: 'b', role: 'concept', entityType: 'CONCEPT' },
      { canonicalId: 'c', role: 'evidence', entityType: 'PACKET' },
    ],
    evidenceRefs: ['evidence:policy'],
    admission: 'PROPOSED' as const,
  };
}
