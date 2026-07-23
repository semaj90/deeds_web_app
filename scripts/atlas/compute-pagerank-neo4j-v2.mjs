#!/usr/bin/env node
/**
 * Fixture-only Parent Atlas Neo4j GDS PageRank runner.
 *
 * This script never writes Postgres, Qdrant, Valkey, or production Neo4j
 * PageRank properties. It creates isolated :AtlasContextNode fixture data,
 * runs stream mode, emits JSON, and removes the projection and fixture nodes.
 */

import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import neo4j from 'neo4j-driver';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..', '..');
const fixturePath = process.argv.includes('--fixture')
  ? resolve(process.argv[process.argv.indexOf('--fixture') + 1])
  : resolve(ROOT, 'sveltekit-frontend/src/lib/server/atlas/graph/fixtures/pagerank-parity-graph.json');
const manifestPath = process.argv.includes('--manifest')
  ? resolve(process.argv[process.argv.indexOf('--manifest') + 1])
  : resolve(ROOT, '.okf/manifest.yaml');
const JSON_ONLY = process.argv.includes('--json');

const uri = process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687';
const user = process.env.NEO4J_USER ?? 'neo4j';
const password = process.env.NEO4J_PASSWORD ?? 'neo4j123';
const fixtureRunId = crypto.randomUUID();
const graphName = `atlas_authority_fixture_${fixtureRunId.replaceAll('-', '_')}`;

const log = (...args) => {
  if (!JSON_ONLY) console.error(...args);
};

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function topologyHash(nodes, edges) {
  const normalized = {
    nodes: nodes.map(({ snapshotId: _snapshotId, ...node }) => node).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)),
    edges: edges.map(({ snapshotId: _snapshotId, ...edge }) => edge).sort((a, b) => a.edgeKey.localeCompare(b.edgeKey)),
  };
  return crypto.createHash('sha256').update(stableJson(normalized)).digest('hex');
}

function gdsUnavailable(error) {
  const message = String(error?.message ?? error);
  return /ECONNREFUSED|ServiceUnavailable|Connection.*refused|Unknown procedure.*gds/i.test(message);
}

