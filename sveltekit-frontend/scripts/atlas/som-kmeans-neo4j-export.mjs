#!/usr/bin/env node
/**
 * SOM K-means Topology Generation + Neo4j JSON Export
 *
 * Generates 20×20 SOM grid from Qdrant embeddings using k-means clustering,
 * then exports topology as JSON for Neo4j analysis and Gemma4 synthesis.
 *
 * Usage:
 *   node som-kmeans-neo4j-export.mjs --collection codebase_chunks_768 --grid-size 20 --output som-topology.json
 */

import fetch from 'node-fetch';
import { execSync } from 'child_process';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const GRID_SIZE = 20; // 20×20 = 400 cells
const BATCH_SIZE = 500;

// K-means implementation (simplified for SOM initialization)
class KMeans {
  constructor(k, dims, maxIterations = 100) {
    this.k = k;
    this.dims = dims;
    this.maxIterations = maxIterations;
    this.centroids = [];
    this.assignments = [];
  }

  // Initialize centroids randomly from data
  initializeCentroids(data) {
    const indices = new Set();
    while (indices.size < this.k) {
      indices.add(Math.floor(Math.random() * data.length));
    }
    this.centroids = Array.from(indices).map(i => data[i]);
  }

  // Euclidean distance
  distance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  // Assign points to nearest centroid
  assign(data) {
    this.assignments = data.map(point => {
      let minDist = Infinity;
      let assignment = 0;
      for (let i = 0; i < this.k; i++) {
        const d = this.distance(point, this.centroids[i]);
        if (d < minDist) {
          minDist = d;
          assignment = i;
        }
      }
      return assignment;
    });
  }

  // Update centroids
  updateCentroids(data) {
    const newCentroids = Array(this.k).fill(null).map(() =>
      Array(this.dims).fill(0)
    );
    const counts = Array(this.k).fill(0);

    for (let i = 0; i < data.length; i++) {
      const cluster = this.assignments[i];
      for (let j = 0; j < this.dims; j++) {
        newCentroids[cluster][j] += data[i][j];
      }
      counts[cluster]++;
    }

    for (let i = 0; i < this.k; i++) {
      if (counts[i] > 0) {
        for (let j = 0; j < this.dims; j++) {
          newCentroids[i][j] /= counts[i];
        }
      }
    }

    this.centroids = newCentroids;
  }

  // Fit k-means
  fit(data) {
    this.initializeCentroids(data);

    for (let iter = 0; iter < this.maxIterations; iter++) {
      this.assign(data);
      this.updateCentroids(data);
    }

    return { centroids: this.centroids, assignments: this.assignments };
  }
}

// SOM Grid mapping (convert cluster ID to 2D grid coordinates)
function clusterToGridCoords(clusterId, gridSize) {
  const row = Math.floor(clusterId / gridSize);
  const col = clusterId % gridSize;
  return { row, col };
}

// Fetch all points from Qdrant collection
async function fetchAllPoints(collection) {
  const allPoints = [];
  let offset = 0;

  console.log(`📥 Fetching points from ${collection}...`);

  while (true) {
    const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: BATCH_SIZE,
        offset,
        with_payload: true,
        with_vectors: true,
      }),
    });

    const data = await response.json();
    const points = data.result?.points || [];

    if (points.length === 0) break;

    allPoints.push(...points);
    offset += BATCH_SIZE;

    if (allPoints.length % 5000 === 0) {
      console.log(`  [${allPoints.length}] points fetched...`);
    }
  }

  console.log(`✅ Fetched ${allPoints.length} total points`);
  return allPoints;
}

// Run k-means clustering
function runKMeans(points, gridSize) {
  console.log(`🧠 Running k-means with k=${gridSize * gridSize} clusters...`);

  // Extract vectors
  const vectors = points.map(p =>
    Array.isArray(p.vector) ? p.vector : Object.values(p.vector || {})
  );

  const kmeans = new KMeans(gridSize * gridSize, vectors[0].length, 50);
  const { centroids, assignments } = kmeans.fit(vectors);

  console.log(`✅ K-means complete. Centroid count: ${centroids.length}`);

  return { centroids, assignments };
}

