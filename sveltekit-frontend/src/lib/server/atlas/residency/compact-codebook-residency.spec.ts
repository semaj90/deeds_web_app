import { describe, expect, it } from 'vitest';
import {
  buildRegistryOrdinalMapV1,
  ordinalLookup,
  canonicalLookup,
  isRegistryRevisionCurrent,
  DuplicateCanonicalIdError,
  RegistryOverflowError,
  EmptyCanonicalSetError,
  RegistryOrdinalMapV1Schema,
} from './registry-ordinal-map-v1.js';
import {
  createDomainClassLUT,
  createSourceRoleLUT,
  encodePackedHeader,
  decodePackedHeader,
  PackedHeaderSchema,
} from './codebook-luts-v1.js';
import {
  parseTypedCoordinate,
  formatTypedCoordinate,
  validateOntologyTuple,
} from '../ontology/typed-coordinates-v1.js';
import {
  buildAtlasFeatureCardV1,
  AtlasFeatureCardV1Schema,
} from '../features/atlas-feature-card-v1.js';
import { RepresentationFamilyV1Schema } from '../representations/representation-gradient-v1.js';
import {
  buildHiddenStateCacheKeyV1,
  assertEphemeralStorageOnly,
  CanonicalStorageViolationError,
} from '../../cache/hidden-state-boundary-v1.js';
import {
  buildAdapterRegistryV1,
  resolveAdapterSlot,
  AdapterRegistryV1Schema,
} from '../adapters/adapter-registry-v1.js';
import {
  HotDeque,
  WarmPriorityQueue,
  computeWarmPriority,
} from './residency-controller-v1.js';
import {
  expandLOD,
  LOD_TIER_ORDER,
  type LodLadderCandidate,
} from '../context/lod-ladder-v1.js';

