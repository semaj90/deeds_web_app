import { describe, expect, it } from 'vitest';

describe('taxonomy-topology-packet', () => {
  it('requires canonical packet resolution before taxonomy tuple persistence', async () => {
    const { resolveTaxonomyPacketKeyV1 } = await import('./taxonomy-topology-packet.js');

    await expect(resolveTaxonomyPacketKeyV1(
      'ace:packet:generated',
      async () => ({ canonicalPacketKey: 'packet:12345678-1234-5234-9234-123456789abc' }),
    )).resolves.toBe('packet:12345678-1234-5234-9234-123456789abc');
    await expect(resolveTaxonomyPacketKeyV1(
      'ace:packet:generated',
      async () => { throw new Error('NO_CANONICAL_ALIAS'); },
    )).resolves.toBeNull();
    await expect(resolveTaxonomyPacketKeyV1(
      'ace:packet:generated',
      async () => ({ canonicalPacketKey: ' ' }),
    )).resolves.toBeNull();
    await expect(resolveTaxonomyPacketKeyV1(
      'ace:packet:generated',
      async () => ({ canonicalPacketKey: 'packet:not-v2' }),
    )).resolves.toBeNull();
  });

  it('requires an explicit workspace or repository revision for cache routing', async () => {
    const { resolveTaxonomyWorkspaceRevisionV1 } = await import('./taxonomy-topology-packet.js');

    expect(resolveTaxonomyWorkspaceRevisionV1({})).toBeNull();
    expect(resolveTaxonomyWorkspaceRevisionV1({ WORKSPACE_REVISION: 'workspace:42' })).toBe('workspace:42');
    expect(resolveTaxonomyWorkspaceRevisionV1({
      WORKSPACE_REVISION: ' ',
      REPOSITORY_REVISION: 'repo:17',
    })).toBe('repo:17');
    expect(resolveTaxonomyWorkspaceRevisionV1({ WORKSPACE_REVISION: 'unknown' })).toBeNull();
  });

  it('loads the packet builder module with the ontology cache hook', async () => {
    const mod = await import('./taxonomy-topology-packet.js');
    expect(typeof mod.buildTaxonomyTopologyPacket).toBe('function');
  });

  it('keeps taxonomy-derived tuples reference-only without grounded participants or evidence', async () => {
    const { buildTaxonomyReferenceTuplesV1 } = await import('./taxonomy-topology-packet.js');
    const input = [{ source: 'node-1', relation: 'HAS_ONTOLOGY_TAG' as const, target: 'tag:contracts' }];
    const tuples = buildTaxonomyReferenceTuplesV1(
      'packet:12345678-1234-5234-9234-123456789abc',
      'node-1',
      input,
    );

    expect(tuples).toHaveLength(1);
    expect(tuples[0]).toMatchObject({
      packetKey: 'packet:12345678-1234-5234-9234-123456789abc',
      sourceRef: 'taxonomy:node-1',
      evidenceState: 'REFERENCE_ONLY',
      participants: [],
      evidenceRefs: [],
    });
    expect(buildTaxonomyReferenceTuplesV1(null, 'node-1', input)).toEqual([]);
    expect(buildTaxonomyReferenceTuplesV1('ace:packet:generated', 'node-1', input)).toEqual([]);
  });
});
