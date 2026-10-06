/**
 * Single owner of the per-packet enrichment readiness predicates (SQL). Read-only.
 * Consumed by the census and by the pre-embedding guard so the two can never drift.
 * Placeholder = vector shared by >1% of all embedded packets.
 */
export const ENRICHMENT_READINESS_CTE_V1 = `
WITH emb AS (SELECT packet_key, md5(embedding::text) AS h FROM public.atlas_packets WHERE embedding IS NOT NULL),
grp AS (SELECT h, count(*)::int AS n FROM emb GROUP BY h),
lim AS (SELECT greatest(1, floor(count(*) * 0.01))::int AS t FROM emb),
p AS (
  SELECT ap.packet_key, ap.source_ref,
    (ap.packet_key IS NOT NULL AND ap.packet_key <> '' AND ap.source_ref IS NOT NULL AND ap.source_ref <> '') AS ident,
    (ap.source_revision IS NOT NULL) AS has_rev, (ap.sha256 IS NOT NULL) AS has_sha,
    (ap.sha256 IS NOT NULL AND ap.source_revision IS NOT NULL AND lower(replace(ap.sha256,'sha256:','')) <> lower(replace(ap.source_revision,'sha256:',''))) AS sha_conflict,
    (ap.summary IS NOT NULL AND btrim(ap.summary) <> '') AS has_summary,
    (coalesce(cardinality(ap.keywords),0) > 0) AS has_keywords,
    (ap.domain_class IS NOT NULL) AS has_domain, (coalesce(cardinality(ap.concept_ids),0) > 0) AS has_concepts,
    (coalesce(cardinality(ap.used_concepts),0) > 0) AS has_used_concepts,
    (ap.extracted_entities IS NOT NULL AND ap.extracted_entities::text NOT IN ('[]','{}','null')) AS has_entities,
    (ap.embedding IS NOT NULL AND g.n <= lim.t) AS emb_real, (ap.embedding IS NOT NULL AND g.n > lim.t) AS emb_placeholder,
    (ap.embedding_version IS NOT NULL) AS has_emb_version, (ap.representation_revision IS NOT NULL AND ap.representation_revision <> 0) AS has_repr_rev,
    (ap.community_id IS NOT NULL) AS has_comm, (coalesce(ap.kmeans_cluster, ap.kmeans_cluster_id) IS NOT NULL) AS has_km,
    (ap.som_cell_x IS NOT NULL AND ap.som_cell_y IS NOT NULL) AS has_som, (coalesce(ap.pagerank_raw, ap.pagerank_score) IS NOT NULL) AS has_pr,
    (ap.workspace_revision_key IS NOT NULL) AS has_ws_key
  FROM public.atlas_packets ap LEFT JOIN emb ON emb.packet_key = ap.packet_key LEFT JOIN grp g ON g.h = emb.h CROSS JOIN lim),
lv AS (
  SELECT *,
    (ident AND has_rev AND NOT sha_conflict) AS l1, (has_summary AND has_keywords) AS l2, (has_domain AND has_concepts) AS l3,
    (emb_real AND has_emb_version AND has_repr_rev) AS l4, (has_comm AND has_km AND has_som AND has_pr) AS l5,
    -- embedding gate: lineage + summary + classification. Keywords are CPU-derivable and do NOT gate embedding.
    (ident AND has_rev AND NOT sha_conflict AND has_summary AND has_domain AND has_concepts) AS embed_allowed
  FROM p)`;

export const EMBED_ALLOWED_KEYSET_SCHEMA_V1 = 'atlas.embed-allowed-packet-keyset.v1';

/**
 * Read-only producer of the `embedAllowedPacketKeys` set the BitFrost writer requires.
 * Same `embed_allowed` predicate as the census/guard above (one owner, cannot drift). It supplies
 * keys only: it never mints identity, never writes, and is NOT an admission verdict - callers must
 * still require SAFE_TO_PROJECT before any cache write. Empty set is returned as-is (caller fails closed).
 * `client` is a connected pg client; runs in one REPEATABLE READ READ ONLY transaction.
 */
export async function loadEmbedAllowedPacketKeysV1(client) {
  const { createHash } = await import('node:crypto');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const r = await client.query(`${ENRICHMENT_READINESS_CTE_V1} SELECT packet_key, (SELECT count(*)::int FROM lv) AS total FROM lv WHERE embed_allowed ORDER BY packet_key`);
    const keys = r.rows.map((row) => row.packet_key);
    if (keys.some((k) => typeof k !== 'string' || k === '')) throw new Error('EMBED_ALLOWED_KEYSET_BLANK_KEY');
    if (new Set(keys).size !== keys.length) throw new Error('EMBED_ALLOWED_KEYSET_DUPLICATE_KEY');
    return {
      schema: EMBED_ALLOWED_KEYSET_SCHEMA_V1,
      generatedAt: new Date().toISOString(),
      keys: Object.freeze(new Set(keys)),
      count: keys.length,
      totalPackets: r.rows[0]?.total ?? null,
      keysSha256: `sha256:${createHash('sha256').update(keys.join('\n')).digest('hex')}`,
      canonicalAuthority: false,
      admissionVerdict: null,
    };
  } finally {
    await client.query('ROLLBACK');
  }
}
