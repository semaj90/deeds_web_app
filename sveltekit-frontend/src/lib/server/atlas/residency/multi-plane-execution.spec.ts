import { describe, expect, it, vi } from 'vitest';
import {
  packRevisionQualifiedNibblesV1,
  packNibbles,
  unpackRevisionQualifiedNibblesV1,
  unpackNibbles,
  NibbleRangeError,
  NibbleRevisionError,
} from './nibble-encoding-v1.js';
import { createEvidenceKindLUT, createSourceRoleLUT } from './codebook-luts-v1.js';
import {
  encodeMessagePackPayload,
  decodeMessagePackPayload,
  MessagePackEnvelopeSchema,
} from '../transport/messagepack-transport-v1.js';
import {
  serializeNdjsonStream,
  parseNdjsonStream,
  ErrorFixTrainingExampleSchema,
} from '../streaming/ndjson-stream-v1.js';
import {
  executeMapReduce,
} from '../projections/mapreduce-view-v1.js';
import {
  buildGlyphInstance,
  encodeGlyphVertex,
  decodeGlyphVertex,
  AtlasArchetypeCode,
} from '../visualization/glyph-registry-v1.js';
import {
  buildTopologyTiles,
  buildTopologyTileIndexV1,
  queryNearbyTileCandidates,
  resolveTopologyCandidatesAgainstCanonicalMapV1,
  TopologyIdentityError,
  TopologyRevisionError,
  TopologyTileV1Schema,
} from '../topology/topology-tile-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
  resolveErrorNeighborhood,
  ErrorFixNeighborhoodSchema,
} from '../agentic/error-neighborhood-resolver-v1.js';

