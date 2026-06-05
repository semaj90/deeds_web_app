import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import neo4jPkg from 'neo4j-driver';

// Target directory for generated profile jsons (relative to sveltekit-frontend)
const DATA_DIR = path.resolve('../docs/profile-cards/data');

// Retrieve configs
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

export const load = async ({ params }) => {
  const { sourceRef } = params;
  if (!sourceRef) {
    throw error(400, 'sourceRef parameter is required');
  }

  const safeName = sourceRef.replace(/[\/\\:]/g, '_');
  const jsonPath = path.join(DATA_DIR, `${safeName}.json`);

  // 1. Try reading pre-generated JSON first
  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      const card = JSON.parse(content);
      return { card };
    } catch (e) {
      console.error(`Failed to parse cached JSON card: ${e.message}`);
    }
  }

  // 2. Dynamic database/service fallback queries
  console.log(`[dev-file-card] Pre-generated card not found at ${jsonPath}, running fallback live queries for ${sourceRef}`);
  
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let card = null;

  try {
    const pgQuery = `
      SELECT
        pad.source_ref,
        pad.rel_path,
        pad.feature_id,
        pad.line_count,
        pad.is_route,
        pad.is_svelte_comp,
        pad.has_auth,
        pad.has_zod,
        pad.drizzle_refs,
        pad.imports,
        pad.exports,
        pad.route_handlers,
        pad.tags,
        pad.cluster_id,
        pad.centroid_id,
        pad.qdrant_point_id,
        afms.som_cluster,
        afms.packet_count,
        afms.semantic_confidence,
        afms.behavior_score,
        afms.routing_score,
        afms.runtime_state,
        afs.avg_confidence     AS feature_avg_confidence,
        afs.dominant_status    AS feature_dominant_status,
        afs.primary_cluster_id AS feature_primary_cluster
      FROM parent_atlas_documents pad
      LEFT JOIN atlas_feature_map_synthesized afms ON afms.source_ref = pad.source_ref
      LEFT JOIN atlas_feature_synthesis       afs  ON afs.feature_id  = pad.feature_id
      WHERE pad.source_ref = $1;
    `;
    const { rows } = await pool.query(pgQuery, [sourceRef]);
    
    if (rows.length === 0) {
      throw error(404, `File profile not found for sourceRef: ${sourceRef}`);
    }

    const row = rows[0];
    
    // Neo4j connections
    let hypergraphNeighbors = [];
    let parentModules = [];
    let nestedRoutes = [];
    let relatedFeatures = new Set();

    if (neo4jPkg) {
      try {
        const driver = neo4jPkg.driver(NEO4J_URI, neo4jPkg.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
          disableLosslessIntegers: true
        });
        const session = driver.session({ database: 'neo4j' });
        
        const cypherQuery = `
          MATCH (f {sourceRef: $sourceRef})-[r]-(n)
          RETURN
            type(r) AS relation,
            coalesce(n.sourceRef, n.source_ref, n.id) AS neighbor,
            labels(n) AS labels
          LIMIT 50;
        `;
        const res = await session.run(cypherQuery, { sourceRef });
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
        await session.close();
        await driver.close();
      } catch (err) {
        console.warn(`[Neo4j live fallback error]: ${err.message}`);
      }
    }

    // Qdrant similar files
    let similarFiles = [];
    if (row.qdrant_point_id) {
      try {
        const pointId = /^\d+$/.test(row.qdrant_point_id) ? parseInt(row.qdrant_point_id, 10) : row.qdrant_point_id;
        const qdrantRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positive: [pointId],
            limit: 5,
            with_payload: true
          }),
          signal: AbortSignal.timeout(3000)
        });
        if (qdrantRes.ok) {
          const data = await qdrantRes.json();
          similarFiles = data.result
            ?.map(r => r.payload?.source_ref || r.payload?.file_path || r.payload?.file || r.id)
            ?.filter(ref => ref && ref !== sourceRef) || [];
        }
      } catch (err) {
        console.warn(`[Qdrant live fallback error]: ${err.message}`);
      }
    }

    let componentType = 'TypeScript module';
    if (row.is_svelte_comp) componentType = 'Svelte component';
    else if (row.is_route) componentType = 'SvelteKit route';
    else if (sourceRef.endsWith('.css') || sourceRef.endsWith('.scss')) componentType = 'CSS stylesheet';
    else if (sourceRef.endsWith('.test.ts') || sourceRef.endsWith('.spec.ts')) componentType = 'test';

    const warnings: string[] = [];
    const agenticFixes: { type: string; description: string }[] = [];

    if (row.line_count > 400) {
      warnings.push('high complexity (line count > 400)');
      agenticFixes.push({ type: 'refactor', description: 'Extract functions/sub-components to simplify module footprint.' });
    }
    if (row.is_route && !row.has_zod) {
      warnings.push('missing strict validation payload adapter (Zod)');
      agenticFixes.push({ type: 'security', description: 'Apply Zod schema validator to handle request parameters safely.' });
    }
    if (row.is_route && !row.has_auth) {
      warnings.push('route lacks auth guard');
      agenticFixes.push({ type: 'security', description: 'Add locals.user auth check or requireAuth guard.' });
    }

    const healthStatus = warnings.length === 0 ? 'healthy' : (warnings.length >= 2 ? 'critical' : 'warning');

    card = {
      source_ref: row.source_ref,
      file_path: row.rel_path || row.source_ref,
      feature_id: row.feature_id || 'unknown',
      component_type: componentType,
      line_count: row.line_count || 0,
      is_route: !!row.is_route,
      is_svelte_comp: !!row.is_svelte_comp,
      has_auth: !!row.has_auth,
      has_zod: !!row.has_zod,
      drizzle_refs: row.drizzle_refs || [],
      imports: row.imports || [],
      exports: row.exports || [],
      route_handlers: row.route_handlers || [],
      tags: row.tags || [],
      som_cluster: row.som_cluster || 'unassigned',
      centroid_id: row.centroid_id || 'unassigned',
      qdrant_point_id: row.qdrant_point_id || null,
      semantic_confidence: row.semantic_confidence ?? null,
      behavior_score: row.behavior_score ?? null,
      routing_score: row.routing_score ?? null,
      runtime_state: row.runtime_state ?? null,
      feature_avg_confidence: row.feature_avg_confidence ?? null,
      feature_dominant_status: row.feature_dominant_status ?? null,
      feature_primary_cluster: row.feature_primary_cluster ?? null,
      packet_count: row.packet_count || 0,
      runtime_packet_count: 0,
      parent_modules: [...new Set(parentModules)].slice(0, 10),
      nested_routes: [...new Set(nestedRoutes)].slice(0, 10),
      related_features: [...relatedFeatures],
      hypergraph_neighbors: hypergraphNeighbors.slice(0, 15),
      similar_files: [...new Set(similarFiles)].slice(0, 10),
      health_status: healthStatus,
      warnings,
      agentic_fixes: agenticFixes
    };
  } finally {
    await pool.end();
  }

  return { card };
};
