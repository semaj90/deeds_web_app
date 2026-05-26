/**
 * Glyph Mappers — CHR97 ↔ GlyphRecord backward-compat bridge.
 *
 * Provides two-way conversion between the compact binary CHR97 transport
 * format (RuneData / ParsedRune) and the canonical 4-layer server schema
 * (GlyphRecord from src/lib/server/types/glyph.ts).
 *
 * Invariants:
 *   runeToGlyphRecord(glyphRecordToRuneData(g)) ≈ g  (round-trip safe)
 *   Fields without CHR97 equivalents default to safe empty values.
 *
 * Also exports:
 *   glyphRecordToDbRow()   — Drizzle INSERT into glyph_records
 *   dbRowToGlyphRecord()   — SELECT row → runtime GlyphRecord
 *   parseGlyphRecordRow()  — cast JSONB `unknown` columns to typed shape
 *   glyphIdFromSource()    — stable deterministic glyphId
 */

import crypto from 'crypto';
import type { RuneData, ParsedRune } from './chr97-builder.js';
import type {
  GlyphRecord,
  GlyphSection,
  GlyphKind,
  GlyphSemanticLayer,
  GlyphVectorLayer,
  GlyphTopologyLayer,
  GlyphRenderLayer,
} from '$lib/server/types/glyph.js';
import { hmmStateToGlyphSection } from '$lib/server/types/glyph.js';

// ── Stable ID derivation ──────────────────────────────────────────────────

/**
 * Derive a stable glyphId from sourceId + first 64 chars of text.
 * sha256 truncated to 16 hex bytes = 32 chars.
 */
export function glyphIdFromSource(sourceId: string, text: string): string {
  return crypto
    .createHash('sha256')
    .update(`${sourceId}:${text.slice(0, 64)}`)
    .digest('hex')
    .slice(0, 32);
}

// ── RuneData → GlyphRecord ────────────────────────────────────────────────

/**
 * Convert a CHR97 RuneData (compact transport) into a canonical 4-layer GlyphRecord.
 *
 * RuneData carries: id, clusterId, embedding, text, sourceId, sourceName, entities.
 * All topology/render/reward fields default to safe empty values. Callers should
 * enrich these from Postgres/Qdrant/Neo4j/SOM after conversion.
 */
export function runeToGlyphRecord(rune: RuneData): GlyphRecord {
  const sourceId = rune.sourceId ?? String(rune.id);
  const text     = rune.text ?? '';
  const entities = rune.entities ?? [];

  // Heuristic section detection from entity tags (fallback before HMM runs)
  const entityStr = entities.join(' ');
  const section: GlyphSection = hmmStateToGlyphSection(
    entities.find(e =>
      /FACTS|LEGAL_AUTHORITY|CLAIMS|PRAYER_HOLDING|PARTIES|JURISDICTION/i.test(e)
    ) ?? null
  );

  // topo4d / manifold from first 4 embedding dims (mirrors chr97-builder convention)
  const emb = rune.embedding;
  const manifold4: [number, number, number, number] = [
    emb[0] ?? 0, emb[1] ?? 0, emb[2] ?? 0, emb[3] ?? 0,
  ];

  const semantic: GlyphSemanticLayer = {
    summary:       text,
    tags:          entities.filter(e => !e.startsWith('section:')),
    entities,
    section,
    kagNeighbors:  [],
    dagPrev:       [],
    dagNext:       [],
    jsonbKeyHints: [],
  };

  const vector: GlyphVectorLayer = {
    embedding768:    new Float32Array(emb),
    embeddingModel:  'embeddinggemma:latest',
    centroidId:      rune.clusterId,
    grpoRewardScore: null,
  };

  const topology: GlyphTopologyLayer = {
    manifold4,
    somCluster:  null,
    gridX:       null,
    gridY:       null,
    normX:       null,
    normY:       null,
    confidence:  null,
    runeCount:   null,
  };

  const render: GlyphRenderLayer = {
    cartridgeId:    null,
    pageIndex:      null,
    tileIndex:      null,
    promptCacheKey: `glyph:${glyphIdFromSource(sourceId, text)}`,
    atlasKey:       null,
  };

  return {
    glyphId:       glyphIdFromSource(sourceId, text),
    sourceId,
    caseId:        null,
    kind:          'chunk' as GlyphKind,
    schemaVersion: 1,
    semantic,
    vector,
    topology,
    render,
  };
}

/**
 * Convert a batch of RuneData records to GlyphRecords.
 */
export function runeBatchToGlyphRecords(runes: RuneData[]): GlyphRecord[] {
  return runes.map(runeToGlyphRecord);
}

