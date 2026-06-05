#!/usr/bin/env node
/**
 * scripts/docs/build-file-profile-cards.mjs
 *
 * Extracts codebase file metadata from Postgres, Neo4j, and Qdrant,
 * aggregates them into a documentation card profile (JSON),
 * and uses Playwright to render and screenshot Svelte/HTML cards.
 *
 * Usage:
 *   node scripts/docs/build-file-profile-cards.mjs            # Dry-run default
 *   node scripts/docs/build-file-profile-cards.mjs --apply    # Write JSON and take screenshots
 *   node scripts/docs/build-file-profile-cards.mjs --limit 10 # Limit number of processed files
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createRequire } from 'node:module';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

const dotenv = await import('dotenv').catch(() => null);
dotenv?.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });

const neo4jPkg = await import('neo4j-driver').catch(() => null);

// Connection Configs
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

// CLI Args
const args       = process.argv.slice(2);
const DRY_RUN    = !args.includes('--apply');
const NO_PNG     = args.includes('--no-png');
const NO_NEO4J   = args.includes('--no-neo4j');
const NO_QDRANT  = args.includes('--no-qdrant');
const LIMIT_IDX  = args.indexOf('--limit');
const LIMIT      = LIMIT_IDX >= 0 ? parseInt(args[LIMIT_IDX + 1], 10) : (DRY_RUN ? 5 : 20);
const REF_IDX    = args.indexOf('--source-ref');
const FILTER_REF = REF_IDX >= 0 ? args[REF_IDX + 1] : null;
const FT_IDX     = args.indexOf('--feature');
const FILTER_FT  = FT_IDX >= 0 ? args[FT_IDX + 1] : null;

// Output Paths — inside sveltekit-frontend/docs so dev server can serve them
const FRONT_ROOT = path.join(ROOT, 'sveltekit-frontend');
const DATA_DIR   = path.join(FRONT_ROOT, 'docs', 'profile-cards', 'data');
const IMAGES_DIR = path.join(FRONT_ROOT, 'docs', 'profile-cards', 'images');

async function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(1000);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

async function run() {
  console.log('=== File Profile Card Generator ===');
  console.log(`Mode:  ${DRY_RUN ? 'DRY-RUN (default)' : 'APPLY (writing data + screenshots)'}`);
  console.log(`Limit: ${LIMIT} files\n`);

  // Ensure output folders exist
  if (!DRY_RUN) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(IMAGES_DIR, { recursive: true });
  }

  // Postgres Pool
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let neo4jDriver = null;

  if (neo4jPkg) {
    try {
      neo4jDriver = neo4jPkg.default.driver(
        NEO4J_URI,
        neo4jPkg.default.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
        { disableLosslessIntegers: true }
      );
    } catch (e) {
      console.warn(`[Neo4j] Failed to initialize driver: ${e.message}`);
    }
  }

  try {
    // 1. Fetch target files from Postgres
    console.log('[Postgres] Querying parent_atlas_documents...');
    const pgParams = [];
    // Base: exclude feature buckets, vendored paths, and large data dumps
    const baseClauses = [
      `pad.source_ref NOT LIKE 'feature:%'`,
      `pad.source_ref NOT LIKE '%.venv/%'`,
      `pad.source_ref NOT LIKE '%/node_modules/%'`,
      `pad.source_ref NOT LIKE '%scripts/memory/graphify/%'`,
      `pad.source_ref NOT LIKE '%next_steps/%'`,
      `pad.source_ref NOT LIKE '%.opencode/%'`,
      `NOT ('vendor' = ANY(COALESCE(pad.tags, '{}')))`,
      `(
        pad.source_ref LIKE 'src/%'
        OR pad.source_ref LIKE 'sveltekit-frontend/src/%'
        OR pad.source_ref LIKE 'scripts/atlas/%'
        OR pad.source_ref LIKE 'scripts/docs/%'
        OR pad.source_ref LIKE 'scripts/startup/%'
      )`,
    ];

    let pgWhere = '';
    if (FILTER_REF) {
      pgParams.push(FILTER_REF);
      pgWhere = `WHERE pad.source_ref = $1`;
    } else if (FILTER_FT) {
      pgParams.push(FILTER_FT);
      pgWhere = `WHERE pad.feature_id = $1 AND ${baseClauses.join(' AND ')}`;
    } else {
      pgWhere = `WHERE ${baseClauses.join(' AND ')}`;
    }
    const pgLimit = FILTER_REF ? '' : `LIMIT ${LIMIT}`;
    const pgQuery = `
      SELECT
        pad.source_ref, pad.rel_path, pad.feature_id,
        pad.line_count, pad.is_route, pad.is_svelte_comp,
        pad.has_auth, pad.has_zod,
        pad.drizzle_refs, pad.imports, pad.exports,
        pad.route_handlers, pad.tags,
        pad.cluster_id, pad.centroid_id, pad.qdrant_point_id,
        afms.som_cluster, afms.packet_count, afms.semantic_confidence,
        afms.behavior_score, afms.routing_score, afms.runtime_state,
        afs.avg_confidence     AS feature_avg_confidence,
        afs.dominant_status    AS feature_dominant_status,
        afs.primary_cluster_id AS feature_primary_cluster
      FROM parent_atlas_documents pad
      LEFT JOIN atlas_feature_map_synthesized afms ON afms.source_ref = pad.source_ref
      LEFT JOIN atlas_feature_synthesis       afs  ON afs.feature_id  = pad.feature_id
      ${pgWhere}
      ORDER BY pad.line_count DESC NULLS LAST
      ${pgLimit}
    `;
    const { rows } = await pool.query(pgQuery, pgParams);
    console.log(`Found ${rows.length} files to process.`);

    if (rows.length === 0) {
      console.log('No files found to generate profile cards.');
      return;
    }

    // Check if local dev server is running before attempting Playwright
    let isServerRunning = false;
    if (!DRY_RUN) {
      isServerRunning = await isPortOpen(5173);
      if (!isServerRunning) {
        console.warn('⚠️  SvelteKit server is NOT running on port 5173. Screenshots will be skipped.');
        console.warn('   Please start the server first in another window: npm run dev\n');
      }
    }

    let playwright = null;
    let browser = null;
    let page = null;

    if (!DRY_RUN && isServerRunning) {
      try {
        try {
          playwright = require('playwright');
        } catch (e) {
          const frontendPlaywrightPath = path.join(ROOT, 'sveltekit-frontend', 'node_modules', 'playwright');
          playwright = require(frontendPlaywrightPath);
        }
        browser = await playwright.chromium.launch();
        page = await browser.newPage({
          viewport: { width: 1280, height: 900 }
        });
        console.log('[Playwright] Browser initialized.');
      } catch (e) {
        console.warn(`[Playwright] Failed to initialize Playwright: ${e.message}`);
      }
    }

    for (const row of rows) {
      const {
        source_ref,
        rel_path,
        feature_id,
        line_count,
        is_route,
        is_svelte_comp,
        has_auth,
        has_zod,
        drizzle_refs,
        imports,
        exports,
        route_handlers,
        tags,
        qdrant_point_id,
        som_cluster,
        centroid_id,
        semantic_confidence,
        behavior_score,
        routing_score,
        runtime_state,
        feature_avg_confidence,
        feature_dominant_status,
        feature_primary_cluster
      } = row;

      // Skip feature:* refs as they are feature aggregation nodes, not actual source files
      if (source_ref.startsWith('feature:')) {
        console.log(`Skipping feature aggregation reference: ${source_ref}`);
        continue;
      }

      // Safe clean name (removing extension inside safety wrapper or leaving clean)
      const cleanRef = source_ref.endsWith('.json') ? source_ref.slice(0, -5) : source_ref;
      const safeName = cleanRef.replace(/[\/\\:]/g, '_');
      console.log(`\nProcessing file: ${source_ref}`);

      // Query database for task/runtime packet counts
      const { rows: packetCountRows } = await pool.query(
        'SELECT count(*)::integer AS count FROM task_semantic_packets WHERE source_ref = $1',
        [source_ref]
      );
      const packetCount = packetCountRows[0]?.count || 0;

      const { rows: runtimeCountRows } = await pool.query(
        'SELECT count(*)::integer AS count FROM route_runtime_packets WHERE source_refs @> jsonb_build_array($1::text)',
        [source_ref]
      );
      const runtimePacketCount = runtimeCountRows[0]?.count || 0;

      // 2. Query Neo4j for neighbors
      let hypergraphNeighbors = [];
      let parentModules = [];
      let nestedRoutes = [];
      let relatedFeatures = new Set();

      if (neo4jDriver) {
        const session = neo4jDriver.session({ database: 'neo4j' });
        try {
          const cypherQuery = `
            MATCH (f {sourceRef: $sourceRef})-[r]-(n)
            RETURN
              type(r) AS relation,
              coalesce(n.sourceRef, n.source_ref, n.id) AS neighbor,
              labels(n) AS labels
            LIMIT 50;
          `;
          const res = await session.run(cypherQuery, { sourceRef: source_ref });
          for (const rec of res.records) {
            const rel = rec.get('relation');
            const neighbor = rec.get('neighbor');
            const labels = rec.get('labels') || [];

            hypergraphNeighbors.push(`${rel} → ${neighbor}`);

            if (rel === 'IMPORTS' || rel === 'DEPENDS_ON') {
              parentModules.push(neighbor);
            }
            if (labels.includes('Route') || neighbor.includes('/routes/')) {
              nestedRoutes.push(neighbor);
            }
            if (labels.includes('Feature') || neighbor.includes('feature:')) {
              relatedFeatures.add(neighbor.replace('feature:', ''));
            }
          }
        } catch (e) {
          if (DRY_RUN) console.log(`  [Neo4j error]: ${e.message}`);
        } finally {
          await session.close();
        }
      }

      // 3. Query Qdrant for similar files
      let similarFiles = [];
      if (qdrant_point_id) {
        try {
          const pointId = /^\d+$/.test(qdrant_point_id) ? parseInt(qdrant_point_id, 10) : qdrant_point_id;
          const qdrantRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              positive: [pointId],
              limit: 5,
              with_payload: true
            }),
            signal: AbortSignal.timeout(5000)
          });
          if (qdrantRes.ok) {
            const data = await qdrantRes.json();
            similarFiles = data.result
              ?.map(r => r.payload?.source_ref || r.payload?.file_path || r.payload?.file || r.id)
              ?.filter(ref => ref && ref !== source_ref) || [];
          }
        } catch (e) {
          if (DRY_RUN) console.log(`  [Qdrant error]: ${e.message}`);
        }
      }

      // Heuristic Warnings
      const warnings = [];
      if (line_count > 400) {
        warnings.push('high complexity (line count > 400)');
      }
      if (is_route && !has_zod) {
        warnings.push('missing strict validation payload adapter (Zod)');
      }
      if (is_route && !has_auth) {
        warnings.push('route lacks auth guard');
      }

      const healthStatus = warnings.length === 0 ? 'healthy' : (warnings.length >= 2 ? 'critical' : 'warning');

      // Derive component type label
      let componentType = 'module';
      if (is_svelte_comp) componentType = 'Svelte component';
      else if (is_route) componentType = 'SvelteKit route';
      else if (source_ref.endsWith('.test.ts') || source_ref.endsWith('.spec.ts')) componentType = 'test';
      else if (source_ref.endsWith('.ts')) componentType = 'TypeScript module';

      // Assemble JSON payload matching exact schema
      const profileCard = {
        source_ref,
        file_path: rel_path || source_ref,
        feature_id: feature_id || 'unknown',
        component_type: componentType,
        line_count: line_count || 0,
        is_route: !!is_route,
        is_svelte_comp: !!is_svelte_comp,
        has_auth: !!has_auth,
        has_zod: !!has_zod,
        drizzle_refs: drizzle_refs || [],
        imports: imports || [],
        exports: exports || [],
        route_handlers: route_handlers || [],
        tags: tags || [],
        som_cluster: som_cluster || 'unassigned',
        centroid_id: centroid_id || 'unassigned',
        qdrant_point_id: qdrant_point_id || '',
        semantic_confidence: semantic_confidence || null,
        behavior_score: behavior_score || null,
        routing_score: routing_score || null,
        runtime_state: runtime_state || null,
        feature_avg_confidence: feature_avg_confidence || null,
        feature_dominant_status: feature_dominant_status || null,
        feature_primary_cluster: feature_primary_cluster || null,
        packet_count: packetCount,
        runtime_packet_count: runtimePacketCount,
        parent_modules: [...new Set(parentModules)].slice(0, 10),
        nested_routes: [...new Set(nestedRoutes)].slice(0, 10),
        related_features: [...relatedFeatures],
        hypergraph_neighbors: hypergraphNeighbors.slice(0, 15),
        similar_files: [...new Set(similarFiles)].slice(0, 10),
        health_status: healthStatus,
        warnings
      };

      if (DRY_RUN) {
        console.log(`[DRY-RUN] Schema details derived:`);
        console.log(JSON.stringify(profileCard, null, 2));
      } else {
        // Write file JSON
        const jsonPath = path.join(DATA_DIR, `${safeName}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(profileCard, null, 2), 'utf8');
        console.log(`Saved JSON profile: ${jsonPath}`);

        // Capture screenshot via Playwright
        if (page && isServerRunning) {
          try {
            const encodedSourceRef = encodeURIComponent(source_ref);
            const devUrl = `http://localhost:5173/dev/file-card/${encodedSourceRef}`;
            console.log(`Loading Dev Render: ${devUrl}`);
            await page.goto(devUrl, { waitUntil: 'networkidle' });
            
            // Subtle timeout to let layout finish animation/transitions
            await new Promise(r => setTimeout(r, 500));

            const imgPath = path.join(IMAGES_DIR, `${safeName}.png`);
            await page.screenshot({ path: imgPath, fullPage: true });
            console.log(`Exported card screenshot: ${imgPath}`);
          } catch (err) {
            console.error(`Playwright screenshot failed for ${source_ref}:`, err.message);
          }
        }
      }
    }

    if (page) await page.close();
    if (browser) await browser.close();

  } catch (err) {
    console.error('Fatal error during execution:', err);
  } finally {
    await pool.end();
    if (neo4jDriver) {
      await neo4jDriver.close();
    }
  }
}

run().catch(console.error);
