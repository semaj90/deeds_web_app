/**
 * packet-dense-search.ts — orchestrator for atlas.packet_dense_search
 * (openspec/changes/parent-atlas-packet-dense-bitmap-search/).
 *
 * Ties together the three stages:
 *   1. packet-bitmap-prefilter.ts  — Postgres bitmap-scan narrowing to a candidate packet_key set
 *   2. packet-dense-rerank.ts      — Qdrant ANN restricted to that candidate set
 *   3. join-back                  — re-read atlas_packets by packet_key/source_ref (never
 *                                    feature_id alone) to attach summary/reward_prior/etc. and
 *                                    shape the response.
 *
 * Response shaping reuses PacketControlWordV1 (src/lib/server/atlas/packet-control-word-v1.ts)
 * for the compact per-result projection, rather than inventing a third packet-summary shape.
 * NOTE — corrects an earlier assumption in this change's design.md/specs: PacketControlWordV1
 * does NOT itself carry packetKey/title_id/sourceRevision (it's a revision+bit projection, not
 * an identity record — see that module's own doc comment). Those identity fields are attached as
 * sibling fields on PacketDenseSearchResult, alongside the reused control word.
 *
 * The presentBits/lod/residency/domainByte/routingByte mapping below is a best-effort derivation
 * from currently-available atlas_packets columns — it is not an authoritative bit certification
 * (that would require the actual producers of each feature to assert presence). Documented
 * per-bit inline.
 */

import { createHash } from 'node:crypto';
import {
  encodePacketControlWordV1,
  type PacketControlWordV1,
  type PacketControlWordBitV1,
} from '../atlas/packet-control-word-v1.js';
import {
  runPacketBitmapPrefilter,
  type PacketBitmapPrefilterFilters,
  type PgQueryable,
} from './packet-bitmap-prefilter.js';
import {
  runPacketDenseRerank,
  type DenseRerankCollection,
  type QdrantPointsQueryFn,
} from './packet-dense-rerank.js';

const CONTROL_WORD_SCHEMA_REVISION = 'atlas-packet-dense-search.v1';
const DEFAULT_EXPAND_TOP_K = 10;

export interface PacketDenseSearchRequest extends PacketBitmapPrefilterFilters {
  queryVector: number[];
  collection: DenseRerankCollection;
  candidateCap?: number;
  denseLimit?: number;
  scoreThreshold?: number;
  expandTopK?: number;
}

export interface PacketDenseSearchResult {
  packetKey: string;
  titleId: string | null;
  sourceRevision: string | null;
  workspaceRevision: string | number | null;
  representationRevision: string | number | null;
  identityResolutionSource: 'qdrant_payload_source_ref';
  score: number;
  controlWord: PacketControlWordV1;
  payload?: {
    summary: string | null;
    rewardPrior: number | null;
    communityId: number | null;
    pageRankScore: number | null;
    sourceRef: string | null;
    featureId: string | null;
  };
}

export interface PacketDenseSearchResponse {
  status: 'OK' | 'NO_RESULTS' | 'IDENTITY_BRIDGE_UNAVAILABLE';
  degradedReasons: string[];
  results: PacketDenseSearchResult[];
  candidateSetTruncated: boolean;
  candidateCount: number;
}

interface JoinBackRow {
  packet_key: string;
  title_id: string | null;
  workspace_revision: string | null;
  source_revision: string | null;
  representation_revision: string | null;
  source_ref: string | null;
  feature_id: string | null;
  summary: string | null;
  reward_prior: number | null;
  community_id: number | null;
  page_rank_score: number | null;
  domain_class: string | null;
  ast_score: number | null;
  tree_node_id: string | null;
  bm25_terms: string[] | null;
  trigrams: string[] | null;
  taxonomy_level: number | null;
  ontology: unknown;
  neo4j_node_id: string | null;
  used_concepts: string[] | null;
  latent_64: unknown;
  qdrant_point_id: string | null;
  rerank_features: unknown;
  canonical: boolean | null;
}

function byteFromString(value: string | null): number {
  if (!value) return 0;
  return createHash('sha256').update(value).digest()[0];
}

