import { describe, expect, it } from 'vitest';

describe('taxonomy-topology-packet', () => {
  it('loads the packet builder module with the ontology cache hook', async () => {
    const mod = await import('./taxonomy-topology-packet.js');
    expect(typeof mod.buildTaxonomyTopologyPacket).toBe('function');
  });
});