describe('Section 9 — Multi-Plane Projection, Transport & Bounded Agentic Execution', () => {
  describe('9.1 Nibble-Packed Encodings', () => {
    it('packs and unpacks high/low nibbles accurately', () => {
      const packed = packNibbles(9, 5); // sourceRole=9, evidenceKind=5
      expect(packed).toBe((9 << 4) | 5);
      const { sourceRole, evidenceKind } = unpackNibbles(packed);
      expect(sourceRole).toBe(9);
      expect(evidenceKind).toBe(5);
    });

    it('rejects values exceeding 4 bits (0..15)', () => {
      expect(() => packNibbles(16, 5)).toThrow(NibbleRangeError);
      expect(() => packNibbles(5, -1)).toThrow(NibbleRangeError);
      expect(() => unpackNibbles(256)).toThrow(NibbleRangeError);
    });

    it('round trips every EvidenceKindLUT value with revision-qualified extension bytes', () => {
      const sourceRoleLut = createSourceRoleLUT(Array.from({ length: 16 }, (_, index) => `role-${String(index).padStart(2, '0')}`));
      const evidenceKindLut = createEvidenceKindLUT(Array.from({ length: 32 }, (_, index) => `kind-${String(index).padStart(2, '0')}`));

      for (let evidenceKind = 0; evidenceKind < 32; evidenceKind += 1) {
        const code = packRevisionQualifiedNibblesV1({ sourceRole: 15, evidenceKind, sourceRoleLut, evidenceKindLut });
        expect(code.sourceRoleEncodingRevision).toBe(sourceRoleLut.encodingRevision);
        expect(code.evidenceKindEncodingRevision).toBe(evidenceKindLut.encodingRevision);
        expect(code.bytes).toHaveLength(evidenceKind <= 14 ? 1 : 2);
        expect(unpackRevisionQualifiedNibblesV1({ code, sourceRoleLut, evidenceKindLut })).toEqual({
          sourceRole: `role-15`,
          evidenceKind: `kind-${String(evidenceKind).padStart(2, '0')}`,
        });
      }
    });

    it('rejects stale LUT revisions, malformed extensions, and trailing bytes', () => {
      const sourceRoleLut = createSourceRoleLUT(['role-a', 'role-b']);
      const evidenceKindLabels = Array.from({ length: 32 }, (_, index) => `kind-${String(index).padStart(2, '0')}`);
      const evidenceKindLut = createEvidenceKindLUT(evidenceKindLabels);
      const extended = packRevisionQualifiedNibblesV1({ sourceRole: 0, evidenceKind: 31, sourceRoleLut, evidenceKindLut });
      const inline = packRevisionQualifiedNibblesV1({ sourceRole: 0, evidenceKind: 2, sourceRoleLut, evidenceKindLut });

      expect(() => unpackRevisionQualifiedNibblesV1({
        code: extended,
        sourceRoleLut,
        evidenceKindLut: createEvidenceKindLUT([...evidenceKindLabels.slice(0, -1), 'kind-renamed']),
      })).toThrow(NibbleRevisionError);
      expect(() => unpackRevisionQualifiedNibblesV1({
        code: extended,
        sourceRoleLut: createSourceRoleLUT(['role-a', 'role-z']),
        evidenceKindLut,
      })).toThrow(NibbleRevisionError);
      expect(() => packRevisionQualifiedNibblesV1({
        sourceRole: 0,
        evidenceKind: 31,
        sourceRoleLut,
        evidenceKindLut: {
          ...evidenceKindLut,
          entries: evidenceKindLut.entries.map((entry, index) => index === 0 ? { ...entry, label: 'tampered' } : entry),
        },
      })).toThrow(NibbleRevisionError);
      expect(() => unpackRevisionQualifiedNibblesV1({
        code: { ...extended, bytes: [extended.bytes[0], 0x5f] },
        sourceRoleLut,
        evidenceKindLut,
      })).toThrow(NibbleRangeError);
      expect(() => unpackRevisionQualifiedNibblesV1({
        code: { ...extended, bytes: [extended.bytes[0]] },
        sourceRoleLut,
        evidenceKindLut,
      })).toThrow(NibbleRangeError);
      expect(() => unpackRevisionQualifiedNibblesV1({
        code: { ...inline, bytes: [...inline.bytes, 0x20] },
        sourceRoleLut,
        evidenceKindLut,
      })).toThrow(NibbleRangeError);
    });
  });

  describe('9.2 MessagePack Runtime Cache/Transport Encoder', () => {
    it('encodes canonical JSON to MessagePack with checksum preservation', () => {
      const payload = {
        packetKey: 'ace:packet:auth:001',
        title: 'Authentication Session Handler',
        domainOrdinal: 7,
      };
      const envelope = encodeMessagePackPayload(payload);
      expect(MessagePackEnvelopeSchema.safeParse(envelope).success).toBe(true);
      expect(envelope.canonicalAuthority).toBe(false);
      expect(envelope.payloadBytes).toBeInstanceOf(Uint8Array);

      const { data, verified } = decodeMessagePackPayload<typeof payload>(envelope);
      expect(verified).toBe(true);
      expect(data).toEqual(payload);
    });
  });

  describe('9.3 NDJSON Streamer', () => {
    it('streams and parses NDJSON event records with schema validation', () => {
      const records = [
        {
          kind: 'ERROR_FIX_TRACE' as const,
          traceId: 'trace:001',
          contextManifestChecksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          errorClass: 'TypeError',
          sourceOrdinal: 42,
          symbolOrdinal: 19,
          domainOrdinal: 7,
          topologyCell: [1, 2, 0, 1] as [number, number, number, number],
          patch: 'diff --git a/foo.ts b/foo.ts',
          validationVerdict: 'PASS' as const,
        },
      ];

      const serialized = serializeNdjsonStream(records);
      expect(serialized).toContain('ERROR_FIX_TRACE');
      const parsed = parseNdjsonStream(serialized, (item) => ErrorFixTrainingExampleSchema.parse(item));
      expect(parsed).toEqual(records);
    });
  });

  describe('9.4 Pure MapReduce Derived Projections', () => {
    it('aggregates counts by domain using pure map and reduce functions', () => {
      const docs = [
        { id: 'doc1', domain: 7, count: 10 },
        { id: 'doc2', domain: 7, count: 20 },
        { id: 'doc3', domain: 3, count: 5 },
      ];

      const results = executeMapReduce(
        docs,
        (doc, emit) => emit(doc.domain, doc.count),
        (key, values) => values.reduce((sum, v) => sum + v, 0),
      );

      expect(results).toEqual([
        { key: 3, result: 5 },
        { key: 7, result: 30 },
      ]);
    });
  });

  describe('9.5 WebGPU Sprite & Glyph Visual Registry', () => {
    it('encodes and decodes 4-byte glyph vertex descriptors', () => {
      const desc = buildGlyphInstance('TASK', 7, 1, 2);
      expect(desc.glyphOrdinal).toBe(AtlasArchetypeCode.TASK);
      expect(desc.domainOrdinal).toBe(7);

      const vertexBytes = encodeGlyphVertex(desc);
      expect(vertexBytes.byteLength).toBe(4);
      const decoded = decodeGlyphVertex(vertexBytes);
      expect(decoded).toEqual(desc);
    });
  });

  describe('9.6 4D Tetracubic Topology Coordinates & Tile Generator', () => {
    const revisions = {
      semantic: `sha256:${'1'.repeat(64)}`,
      ast: `sha256:${'2'.repeat(64)}`,
      graph: `sha256:${'3'.repeat(64)}`,
      temporal: `sha256:${'4'.repeat(64)}`,
    };
    const workspaceRevision = `sha256:${'a'.repeat(64)}`;
    const coords = [
      { canonicalCandidateId: 'packet://candidate/101', candidateRevision: `sha256:${'5'.repeat(64)}`, x: 1.2, y: 2.1, z: 0.5, w: 0.1 },
      { canonicalCandidateId: 'packet://candidate/102', candidateRevision: `sha256:${'6'.repeat(64)}`, x: 1.4, y: 2.3, z: 0.7, w: 0.3 },
      { canonicalCandidateId: 'packet://candidate/201', candidateRevision: `sha256:${'7'.repeat(64)}`, x: 10.0, y: 15.0, z: 2.0, w: 5.0 },
    ];
    const makeCandidateOrdinalMap = (
      candidates: typeof coords = coords,
      workspace = workspaceRevision,
    ) => materializeCandidateOrdinalMap({
      candidates: candidates.map((candidate) => ({
        canonicalId: candidate.canonicalCandidateId,
        packetKey: candidate.canonicalCandidateId,
        sourceRef: `fixture/${candidate.canonicalCandidateId.split('/').at(-1)}.ts`,
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision: workspace,
        sourceRevision: candidate.candidateRevision,
        graphRevision: null,
        semanticRevision: null,
        degradedIdentity: false,
        evidenceRefs: [],
        representationBindings: [],
      })),
      candidateSnapshotRevision: `sha256:${'c'.repeat(64)}`,
      workspaceRevision: workspace,
      producerRevision: `sha256:${'d'.repeat(64)}`,
    });

    it('partitions candidates into revision-bound tiles and returns candidate-only canonical references', () => {
      const candidateOrdinalMap = makeCandidateOrdinalMap();
      const tiles = buildTopologyTiles({ candidateOrdinalMap, coordinateFunctionRevisions: revisions, coordinates: coords, tileSize: 1.0 });
      const tileIndex = buildTopologyTileIndexV1(tiles);
      expect(tiles.length).toBe(2);
      expect(tileIndex.tileCount).toBe(2);
      expect(tileIndex.tilesByCoordinate.size).toBe(2);
      expect(TopologyTileV1Schema.safeParse(tiles[0]).success).toBe(true);
      expect(tiles[0].canonicalAuthority).toBe(false);
      expect(tiles[0].projectionState).toBe('CHALLENGER_ONLY');

      const nearby = queryNearbyTileCandidates({ x: 1.0, y: 2.0, z: 0.0, w: 0.0 }, tileIndex, {
        expectedTopologyRevision: tiles[0].topologyRevision,
        radius: 1,
        tileSize: 1.0,
      });
      expect(nearby.map((candidate) => candidate.canonicalCandidateId)).toEqual([
        'packet://candidate/101',
        'packet://candidate/102',
      ]);
      expect(nearby.every((candidate) => candidate.candidateState === 'CANDIDATE_ONLY' && !candidate.canonicalAuthority)).toBe(true);
      const exactResolution = resolveTopologyCandidatesAgainstCanonicalMapV1({ candidates: nearby, candidateOrdinalMap });
      expect(exactResolution.candidates.map((candidate) => candidate.canonicalId)).toEqual([
        'packet://candidate/101',
        'packet://candidate/102',
      ]);
      expect(exactResolution.identityAuthority).toBe(false);
      expect(exactResolution.writesPerformed).toBe(false);
      expect(exactResolution.retrievalEligibility).toBe(false);
    });

    it('binds topology revision to coordinates, candidate revisions, workspace, and all coordinate-function revisions', () => {
      const baseMap = makeCandidateOrdinalMap();
      const base = buildTopologyTiles({ candidateOrdinalMap: baseMap, coordinateFunctionRevisions: revisions, coordinates: coords, tileSize: 1.0 });
      const reordered = buildTopologyTiles({ candidateOrdinalMap: baseMap, coordinateFunctionRevisions: revisions, coordinates: [...coords].reverse(), tileSize: 1.0 });
      const changedCoords = coords.map((coord) => coord.canonicalCandidateId.endsWith('101') ? { ...coord, x: coord.x + 0.1 } : coord);
      const changedCoordinate = buildTopologyTiles({
        candidateOrdinalMap: baseMap,
        coordinateFunctionRevisions: revisions,
        coordinates: changedCoords,
        tileSize: 1.0,
      });
      const changedRevisionCoords = coords.map((coord) => coord.canonicalCandidateId.endsWith('101') ? { ...coord, candidateRevision: `sha256:${'9'.repeat(64)}` } : coord);
      const changedCandidateRevision = buildTopologyTiles({
        candidateOrdinalMap: makeCandidateOrdinalMap(changedRevisionCoords),
        coordinateFunctionRevisions: revisions,
        coordinates: changedRevisionCoords,
        tileSize: 1.0,
      });
      const changedWorkspace = buildTopologyTiles({
        candidateOrdinalMap: makeCandidateOrdinalMap(coords, `sha256:${'b'.repeat(64)}`),
        coordinateFunctionRevisions: revisions,
        coordinates: coords,
        tileSize: 1.0,
      });
      const changedFunction = buildTopologyTiles({
        candidateOrdinalMap: baseMap,
        coordinateFunctionRevisions: { ...revisions, semantic: `sha256:${'8'.repeat(64)}` },
        coordinates: coords,
        tileSize: 1.0,
      });

      expect(base[0].topologyRevision).toBe(reordered[0].topologyRevision);
      expect(base[0].topologyRevision).not.toBe(changedCoordinate[0].topologyRevision);
      expect(base[0].topologyRevision).not.toBe(changedCandidateRevision[0].topologyRevision);
      expect(base[0].topologyRevision).not.toBe(changedWorkspace[0].topologyRevision);
      expect(base[0].topologyRevision).not.toBe(changedFunction[0].topologyRevision);
    });

    it('rejects duplicate canonical identities, stale topology revisions, and over-budget shortlists', () => {
      const candidateOrdinalMap = makeCandidateOrdinalMap();
      const tiles = buildTopologyTiles({ candidateOrdinalMap, coordinateFunctionRevisions: revisions, coordinates: coords, tileSize: 1.0 });
      const tileIndex = buildTopologyTileIndexV1(tiles);
      expect(() => buildTopologyTiles({
        candidateOrdinalMap,
        coordinateFunctionRevisions: revisions,
        coordinates: [coords[0], { ...coords[0], x: 2.0 }],
        tileSize: 1.0,
      })).toThrow(TopologyIdentityError);
      expect(() => queryNearbyTileCandidates({ x: 1, y: 2, z: 0, w: 0 }, tileIndex, {
        expectedTopologyRevision: `sha256:${'0'.repeat(64)}`,
      })).toThrow(TopologyRevisionError);
      expect(() => queryNearbyTileCandidates({ x: 1, y: 2, z: 0, w: 0 }, tileIndex, {
        expectedTopologyRevision: tiles[0].topologyRevision,
        maxCandidates: 1,
      })).toThrow(/exceeds maxCandidates/);
      const nearby = queryNearbyTileCandidates({ x: 1, y: 2, z: 0, w: 0 }, tileIndex, {
        expectedTopologyRevision: tiles[0].topologyRevision,
      });
      expect(() => resolveTopologyCandidatesAgainstCanonicalMapV1({
        candidates: nearby.map((candidate, index) => index === 0 ? { ...candidate, candidateRevision: `sha256:${'e'.repeat(64)}` } : candidate),
        candidateOrdinalMap,
      })).toThrow(/source revision is stale/);
    });

    it('queries a revision-bound coordinate hash index with a bounded probe budget', () => {
      const candidateOrdinalMap = makeCandidateOrdinalMap();
      const tiles = buildTopologyTiles({ candidateOrdinalMap, coordinateFunctionRevisions: revisions, coordinates: coords, tileSize: 1.0 });
      const tileIndex = buildTopologyTileIndexV1(tiles);
      const get = vi.spyOn(tileIndex.tilesByCoordinate, 'get');

      const nearby = queryNearbyTileCandidates({ x: 1, y: 2, z: 0, w: 0 }, tileIndex, {
        expectedTopologyRevision: tileIndex.topologyRevision,
        radius: 1,
      });

      expect(get).toHaveBeenCalledTimes(81);
      expect(nearby.map((candidate) => candidate.canonicalCandidateId)).toEqual([
        'packet://candidate/101',
        'packet://candidate/102',
      ]);
      expect(() => queryNearbyTileCandidates({ x: 1, y: 2, z: 0, w: 0 }, tileIndex, {
        expectedTopologyRevision: tileIndex.topologyRevision,
        radius: 8,
      })).toThrow(/exceeds 65536 coordinate probes/);
    });

    it('matches an exact coordinate scan across deterministic multi-query fixtures', () => {
      const oracleCoords = Array.from({ length: 256 }, (_, index) => ({
        canonicalCandidateId: `packet://oracle/${String(index).padStart(3, '0')}`,
        candidateRevision: `sha256:${index.toString(16).padStart(64, '0')}`,
        x: ((index * 13) % 81 - 40) / 2,
        y: ((index * 19) % 73 - 36) / 2,
        z: ((index * 23) % 67 - 33) / 2,
        w: ((index * 29) % 59 - 29) / 2,
      }));
      const candidateOrdinalMap = makeCandidateOrdinalMap(oracleCoords);
      const tileIndex = buildTopologyTileIndexV1(buildTopologyTiles({
        candidateOrdinalMap,
        coordinateFunctionRevisions: revisions,
        coordinates: oracleCoords,
        tileSize: 0.5,
      }));
      const queries = [
        { coordinate: { x: 0, y: 0, z: 0, w: 0 }, radius: 0 },
        { coordinate: { x: 1.25, y: -2.5, z: 3.75, w: -4.25 }, radius: 1 },
        { coordinate: { x: -8.5, y: 6.25, z: -1.75, w: 9.5 }, radius: 2 },
      ];

      for (const { coordinate, radius } of queries) {
        const center = [coordinate.x, coordinate.y, coordinate.z, coordinate.w].map((value) => Math.floor(value / 0.5));
        const exactIds = oracleCoords
          .filter((candidate) => {
            const candidateTile = [candidate.x, candidate.y, candidate.z, candidate.w].map((value) => Math.floor(value / 0.5));
            return candidateTile.every((value, axis) => Math.abs(value - center[axis]!) <= radius);
          })
          .map((candidate) => candidate.canonicalCandidateId)
          .sort();
        const indexedIds = queryNearbyTileCandidates(coordinate, tileIndex, {
          expectedTopologyRevision: tileIndex.topologyRevision,
          radius,
          tileSize: 0.5,
        }).map((candidate) => candidate.canonicalCandidateId);

        expect(indexedIds).toEqual(exactIds);
      }
    });
  });

  describe('9.7 Bounded Agentic Error-Fixing Neighborhood Resolver', () => {
    it('constructs a deterministic bounded neighborhood with checksum and token budget', () => {
      const neighborhood = resolveErrorNeighborhood({
        errorId: 'err:500:db_pool_timeout',
        errorClass: 'TimeoutError',
        sourceOrdinal: 442,
        symbolOrdinal: 891,
        domainOrdinal: 7,
        topologyCell: [4, 12, 2, 7],
        callerOrdinals: [12, 34],
        testOrdinals: [99],
        receiptRefs: ['receipt:static:001'],
      });

      expect(ErrorFixNeighborhoodSchema.safeParse(neighborhood).success).toBe(true);
      expect(neighborhood.neighborhoodChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(neighborhood.boundedTokenEstimate).toBeGreaterThan(0);
      expect(neighborhood.callerOrdinals).toEqual([12, 34]);
    });
  });
});