// ── ParsedRune → GlyphRecord (after cartridge parse) ─────────────────────

/**
 * Reconstruct a minimal GlyphRecord from a ParsedRune + dequantized tensor.
 * ParsedRune comes from parseCartridge() and lacks text/entities.
 * Caller must supply metadata from the Metadata JSON block.
 */
export function parsedRuneToGlyphRecord(
  rune: ParsedRune,
  tensor: Float32Array,
  opts: {
    sourceId?:   string;
    sourceName?: string;
    text?:       string;
    entities?:   string[];
    section?:    GlyphSection;
    kind?:       GlyphKind;
    caseId?:     string;
    cartridge_kind?: string | null;
    glyph_kind?: string | null;
    cluster_key?: string | null;
  } = {}
): GlyphRecord {
  const sourceId = opts.sourceId ?? String(rune.id);
  const text     = opts.text ?? '';

  const semantic: GlyphSemanticLayer = {
    summary:       text,
    tags:          opts.entities ?? [],
    entities:      opts.entities ?? [],
    section:       opts.section ?? 'UNKNOWN',
    kagNeighbors:  [],
    dagPrev:       [],
    dagNext:       [],
    jsonbKeyHints: [],
  };

  const vector: GlyphVectorLayer = {
    embedding768:    tensor,
    embeddingModel:  'embeddinggemma:latest',
    centroidId:      rune.clusterId,
    grpoRewardScore: null,
  };

  const topology: GlyphTopologyLayer = {
    manifold4:   rune.manifold,
    somCluster:  null,
    gridX:       null,
    gridY:       null,
    normX:       null,
    normY:       null,
    confidence:  null,
    runeCount:   null,
  };

  const render: GlyphRenderLayer = {
    cartridgeId:    null,
    pageIndex:      null,
    tileIndex:      null,
    promptCacheKey: `glyph:${glyphIdFromSource(sourceId, text)}`,
    atlasKey:       null,
  };

  return {
    glyphId:       glyphIdFromSource(sourceId, text),
    sourceId,
    caseId:        opts.caseId ?? null,
    kind:          opts.kind ?? 'chunk',
    schemaVersion: 1,
    cartridge_kind: opts.cartridge_kind ?? null,
    glyph_kind: opts.glyph_kind ?? null,
    cluster_key: opts.cluster_key ?? null,
    semantic,
    vector,
    topology,
    render,
  };
}

// ── GlyphRecord → Drizzle DB row ──────────────────────────────────────────

export interface GlyphRecordDbRow {
  glyphId:         string;
  sourceId:        string;
  caseId:          string | null;
  kind:            string;
  section:         string | null;
  summary:         string;
  tags:            unknown;          // JSONB: string[]
  jsonbKeyHints:   unknown;          // JSONB: string[]
  topo4d:          unknown;          // JSONB: [f,f,f,f]
  somCluster:      number | null;
  centroidId:      number | null;
  kagNeighbors:    unknown;          // JSONB: string[]
  dagPrev:         unknown;          // JSONB: string[]
  grpoRewardScore: number | null;
  entities:        unknown;          // JSONB: string[]
  recordJson:      unknown;          // JSONB: nested layer snapshot
  schemaVersion:   number;
}

/**
 * Serialize a GlyphRecord for Drizzle INSERT into `glyph_records`.
 * embedding768 is NOT stored here — it goes into a separate pgvector column
 * or Qdrant. The JSONB `recordJson` omits the full vector for the same reason.
 */
export function glyphRecordToDbRow(g: GlyphRecord): GlyphRecordDbRow {
  return {
    glyphId:         g.glyphId,
    sourceId:        g.sourceId,
    caseId:          g.caseId ?? null,
    kind:            g.kind,
    section:         g.semantic.section !== 'UNKNOWN' ? g.semantic.section : null,
    summary:         g.semantic.summary,
    tags:            g.semantic.tags,
    jsonbKeyHints:   g.semantic.jsonbKeyHints ?? [],
    topo4d:          g.topology.manifold4 ? Array.from(g.topology.manifold4) : [0, 0, 0, 0],
    somCluster:      g.topology.somCluster ?? null,
    centroidId:      g.vector.centroidId ?? null,
    kagNeighbors:    g.semantic.kagNeighbors,
    dagPrev:         g.semantic.dagPrev,
    grpoRewardScore: g.vector.grpoRewardScore ?? null,
    entities:        g.semantic.entities,
    recordJson: {
      // Full snapshot of all layers except vector.embedding768
      glyphId:   g.glyphId,
      sourceId:  g.sourceId,
      caseId:    g.caseId,
      kind:      g.kind,
      cartridge_kind: g.cartridge_kind ?? null,
      glyph_kind: g.glyph_kind ?? null,
      cluster_key: g.cluster_key ?? null,
      semantic: {
        ...g.semantic,
      },
      vector: {
        embeddingModel:  g.vector.embeddingModel,
        centroidId:      g.vector.centroidId,
        grpoRewardScore: g.vector.grpoRewardScore,
        norm:            g.vector.norm,
        // embedding768 intentionally omitted
      },
      topology: g.topology,
      render:   g.render,
    },
    schemaVersion: g.schemaVersion,
  };
}

