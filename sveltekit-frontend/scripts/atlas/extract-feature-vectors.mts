#!/usr/bin/env node

/**
 * Feature Vector Extraction Pipeline
 *
 * Materializes canonical features from atlas_packets + atlas_tree_nodes
 * into atlas_feature_vectors for k-means/SOM/AE clustering.
 *
 * 5 Stages:
 * 1. Read canonical sources (atlas_packets, atlas_tree_nodes)
 * 2. Join tree context (hierarchical + SOM + community)
 * 3. Enrich from summaries (semantic tags, keywords)
 * 4. Fetch graph centrality (pagerank, betweenness, eigenvector)
 * 5. Materialize to atlas_feature_vectors (upsert)
 */

import { Pool } from 'pg';
import process from 'process';

const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : undefined;

interface FeatureVector {
  packet_key: string;
  source_ref: string;
  directory_path: string;
  tree_node_id: string | null;
  feature_id: string;
  feature_label: string;
  domain_class: string | null;
  keywords: string[];
  semantic_tags: string[];
  ontology_classes: string[];
  pagerank: number | null;
  betweenness: number | null;
  eigenvector: number | null;
  community_id: number | null;
  som_cluster: number | null;
  som_x: number | null;
  som_y: number | null;
  feature_extraction_version: string;
}

