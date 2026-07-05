#!/usr/bin/env node

/**
 * Feature Envelope Materialization
 *
 * Reads atlas_summary_layers envelope and atlas_packets canonical truth
 * to produce the derived feature surface for clustering input.
 *
 * Input fields (from summary + packets):
 * - packet_key, source_ref, file_path, source_ref_key
 * - feature_id, feature_label, domain_class
 * - ontology_label, topology_label, community_id, cluster_key
 * - som_cluster, pagerank, keywords, entities, tree_node_id
 * - summary_packet_key, provenance
 *
 * Output: atlas_feature_envelopes table (58,304 rows)
 * Ready for: k-means, SOM 20×20, AE training, Chrom97 materialization
 */

import { Pool } from 'pg';
import process from 'process';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { buildTopologyEnvelope, deriveCentroidKeys, deriveDomainClass } from '../../../scripts/atlas/lib/topology-ontology.mjs';

const ENV = loadRepoEnv(process.env);

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : undefined;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being',
  'between', 'chunk', 'chunks', 'class', 'code', 'codebase', 'data', 'file',
  'files', 'from', 'function', 'into', 'module', 'packet', 'packets', 'summary',
  'that', 'their', 'there', 'these', 'this', 'through', 'using', 'where', 'which',
  'with', 'within',
]);

const VERB_HINTS = new Set([
  'add', 'adds', 'align', 'analyze', 'apply', 'backfill', 'build', 'cache',
  'call', 'check', 'classify', 'compute', 'connect', 'create', 'decode',
  'derive', 'embed', 'extract', 'fetch', 'filter', 'generate', 'hydrate',
  'index', 'join', 'load', 'materialize', 'merge', 'normalize', 'parse',
  'populate', 'query', 'rank', 'rerank', 'resolve', 'route', 'score', 'search',
  'store', 'summarize', 'sync', 'tag', 'train', 'update', 'upsert', 'validate',
  'verify', 'warm', 'write',
]);

const ACTION_NOUN_TO_VERB = new Map([
  ['builder', 'build'],
  ['collector', 'collect'],
  ['compiler', 'compile'],
  ['connector', 'connect'],
  ['analysis', 'analyze'],
  ['audit', 'audit'],
  ['auditing', 'audit'],
  ['backfill', 'backfill'],
  ['cache', 'cache'],
  ['classification', 'classify'],
  ['clustering', 'cluster'],
  ['collection', 'collect'],
  ['compilation', 'compile'],
  ['compression', 'compress'],
  ['configuration', 'configure'],
  ['diagnostic', 'diagnose'],
  ['diagnostics', 'diagnose'],
  ['creation', 'create'],
  ['decode', 'decode'],
  ['deployment', 'deploy'],
  ['encoding', 'encode'],
  ['embedding', 'embed'],
  ['execution', 'execute'],
  ['extraction', 'extract'],
  ['filtering', 'filter'],
  ['generation', 'generate'],
  ['hydration', 'hydrate'],
  ['indexing', 'index'],
  ['ingestion', 'ingest'],
  ['interaction', 'interact'],
  ['loading', 'load'],
  ['management', 'manage'],
  ['materialization', 'materialize'],
  ['migration', 'migrate'],
  ['normalization', 'normalize'],
  ['parsing', 'parse'],
  ['projection', 'project'],
  ['ranking', 'rank'],
  ['reconciliation', 'reconcile'],
  ['reranking', 'rerank'],
  ['retrieval', 'retrieve'],
  ['routing', 'route'],
  ['runner', 'run'],
  ['scoring', 'score'],
  ['search', 'search'],
  ['storage', 'store'],
  ['summarization', 'summarize'],
  ['synchronization', 'sync'],
  ['validation', 'validate'],
  ['verification', 'verify'],
  ['warming', 'warm'],
  ['writeback', 'write'],
  ['reader', 'read'],
  ['writer', 'write'],
]);