// ── JSONB column deserialization ──────────────────────────────────────────
//
// Drizzle returns JSONB columns as `unknown`. These guards cast them safely.

function _jsonbStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return [];
}

function _jsonbNumberArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number);
  return [];
}

function _jsonbTopo4d(v: unknown): [number, number, number, number] {
  const arr = _jsonbNumberArray(v);
  return [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 0];
}

function _jsonbRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/**
 * Parse a raw Drizzle DB row (JSONB columns as `unknown`) into a
 * strongly-typed GlyphRecordDbRow. Safe — no throws on bad data.
 */
export function parseGlyphRecordRow(raw: Record<string, unknown>): GlyphRecordDbRow {
  return {
    glyphId:         String(raw['glyphId']       ?? raw['glyph_id']       ?? ''),
    sourceId:        String(raw['sourceId']       ?? raw['source_id']      ?? ''),
    caseId:          raw['caseId'] != null ? String(raw['caseId'] ?? raw['case_id']) : null,
    kind:            String(raw['kind']           ?? 'chunk'),
    section:         raw['section'] != null ? String(raw['section']) : null,
    summary:         String(raw['summary']        ?? ''),
    tags:            _jsonbStringArray(raw['tags']),
    jsonbKeyHints:   _jsonbStringArray(raw['jsonbKeyHints'] ?? raw['jsonb_key_hints']),
    topo4d:          _jsonbTopo4d(raw['topo4d']),
    somCluster:      raw['somCluster']  != null ? Number(raw['somCluster']  ?? raw['som_cluster'])  : null,
    centroidId:      raw['centroidId']  != null ? Number(raw['centroidId']  ?? raw['centroid_id'])  : null,
    kagNeighbors:    _jsonbStringArray(raw['kagNeighbors']    ?? raw['kag_neighbors']),
    dagPrev:         _jsonbStringArray(raw['dagPrev']         ?? raw['dag_prev']),
    grpoRewardScore: raw['grpoRewardScore'] != null ? Number(raw['grpoRewardScore'] ?? raw['grpo_reward_score']) : null,
    entities:        _jsonbStringArray(raw['entities']),
    recordJson:      _jsonbRecord(raw['recordJson'] ?? raw['record_json']),
    schemaVersion:   Number(raw['schemaVersion'] ?? raw['schema_version'] ?? 1),
  };
}

/**
 * Re-hydrate a GlyphRecord from a typed DB row.
 * vector.embedding768 is left as empty Float32Array — callers fill it from
 * the pgvector column or Qdrant when needed.
 */
export function dbRowToGlyphRecord(row: GlyphRecordDbRow): GlyphRecord {
  const tags         = _jsonbStringArray(row.tags);
  const entities     = _jsonbStringArray(row.entities);
  const kagNeighbors = _jsonbStringArray(row.kagNeighbors);
  const dagPrev      = _jsonbStringArray(row.dagPrev);
  const topo4d       = _jsonbTopo4d(row.topo4d);
  const rec          = _jsonbRecord(row.recordJson);
  const renderSnap   = (rec['render'] ?? {}) as Record<string, unknown>;

  return {
    glyphId:       row.glyphId,
    sourceId:      row.sourceId,
    caseId:        row.caseId,
    kind:          row.kind as GlyphKind,
    schemaVersion: row.schemaVersion,
    cartridge_kind: (rec['cartridge_kind'] as string | null) ?? null,
    glyph_kind: (rec['glyph_kind'] as string | null) ?? null,
    cluster_key: (rec['cluster_key'] as string | null) ?? null,

    semantic: {
      summary:       row.summary,
      tags,
      entities,
      section:       (row.section as GlyphSection | null) ?? 'UNKNOWN',
      kagNeighbors,
      dagPrev,
      dagNext:       _jsonbStringArray((rec['semantic'] as Record<string, unknown>)?.['dagNext']),
      jsonbKeyHints: _jsonbStringArray(row.jsonbKeyHints),
    },

    vector: {
      embedding768:    new Float32Array(0),  // populated by caller
      embeddingModel:  'embeddinggemma:latest',
      centroidId:      row.centroidId,
      grpoRewardScore: row.grpoRewardScore,
    },

    topology: {
      manifold4:  topo4d,
      somCluster: row.somCluster,
      gridX:      null,
      gridY:      null,
      normX:      null,
      normY:      null,
    },

    render: {
      cartridgeId:    (renderSnap['cartridgeId'] as string | null) ?? null,
      pageIndex:      (renderSnap['pageIndex'] as number | null)   ?? null,
      tileIndex:      (renderSnap['tileIndex'] as number | null)   ?? null,
      promptCacheKey: (renderSnap['promptCacheKey'] as string | null) ?? `glyph:${row.glyphId}`,
      atlasKey:       (renderSnap['atlasKey'] as string | null)    ?? null,
    },
  };
}