describe('Section 8 — Compact Codebook, Registry Ordinal Maps & Virtual Memory', () => {
  describe('8.2 RegistryOrdinalMapV1', () => {
    it('builds a valid map passing strict schema', () => {
      const map = buildRegistryOrdinalMapV1(['concept-b', 'concept-a', 'concept-c'], 512);
      expect(RegistryOrdinalMapV1Schema.safeParse(map).success).toBe(true);
      expect(map.canonicalAuthority).toBe(false);
      expect(map.capacity).toBe(512);
      expect(map.entries).toEqual([
        { ordinal: 0, canonicalId: 'concept-a' },
        { ordinal: 1, canonicalId: 'concept-b' },
        { ordinal: 2, canonicalId: 'concept-c' },
      ]);
    });

    it('is deterministic regardless of input order', () => {
      const a = buildRegistryOrdinalMapV1(['z', 'y', 'x']);
      const b = buildRegistryOrdinalMapV1(['x', 'z', 'y']);
      expect(a.registryRevision).toBe(b.registryRevision);
      expect(a.ordinalMapChecksum).toBe(b.ordinalMapChecksum);
      expect(a.entries).toEqual(b.entries);
    });

    it('round-trips ordinalLookup and canonicalLookup', () => {
      const map = buildRegistryOrdinalMapV1(['pkg:auth', 'pkg:db']);
      expect(ordinalLookup(map, 'pkg:db')).toBe(1);
      expect(canonicalLookup(map, 1)).toBe('pkg:db');
      expect(ordinalLookup(map, 'non-existent')).toBeNull();
      expect(canonicalLookup(map, 99)).toBeNull();
    });

    it('rejects empty, duplicate, or overflow sets', () => {
      expect(() => buildRegistryOrdinalMapV1([])).toThrow(EmptyCanonicalSetError);
      expect(() => buildRegistryOrdinalMapV1(['dup', 'dup'])).toThrow(DuplicateCanonicalIdError);
      expect(() => buildRegistryOrdinalMapV1(['a', 'b', 'c'], 2)).toThrow(RegistryOverflowError);
    });

    it('detects registry revision drift', () => {
      const map = buildRegistryOrdinalMapV1(['a', 'b']);
      expect(isRegistryRevisionCurrent(map, ['a', 'b'])).toBe(true);
      expect(isRegistryRevisionCurrent(map, ['a', 'b', 'c'])).toBe(false);
      expect(isRegistryRevisionCurrent(map, ['a', 'z'])).toBe(false);
    });
  });

  describe('8.3 CodebookLUTsV1 & 12-byte Packed Header', () => {
    it('creates domain and source role LUTs adhering to capacity bounds', () => {
      const domainLut = createDomainClassLUT(['legal', 'finance', 'tech']);
      expect(domainLut.entries).toHaveLength(3);
      expect(() => createSourceRoleLUT(Array.from({ length: 17 }, (_, i) => `role-${i}`))).toThrow();
    });

    it('encodes and decodes 12-byte packed header deterministically', () => {
      const header = {
        archetype: 1,
        domain: 7,
        relation: 11,
        flags: 4,
        conceptOrdinal: 42,
        entityOrdinal: 193,
        packetOrdinal: 99999,
      };
      const bytes = encodePackedHeader(header);
      expect(bytes.byteLength).toBe(12);
      const decoded = decodePackedHeader(bytes);
      expect(decoded).toEqual(header);
    });
  });

  describe('8.4 Four-Layer Typed Coordinates', () => {
    it('formats and parses typed coordinates across the 4 namespaces', () => {
      const c1 = parseTypedCoordinate('domain:7');
      expect(c1).toEqual({ namespace: 'domain', ordinal: 7, formatted: 'domain:7' });

      const c2 = parseTypedCoordinate('concept:42');
      expect(c2).toEqual({ namespace: 'concept', ordinal: 42, formatted: 'concept:42' });

      const c3 = parseTypedCoordinate('entity:193');
      expect(c3).toEqual({ namespace: 'entity', ordinal: 193, formatted: 'entity:193' });

      expect(formatTypedCoordinate('relation', 11)).toBe('relation:11');
      expect(() => parseTypedCoordinate('invalid:xyz')).toThrow();
    });

    it('validates grounded ontology linked tuples', () => {
      const validTuple = {
        sourceEntity: 'entity:legal-ai-postgres',
        relation: 'relation:implements',
        targetConcept: 'concept:postgresql',
        sourceRef: 'src/lib/server/db/client.ts#L10',
        sourceRevision: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        byteSpan: [100, 250] as [number, number],
        canonicalAuthority: false as const,
      };
      expect(validateOntologyTuple(validTuple)).toBe(true);
      expect(validateOntologyTuple({ ...validTuple, canonicalAuthority: true })).toBe(false);
    });
  });

  describe('8.5 AtlasFeatureCardV1', () => {
    it('builds an AtlasFeatureCardV1 with representation refs', () => {
      const card = buildAtlasFeatureCardV1({
        canonicalId: 'packet:1234',
        sourceRevision: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        workspaceRevision: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        domainOrdinal: 7,
        conceptOrdinals: [42, 99],
        entityOrdinals: [193],
        relationOrdinals: [11],
        pageRank: 0.85,
        centrality: 0.62,
        representationRefs: {
          semantic768Ref: 'rep:semantic_768:v1',
          latent128Ref: 'rep:pca_128:v1',
        },
      });
      expect(AtlasFeatureCardV1Schema.safeParse(card).success).toBe(true);
      expect(card.canonicalAuthority).toBe(false);
      expect(card.cardChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe('8.6 Independent representation families', () => {
    it('classifies representation kinds without imposing one total dimensional rank', () => {
      expect(RepresentationFamilyV1Schema.parse('SEMANTIC_EMBEDDING')).toBe('SEMANTIC_EMBEDDING');
      expect(RepresentationFamilyV1Schema.parse('AUTOENCODER_LATENT')).toBe('AUTOENCODER_LATENT');
      expect(RepresentationFamilyV1Schema.parse('CLUSTER_ASSIGNMENT')).toBe('CLUSTER_ASSIGNMENT');
      expect(RepresentationFamilyV1Schema.parse('TOPOLOGY_COORDINATE')).toBe('TOPOLOGY_COORDINATE');
    });
  });

  describe('8.7 Ephemeral Hidden State Boundary', () => {
    it('generates deterministic ephemeral cache keys', () => {
      const key = buildHiddenStateCacheKeyV1({
        manifestChecksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        modelRevision: 'ornith-1.5-9b',
        adapterRevision: 'base',
        tokenizerRevision: 'tok-v1',
        layer: 17,
        tokenRange: [0, 128],
      });
      expect(key).toMatch(/^ephemeral:hidden:sha256:[a-f0-9]{64}$/);
    });

    it('throws if trying to write hidden states to canonical stores', () => {
      expect(() => assertEphemeralStorageOnly('PostgreSQL')).toThrow(CanonicalStorageViolationError);
      expect(() => assertEphemeralStorageOnly('Qdrant')).toThrow(CanonicalStorageViolationError);
      expect(() => assertEphemeralStorageOnly('neo4j')).toThrow(CanonicalStorageViolationError);
      expect(() => assertEphemeralStorageOnly('ram_cache')).not.toThrow();
    });
  });

  describe('8.8 AdapterRegistryV1', () => {
    it('assigns compact adapter slots starting at 1 (slot 0 reserved for base)', () => {
      const registry = buildAdapterRegistryV1([
        {
          adapterId: 'atlas.legal-lora',
          adapterRevision: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          baseModelRevision: 'ornith-1.5-9b',
          trainingCorpusRevision: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          cohortChecksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          rank: 16,
          alpha: 32,
          targetModules: ['q_proj', 'v_proj'],
          quantizationContract: 'q4_k',
          evalReceipt: 'eval:receipt:001',
          lifecycleStatus: 'ADMITTED',
        },
      ]);
      expect(AdapterRegistryV1Schema.safeParse(registry).success).toBe(true);
      expect(resolveAdapterSlot(registry, 0)).toBeNull(); // base model
      const slot1 = resolveAdapterSlot(registry, 1);
      expect(slot1).not.toBeNull();
      expect(slot1?.adapterId).toBe('atlas.legal-lora');
    });
  });

  describe('8.9 Residency Controller (Hot Deque & Warm Priority Queue)', () => {
    it('manages HotDeque promotion and eviction', () => {
      const deque = new HotDeque<string>(3);
      deque.pushFront('a');
      deque.pushFront('b');
      deque.pushFront('c');
      expect(deque.getItems()).toEqual(['c', 'b', 'a']);

      // Promotion
      deque.pushFront('a');
      expect(deque.getItems()).toEqual(['a', 'c', 'b']);

      // Eviction on overflow
      deque.pushFront('d');
      expect(deque.getItems()).toEqual(['d', 'a', 'c']);
    });

    it('orders WarmPriorityQueue items by computeWarmPriority formula', () => {
      const queue = new WarmPriorityQueue();
      queue.enqueue({ id: 'low', utility: 1, pReuse: 0.1, recency: 1, breadth: 1, reloadCost: 10 });
      queue.enqueue({ id: 'high', utility: 10, pReuse: 0.9, recency: 5, breadth: 2, reloadCost: 1 });

      expect(queue.dequeue()?.id).toBe('high');
      expect(queue.dequeue()?.id).toBe('low');
    });
  });

  describe('8.10 Eight-Tier LOD Ladder', () => {
    it('expands candidate Level of Detail progressively', async () => {
      const candidate: LodLadderCandidate = {
        candidateId: 'cand:001',
        currentTier: 'L0_TYPED_ORDINAL',
        data: { ordinal: 42 },
      };

      const loader = async (_id: string, targetTier: string) => {
        if (targetTier === 'L3_SEMANTIC_VECTOR') {
          return { semanticVectorRef: 'vec:768:42' };
        }
        return {};
      };

      const expanded = await expandLOD(candidate, 'L3_SEMANTIC_VECTOR', loader);
      expect(expanded.currentTier).toBe('L3_SEMANTIC_VECTOR');
      expect(expanded.data).toEqual({
        ordinal: 42,
        semanticVectorRef: 'vec:768:42',
      });

      // No-op if target tier is lower than or equal to current
      const same = await expandLOD(expanded, 'L1_FEATURE_CARD', loader);
      expect(same.currentTier).toBe('L3_SEMANTIC_VECTOR');
    });
  });
});