function words(text) {
  return String(text ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(/[a-z][a-z0-9_'-]{2,}/g) ?? [];
}

function unique(items, limit = 24) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function deriveUsedConcepts(row, lexical) {
  const seed = [
    row.title_id,
    row.feature_id,
    row.feature_label,
    row.domain_class,
    row.source_ref,
    ...(Array.isArray(row.keywords) ? row.keywords : []),
    ...(Array.isArray(row.entities) ? row.entities : []),
    ...(Array.isArray(row.ast_symbols) ? row.ast_symbols : []),
    ...(Array.isArray(row.ast_kinds) ? row.ast_kinds : []),
    ...(Array.isArray(row.ast_tags) ? row.ast_tags : []),
    ...lexical.nouns,
    ...lexical.verbs,
    ...lexical.adverbs_ly,
  ]
    .flatMap((value) => {
      if (!value) return [];
      return String(value)
        .split(/[./:_\-\s]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    })
    .filter((value) => value.length >= 3);

  return unique(seed, 40);
}

function extractLexicalTerms(text) {
  const tokens = words(text).filter((token) => !STOP_WORDS.has(token));
  const mappedVerbs = tokens
    .flatMap((token) => {
      const singular = token.endsWith('s') ? token.slice(0, -1) : token;
      return [ACTION_NOUN_TO_VERB.get(token), ACTION_NOUN_TO_VERB.get(singular)];
    })
    .filter(Boolean);
  const nouns = unique(tokens.filter((token) =>
    token.length >= 4 &&
    !token.endsWith('ly') &&
    !VERB_HINTS.has(token) &&
    !/(ing|ed|ize|izes|ise|ises|ate|ates)$/.test(token)
  ));
  const verbs = unique(tokens.filter((token) =>
    VERB_HINTS.has(token) || /(ing|ed|ize|izes|ise|ises|ate|ates|ify|ifies)$/.test(token)
  ).concat(mappedVerbs), 20);
  const adverbs_ly = unique(tokens.filter((token) => token.endsWith('ly')), 16);
  return { nouns, verbs, adverbs_ly };
}

function slugifyTitleId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
}

function deriveTitleId(row, lexical) {
  const direct = row.title_id || row.feature_id || row.feature_label;
  const directSlug = slugifyTitleId(direct);
  if (directSlug) return directSlug;
  return slugifyTitleId([...lexical.nouns, ...lexical.verbs].slice(0, 4).join(' ')) || 'packet';
}

function scoreEnvelope(row, lexical) {
  let score = 0;
  if (row.packet_key) score += 15;
  if (row.source_ref) score += 15;
  if (row.feature_id) score += 15;
  if (row.summary_text && String(row.summary_text).trim().length >= 40) score += 15;
  score += Math.min(15, lexical.nouns.length * 3);
  score += Math.min(15, lexical.verbs.length * 5);
  if (row.pagerank !== null && row.pagerank !== undefined) score += 5;
  if (row.som_cluster !== null && row.som_cluster !== undefined) score += 5;
  return Math.max(0, Math.min(100, score));
}

async function main() {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl(ENV),
  });

  try {
    console.log(`[MATERIALIZE] Starting feature envelope materialization ${DRY_RUN ? '(DRY_RUN)' : ''}`);

    // Create output table if not exists
    if (!DRY_RUN) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS atlas_feature_envelopes (
          packet_key TEXT PRIMARY KEY REFERENCES atlas_packets(packet_key),
          source_ref TEXT NOT NULL,
          file_path TEXT,
          source_ref_key TEXT,
          feature_id TEXT NOT NULL,
          feature_label TEXT NOT NULL,
          domain_class TEXT,
          ontology_label TEXT[] DEFAULT '{}',
          topology_label TEXT[] DEFAULT '{}',
          community_id INTEGER,
          cluster_key TEXT,
          som_cluster INTEGER,
          pagerank REAL,
          topology JSONB DEFAULT '{}'::jsonb,
          domain_centroid_key TEXT,
          feature_centroid_key TEXT,
          kmeans_centroid_key TEXT,
          som_centroid_key TEXT,
          community_centroid_key TEXT,
          redis_centroid_key TEXT,
          som_cell TEXT,
          keywords TEXT[] DEFAULT '{}',
          entities TEXT[] DEFAULT '{}',
          summary_text TEXT,
          title_id TEXT,
          tree_node_id TEXT,
          lexical_nouns JSONB DEFAULT '[]'::jsonb,
          lexical_verbs JSONB DEFAULT '[]'::jsonb,
          lexical_adverbs_ly JSONB DEFAULT '[]'::jsonb,
          used_concepts JSONB DEFAULT '[]'::jsonb,
          lexical_terms JSONB DEFAULT '{}'::jsonb,
          summary_rank_score REAL,
          summary_rank_status TEXT,
          summary_packet_key TEXT,
          provenance JSONB DEFAULT '{}',
          materialized_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE atlas_feature_envelopes
          ADD COLUMN IF NOT EXISTS summary_text TEXT,
          ADD COLUMN IF NOT EXISTS file_path TEXT,
          ADD COLUMN IF NOT EXISTS title_id TEXT,
          ADD COLUMN IF NOT EXISTS tree_node_id TEXT,
          ADD COLUMN IF NOT EXISTS lexical_nouns JSONB DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS lexical_verbs JSONB DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS lexical_adverbs_ly JSONB DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS used_concepts JSONB DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS lexical_terms JSONB DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS summary_rank_score REAL,
          ADD COLUMN IF NOT EXISTS summary_rank_status TEXT,
          ADD COLUMN IF NOT EXISTS topology JSONB DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS domain_centroid_key TEXT,
          ADD COLUMN IF NOT EXISTS feature_centroid_key TEXT,
          ADD COLUMN IF NOT EXISTS kmeans_centroid_key TEXT,
          ADD COLUMN IF NOT EXISTS som_centroid_key TEXT,
          ADD COLUMN IF NOT EXISTS community_centroid_key TEXT,
          ADD COLUMN IF NOT EXISTS redis_centroid_key TEXT,
          ADD COLUMN IF NOT EXISTS som_cell TEXT;

        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_source_ref ON atlas_feature_envelopes(source_ref);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_feature_id ON atlas_feature_envelopes(feature_id);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_title_id ON atlas_feature_envelopes(title_id);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_community_id ON atlas_feature_envelopes(community_id);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_som_cluster ON atlas_feature_envelopes(som_cluster);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_lexical_terms ON atlas_feature_envelopes USING GIN(lexical_terms);
      `);
      console.log('[MATERIALIZE] Output table created');
    }

    // Materialize feature envelopes: merge packets (truth) + summaries (enrichment)
    console.log('[MATERIALIZE] Merging atlas_packets + atlas_summary_layers...');

    const materializeQuery = `
      INSERT INTO atlas_feature_envelopes (
        packet_key, source_ref, file_path, source_ref_key,
        feature_id, feature_label, domain_class,
        ontology_label, topology_label,
        community_id, cluster_key, som_cluster, pagerank, topology,
        domain_centroid_key, feature_centroid_key, kmeans_centroid_key,
        som_centroid_key, community_centroid_key, redis_centroid_key, som_cell,
        keywords, entities,
        summary_text, title_id, tree_node_id,
        summary_packet_key, provenance
      )
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.file_path,
        ap.source_ref || ':' || ap.packet_key as source_ref_key,
        ap.feature_id,
        ap.feature_label,
        ap.domain_class,
        COALESCE(asl.keywords, ARRAY[]::text[]) as ontology_label,
        COALESCE(asl.entities, ARRAY[]::text[]) as topology_label,
        ap.community_id,
        'cluster:' || ap.community_id as cluster_key,
        CASE
          WHEN ap.som_cluster::text ~ '^[0-9]+$' THEN ap.som_cluster::int
          ELSE NULL
        END as som_cluster,
        COALESCE(ap.pagerank, cf_authority.pagerank) as pagerank,
        JSONB_BUILD_OBJECT(
          'domain_class', COALESCE(ap.domain_class, 'infrastructure'),
          'centroid_keys', JSONB_BUILD_OBJECT(
            'domain', 'atlas:centroid:domain:' || COALESCE(ap.domain_class, 'infrastructure'),
            'feature', 'atlas:centroid:feature:' || COALESCE(ap.feature_id, ap.title_id, ap.feature_label),
            'kmeans', CASE
              WHEN ap.kmeans_cluster IS NOT NULL THEN 'atlas:centroid:kmeans:' || ap.kmeans_cluster::text
              WHEN ap.kmeans_cluster_id IS NOT NULL THEN 'atlas:centroid:kmeans:' || ap.kmeans_cluster_id::text
              ELSE NULL
            END,
            'som', CASE WHEN ap.som_cluster IS NOT NULL THEN 'atlas:centroid:som:' || ap.som_cluster::text ELSE NULL END,
            'community', CASE WHEN ap.community_id IS NOT NULL THEN 'atlas:centroid:community:' || ap.community_id::text ELSE NULL END
          ),
          'som_cell', CASE WHEN ap.som_cluster IS NOT NULL THEN ap.som_cluster::text ELSE NULL END
        ) as topology,
        'atlas:centroid:domain:' || COALESCE(ap.domain_class, 'infrastructure') as domain_centroid_key,
        'atlas:centroid:feature:' || COALESCE(ap.feature_id, ap.title_id, ap.feature_label) as feature_centroid_key,
        CASE
          WHEN ap.kmeans_cluster IS NOT NULL THEN 'atlas:centroid:kmeans:' || ap.kmeans_cluster::text
          WHEN ap.kmeans_cluster_id IS NOT NULL THEN 'atlas:centroid:kmeans:' || ap.kmeans_cluster_id::text
          ELSE NULL
        END as kmeans_centroid_key,
        CASE
          WHEN ap.som_row IS NOT NULL AND ap.som_col IS NOT NULL THEN 'atlas:centroid:som:' || ap.som_row::text || ':' || ap.som_col::text
          WHEN ap.som_cluster IS NOT NULL THEN 'atlas:centroid:som:' || ap.som_cluster::text
          ELSE NULL
        END as som_centroid_key,
        CASE WHEN ap.community_id IS NOT NULL THEN 'atlas:centroid:community:' || ap.community_id::text ELSE NULL END as community_centroid_key,
        'atlas:centroid:domain:' || COALESCE(ap.domain_class, 'infrastructure') as redis_centroid_key,
        CASE
          WHEN ap.som_row IS NOT NULL AND ap.som_col IS NOT NULL THEN ap.som_row::text || ':' || ap.som_col::text
          WHEN ap.som_cluster IS NOT NULL THEN ap.som_cluster::text
          ELSE NULL
        END as som_cell,
        COALESCE(ap.keywords, ARRAY[]::text[]) as keywords,
        COALESCE(asl.entities, ARRAY[]::text[]) as entities,
        COALESCE(NULLIF(asl.summary_text, ''), NULLIF(asl.summary, ''), ap.summary) as summary_text,
        COALESCE(ap.title_id, ap.feature_id) as title_id,
        COALESCE(ap.tree_node_id, tn.node_id) as tree_node_id,
        asl.packet_key as summary_packet_key,
        JSONB_BUILD_OBJECT(
          'layer_type', asl.layer_type,
          'summary_level', asl.summary_level,
          'model_name', asl.model_name,
          'generated_at', asl.generated_at
        ) as provenance
      FROM atlas_packets ap
      LEFT JOIN LATERAL (
        SELECT *
        FROM atlas_summary_layers layer
        WHERE layer.packet_key = ap.packet_key
        ORDER BY layer.generated_at DESC NULLS LAST, layer.created_at DESC NULLS LAST
        LIMIT 1
      ) asl ON TRUE
      LEFT JOIN LATERAL (
        SELECT node_id
        FROM atlas_tree_nodes tn
        WHERE tn.packet_key = ap.packet_key
        ORDER BY tn.created_at ASC NULLS LAST, tn.updated_at ASC NULLS LAST
        LIMIT 1
      ) tn ON TRUE
      LEFT JOIN LATERAL (
        SELECT MAX(cf.page_rank_score) as pagerank
        FROM code_features cf
        WHERE cf.source_ref IN (ap.source_ref, regexp_replace(ap.source_ref, '^sveltekit-frontend/', ''))
           OR cf.feature_id = ap.feature_id
      ) cf_authority ON TRUE
      WHERE ap.packet_key IS NOT NULL
        AND ap.source_ref IS NOT NULL
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}
      ON CONFLICT (packet_key) DO UPDATE SET
        updated_at = NOW(),
        file_path = EXCLUDED.file_path,
        ontology_label = EXCLUDED.ontology_label,
        topology_label = EXCLUDED.topology_label,
        topology = EXCLUDED.topology,
        domain_centroid_key = EXCLUDED.domain_centroid_key,
        feature_centroid_key = EXCLUDED.feature_centroid_key,
        kmeans_centroid_key = EXCLUDED.kmeans_centroid_key,
        som_centroid_key = EXCLUDED.som_centroid_key,
        community_centroid_key = EXCLUDED.community_centroid_key,
        redis_centroid_key = EXCLUDED.redis_centroid_key,
        som_cell = EXCLUDED.som_cell,
        keywords = EXCLUDED.keywords,
        entities = EXCLUDED.entities,
        pagerank = EXCLUDED.pagerank,
        summary_text = EXCLUDED.summary_text,
        title_id = EXCLUDED.title_id,
        tree_node_id = EXCLUDED.tree_node_id,
        provenance = EXCLUDED.provenance;
    `;

    if (DRY_RUN) {
      console.log('[DRY_RUN] Would execute materialization query');
      console.log(`[DRY_RUN] Preview: select first packet...`);

      const preview = await pool.query(`
        SELECT
          ap.packet_key,
          ap.source_ref,
          ap.file_path,
          ap.feature_id,
          ap.feature_label,
          ap.pagerank,
          ap.keywords,
          asl.entities,
          asl.layer_type
        FROM atlas_packets ap
        LEFT JOIN LATERAL (
          SELECT *
          FROM atlas_summary_layers layer
          WHERE layer.packet_key = ap.packet_key
          ORDER BY layer.generated_at DESC NULLS LAST, layer.created_at DESC NULLS LAST
          LIMIT 1
        ) asl ON TRUE
        LIMIT 1;
      `);

      console.log('[DRY_RUN] Sample row:', JSON.stringify(preview.rows[0], null, 2));
      process.exit(0);
    }

    // Execute materialization
    const result = await pool.query(materializeQuery);
    console.log(`[MATERIALIZE] Materialization complete: ${result.rowCount} rows upserted`);

    const lexicalInput = await pool.query(`
      SELECT
        afe.packet_key,
        afe.source_ref,
        afe.file_path,
        afe.feature_id,
        afe.feature_label,
        afe.title_id,
        afe.tree_node_id,
        afe.domain_class,
        afe.summary_text,
        afe.keywords,
        afe.entities,
        ast.ast_symbols,
        ast.ast_kinds,
        ast.ast_tags,
        afe.pagerank,
        ap.som_cluster,
        ap.community_id,
        ap.som_row,
        ap.som_col,
        ap.kmeans_cluster,
        ap.kmeans_cluster_id
      FROM atlas_feature_envelopes afe
      JOIN atlas_packets ap ON ap.packet_key = afe.packet_key
      LEFT JOIN LATERAL (
        SELECT
          array_agg(DISTINCT cf.symbol) FILTER (WHERE cf.symbol IS NOT NULL AND cf.symbol <> '') as ast_symbols,
          array_agg(DISTINCT cf.kind) FILTER (WHERE cf.kind IS NOT NULL AND cf.kind <> '') as ast_kinds,
          array_agg(DISTINCT tag) FILTER (WHERE tag IS NOT NULL AND tag <> '') as ast_tags
        FROM code_features cf
        LEFT JOIN LATERAL unnest(COALESCE(cf.static_tags, ARRAY[]::text[])) tag ON TRUE
        WHERE cf.source_ref IN (
             afe.source_ref,
             regexp_replace(afe.source_ref, '^sveltekit-frontend/', '')
           )
           OR cf.feature_id = afe.feature_id
      ) ast ON TRUE
      WHERE afe.packet_key IS NOT NULL
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}
    `);

    let lexicalUpdated = 0;
    for (const row of lexicalInput.rows) {
      const text = [
        row.title_id,
        row.feature_id,
        row.feature_label,
        row.domain_class,
        row.source_ref,
        row.file_path,
        row.summary_text,
        ...(Array.isArray(row.keywords) ? row.keywords : []),
        ...(Array.isArray(row.entities) ? row.entities : []),
        ...(Array.isArray(row.ast_symbols) ? row.ast_symbols : []),
        ...(Array.isArray(row.ast_kinds) ? row.ast_kinds : []),
        ...(Array.isArray(row.ast_tags) ? row.ast_tags : []),
      ].filter(Boolean).join(' ');
      const lexical = extractLexicalTerms(text);
      const titleId = deriveTitleId(row, lexical);
      const usedConcepts = deriveUsedConcepts(row, lexical);
      const score = scoreEnvelope(row, lexical);
      const status = score >= 80 ? 'READY' : score >= 60 ? 'NEAR_READY' : score >= 35 ? 'PARTIAL' : 'BLOCKED';
      const domainClass = deriveDomainClass(row);
      const centroidKeys = deriveCentroidKeys({
        ...row,
        domain_class: domainClass,
        som_row: row.som_row,
        som_col: row.som_col,
        som_cell: row.som_cluster,
      });
      const topology = buildTopologyEnvelope({
        ...row,
        domain_class: domainClass,
        som_row: row.som_row,
        som_col: row.som_col,
        som_cell: row.som_cluster,
      });

      await pool.query(
        `UPDATE atlas_feature_envelopes
         SET
           title_id = $2,
           domain_class = $3,
           topology = $4::jsonb,
           domain_centroid_key = $5,
           feature_centroid_key = $6,
           kmeans_centroid_key = $7,
           som_centroid_key = $8,
           community_centroid_key = $9,
           redis_centroid_key = $10,
           som_cell = $11,
           lexical_nouns = $12::jsonb,
           lexical_verbs = $13::jsonb,
           lexical_adverbs_ly = $14::jsonb,
           used_concepts = $15::jsonb,
           lexical_terms = $16::jsonb,
           summary_rank_score = $17,
           summary_rank_status = $18,
           updated_at = NOW()
         WHERE packet_key = $1`,
        [
          row.packet_key,
          titleId,
          domainClass,
          JSON.stringify(topology),
          centroidKeys.domain_centroid_key,
          centroidKeys.feature_centroid_key,
          centroidKeys.kmeans_centroid_key,
          centroidKeys.som_centroid_key,
          centroidKeys.community_centroid_key,
          centroidKeys.domain_centroid_key,
          centroidKeys.som_cell,
          JSON.stringify(lexical.nouns),
          JSON.stringify(lexical.verbs),
          JSON.stringify(lexical.adverbs_ly),
          JSON.stringify(usedConcepts),
          JSON.stringify({ ...lexical, used_concepts: usedConcepts }),
          score,
          status,
        ],
      );
      lexicalUpdated++;
    }
    console.log(`[MATERIALIZE] Lexical enrichment complete: ${lexicalUpdated} rows updated`);

    // Verify
    const countResult = await pool.query('SELECT COUNT(*) as count FROM atlas_feature_envelopes');
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN keywords IS NOT NULL AND array_length(keywords, 1) > 0 THEN 1 END) as with_keywords,
        COUNT(CASE WHEN entities IS NOT NULL AND array_length(entities, 1) > 0 THEN 1 END) as with_entities,
        COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank,
        COUNT(CASE WHEN title_id IS NOT NULL AND title_id <> '' THEN 1 END) as with_title_id,
        COUNT(CASE WHEN tree_node_id IS NOT NULL AND tree_node_id <> '' THEN 1 END) as with_tree_node_id,
        COUNT(CASE WHEN domain_class IS NOT NULL AND domain_class <> '' THEN 1 END) as with_domain_class,
        COUNT(CASE WHEN topology IS NOT NULL AND topology <> '{}'::jsonb THEN 1 END) as with_topology,
        COUNT(CASE WHEN domain_centroid_key IS NOT NULL AND domain_centroid_key <> '' THEN 1 END) as with_domain_centroid_key,
        COUNT(CASE WHEN feature_centroid_key IS NOT NULL AND feature_centroid_key <> '' THEN 1 END) as with_feature_centroid_key,
        COUNT(CASE WHEN som_centroid_key IS NOT NULL AND som_centroid_key <> '' THEN 1 END) as with_som_centroid_key,
        COUNT(CASE WHEN jsonb_array_length(lexical_nouns) > 0 THEN 1 END) as with_lexical_nouns,
        COUNT(CASE WHEN jsonb_array_length(lexical_verbs) > 0 THEN 1 END) as with_lexical_verbs,
        COUNT(CASE WHEN jsonb_array_length(lexical_adverbs_ly) > 0 THEN 1 END) as with_lexical_adverbs,
        COUNT(CASE WHEN jsonb_array_length(used_concepts) > 0 THEN 1 END) as with_used_concepts,
        COUNT(CASE WHEN summary_rank_status IN ('READY', 'NEAR_READY') THEN 1 END) as rank_ready
      FROM atlas_feature_envelopes;
    `);

    const stats = verifyResult.rows[0];
    console.log(`\n[VERIFY] Feature Envelope Statistics:`);
    console.log(`  Total envelopes: ${stats.total}`);
    console.log(`  With keywords: ${stats.with_keywords}`);
    console.log(`  With entities: ${stats.with_entities}`);
    console.log(`  With pagerank: ${stats.with_pagerank}`);
    console.log(`  With title_id: ${stats.with_title_id}`);
    console.log(`  With tree_node_id: ${stats.with_tree_node_id}`);
    console.log(`  With domain_class: ${stats.with_domain_class}`);
    console.log(`  With topology: ${stats.with_topology}`);
    console.log(`  With domain centroid key: ${stats.with_domain_centroid_key}`);
    console.log(`  With feature centroid key: ${stats.with_feature_centroid_key}`);
    console.log(`  With SOM centroid key: ${stats.with_som_centroid_key}`);
    console.log(`  With lexical nouns: ${stats.with_lexical_nouns}`);
    console.log(`  With lexical verbs: ${stats.with_lexical_verbs}`);
    console.log(`  With -ly adverbs: ${stats.with_lexical_adverbs}`);
    console.log(`  With used concepts: ${stats.with_used_concepts}`);
    console.log(`  Rank ready: ${stats.rank_ready}`);

    console.log(`\n✅ Feature envelope materialization complete!`);
    console.log(`  Ready for: k-means clustering, SOM training, AE compression`);
    console.log(`  Next: Chrom97 packet generation from feature envelopes`);

  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
