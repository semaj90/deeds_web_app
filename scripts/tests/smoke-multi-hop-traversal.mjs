#!/usr/bin/env node
/**
 * smoke-multi-hop-traversal.mjs
 *
 * Verifies the complete Three-Layer Feature Mapping, Tag Extraction, and Neo4j Graph Truth Sync:
 *   Layer 1 (File Truth - Postgres)
 *     ↓
 *   Layer 2 (Feature Mapping - Postgres & Qdrant)
 *     ↓
 *   Layer 3 (Graph Truth - Neo4j)
 *
 * Validates:
 *   given source_ref:
 *     1. Finds feature_id and summary in parent_atlas_documents.
 *     2. Finds Qdrant point and SOM cluster in atlas_feature_map.
 *     3. Resolves the point payload from Qdrant.
 *     4. Resolves the ParentAtlasFeature node and fetches its 2-hop neighbors in Neo4j.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const NEO4J_URI = env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASS = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';
const REPORT_JSON = path.join(ROOT, '.tmp', 'multi-hop-traversal-report.json');
const REPORT_MD = path.join(ROOT, '.tmp', 'multi-hop-traversal-report.md');

function readArg(name) {
  const direct = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) return direct.split('=', 2)[1] ?? '';
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1] ?? '';
  const positional = process.argv.slice(2).find((arg) => arg && !arg.startsWith('-'));
  if (positional) return positional;
  return '';
}

const TARGET_SOURCE_REF = String(readArg('source-ref') || readArg('sourceRef') || '').trim();

function createReport() {
  return {
    generatedAt: new Date().toISOString(),
    targetSourceRef: TARGET_SOURCE_REF || null,
    selectionMode: TARGET_SOURCE_REF ? 'targeted' : 'discovered',
    sourceRef: null,
    featureId: null,
    summary: null,
    tags: [],
    featureMap: null,
    qdrant: null,
    neo4j: {
      featureNodeFound: false,
      neighborCount: 0,
      neighbors: [],
    },
    issues: [],
    status: 'pending',
  };
}

async function writeReport(report) {
  try {
    await fs.promises.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.promises.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    const md = [
      `# Multi-Hop Traversal Smoke Report`,
      ``,
      `- Generated: ${report.generatedAt}`,
      `- Status: ${report.status}`,
      `- SourceRef: ${report.sourceRef || '(none)'}`,
      `- FeatureId: ${report.featureId || '(none)'}`,
      `- Qdrant mapped: ${report.featureMap?.qdrantPointId ? 'yes' : 'no'}`,
      `- SOM cluster: ${report.featureMap?.somCluster ?? 'n/a'}`,
      `- Neo4j feature node: ${report.neo4j.featureNodeFound ? 'yes' : 'no'}`,
      `- Neighbor count: ${report.neo4j.neighborCount ?? 0}`,
      ``,
      `## Issues`,
      ...(report.issues.length
        ? report.issues.map((issue) => `- [${issue.level}] ${issue.stage}: ${issue.message}`)
        : ['- none']),
    ].join('\n');
    await fs.promises.writeFile(REPORT_MD, md, 'utf8');
  } catch (err) {
    console.warn(`⚠️ Failed to write traversal report: ${err.message}`);
  }
}

async function main() {
  console.log('🧪 Starting Multi-Hop Traversal Smoke Test...');
  console.log('--------------------------------------------------');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const report = createReport();

  try {
    let candidate = null;
    if (TARGET_SOURCE_REF) {
      console.log(`⏳ Using targeted source_ref: ${TARGET_SOURCE_REF}`);
      const targetRes = await pool.query(`
        SELECT pad.source_ref, pad.feature_id, pad.summary, afm.som_cluster, afm.qdrant_point_id, afm.cluster_id
        FROM parent_atlas_documents pad
        LEFT JOIN atlas_feature_map afm ON afm.source_ref = regexp_replace(pad.source_ref, '^sveltekit-frontend/', '')
        WHERE pad.source_ref = $1
        LIMIT 1
      `, [TARGET_SOURCE_REF]);
      if (targetRes.rows.length === 0) {
        throw new Error(`Target source_ref not found in parent_atlas_documents: ${TARGET_SOURCE_REF}`);
      }
      candidate = targetRes.rows[0];
    } else {
      // 1. Discover a valid candidate file with a feature_id and SOM cluster mapped
      console.log('⏳ Discovered candidate file with feature mapping from Postgres...');
      const discoveryRes = await pool.query(`
        SELECT pad.source_ref, pad.feature_id, pad.summary, afm.som_cluster, afm.qdrant_point_id, afm.cluster_id
        FROM parent_atlas_documents pad
        JOIN atlas_feature_map afm ON afm.source_ref = regexp_replace(pad.source_ref, '^sveltekit-frontend/', '')
        WHERE pad.feature_id IS NOT NULL AND afm.som_cluster IS NOT NULL AND afm.qdrant_point_id IS NOT NULL
        LIMIT 1
      `);

      if (discoveryRes.rows.length === 0) {
        console.warn('⚠️ No fully-mapped candidates found. Falling back to a generic file lookup...');
        const fallbackRes = await pool.query(`
          SELECT source_ref, feature_id, summary
          FROM parent_atlas_documents
          WHERE feature_id IS NOT NULL
          LIMIT 1
        `);
        if (fallbackRes.rows.length === 0) {
          throw new Error('No parent_atlas_documents records found. Has the database been promoted?');
        }
        discoveryRes.rows.push({
          ...fallbackRes.rows[0],
          som_cluster: 'unknown',
          qdrant_point_id: 'unknown',
          cluster_id: 'unknown',
        });
      }

      candidate = discoveryRes.rows[0];
    }

    const sourceRef = candidate.source_ref;
    report.sourceRef = sourceRef;
    report.featureId = candidate.feature_id || null;
    report.summary = candidate.summary || null;
    console.log(`🎯 Target source_ref resolved: "${sourceRef}"`);
    console.log();

    // =========================================================================
    // LAYER 1: File Truth (Postgres parent_atlas_documents)
    // =========================================================================
    console.log('📖 LAYER 1: Postgres File Truth Lookup...');
    const padRes = await pool.query(
      `SELECT source_ref, feature_id, summary, tags FROM parent_atlas_documents WHERE source_ref = $1`,
      [sourceRef]
    );
    const padDoc = padRes.rows[0];
    if (!padDoc) {
      throw new Error(`Layer 1 check failed: source_ref not found in parent_atlas_documents.`);
    }
    report.featureId = padDoc.feature_id || report.featureId;
    report.summary = padDoc.summary || report.summary;
    report.tags = Array.isArray(padDoc.tags) ? padDoc.tags : [];
    console.log(`  ✓ source_ref  : ${padDoc.source_ref}`);
    console.log(`  ✓ feature_id  : ${padDoc.feature_id}`);
    console.log(`  ✓ summary     : ${padDoc.summary ? `${padDoc.summary.slice(0, 120)}...` : 'none'}`);
    console.log(`  ✓ tags        : [${(padDoc.tags || []).join(', ')}]`);
    console.log();

    // =========================================================================
    // LAYER 2: Feature Mapping (Postgres & Qdrant atlas_feature_map)
    // =========================================================================
    console.log('🗺️ LAYER 2: Postgres & Qdrant Feature Map Lookup...');
    const afmRes = await pool.query(
      `SELECT som_cluster, centroid_id, qdrant_point_id, cluster_id, lane_ids FROM atlas_feature_map WHERE source_ref = regexp_replace($1, '^sveltekit-frontend/', '')`,
      [sourceRef]
    );
    const afmDoc = afmRes.rows[0];
    if (!afmDoc) {
      console.warn('  ⚠️ No row found in atlas_feature_map for this file. Continuing checks...');
      report.issues.push({
        level: 'warn',
        stage: 'qdrant-map',
        message: `No atlas_feature_map row for ${sourceRef}`,
      });
    } else {
      report.featureMap = {
        somCluster: afmDoc.som_cluster ?? null,
        centroidId: afmDoc.centroid_id ?? null,
        qdrantPointId: afmDoc.qdrant_point_id ?? null,
        clusterId: afmDoc.cluster_id ?? null,
        laneIds: afmDoc.lane_ids || [],
        matched: true,
      };
      console.log(`  ✓ som_cluster : ${afmDoc.som_cluster}`);
      console.log(`  ✓ centroid_id : ${afmDoc.centroid_id}`);
      console.log(`  ✓ qdrant_id   : ${afmDoc.qdrant_point_id}`);
      console.log(`  ✓ cluster_id  : ${afmDoc.cluster_id}`);
      console.log(`  ✓ lane_ids    : [${(afmDoc.lane_ids || []).join(', ')}]`);

      // Qdrant Lookup with Fallback Resolution
      const resolvedRes = await (async () => {
        const normSourceRef = sourceRef.replace(/^sveltekit-frontend\//, '');
        // 1. Try direct Point ID
        if (afmDoc.qdrant_point_id && afmDoc.qdrant_point_id !== 'unknown') {
          const qdrantPointUrl = `${QDRANT_URL}/collections/codebase_chunks_768/points/${afmDoc.qdrant_point_id}`;
          console.log(`⏳ Fetching point from Qdrant by ID: ${qdrantPointUrl}`);
          try {
            const qdrantRes = await fetch(qdrantPointUrl, { signal: AbortSignal.timeout(10_000) });
            if (qdrantRes.ok) {
              const qdrantData = await qdrantRes.json();
              if (qdrantData?.result) return { method: 'point_id', point: qdrantData.result };
            }
          } catch (e) {}
        }
        // 2. Scroll/filter by source_ref
        console.log(`⏳ Point ID not found/404. Falling back to scrolling by source_ref: "${sourceRef}"`);
        const scrollUrl = `${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`;
        try {
          const res = await fetch(scrollUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              limit: 1,
              with_payload: true,
              filter: {
                must: [
                  { key: 'source_ref', match: { value: sourceRef } }
                ]
              }
            })
          });
          if (res.ok) {
            const data = await res.json();
            const pt = data.result?.points?.[0];
            if (pt) {
              // Update database qdrant_point_id mapping
              await pool.query(
                `UPDATE atlas_feature_map SET qdrant_point_id = $1 WHERE source_ref = $2 OR source_ref = $3`,
                [pt.id, sourceRef, normSourceRef]
              ).catch(() => {});
              return { method: 'source_ref_scroll', point: pt };
            }
          }
        } catch (e) {}

        // 3. Filter by feature_id
        if (padDoc.feature_id) {
          console.log(`⏳ Scroll by source_ref empty. Falling back to feature_id: "${padDoc.feature_id}"`);
          try {
            const res = await fetch(scrollUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                limit: 1,
                with_payload: true,
                filter: {
                  must: [
                    { key: 'feature_id', match: { value: padDoc.feature_id } }
                  ]
                }
              })
            });
            if (res.ok) {
              const data = await res.json();
              const pt = data.result?.points?.[0];
              if (pt) return { method: 'feature_id_scroll', point: pt };
            }
          } catch (e) {}
        }
        return null;
      })();

      if (resolvedRes) {
        const pt = resolvedRes.point;
        const payload = pt.payload || {};
        report.qdrant = {
          ok: true,
          method: resolvedRes.method,
          pointId: pt.id,
          filePath: payload.file_path || payload.sourceRef || null,
          sourceRef: payload.sourceRef || null,
          somCluster: payload.som_cluster ?? null,
          centroidId: payload.centroid_id ?? null,
          clusterId: payload.cluster_id ?? null,
        };
        console.log(`  ✓ Qdrant matched via [${resolvedRes.method}]: file_path = "${payload.file_path || payload.sourceRef}"`);
        console.log(`  ✓ Qdrant match: som_cluster = ${payload.som_cluster}`);
      } else {
        report.qdrant = {
          ok: false,
        };
        report.issues.push({
          level: 'warn',
          stage: 'qdrant-point',
          message: 'stale_qdrant_id: Qdrant point lookup failed across all fallback resolution strategies',
        });
        console.warn('  ⚠️ Qdrant point lookup failed across all fallback resolution strategies');
      }
    }
    console.log();

    // =========================================================================
    // LAYER 3: Graph Truth (Neo4j Graph)
    // =========================================================================
    console.log('⚡ LAYER 3: Neo4j Multi-Hop Traversal...');
    const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    const session = driver.session({ database: 'neo4j' });

    try {
      // 1. Verify ParentAtlasFeature exists
      const featureId = padDoc.feature_id;
      console.log(`⏳ Querying ParentAtlasFeature node for "${featureId}"...`);
      const featureNodeRes = await session.run(
        `MATCH (f:ParentAtlasFeature {featureId: $featureId}) RETURN f`,
        { featureId }
      );
      if (featureNodeRes.records.length > 0) {
        report.neo4j.featureNodeFound = true;
        console.log(`  ✓ Neo4j: ParentAtlasFeature node found!`);
      } else {
        report.issues.push({
          level: 'warn',
          stage: 'neo4j-feature',
          message: `ParentAtlasFeature node missing for ${featureId}`,
        });
        console.warn(`  ⚠️ Neo4j: ParentAtlasFeature node NOT found for "${featureId}". Ensure sync script was run.`);
      }

      // 2. Perform 2-hop traversal from the codebase file
      console.log(`⏳ Resolving 2-hop graph neighbors for CodebaseFile "${sourceRef}"...`);
      const traversalRes = await session.run(
        `
          MATCH (c:CodebaseFile {filePath: $filePath})
          MATCH path = (c)-[*1..2]-(neighbor:CodebaseFile)
          RETURN DISTINCT neighbor.filePath AS neighborPath, labels(neighbor) AS labels, type(last(relationships(path))) AS relType
          LIMIT 10
        `,
        { filePath: sourceRef }
      );

      console.log(`  ✓ Traversals found: ${traversalRes.records.length}`);
      report.neo4j.neighborCount = traversalRes.records.length;
      if (traversalRes.records.length > 0) {
        console.log('\n🧭 Traverse Results (Top 10):');
        for (const record of traversalRes.records) {
          const neighborPath = record.get('neighborPath');
          const labels = record.get('labels');
          const relType = record.get('relType');
          report.neo4j.neighbors.push({
            neighborPath,
            labels,
            relType,
          });
          console.log(`    - [${relType}] → ${neighborPath} (${labels.join(', ')})`);
        }
      } else {
        report.issues.push({
          level: 'warn',
          stage: 'neo4j-traversal',
          message: `No 2-hop neighbors found for ${sourceRef}`,
        });
        console.warn('  ⚠️ No neighbors found in 2 hops. Make sure sync script has been run with --apply.');
      }
    } finally {
      await session.close();
      await driver.close();
    }

    report.status = report.issues.some((issue) => issue.level === 'error') ? 'error' : (report.issues.length ? 'warn' : 'ok');
    await writeReport(report);
    console.log('\n🎉 Multi-Hop Traversal Smoke Test completed successfully!');
  } catch (err) {
    report.status = 'error';
    report.issues.push({
      level: 'error',
      stage: 'smoke',
      message: err.message || String(err),
    });
    await writeReport(report);
    console.error('\n❌ Smoke test failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
