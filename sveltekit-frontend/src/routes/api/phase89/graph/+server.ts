/**
 * API: GET /api/phase89/graph
 * Returns complete knowledge graph (nodes + edges)
 */

import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import postgres from 'postgres';

import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';

const sql = postgres(ENV.DATABASE_URL);

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Check if graph export exists
    const exportPath = path.resolve('reports/phase89-error-graph.json');
    try {
      const cached = await fs.readFile(exportPath, 'utf-8');
      return json(JSON.parse(cached));
    } catch {
      // Fall through to database query
    }

    // Query from database. kg_nodes columns are id, node_type, label, properties; the aliases keep the
    // response keys (kind, meta) stable for callers.
    const nodes = await sql`SELECT id, node_type AS kind, label, properties AS meta FROM kg_nodes`;

    // No edge table is keyed to kg_nodes ids: kg_edges does not exist, and cpg_edges / phase89_import_edges
    // reference other id spaces (cpg_nodes ids, file paths), so joining them here would invent edges.
    const graphData = {
      nodes: nodes.map(n => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        meta: n.meta,
      })),
      edges: [] as Array<{ from: number; to: number; type: string; weight: number | null; evidence: unknown }>,
    };

    return json(graphData);
  } catch (error) {
    console.error('Error loading graph:', error);
    return json({ nodes: [], edges: [] });
  }
};