async function main() {
  const pool = new Pool({
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || 'password',
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5434', 10),
    database: process.env.POSTGRES_DB || 'legal_ai_db',
  });

  try {
    console.log(`[EXTRACT] Starting feature vector extraction ${DRY_RUN ? '(DRY_RUN)' : ''}`);

    // Stage 1: Read canonical sources
    console.log('[STAGE 1] Reading canonical sources from atlas_packets...');
    const packetQuery = `
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.directory_path,
        ap.feature_id,
        ap.feature_label,
        ap.domain_class,
        COALESCE(ap.keywords, ARRAY[]::text[]) as keywords,
        ap.pagerank,
        ap.community_id
      FROM atlas_packets ap
      WHERE ap.packet_key IS NOT NULL
        AND ap.source_ref IS NOT NULL
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}
    `;

    const packetResult = await pool.query(packetQuery);
    const packets = packetResult.rows as any[];
    console.log(`  ✓ Read ${packets.length} packets`);

    // Stage 2: Join tree context
    console.log('[STAGE 2] Joining tree context (hierarchical + SOM + community)...');
    const featureVectors: FeatureVector[] = [];

    for (const packet of packets) {
      const treeQuery = `
        SELECT
          node_id,
          som_cluster,
          som_x,
          som_y,
          ontology,
          community_id as tree_community,
          tags as tree_tags
        FROM atlas_tree_nodes
        WHERE packet_key = $1 OR source_ref = $2
        LIMIT 1
      `;

      const treeResult = await pool.query(treeQuery, [packet.packet_key, packet.source_ref]);
      const treeNode = treeResult.rows[0];

      let ontologyClasses: string[] = [];
      let treeTags: string[] = [];

      if (treeNode?.ontology && typeof treeNode.ontology === 'object') {
        if (Array.isArray(treeNode.ontology)) {
          ontologyClasses = treeNode.ontology.slice(0, 5);
        } else if (treeNode.ontology.classes) {
          ontologyClasses = Array.isArray(treeNode.ontology.classes)
            ? treeNode.ontology.classes.slice(0, 5)
            : [];
        }
      }

      if (Array.isArray(treeNode?.tree_tags)) {
        treeTags = treeNode.tree_tags.slice(0, 8);
      }

      featureVectors.push({
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        directory_path: packet.directory_path,
        tree_node_id: treeNode?.node_id || null,
        feature_id: packet.feature_id,
        feature_label: packet.feature_label,
        domain_class: packet.domain_class,
        keywords: packet.keywords.slice(0, 10),
        semantic_tags: treeTags,
        ontology_classes: ontologyClasses,
        pagerank: packet.pagerank,
        betweenness: null, // Stage 4
        eigenvector: null, // Stage 4
        community_id: treeNode?.tree_community || packet.community_id,
        som_cluster: treeNode?.som_cluster,
        som_x: treeNode?.som_x,
        som_y: treeNode?.som_y,
        feature_extraction_version: 'v1',
      });
    }

    console.log(`  ✓ Enriched ${featureVectors.length} vectors with tree context`);

    // Stage 3: Enrich from summaries (if available)
    console.log('[STAGE 3] Enriching from atlas_summary_layers...');
    let summaryCount = 0;

    for (const vec of featureVectors) {
      const summaryQuery = `
        SELECT content_envelope
        FROM atlas_summary_layers
        WHERE packet_key = $1
        LIMIT 1
      `;

      const summaryResult = await pool.query(summaryQuery, [vec.packet_key]);
      const summary = summaryResult.rows[0];

      if (summary?.content_envelope && typeof summary.content_envelope === 'object') {
        const envelope = summary.content_envelope as any;
        if (Array.isArray(envelope.semantic_tags)) {
          vec.semantic_tags = [
            ...new Set([...vec.semantic_tags, ...envelope.semantic_tags.slice(0, 8)]),
          ].slice(0, 8);
        }
        if (Array.isArray(envelope.context_features)) {
          vec.keywords = [
            ...new Set([...vec.keywords, ...envelope.context_features.slice(0, 10)]),
          ].slice(0, 10);
        }
        summaryCount++;
      }
    }

    console.log(`  ✓ Enhanced ${summaryCount} vectors from summaries`);

    // Stage 4: Fetch graph centrality (from Neo4j or cached)
    console.log('[STAGE 4] Fetching graph centrality metrics...');
    // Note: Would query Neo4j or CouchDB cache here
    // For now, we rely on pagerank already in atlas_packets
    console.log('  ℹ Graph centrality: using cached pagerank from atlas_packets');

    // Stage 5: Materialize to atlas_feature_vectors
    console.log('[STAGE 5] Materializing to atlas_feature_vectors...');

    if (DRY_RUN) {
      console.log(`  [DRY_RUN] Would insert/upsert ${featureVectors.length} feature vectors`);
      console.log(`  Sample: ${JSON.stringify(featureVectors[0], null, 2)}`);
      process.exit(0);
    }

    let inserted = 0;
    for (let i = 0; i < featureVectors.length; i += BATCH_SIZE) {
      const batch = featureVectors.slice(i, i + BATCH_SIZE);

      const upsertQuery = `
        INSERT INTO atlas_feature_vectors (
          packet_key,
          source_ref,
          directory_path,
          tree_node_id,
          feature_id,
          feature_label,
          domain_class,
          keywords,
          semantic_tags,
          ontology_classes,
          pagerank,
          betweenness,
          eigenvector,
          community_id,
          som_cluster,
          som_x,
          som_y,
          feature_extraction_version,
          extracted_at
        )
        VALUES
        ${batch
          .map(
            (_, idx) =>
              `($${idx * 19 + 1}, $${idx * 19 + 2}, $${idx * 19 + 3}, $${idx * 19 + 4}, $${idx * 19 + 5}, $${idx * 19 + 6}, $${idx * 19 + 7}, $${idx * 19 + 8}, $${idx * 19 + 9}, $${idx * 19 + 10}, $${idx * 19 + 11}, $${idx * 19 + 12}, $${idx * 19 + 13}, $${idx * 19 + 14}, $${idx * 19 + 15}, $${idx * 19 + 16}, $${idx * 19 + 17}, $${idx * 19 + 18}, $${idx * 19 + 19})`
          )
          .join(',')}
        ON CONFLICT (packet_key) DO UPDATE SET
          updated_at = NOW(),
          feature_extraction_version = EXCLUDED.feature_extraction_version,
          keywords = EXCLUDED.keywords,
          semantic_tags = EXCLUDED.semantic_tags,
          ontology_classes = EXCLUDED.ontology_classes
      `;

      const values = batch.flatMap((vec) => [
        vec.packet_key,
        vec.source_ref,
        vec.directory_path,
        vec.tree_node_id,
        vec.feature_id,
        vec.feature_label,
        vec.domain_class,
        vec.keywords,
        vec.semantic_tags,
        vec.ontology_classes,
        vec.pagerank,
        vec.betweenness,
        vec.eigenvector,
        vec.community_id,
        vec.som_cluster,
        vec.som_x,
        vec.som_y,
        vec.feature_extraction_version,
        new Date(),
      ]);

      try {
        await pool.query(upsertQuery, values);
        inserted += batch.length;
        console.log(`  ✓ Batch ${i / BATCH_SIZE + 1}: ${inserted}/${featureVectors.length}`);
      } catch (err: any) {
        console.error(`  ✗ Batch error at index ${i}:`, err.message);
        throw err;
      }
    }

    console.log(`\n✅ Feature extraction complete!`);
    console.log(`  Total vectors: ${inserted}`);
    console.log(`  With tree context: ${featureVectors.filter((v) => v.tree_node_id).length}`);
    console.log(`  With summaries: ${summaryCount}`);

    // Verify
    const countResult = await pool.query('SELECT COUNT(*) as rows FROM atlas_feature_vectors');
    console.log(`  Database total: ${countResult.rows[0].rows} rows`);
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
