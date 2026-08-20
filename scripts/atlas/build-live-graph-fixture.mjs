#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function required(name) {
  const value = arg(name);
  if (!value) throw new Error(`missing --${name}=...`);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksum(value) {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function parsePgVector(text) {
  if (text == null) return null;
  const source = String(text).trim();
  if (!source.startsWith('[') || !source.endsWith(']')) throw new Error('invalid pgvector text');
  const values = source.slice(1, -1).split(',').map(Number);
  if (values.length !== 768 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`semantic_768 expected 768 finite values; got ${values.length}`);
  }
  return values;
}

function edgeFamily(relationshipType) {
  const value = String(relationshipType).toLowerCase();
  if (value.includes('call')) return 'AST_CALL';
  if (value.includes('import') || value.includes('require')) return 'AST_IMPORT';
  if (value.includes('reference') || value.includes('refers')) return 'AST_REFERENCE';
  if (value.includes('ontology') || value.includes('type_of') || value.includes('implements')) return 'ONTOLOGY_ROLE';
  if (value.includes('workflow') || value.includes('depends')) return 'WORKFLOW_DEPENDENCY';
  return 'NARY_INCIDENCE';
}

function pairwiseEdgesFromRelationships(rows, ordinalByCandidate) {
  const grouped = new Map();
  for (const row of rows) {
    const relationshipId = String(row.relationship_id);
    const group = grouped.get(relationshipId) ?? {
      relationship_id: relationshipId,
      relationship_type: String(row.relationship_type),
      confidence: Number(row.confidence),
      members: [],
    };
    const ordinal = ordinalByCandidate.get(String(row.entity_id));
    if (ordinal !== undefined) group.members.push(ordinal);
    grouped.set(relationshipId, group);
  }

  const edges = [];
  for (const group of grouped.values()) {
    const members = [...new Set(group.members)].sort((a, b) => a - b);
    if (members.length < 2) continue;
    const pairCount = (members.length * (members.length - 1)) / 2;
    const normalizedWeight = Math.max(0, Math.min(1, group.confidence)) / pairCount;
    const family = edgeFamily(group.relationship_type);
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        edges.push({
          src: members[left],
          dst: members[right],
          weight: normalizedWeight,
          family,
          relationship_id: group.relationship_id,
          canonical_fact: true,
          derived_similarity: false,
        });
      }
    }
  }
  return edges;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const workspaceRevision = required('workspace-revision');
  const sourceSnapshotRevision = required('source-snapshot-revision');
  const graphRevision = required('graph-revision');
  const featureRevision = required('feature-revision');
  const workflowId = arg('workflow-id', `live-graph:${graphRevision}`);
  const workflowRevision = Number(arg('workflow-revision', '1'));
  const requestedLimit = Number(arg('limit', '1000'));
  const limit = Math.max(500, Math.min(5000, requestedLimit));
  const numClusters = Math.max(2, Math.min(Number(arg('clusters', '20')), limit));
  const semanticTopK = Math.max(0, Math.min(Number(arg('semantic-top-k', '16')), 128));
  const randomSeed = Number(arg('seed', String(0xA71A5)));
  const output = path.resolve(arg('output', '.tmp/atlas/live-graph/live-graph-fixture.json'));

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const candidates = await pool.query(`
      SELECT
        candidate_id,
        source_ref,
        source_revision,
        row_identity_checksum,
        kmeans_cluster,
        som_cell,
        community_id,
        semantic_768::text AS semantic_768
      FROM atlas_observation_feature_rows
      WHERE workspace_revision = $1
        AND semantic_768 IS NOT NULL
      ORDER BY row_ordinal, candidate_id
      LIMIT $2
    `, [workspaceRevision, limit]);

    if (candidates.rows.length < 500) {
      throw new Error(`LIVE_GRAPH_REQUIRES_AT_LEAST_500_CANDIDATES:${candidates.rows.length}`);
    }

    const vertices = candidates.rows.map((row, ordinal) => ({
      ordinal,
      candidate_id: String(row.candidate_id),
      source_ref: String(row.source_ref),
      source_revision: String(row.source_revision),
      original_row_identity_checksum: String(row.row_identity_checksum),
      kmeans_cluster: row.kmeans_cluster == null ? null : Number(row.kmeans_cluster),
      som_cell: row.som_cell == null ? null : String(row.som_cell),
      community_id: row.community_id == null ? null : String(row.community_id),
      semantic_768: parsePgVector(row.semantic_768),
    }));
    const candidateIds = vertices.map((vertex) => vertex.candidate_id);
    const ordinalByCandidate = new Map(candidateIds.map((candidateId, ordinal) => [candidateId, ordinal]));

    const relationships = await pool.query(`
      SELECT
        r.relationship_id,
        r.relationship_type,
        r.relationship_revision,
        r.confidence,
        m.member_ordinal,
        m.entity_type,
        m.entity_id,
        m.role
      FROM atlas_relationship_members m
      JOIN atlas_relationships r USING (relationship_id)
      WHERE m.entity_id = ANY($1::text[])
      ORDER BY r.relationship_id, m.member_ordinal
    `, [candidateIds]);

    const canonicalEdges = pairwiseEdgesFromRelationships(relationships.rows, ordinalByCandidate);
    if (canonicalEdges.length === 0) {
      throw new Error('LIVE_GRAPH_NO_CANONICAL_RELATIONSHIP_EDGES');
    }

    const rowIdentityChecksum = checksum(vertices.map((vertex) => ({
      ordinal: vertex.ordinal,
      candidate_id: vertex.candidate_id,
      source_ref: vertex.source_ref,
      source_revision: vertex.source_revision,
      prior_row_identity_checksum: vertex.original_row_identity_checksum,
    })));

    const fixture = {
      schema: 'atlas.live-graph-fixture.v1',
      workflow_id: workflowId,
      workflow_revision: workflowRevision,
      workspace_revision: workspaceRevision,
      source_snapshot_revision: sourceSnapshotRevision,
      graph_revision: graphRevision,
      feature_revision: featureRevision,
      row_identity_checksum: rowIdentityChecksum,
      random_seed: randomSeed,
      num_clusters: numClusters,
      semantic_top_k: semanticTopK,
      semantic_edge_weight: Number(arg('semantic-edge-weight', '0.20')),
      semantic_knn_executor: 'CUVS_ALL_NEIGHBORS_BRUTE_FORCE',
      vertices,
      edges: canonicalEdges,
      evaluation_cases: [],
      canonical_relationships_remain_external: true,
      canonical_authority: false,
      fixture_builder_revision: 'live-graph-postgres-v1',
    };

    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      output,
      vertex_count: vertices.length,
      canonical_edge_count: canonicalEdges.length,
      semantic_top_k: semanticTopK,
      row_identity_checksum: rowIdentityChecksum,
      fixture_checksum: checksum(fixture),
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