async function main() {
  const [fixture, manifest] = await Promise.all([
    readFile(fixturePath, 'utf8').then(JSON.parse),
    readFile(manifestPath, 'utf8').then(parseYaml),
  ]);
  const projection = manifest.graph_projection;
  const includedTypes = projection.pagerank_edges.map((edge) => String(edge).toUpperCase()).sort();
  const excludedTypes = projection.excluded_edges.map((edge) => String(edge).toUpperCase()).sort();
  const snapshotId = fixture.snapshotId;
  const nodes = fixture.nodes.map((node) => ({ ...node, snapshotId }));
  const edges = fixture.edges.map((edge) => ({ ...edge, snapshotId }));
  const topology_hash = topologyHash(nodes, edges);
  const driver = neo4j.default.driver(uri, neo4j.default.auth.basic(user, password));
  const session = driver.session();
  let projectionCreated = false;

  try {
    for (const node of nodes) {
      await session.run(
        `CREATE (:AtlasContextNode {
          snapshot_id: $snapshotId,
          fixture_run_id: $fixtureRunId,
          node_key: $nodeKey,
          node_type: $nodeType,
          packet_key: $packetKey,
          tree_node_id: $treeNodeId,
          source_ref: $sourceRef
        })`,
        { snapshotId, fixtureRunId, nodeKey: node.nodeKey, nodeType: node.nodeType, packetKey: node.packetKey, treeNodeId: node.treeNodeId, sourceRef: node.sourceRef },
      );
    }

    for (const edge of edges) {
      if (!['CONTAINS', 'MATERIALIZES', 'IMPORTS', 'CALLS', 'REFERENCES', 'DEPENDS_ON', 'IMPLEMENTS', 'USES_CONCEPT', 'PARTICIPATES_IN'].includes(edge.edgeType)) {
        throw new Error(`Unsupported fixture relationship type: ${edge.edgeType}`);
      }
      await session.run(
        `MATCH (source:AtlasContextNode {snapshot_id: $snapshotId, fixture_run_id: $fixtureRunId, node_key: $sourceNodeKey})
         MATCH (target:AtlasContextNode {snapshot_id: $snapshotId, fixture_run_id: $fixtureRunId, node_key: $targetNodeKey})
         CREATE (source)-[:${edge.edgeType} {edge_key: $edgeKey, weight: $weight, confidence: $confidence}]->(target)`,
        { snapshotId, fixtureRunId, sourceNodeKey: edge.sourceNodeKey, targetNodeKey: edge.targetNodeKey, edgeKey: edge.edgeKey, weight: edge.weight, confidence: edge.confidence },
      );
    }

    const nodeQuery = `MATCH (n:AtlasContextNode)
      WHERE n.snapshot_id = $snapshotId AND n.fixture_run_id = $fixtureRunId
      RETURN id(n) AS id`;
    const relationshipQuery = `MATCH (a:AtlasContextNode)-[r]->(b:AtlasContextNode)
      WHERE a.snapshot_id = $snapshotId
        AND b.snapshot_id = $snapshotId
        AND a.fixture_run_id = $fixtureRunId
        AND b.fixture_run_id = $fixtureRunId
        AND type(r) IN $edgeTypes
        AND coalesce(r.confidence, 1.0) >= $minimumConfidence
      RETURN id(a) AS source, id(b) AS target, r.weight AS weight`;

    const projectionResult = await session.run(
      `CALL gds.graph.project.cypher($graphName, $nodeQuery, $relationshipQuery, {
        parameters: {
          snapshotId: $snapshotId,
          fixtureRunId: $fixtureRunId,
          edgeTypes: $edgeTypes,
          minimumConfidence: $minimumConfidence
        }
      })
      YIELD graphName, nodeCount, relationshipCount
      RETURN graphName, nodeCount, relationshipCount`,
      { graphName, nodeQuery, relationshipQuery, snapshotId, fixtureRunId, edgeTypes: includedTypes, minimumConfidence: projection.minimum_confidence },
    );
    projectionCreated = true;
    const projectionRow = projectionResult.records[0].toObject();

    const statsResult = await session.run(
      `CALL gds.pageRank.stats($graphName, {
        relationshipWeightProperty: 'weight',
        dampingFactor: 0.85,
        maxIterations: 100,
        tolerance: 1e-8,
        scaler: 'None'
      })
      YIELD didConverge, ranIterations
      RETURN didConverge, ranIterations`,
      { graphName },
    );
    const stats = statsResult.records[0].toObject();
    if (!stats.didConverge) throw new Error('Neo4j GDS PageRank did not converge');

    const streamResult = await session.run(
      `CALL gds.pageRank.stream($graphName, {
        relationshipWeightProperty: 'weight',
        dampingFactor: 0.85,
        maxIterations: 100,
        tolerance: 1e-8,
        scaler: 'None'
      })
      YIELD nodeId, score
      RETURN gds.util.asNode(nodeId).node_key AS nodeKey, score AS pagerankRaw
      ORDER BY nodeKey`,
      { graphName },
    );
    const scores = streamResult.records.map((record) => {
      const row = record.toObject();
      return { nodeKey: row.nodeKey, pagerankRaw: Number(row.pagerankRaw) };
    });
    const result_hash = crypto.createHash('sha256').update(stableJson(scores)).digest('hex');

    console.log(JSON.stringify({
      status: 'NEO4J_GDS_PROVEN',
      snapshot_id: snapshotId,
      run_id: fixtureRunId,
      topology_hash,
      engine: 'neo4j_gds',
      normalization_applied_by: 'none',
      config: { dampingFactor: 0.85, maxIterations: 100, tolerance: 1e-8, relationshipWeightProperty: 'weight' },
      graph_name: projectionRow.graphName,
      node_count: Number(projectionRow.nodeCount),
      edge_count: Number(projectionRow.relationshipCount),
      included_edge_types: includedTypes,
      excluded_edge_types: excludedTypes,
      did_converge: Boolean(stats.didConverge),
      ran_iterations: Number(stats.ranIterations),
      scores,
      result_hash,
    }));
  } catch (error) {
    const status = gdsUnavailable(error) ? 'NEO4J_GDS_UNAVAILABLE' : 'NEO4J_GDS_CONFIG_UNSUPPORTED';
    console.log(JSON.stringify({ status, reason: String(error?.message ?? error), graph_name: graphName }));
    process.exitCode = status === 'NEO4J_GDS_UNAVAILABLE' ? 0 : 3;
  } finally {
    try {
      if (projectionCreated) await session.run('CALL gds.graph.drop($graphName, false) YIELD graphName RETURN graphName', { graphName });
    } catch (error) {
      log(`Fixture projection cleanup failed: ${String(error?.message ?? error)}`);
    }
    try {
      await session.run('MATCH (n:AtlasContextNode {fixture_run_id: $fixtureRunId}) DETACH DELETE n', { fixtureRunId });
    } finally {
      await session.close();
      await driver.close();
    }
  }
}

await main();
