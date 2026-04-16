/**
 * src/lib/server/types — public type barrel
 *
 * Narrow, intentional re-exports only.
 * Avoids wildcard (`export * from`) to keep bundling predictable.
 */

// ── Glyph system (canonical schema + search contracts) ──────────────────────
export type {
  GlyphRecord,
  GlyphKind,
  GlyphSection,
  GlyphSemanticLayer,
  GlyphVectorLayer,
  GlyphTopologyLayer,
  GlyphRenderLayer,
  GlyphBridge,
  GlyphSearchHit,
  GlyphSearchOptions,
} from './glyph.js';

// ── ACE context types ────────────────────────────────────────────────────────
export type {
  ACEContextChunk,
  ACEPolicyTier,
  ACEPolicy,
  ACEContextResult,
} from './ace.js';

// ── KAG graph types ──────────────────────────────────────────────────────────
export type {
  KAGNode,
  KAGEdge,
  KAGExpansion,
  KAGRetrievalContext,
} from './kag.js';

// ── Synthesis types ──────────────────────────────────────────────────────────
export type {
  SynthesisRequest,
  SynthesisCitation,
  SynthesisResponse,
  RewardScoringRequest,
  RewardScoringResult,
} from './synthesis.js';

// ── Qdrant types ─────────────────────────────────────────────────────────────
export type {
  CodebaseChunkPayload,
  EvidenceChunkPayload,
  LegalDocChunkPayload,
  QdrantPoint,
} from './qdrant.js';