// ── Proto transport converters ────────────────────────────────────────────
//
// GlyphRecordProto (graph_ml.proto message) is the compact gRPC transport
// shape used when passing glyph metadata to the Python image-synthesis
// microservice (ConditionGlyphAtlas + GlyphRecord transport RPCs).
// It omits the 768-dim embedding (too large for inline gRPC messages) and
// flattens the 4-layer schema to a single level.

/** Flat proto-compatible shape matching GlyphRecordProto in graph_ml.proto. */
export interface GlyphRecordProtoLike {
  glyphId:         string;
  sourceId:        string;
  type:            string;   // GlyphKind
  section:         string;   // GlyphSection or ""
  summary:         string;
  tags:            string[];
  topo4d:          number[]; // length 4
  somCluster:      number;   // 0 = unset
  centroidId:      number;   // 0 = unset
  grpoRewardScore: number;   // 0 = unset
  kagNeighbors:    string[];
  entities:        string[];
}

/**
 * Serialize a canonical GlyphRecord → flat GlyphRecordProto-compatible object.
 * Embedding is intentionally omitted (use separate Qdrant/pgvector lookup).
 */
export function glyphRecordToProto(g: GlyphRecord): GlyphRecordProtoLike {
  return {
    glyphId:         g.glyphId,
    sourceId:        g.sourceId,
    type:            g.kind,
    section:         g.semantic.section !== 'UNKNOWN' ? g.semantic.section : '',
    summary:         g.semantic.summary,
    tags:            g.semantic.tags,
    topo4d:          g.topology.manifold4
                       ? Array.from(g.topology.manifold4)
                       : [0, 0, 0, 0],
    somCluster:      g.topology.somCluster ?? 0,
    centroidId:      g.vector.centroidId ?? 0,
    grpoRewardScore: g.vector.grpoRewardScore ?? 0,
    kagNeighbors:    g.semantic.kagNeighbors,
    entities:        g.semantic.entities,
  };
}

/**
 * Deserialize a GlyphRecordProto-compatible object → canonical GlyphRecord.
 * embedding768 is empty — caller must hydrate from Qdrant/pgvector if needed.
 */
export function protoToGlyphRecord(p: GlyphRecordProtoLike): GlyphRecord {
  const section = hmmStateToGlyphSection(p.section || null);
  const text    = p.summary;

  return {
    glyphId:       p.glyphId || glyphIdFromSource(p.sourceId, text),
    sourceId:      p.sourceId,
    caseId:        null,
    kind:          (p.type || 'chunk') as GlyphKind,
    schemaVersion: 1,

    semantic: {
      summary:       text,
      tags:          p.tags ?? [],
      entities:      p.entities ?? [],
      section,
      kagNeighbors:  p.kagNeighbors ?? [],
      dagPrev:       [],
      dagNext:       [],
      jsonbKeyHints: [],
    },

    vector: {
      embedding768:    new Float32Array(0),   // hydrate from Qdrant/pgvector
      embeddingModel:  'embeddinggemma:latest',
      centroidId:      p.centroidId || null,
      grpoRewardScore: p.grpoRewardScore || null,
    },

    topology: {
      manifold4:   (p.topo4d?.length === 4
                     ? [p.topo4d[0], p.topo4d[1], p.topo4d[2], p.topo4d[3]]
                     : [0, 0, 0, 0]) as [number, number, number, number],
      somCluster:  p.somCluster || null,
      gridX:       null,
      gridY:       null,
      normX:       null,
      normY:       null,
      confidence:  null,
      runeCount:   null,
    },

    render: {
      cartridgeId:    null,
      pageIndex:      null,
      tileIndex:      null,
      promptCacheKey: `glyph:${p.glyphId}`,
      atlasKey:       null,
    },
  };
}