function deriveControlWord(row: JoinBackRow): PacketControlWordV1 {
  const presentBits: PacketControlWordBitV1[] = ['UTF8_VALID']; // Postgres text is UTF8 — unconditional
  if (row.title_id) presentBits.push('TITLE_BOUND');
  if (row.workspace_revision) presentBits.push('SOURCE_REVISION_PROVEN');
  if (row.ast_score !== null) presentBits.push('AST_PRESENT');
  if (row.tree_node_id) presentBits.push('CST_PRESENT');
  if (row.bm25_terms && row.bm25_terms.length > 0) presentBits.push('LEXICAL_PRESENT');
  if (row.trigrams && row.trigrams.length > 0) presentBits.push('TRIGRAM_PRESENT');
  if (row.domain_class) presentBits.push('DOMAIN_PRESENT');
  if (row.taxonomy_level && row.taxonomy_level > 0) presentBits.push('TAXONOMY_PRESENT');
  if (row.ontology) presentBits.push('ONTOLOGY_PRESENT');
  if (row.neo4j_node_id) presentBits.push('GRAPH_PRESENT');
  if (row.used_concepts && row.used_concepts.length > 0) presentBits.push('HYPEREDGE_PRESENT');
  if (row.latent_64) presentBits.push('LATENT64_PRESENT');
  if (row.qdrant_point_id) presentBits.push('SEMANTIC768_PRESENT');
  if (row.rerank_features) presentBits.push('RERANK_PRESENT');
  if (row.canonical) presentBits.push('VALIDATED');

  // workspace_revision/representation_revision are `integer` columns in Postgres (confirmed
  // live via \d atlas_packets, 2026-09-16) — encodePacketControlWordV1 requires string
  // revisions, so coerce rather than pass the raw pg driver number through.
  return encodePacketControlWordV1({
    packetRevision: row.workspace_revision !== null && row.workspace_revision !== undefined ? String(row.workspace_revision) : 'unknown',
    featureRevision: row.representation_revision !== null && row.representation_revision !== undefined ? String(row.representation_revision) : 'unknown',
    controlWordSchemaRevision: CONTROL_WORD_SCHEMA_REVISION,
    presentBits,
    lod: 2, // "summary + lexical/feature signals; cheap ranking" — matches this tool's response shape
    residency: 'WARM', // Postgres+Qdrant-resident result, not GPU-loaded
    domainByte: byteFromString(row.domain_class),
    routingByte: row.community_id !== null ? row.community_id % 256 : 0,
  });
}

export interface PacketDenseSearchDeps {
  db: PgQueryable;
  queryQdrantPoints: QdrantPointsQueryFn;
}

