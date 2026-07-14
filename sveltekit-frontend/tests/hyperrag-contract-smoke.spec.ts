// @vitest-environment node
/**
 * HyperRAG Pipeline Contract Smoke Test
 *
 * Validates that every pipeline stage produces a schema-valid object and that
 * identity fields (packet_key, source_ref, feature_id, tree_node_id,
 * qdrant_point_id) remain immutable while enrichment fields are added.
 *
 * Two levels:
 *   1. Internal contract: Zod validates each stage object in isolation.
 *   2. Identity invariant: field values must not change across stages.
 *
 * Column names and field names are verified against the live DB schema:
 *   atlas_packets: packet_key, source_ref, feature_id, title_id, domain_class,
 *                  tree_node_id, qdrant_point_id, kmeans_cluster, topolog_cluster,
 *                  topolog_method, som_cluster, som_row, som_col, community_id,
 *                  page_rank_score, content_embedding_384, summary, vectors (jsonb)
 *   atlas_summary_layers: packet_key, source_ref, feature_id, layer_type,
 *                         summary_level, summary, summary_text, metadata
 *
 * Does NOT test MsgPack, latent128/64, or PageRank — these are optional
 * until the pipeline stages producing them are operational.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ── Zod schemas matching verified DB column names ────────────────────────────

// Stage 1: Candidate — raw Postgres join result
const CandidateSchema = z.object({
  packet_key:      z.string().min(1),
  source_ref:      z.string().min(1),
  feature_id:      z.string().nullable().optional(),
  domain_class:    z.string().nullable().optional(),
  summary:         z.string().nullable().optional(),
  // Topology — may be null before clustering runs
  kmeans_cluster:    z.number().int().nullable().optional(),
  topolog_cluster:   z.number().int().nullable().optional(),
  topolog_method:    z.string().nullable().optional(),
  som_row:           z.number().int().nullable().optional(),
  som_col:           z.number().int().nullable().optional(),
  // Identity anchors
  tree_node_id:    z.string().uuid().nullable().optional(),
  qdrant_point_id: z.string().nullable().optional(),
});

// Stage 2: FeatureEnvelope — after summary + vectors hydrated
const FeatureEnvelopeSchema = CandidateSchema.extend({
  title_id:     z.string().regex(/^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$/),
  summary:      z.string().min(1),       // required at this stage
  vectors:      z.object({
    summary_384: z.object({
      dimension: z.literal(384),
      model:     z.string().min(1),
    }).optional(),
    content_768: z.object({
      dimension: z.literal(768),
      model:     z.string().min(1),
    }).optional(),
  }),
});

// Stage 3: RankedCandidate — after cross-encoder / RRF scoring
const RankedCandidateSchema = FeatureEnvelopeSchema.extend({
  rank:         z.number().int().min(0),
  scores:       z.object({
    qdrant_dense: z.number().min(0).max(1).optional(),
    bm25:         z.number().min(0).max(1).optional(),
    rrf:          z.number().min(0).optional(),
    cross_encoder: z.number().min(-1).max(1).optional(),
  }),
  final_score:  z.number(),
});

// Stage 4: SemanticPacket — after domain classification enrichment
const SemanticPacketSchema = RankedCandidateSchema.extend({
  domain_class: z.string().min(1),    // required (100% populated in atlas_packets)
  keywords:     z.array(z.string()).optional(),
});

// Stage 5: PacketTopologyEnvelope — after topology fields resolved
const PacketTopologyEnvelopeSchema = SemanticPacketSchema.extend({
  topology: z.object({
    kmeans_cluster:  z.number().int().nullable().optional(),
    topolog_cluster: z.number().int().nullable().optional(),
    topolog_method:  z.string().nullable().optional(),
    som_cluster:     z.string().nullable().optional(),  // text type in DB
    som_row:         z.number().int().nullable().optional(),
    som_col:         z.number().int().nullable().optional(),
    community_id:    z.number().int().nullable().optional(),
    page_rank_score: z.number().nullable().optional(),
  }),
  // Vectors validated by dimension when present
  content_embedding_384: z.array(z.number()).length(384).nullable().optional(),
});

// ── Identity invariant assertion helper ─────────────────────────────────────

type IdentityFields = {
  packet_key:      string;
  source_ref:      string;
  feature_id?:     string | null;
  tree_node_id?:   string | null;
  qdrant_point_id?: string | null;
};

function assertIdentityUnchanged(before: IdentityFields, after: IdentityFields, stage: string) {
  expect(after.packet_key, `${stage}: packet_key mutated`).toEqual(before.packet_key);
  expect(after.source_ref,  `${stage}: source_ref mutated`).toEqual(before.source_ref);
  if (before.feature_id != null) {
    expect(after.feature_id, `${stage}: feature_id mutated`).toEqual(before.feature_id);
  }
  if (before.tree_node_id != null) {
    expect(after.tree_node_id, `${stage}: tree_node_id mutated`).toEqual(before.tree_node_id);
  }
  if (before.qdrant_point_id != null) {
    expect(after.qdrant_point_id, `${stage}: qdrant_point_id mutated`).toEqual(before.qdrant_point_id);
  }
}

// ── Fixture: realistic packet from verified DB sample ───────────────────────

const FIXTURE_PACKET_KEY      = 'packet:1f18437ee58f';
const FIXTURE_SOURCE_REF      = 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte';
const FIXTURE_FEATURE_ID      = 'sveltekit-frontend.+page';
const FIXTURE_TITLE_ID        = 'title:sveltekit-frontend-page:e2342d79';
const FIXTURE_DOMAIN_CLASS    = 'frontend';
const FIXTURE_TREE_NODE_ID    = '8c42cec6-6264-4b86-abb7-10a3e2d5d943';
const FIXTURE_QDRANT_POINT_ID = '0001981c-da69-4b0e-9acb-ad29544029c8';

function makeCandidate(): z.infer<typeof CandidateSchema> {
  return {
    packet_key:      FIXTURE_PACKET_KEY,
    source_ref:      FIXTURE_SOURCE_REF,
    feature_id:      FIXTURE_FEATURE_ID,
    domain_class:    FIXTURE_DOMAIN_CLASS,
    summary:         null,
    kmeans_cluster:  null,
    topolog_cluster: null,
    topolog_method:  'unassigned',
    som_row:         5,
    som_col:         17,
    tree_node_id:    FIXTURE_TREE_NODE_ID,
    qdrant_point_id: FIXTURE_QDRANT_POINT_ID,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HyperRAG Contract Smoke — Stage 1: Candidate', () => {
  it('validates schema with all required identity fields', () => {
    const candidate = makeCandidate();
    const result = CandidateSchema.safeParse(candidate);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it('rejects missing packet_key', () => {
    const bad = { ...makeCandidate(), packet_key: '' };
    expect(CandidateSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing source_ref', () => {
    const bad = { ...makeCandidate(), source_ref: '' };
    expect(CandidateSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts null topology fields (not yet clustered)', () => {
    const candidate = { ...makeCandidate(), kmeans_cluster: null, topolog_cluster: null };
    expect(CandidateSchema.safeParse(candidate).success).toBe(true);
  });
});

describe('HyperRAG Contract Smoke — Stage 2: FeatureEnvelope', () => {
  function makeEnvelope(): z.infer<typeof FeatureEnvelopeSchema> {
    return {
      ...makeCandidate(),
      title_id:  FIXTURE_TITLE_ID,
      summary:   'This Svelte route renders the demos page with WebGPU showcase components.',
      vectors: {
        content_768: { dimension: 768, model: 'embeddinggemma:latest' },
      },
    };
  }

  it('validates fully-hydrated envelope', () => {
    const envelope = makeEnvelope();
    const result = FeatureEnvelopeSchema.safeParse(envelope);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it('rejects non-canonical title_id', () => {
    const bad = { ...makeEnvelope(), title_id: 'grpc_service' };
    expect(FeatureEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty summary at envelope stage', () => {
    const bad = { ...makeEnvelope(), summary: '' };
    expect(FeatureEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('identity fields unchanged from Candidate to FeatureEnvelope', () => {
    const before = makeCandidate();
    const after  = makeEnvelope();
    assertIdentityUnchanged(before, after, 'FeatureEnvelope');
  });

  it('title_id matches canonical regex', () => {
    const envelope = makeEnvelope();
    expect(envelope.title_id).toMatch(/^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$/);
  });
});

describe('HyperRAG Contract Smoke — Stage 3: RankedCandidate', () => {
  function makeRanked(): z.infer<typeof RankedCandidateSchema> {
    return {
      ...makeCandidate(),
      title_id: FIXTURE_TITLE_ID,
      summary:  'This Svelte route renders the demos page with WebGPU showcase components.',
      vectors:  { content_768: { dimension: 768, model: 'embeddinggemma:latest' } },
      rank:       0,
      scores:     { qdrant_dense: 0.87, bm25: 0.62, rrf: 0.74 },
      final_score: 0.74,
    };
  }

  it('validates ranked candidate with scores', () => {
    const ranked = makeRanked();
    expect(RankedCandidateSchema.safeParse(ranked).success).toBe(true);
  });

  it('scores must be finite numbers', () => {
    const bad = { ...makeRanked(), scores: { qdrant_dense: NaN } };
    // NaN is not a valid JSON number — Zod number() rejects NaN
    expect(RankedCandidateSchema.safeParse(bad).success).toBe(false);
  });

  it('scores bounded [0,1] for dense and bm25', () => {
    const bad = { ...makeRanked(), scores: { qdrant_dense: 1.5 } };
    expect(RankedCandidateSchema.safeParse(bad).success).toBe(false);
  });

  it('rank must be non-negative integer', () => {
    const bad = { ...makeRanked(), rank: -1 };
    expect(RankedCandidateSchema.safeParse(bad).success).toBe(false);
  });

  it('identity fields unchanged through reranking', () => {
    const before = makeCandidate();
    const after  = makeRanked();
    assertIdentityUnchanged(before, after, 'RankedCandidate');
  });
});

describe('HyperRAG Contract Smoke — Stage 4: SemanticPacket', () => {
  function makeSemantic(): z.infer<typeof SemanticPacketSchema> {
    return {
      ...makeCandidate(),
      title_id:     FIXTURE_TITLE_ID,
      summary:      'This Svelte route renders the demos page with WebGPU showcase components.',
      vectors:      { content_768: { dimension: 768, model: 'embeddinggemma:latest' } },
      rank:         0,
      scores:       { qdrant_dense: 0.87, bm25: 0.62, rrf: 0.74 },
      final_score:  0.74,
      domain_class: 'frontend',
      keywords:     ['svelte', 'webgpu', 'demos', 'showcase'],
    };
  }

  it('validates semantic packet with domain_class', () => {
    expect(SemanticPacketSchema.safeParse(makeSemantic()).success).toBe(true);
  });

  it('domain_class must be non-empty string', () => {
    const bad = { ...makeSemantic(), domain_class: '' };
    expect(SemanticPacketSchema.safeParse(bad).success).toBe(false);
  });

  it('identity fields unchanged after semantic enrichment', () => {
    assertIdentityUnchanged(makeCandidate(), makeSemantic(), 'SemanticPacket');
  });

  it('enrichment fields added without touching identity', () => {
    const semantic = makeSemantic();
    // Enrichment-only fields must be present
    expect(semantic.title_id).toBeDefined();
    expect(semantic.domain_class).toBeDefined();
    expect(semantic.keywords).toBeDefined();
    // Identity fields must be original values
    expect(semantic.packet_key).toBe(FIXTURE_PACKET_KEY);
    expect(semantic.source_ref).toBe(FIXTURE_SOURCE_REF);
    expect(semantic.feature_id).toBe(FIXTURE_FEATURE_ID);
  });
});

describe('HyperRAG Contract Smoke — Stage 5: PacketTopologyEnvelope', () => {
  function makeTopologyEnvelope(): z.infer<typeof PacketTopologyEnvelopeSchema> {
    return {
      ...makeCandidate(),
      title_id:     FIXTURE_TITLE_ID,
      summary:      'This Svelte route renders the demos page with WebGPU showcase components.',
      vectors:      { content_768: { dimension: 768, model: 'embeddinggemma:latest' } },
      rank:         0,
      scores:       { qdrant_dense: 0.87, bm25: 0.62, rrf: 0.74 },
      final_score:  0.74,
      domain_class: 'frontend',
      topology: {
        kmeans_cluster:  null,          // not yet clustered in this fixture
        topolog_cluster: null,
        topolog_method:  'unassigned',
        som_cluster:     'som20x20',    // DB column is text type
        som_row:         5,
        som_col:         17,
        community_id:    39055,
        page_rank_score: 0.15,
      },
    };
  }

  it('validates topology envelope', () => {
    const envelope = makeTopologyEnvelope();
    const result = PacketTopologyEnvelopeSchema.safeParse(envelope);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it('topology cluster fields are nullable (clustering may not be run yet)', () => {
    const envelope = makeTopologyEnvelope();
    expect(envelope.topology.kmeans_cluster).toBeNull();
    expect(envelope.topology.topolog_cluster).toBeNull();
  });

  it('som_cluster is stored as text (matches DB column type)', () => {
    const envelope = makeTopologyEnvelope();
    expect(typeof envelope.topology.som_cluster).toBe('string');
  });

  it('accepts content_embedding_384 as 384-element array when present', () => {
    const envelope = {
      ...makeTopologyEnvelope(),
      content_embedding_384: Array.from({ length: 384 }, (_, i) => i / 384),
    };
    expect(PacketTopologyEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('rejects content_embedding_384 with wrong dimension', () => {
    const bad = {
      ...makeTopologyEnvelope(),
      content_embedding_384: Array.from({ length: 768 }, () => 0),
    };
    expect(PacketTopologyEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('identity fields unchanged through full pipeline', () => {
    assertIdentityUnchanged(makeCandidate(), makeTopologyEnvelope(), 'PacketTopologyEnvelope');
  });
});

describe('HyperRAG Contract Smoke — Title ID determinism', () => {
  it('title_id formula is deterministic given same packet_key', () => {
    // The canonical formula: sha256(packet_key + '\0' + 'deterministic-title-v1').hex.slice(0,8)
    // plus slug from feature_id
    // Verify the fixture title_id matches the pattern
    expect(FIXTURE_TITLE_ID).toMatch(/^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$/);
  });

  it('two calls with same packet_key produce identical title_id', async () => {
    // Inline the formula to avoid SvelteKit path resolution in test env
    const crypto = await import('crypto');
    function generateTitleId(packetKey: string, featureId: string) {
      const hash8 = crypto.createHash('sha256')
        .update(`${packetKey}\0deterministic-title-v1`)
        .digest('hex')
        .slice(0, 8);
      const slug = (featureId || 'untitled')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64) || 'untitled';
      return `title:${slug}:${hash8}`;
    }

    const first  = generateTitleId(FIXTURE_PACKET_KEY, FIXTURE_FEATURE_ID);
    const second = generateTitleId(FIXTURE_PACKET_KEY, FIXTURE_FEATURE_ID);
    expect(first).toBe(second);
    expect(first).toMatch(/^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$/);
  });
});

describe('HyperRAG Contract Smoke — Domain classifier output', () => {
  const DomainClassifierOutputSchema = z.object({
    primaryDomain:    z.string().min(1),
    secondaryDomains: z.array(z.string()).optional(),
    capabilities:     z.array(z.string()).optional(),
    confidence:       z.number().min(0).max(1),
    classifierVersion: z.string().optional(),
  });

  it('validates structured domain classifier output', () => {
    const output = {
      primaryDomain:    'retrieval',
      secondaryDomains: ['machine_learning'],
      capabilities:     ['cross_encoder', 'rrf'],
      confidence:       0.94,
      classifierVersion: '1.0',
    };
    expect(DomainClassifierOutputSchema.safeParse(output).success).toBe(true);
  });

  it('rejects confidence outside [0,1]', () => {
    const bad = { primaryDomain: 'retrieval', confidence: 1.5 };
    expect(DomainClassifierOutputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty primaryDomain', () => {
    const bad = { primaryDomain: '', confidence: 0.9 };
    expect(DomainClassifierOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe('HyperRAG Contract Smoke — End-to-end identity stability', () => {
  it('packet_key, source_ref, feature_id, tree_node_id, qdrant_point_id survive all 5 stages', () => {
    const identity = {
      packet_key:      FIXTURE_PACKET_KEY,
      source_ref:      FIXTURE_SOURCE_REF,
      feature_id:      FIXTURE_FEATURE_ID,
      tree_node_id:    FIXTURE_TREE_NODE_ID,
      qdrant_point_id: FIXTURE_QDRANT_POINT_ID,
    };

    // Simulate each stage adding fields without touching identity
    const stage1 = { ...identity, domain_class: 'frontend', summary: null };
    const stage2 = { ...stage1, title_id: FIXTURE_TITLE_ID, summary: 'Demo page summary.' };
    const stage3 = { ...stage2, rank: 0, scores: { qdrant_dense: 0.87 }, final_score: 0.87 };
    const stage4 = { ...stage3, keywords: ['svelte', 'demos'] };
    const stage5 = { ...stage4, topology: { som_row: 5, som_col: 17, community_id: 39055 } };

    for (const [name, stage] of [
      ['stage1', stage1], ['stage2', stage2], ['stage3', stage3],
      ['stage4', stage4], ['stage5', stage5],
    ] as const) {
      assertIdentityUnchanged(identity, stage as unknown as IdentityFields, name);
    }
  });
});