// Build SOM topology graph
function buildSOMTopology(points, assignments, gridSize) {
  console.log(`🗺️ Building SOM topology...`);

  const nodes = {};
  const edges = [];

  // Create nodes for each grid cell
  for (let i = 0; i < gridSize * gridSize; i++) {
    const { row, col } = clusterToGridCoords(i, gridSize);
    nodes[i] = {
      cell_id: `som:${row}:${col}`,
      som_row: row,
      som_col: col,
      som_index: i,
      member_count: 0,
      members: []
    };
  }

  // Assign points to nodes and collect members
  for (let i = 0; i < points.length; i++) {
    const cluster = assignments[i];
    nodes[cluster].member_count++;
    nodes[cluster].members.push(points[i].id);
  }

  // Create edges between neighboring grid cells (8-neighbor topology)
  for (let i = 0; i < gridSize * gridSize; i++) {
    const { row, col } = clusterToGridCoords(i, gridSize);

    // 8 neighbors: up, down, left, right, diagonals
    const neighbors = [
      [row - 1, col - 1], [row - 1, col], [row - 1, col + 1],
      [row, col - 1],                     [row, col + 1],
      [row + 1, col - 1], [row + 1, col], [row + 1, col + 1],
    ];

    for (const [nRow, nCol] of neighbors) {
      if (nRow >= 0 && nRow < gridSize && nCol >= 0 && nCol < gridSize) {
        const nIdx = nRow * gridSize + nCol;
        if (nIdx > i) { // Avoid duplicate edges
          edges.push({
            source: i,
            target: nIdx,
            source_cell_id: nodes[i].cell_id,
            target_cell_id: nodes[nIdx].cell_id,
            weight: 1.0,
            edge_type: 'SIMILAR_TOPOLOGY'
          });
        }
      }
    }
  }

  console.log(`✅ SOM topology built: ${Object.keys(nodes).length} nodes, ${edges.length} edges`);

  return { nodes, edges };
}

// Export for Neo4j JSON analysis
function exportNeo4jJSON(nodes, edges, outputPath) {
  console.log(`📤 Exporting Neo4j JSON...`);

  const nodeList = Object.values(nodes).map(n => ({
    id: n.cell_id,
    labels: ['Node', 'SOMCell'],
    properties: {
      cell_id: n.cell_id,
      som_row: n.som_row,
      som_col: n.som_col,
      som_index: n.som_index,
      member_count: n.member_count
    }
  }));

  const edgeList = edges.map(e => ({
    id: `${e.source_cell_id}__${e.target_cell_id}`,
    type: e.edge_type,
    start_node: e.source_cell_id,
    end_node: e.target_cell_id,
    properties: {
      weight: e.weight
    }
  }));

  const neo4jExport = {
    metadata: {
      timestamp: new Date().toISOString(),
      grid_rows: 20,
      grid_cols: 20,
      total_nodes: nodeList.length,
      total_edges: edgeList.length,
      node_distribution: Object.values(nodes).reduce((acc, n) => {
        acc[n.member_count] = (acc[n.member_count] || 0) + 1;
        return acc;
      }, {})
    },
    nodes: nodeList,
    edges: edgeList,
    statistics: {
      populated_cells: nodeList.filter(n => n.properties.member_count > 0).length,
      empty_cells: nodeList.filter(n => n.properties.member_count === 0).length,
      avg_members_per_cell: Math.round(
        nodeList.reduce((sum, n) => sum + n.properties.member_count, 0) / nodeList.length
      )
    }
  };

  require('fs').writeFileSync(outputPath, JSON.stringify(neo4jExport, null, 2));
  console.log(`✅ Neo4j JSON exported to ${outputPath}`);

  return neo4jExport;
}

// Main execution
async function main() {
  const collectionArg = process.argv.find((arg, i) =>
    i > 0 && process.argv[i - 1] === '--collection'
  ) || 'codebase_chunks_768';

  const outputArg = process.argv.find((arg, i) =>
    i > 0 && process.argv[i - 1] === '--output'
  ) || 'som-topology.json';

  console.log(`\n🚀 SOM K-means + Neo4j Export`);
  console.log(`   Collection: ${collectionArg}`);
  console.log(`   Grid: ${GRID_SIZE}×${GRID_SIZE}`);
  console.log(`   Output: ${outputArg}\n`);

  try {
    // Fetch points
    const points = await fetchAllPoints(collectionArg);

    // Run k-means
    const { assignments } = runKMeans(points, GRID_SIZE);

    // Build topology
    const { nodes, edges } = buildSOMTopology(points, assignments, GRID_SIZE);

    // Export Neo4j JSON
    const neo4jData = exportNeo4jJSON(nodes, edges, outputArg);

    // Print summary
    console.log(`\n📊 SUMMARY`);
    console.log(`   Total points: ${points.length}`);
    console.log(`   Populated cells: ${neo4jData.statistics.populated_cells}/400`);
    console.log(`   Empty cells: ${neo4jData.statistics.empty_cells}/400`);
    console.log(`   Avg members/cell: ${neo4jData.statistics.avg_members_per_cell}`);
    console.log(`   Edges: ${edges.length}`);
    console.log(`\n✅ SOM topology ready for Neo4j analysis and Gemma4 synthesis`);

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
