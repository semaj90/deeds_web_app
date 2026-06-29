#!/usr/bin/env node

/**
 * Feature Envelope Materialization
 *
 * Reads atlas_summary_layers envelope and atlas_packets canonical truth
 * to produce the derived feature surface for clustering input.
 *
 * Input fields (from summary + packets):
 * - packet_key, source_ref, source_ref_key
 * - feature_id, feature_label, domain_class
 * - ontology_label, topology_label, community_id, cluster_key
 * - som_cluster, pagerank, keywords, entities
 * - summary_packet_key, provenance
 *
 * Output: atlas_feature_envelopes table (58,304 rows)
 * Ready for: k-means, SOM 20×20, AE training, Chrom97 materialization
 */

import { Pool } from 'pg';
import process from 'process';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : undefined;

async function main() {
  const pool = new Pool({
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || 'password',
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5434', 10),
    database: process.env.POSTGRES_DB || 'legal_ai_db',
  });

  try {
    console.log(`[MATERIALIZE] Starting feature envelope materialization ${DRY_RUN ? '(DRY_RUN)' : ''}`);

    // Create output table if not exists
    if (!DRY_RUN) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS atlas_feature_envelopes (
          packet_key TEXT PRIMARY KEY REFERENCES atlas_packets(packet_key),
          source_ref TEXT NOT NULL,
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
          keywords TEXT[] DEFAULT '{}',
          entities TEXT[] DEFAULT '{}',
          summary_packet_key TEXT,
          provenance JSONB DEFAULT '{}',
          materialized_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_source_ref ON atlas_feature_envelopes(source_ref);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_feature_id ON atlas_feature_envelopes(feature_id);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_community_id ON atlas_feature_envelopes(community_id);
        CREATE INDEX IF NOT EXISTS idx_feature_envelopes_som_cluster ON atlas_feature_envelopes(som_cluster);
      `);
      console.log('[MATERIALIZE] Output table created');
    }

    // Materialize feature envelopes: merge packets (truth) + summaries (enrichment)
    console.log('[MATERIALIZE] Merging atlas_packets + atlas_summary_layers...');

    const materializeQuery = `
      INSERT INTO atlas_feature_envelopes (
        packet_key, source_ref, source_ref_key,
        feature_id, feature_label, domain_class,
        ontology_label, topology_label,
        community_id, cluster_key, som_cluster, pagerank,
        keywords, entities,
        summary_packet_key, provenance
      )
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.source_ref || ':' || ap.packet_key as source_ref_key,
        ap.feature_id,
        ap.feature_label,
        ap.domain_class,
        COALESCE(asl.keywords, ARRAY[]::text[]) as ontology_label,
        COALESCE(asl.entities, ARRAY[]::text[]) as topology_label,
        ap.community_id,
        'cluster:' || ap.community_id as cluster_key,
        ap.som_cluster,
        ap.pagerank,
        COALESCE(ap.keywords, ARRAY[]::text[]) as keywords,
        COALESCE(asl.entities, ARRAY[]::text[]) as entities,
        asl.packet_key as summary_packet_key,
        JSONB_BUILD_OBJECT(
          'layer_type', asl.layer_type,
          'summary_level', asl.summary_level,
          'model_name', asl.model_name,
          'generated_at', asl.generated_at
        ) as provenance
      FROM atlas_packets ap
      LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
      WHERE ap.packet_key IS NOT NULL
        AND ap.source_ref IS NOT NULL
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}
      ON CONFLICT (packet_key) DO UPDATE SET
        updated_at = NOW(),
        ontology_label = EXCLUDED.ontology_label,
        topology_label = EXCLUDED.topology_label,
        keywords = EXCLUDED.keywords,
        entities = EXCLUDED.entities,
        provenance = EXCLUDED.provenance;
    `;

    if (DRY_RUN) {
      console.log('[DRY_RUN] Would execute materialization query');
      console.log(`[DRY_RUN] Preview: select first packet...`);

      const preview = await pool.query(`
        SELECT
          ap.packet_key,
          ap.source_ref,
          ap.feature_id,
          ap.feature_label,
          ap.pagerank,
          ap.keywords,
          asl.entities,
          asl.layer_type
        FROM atlas_packets ap
        LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
        LIMIT 1;
      `);

      console.log('[DRY_RUN] Sample row:', JSON.stringify(preview.rows[0], null, 2));
      process.exit(0);
    }

    // Execute materialization
    const result = await pool.query(materializeQuery);
    console.log(`[MATERIALIZE] Materialization complete: ${result.rowCount} rows upserted`);

    // Verify
    const countResult = await pool.query('SELECT COUNT(*) as count FROM atlas_feature_envelopes');
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN keywords IS NOT NULL AND array_length(keywords, 1) > 0 THEN 1 END) as with_keywords,
        COUNT(CASE WHEN entities IS NOT NULL AND array_length(entities, 1) > 0 THEN 1 END) as with_entities,
        COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank
      FROM atlas_feature_envelopes;
    `);

    const stats = verifyResult.rows[0];
    console.log(`\n[VERIFY] Feature Envelope Statistics:`);
    console.log(`  Total envelopes: ${stats.total}`);
    console.log(`  With keywords: ${stats.with_keywords}`);
    console.log(`  With entities: ${stats.with_entities}`);
    console.log(`  With pagerank: ${stats.with_pagerank}`);

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