export async function runPacketDenseSearch(
  deps: PacketDenseSearchDeps,
  req: PacketDenseSearchRequest
): Promise<PacketDenseSearchResponse> {
  const expandTopK = req.expandTopK ?? DEFAULT_EXPAND_TOP_K;

  // Stage 1 — Postgres bitmap prefilter (returns packetKey + sourceRef pairs)
  const prefilter = await runPacketBitmapPrefilter(deps.db, req, req.candidateCap);
  const candidateCount = prefilter.candidates.length;

  if (candidateCount === 0) {
    return { status: 'NO_RESULTS', degradedReasons: [], results: [], candidateSetTruncated: prefilter.candidateSetTruncated, candidateCount: 0 };
  }

  // Stage 2 — Qdrant ANN restricted to the candidate source_ref set. source_ref is indexed and
  // 100%-populated on both Qdrant collections; packet_key is unindexed (though present) on
  // codebase_chunks_768 and only ~12% populated on _768_v2 (see packet-dense-rerank.ts's header
  // comment for the full finding, corrected twice 2026-09-16 — earlier versions of this comment
  // wrongly said packet_key doesn't exist at all, first on neither collection then on _v2 alone).
  const candidateSourceRefs = [...new Set(prefilter.candidates.map((c) => c.sourceRef))];
  const hits = await runPacketDenseRerank(deps.queryQdrantPoints, {
    queryVector: req.queryVector,
    collection: req.collection,
    candidateSourceRefs,
    limit: req.denseLimit,
    scoreThreshold: req.scoreThreshold,
  });

  if (hits.length === 0) {
    return { status: 'NO_RESULTS', degradedReasons: [], results: [], candidateSetTruncated: prefilter.candidateSetTruncated, candidateCount };
  }

  // Map Qdrant hits (keyed by source_ref) back to Stage 1's packet_key candidates. One
  // source_ref can back several packets (different symbols in the same file) — each shares the
  // file-level dense score, which is an honest limitation of chunk-level (not symbol-level)
  // embeddings, not a bug; documented in design.md.
  const packetKeysBySourceRef = new Map<string, string[]>();
  for (const candidate of prefilter.candidates) {
    const list = packetKeysBySourceRef.get(candidate.sourceRef) ?? [];
    list.push(candidate.packetKey);
    packetKeysBySourceRef.set(candidate.sourceRef, list);
  }
  // Keep only the highest-scoring occurrence per packetKey — multiple Qdrant chunks for the
  // same source_ref (and therefore the same candidate packets) can each match, which would
  // otherwise duplicate a packet in the response at descending scores (observed live 2026-09-16).
  const bestScoreByPacketKey = new Map<string, number>();
  for (const hit of hits) {
    for (const packetKey of packetKeysBySourceRef.get(hit.sourceRef) ?? []) {
      const existing = bestScoreByPacketKey.get(packetKey);
      if (existing === undefined || hit.score > existing) {
        bestScoreByPacketKey.set(packetKey, hit.score);
      }
    }
  }
  const scoredPacketKeys: Array<{ packetKey: string; score: number }> = [...bestScoreByPacketKey.entries()]
    .map(([packetKey, score]) => ({ packetKey, score }))
    .sort((a, b) => b.score - a.score);

  if (scoredPacketKeys.length === 0) {
    return { status: 'NO_RESULTS', degradedReasons: [], results: [], candidateSetTruncated: prefilter.candidateSetTruncated, candidateCount };
  }

  // Stage 3 — join back to atlas_packets by packet_key (never feature_id or source_ref alone)
  const packetKeys = scoredPacketKeys.map((h) => h.packetKey);
  const joinSql = `
    SELECT packet_key, title_id, workspace_revision, source_revision, representation_revision, source_ref,
           feature_id, summary, reward_prior, community_id, page_rank_score, domain_class,
           ast_score, tree_node_id, bm25_terms, trigrams, taxonomy_level, ontology,
           neo4j_node_id, used_concepts, latent_64, qdrant_point_id, rerank_features, canonical
    FROM atlas_packets
    WHERE packet_key = ANY($1::text[])
  `;
  const joinResult = await deps.db.query<JoinBackRow>(joinSql, [packetKeys]);
  const byPacketKey = new Map<string, JoinBackRow>(joinResult.rows.map((row) => [row.packet_key, row]));

  const results: PacketDenseSearchResult[] = scoredPacketKeys
    .map((scored, index) => {
      const row = byPacketKey.get(scored.packetKey);
      if (!row) return null; // no matching canonical row — drop rather than fabricate identity
      const candidate = prefilter.candidates.find((item) => item.packetKey === row.packet_key);
      if (!candidate || candidate.sourceRef !== row.source_ref || candidate.sourceRevision !== (row.source_revision ?? null) || String(candidate.workspaceRevision ?? '') !== String(row.workspace_revision ?? '')) return null;
      const result: PacketDenseSearchResult = {
        packetKey: row.packet_key,
        titleId: row.title_id,
        sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision,
        representationRevision: row.representation_revision,
        identityResolutionSource: 'qdrant_payload_source_ref',
        score: scored.score,
        controlWord: deriveControlWord(row),
      };
      if (index < expandTopK) {
        result.payload = {
          summary: row.summary,
          rewardPrior: row.reward_prior,
          communityId: row.community_id,
          pageRankScore: row.page_rank_score,
          sourceRef: row.source_ref,
          featureId: row.feature_id,
        };
      }
      return result;
    })
    .filter((r): r is PacketDenseSearchResult => r !== null);

  return {
    status: results.length > 0 ? 'OK' : 'IDENTITY_BRIDGE_UNAVAILABLE',
    degradedReasons: results.length === scoredPacketKeys.length ? [] : ['IDENTITY_BRIDGE_UNAVAILABLE'],
    results,
    candidateSetTruncated: prefilter.candidateSetTruncated,
    candidateCount,
  };
}
