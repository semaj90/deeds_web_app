import { describe, expect, it } from 'vitest';
import {
  packetToDataRefTransport,
  packetToJsonTransport,
  packetToMsgpackTransport,
  packetToReferenceTransport,
} from '$lib/server/atlas/transport/canonical-packet-transport.js';
import { packetTransportToA2AArtifact } from '$lib/server/a2a/a2a-v1-packet-adapter.js';

const packet = {
  packet_id: '11111111-1111-4111-8111-111111111111',
  packet_key: `sha256:${'a'.repeat(64)}`,
  title_id: 'atlas-test',
  feature_id: 'retrieval.packet.transport',
  source_ref: 'src/lib/server/example.ts',
  created_at: '2026-08-19T00:00:00.000Z',
  ontology_ids: ['atlas:RetrievalPacket'],
  concept_ids: ['atlas:ExactPromotion'],
  runtime_evidence_refs: ['evidence:1'],
};

const revisions = {
  workspaceRevision: '742',
  sourceRevision: 'src-r19',
  representationRevision: 'semantic-768-r4',
  featureRevision: '109',
  graphRevision: '338',
  ontologyRevision: 'ont-r7',
  producerRevision: 'test-r1',
  hyperedgeRefs: ['hyperedge:call:1'],
};

describe('canonical packet transport', () => {
  it('preserves packet identity and revision coordinates across representations', () => {
    const ref = packetToReferenceTransport(packet, revisions);
    const json = packetToJsonTransport(packet, revisions);
    const msgpack = packetToMsgpackTransport(packet, revisions);

    for (const result of [ref, json, msgpack]) {
      expect(result.packetKey).toBe(packet.packet_key);
      expect(result.sourceRef).toBe(packet.source_ref);
      expect(result.workspaceRevision).toBe('742');
      expect(result.sourceRevision).toBe('src-r19');
      expect(result.representationRevision).toBe('semantic-768-r4');
      expect(result.ontologyIds).toEqual(['atlas:RetrievalPacket']);
      expect(result.conceptIds).toEqual(['atlas:ExactPromotion']);
      expect(result.hyperedgeRefs).toEqual(['hyperedge:call:1']);
    }

    expect(ref.payload.mode).toBe('PACKET_REF_ONLY');
    expect(json.payload.mode).toBe('JSON_INLINE');
    expect(msgpack.payload.mode).toBe('MSGPACK_INLINE');
    expect(msgpack.payload.inlineBytesBase64?.length).toBeGreaterThan(0);
  });

  it('uses reference transport for mmap/Arrow-scale data', () => {
    const transport = packetToDataRefTransport(packet, revisions, {
      mode: 'MMAP_REF',
      dataRefId: 'mmap:semantic-768:snapshot-4',
      mediaType: 'application/vnd.apache.arrow.file',
      byteLength: 80_000_000,
      contentChecksum: `sha256:${'b'.repeat(64)}`,
    });

    expect(transport.payload.mode).toBe('MMAP_REF');
    expect(transport.payload.dataRefId).toBe('mmap:semantic-768:snapshot-4');
    expect(transport.payload.inlineBytesBase64).toBeUndefined();
  });

  it('projects packet identity into A2A without minting a new canonical identity', () => {
    const transport = packetToReferenceTransport(packet, revisions);
    const artifact = packetTransportToA2AArtifact(transport);

    expect(artifact.artifactId).toBe(transport.transportId);
    expect(artifact.metadata?.packetKey).toBe(packet.packet_key);
    expect(artifact.metadata?.workspaceRevision).toBe('742');
    expect(artifact.parts).toHaveLength(1);
    expect('data' in artifact.parts[0]).toBe(true);
  });
});
