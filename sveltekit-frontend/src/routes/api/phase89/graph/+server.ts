/**
 * API: GET /api/phase89/graph
 * Returns complete knowledge graph (nodes + edges)
 */

import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import postgres from 'postgres';
import type { RequestHandler } from './$types';

const sql = postgres(process.env.DATABASE_URL || 'postgresql://user:pass@127.0.0.1:5434/legal');

export const GET: RequestHandler = async ({ url }) => {
  try {
    // Check if graph export exists
    const exportPath = path.resolve('reports/phase89-error-graph.json');
    try {
      const cached = await fs.readFile(exportPath, 'utf-8');
      return json(JSON.parse(cached));
    } catch {
      // Fall through to database query
    }

    // Query from database
    const nodes = await sql`SELECT id, kind, label, meta FROM kg_nodes`;
    const edges = await sql`SELECT from_id, to_id, type, weight, evidence FROM kg_edges`;

    const graphData = {
      nodes: nodes.map(n => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        meta: n.meta,
      })),
      edges: edges.map(e => ({
        from: e.from_id,
        to: e.to_id,
        type: e.type,
        weight: e.weight,
        evidence: e.evidence,
      })),
    };

    return json(graphData);
  } catch (error) {
    console.error('Error loading graph:', error);
    return json({ nodes: [], edges: [], error: error.message }, { status: 500 });
  }
};

