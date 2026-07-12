import crypto from 'node:crypto';

function stableTopkSourceId(row) {
  return [
    row.feature_id ?? '',
    row.domain_class ?? '',
    row.title_id ?? '',
    row.packet_key ?? '',
    row.rank ?? '',
  ].join('|');
}

function buildSemanticTopkAnalysis(row, meta) {
  return {
    schema: 'atlas.semantic_topk_analysis.v1',
    generated_at: meta.generatedAt,
    mode: meta.mode,
    limit: meta.limit,
    offset: meta.offset,
    top_k: meta.topK,
    min_community_size: meta.minCommunitySize,
    source: meta.source,
    rank: row.rank,
    priority: row.priority,
    feature_id: row.feature_id,
    feature_label: row.feature_label,
    domain_class: row.domain_class,
    title_id: row.title_id,
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    tree_node_id: row.tree_node_id,
    packet_count: row.packet_count,
    summary_count: row.summary_count,
    summary_coverage: row.summary_coverage,
    qdrant_keyed_count: row.qdrant_keyed_count,
    qdrant_keyed_coverage: row.qdrant_keyed_coverage,
    tree_linked_count: row.tree_linked_count,
    tree_linked_coverage: row.tree_linked_coverage,
    todo_score: row.todo_score,
    used_concepts: row.used_concepts ?? [],
    lexical_nouns: row.lexical_nouns ?? [],
    lexical_verbs: row.lexical_verbs ?? [],
    lexical_adverbs_ly: row.lexical_adverbs_ly ?? [],
    source_id: crypto.createHash('sha256').update(stableTopkSourceId(row)).digest('hex').slice(0, 16),
  };
}

export async function persistSemanticTopkRows(pool, rows, meta) {
  if (!rows.length) {
    return { attempted: 0, written: 0, failed: 0 };
  }

  let written = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const analysis = buildSemanticTopkAnalysis(row, meta);
      await pool.query(
        `
          INSERT INTO atlas_packet_metrics (
            packet_key,
            semantic_topk_rank,
            semantic_topk_score,
            semantic_topk_feature_id,
            semantic_topk_domain_class,
            semantic_topk_title_id,
            semantic_topk_source,
            semantic_topk_generated_at,
            semantic_topk_analysis
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (packet_key) DO UPDATE SET
            semantic_topk_rank = EXCLUDED.semantic_topk_rank,
            semantic_topk_score = EXCLUDED.semantic_topk_score,
            semantic_topk_feature_id = EXCLUDED.semantic_topk_feature_id,
            semantic_topk_domain_class = EXCLUDED.semantic_topk_domain_class,
            semantic_topk_title_id = EXCLUDED.semantic_topk_title_id,
            semantic_topk_source = EXCLUDED.semantic_topk_source,
            semantic_topk_generated_at = EXCLUDED.semantic_topk_generated_at,
            semantic_topk_analysis = EXCLUDED.semantic_topk_analysis,
            updated_at = NOW()
        `,
        [
          row.packet_key ?? null,
          row.rank ?? null,
          row.priority ?? null,
          row.feature_id ?? null,
          row.domain_class ?? null,
          row.title_id ?? null,
          meta.source,
          meta.generatedAt,
          JSON.stringify(analysis),
        ],
      );
      written++;
    } catch (error) {
      failed++;
    }
  }

  return { attempted: rows.length, written, failed };
}
