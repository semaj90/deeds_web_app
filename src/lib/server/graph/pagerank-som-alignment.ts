import { Pool } from 'pg';

/**
 * PageRank-SOM Alignment Contract
 *
 * PageRank is linear 2D: (raw, L1)
 * SOM is 5D hyperparameters: (gridSize, dampingFactor, learningRate, radiusDecay, iterations)
 * Topology manifold is 4D: (somRow, somCol, pagerank_l1, community_id)
 *
 * This module aligns PageRank authority scores with SOM grid placement
 * and derives the 4D topology manifold for Neo4j projection.
 */

export interface SOMHyperparameters {
  gridSize: number; // 20×20 = 400 cells
  dampingFactor: number; // 0.85 (PageRank standard)
  learningRate: number; // 0.5 initial
  radiusDecay: number; // 0.95 per epoch
  iterations: number; // 100 SOM training iterations
}

export interface TopologyManifoldRow {
  nodeKey: string;
  somRow: number;
  somCol: number;
  pagerankL1: number;
  communityId?: number;
  manifoldX: number;
  manifoldY: number;
  manifoldZ: number;
  manifoldW: number;
}

export interface PageRankSOMAlignment {
  graphSnapshotId: string;
  runId: string;
  somHyperparameters: SOMHyperparameters;
  alignedRows: TopologyManifoldRow[];
  alignmentMetrics: {
    nodesAligned: number;
    somCellsUsed: number;
    pagerankL1Range: [number, number];
    manifoldVariance: number;
  };
}

export class PageRankSOMAligner {
  constructor(private db: Pool) {}

  /**
   * Align PageRank L1 scores with SOM grid coordinates
   * and derive 4D topology manifold for Neo4j projection
   */
  async alignPageRankWithSOM(
    graphSnapshotId: string,
    runId: string,
    somParams: SOMHyperparameters
  ): Promise<PageRankSOMAlignment> {
    // Fetch PageRank L1 scores
    const scoreQuery = await this.db.query(
      `SELECT
        node_key,
        pagerank_l1,
        authority_percentile
      FROM atlas_graph_authority_scores
      WHERE run_id = $1 AND graph_snapshot_id = $2
      ORDER BY node_key`,
      [runId, graphSnapshotId]
    );

    // Fetch SOM assignments (som_row, som_col already materialized)
    const somQuery = await this.db.query(
      `SELECT
        packet_key,
        source_ref,
        som_row,
        som_col,
        community_id
      FROM atlas_packets
      WHERE som_row IS NOT NULL AND som_col IS NOT NULL
      ORDER BY packet_key`
    );

    // Align: join PageRank scores with SOM coordinates
    const pageRankByKey = new Map(
      scoreQuery.rows.map((row) => [
        row.node_key,
        { l1: row.pagerank_l1, percentile: row.authority_percentile }
      ])
    );

    const somByKey = new Map(
      somQuery.rows.map((row) => [
        row.packet_key,
        { row: row.som_row, col: row.som_col, community: row.community_id }
      ])
    );

    const aligned: TopologyManifoldRow[] = [];
    let minL1 = Infinity;
    let maxL1 = -Infinity;

    for (const [nodeKey, pr] of pageRankByKey) {
      const som = somByKey.get(nodeKey);
      if (!som) continue;

      minL1 = Math.min(minL1, pr.l1);
      maxL1 = Math.max(maxL1, pr.l1);

      // Derive 4D manifold coordinates
      // X, Y: normalized SOM grid position
      // Z: PageRank L1 (authority score)
      // W: Authority percentile (rank)
      const manifoldX = som.row / Math.max(somParams.gridSize - 1, 1);
      const manifoldY = som.col / Math.max(somParams.gridSize - 1, 1);
      const manifoldZ = pr.l1; // L1-normalized authority [0,1]
      const manifoldW = pr.percentile; // Rank percentile [0,1]

      aligned.push({
        nodeKey,
        somRow: som.row,
        somCol: som.col,
        pagerankL1: pr.l1,
        communityId: som.community,
        manifoldX,
        manifoldY,
        manifoldZ,
        manifoldW
      });
    }

    // Calculate manifold variance (spread in Z dimension)
    const zValues = aligned.map((r) => r.manifoldZ);
    const zMean = zValues.reduce((a, b) => a + b, 0) / zValues.length;
    const zVariance =
      zValues.reduce((sum, z) => sum + Math.pow(z - zMean, 2), 0) /
      zValues.length;

    const somCellsUsed = new Set(
      aligned.map((r) => `${r.somRow},${r.somCol}`)
    ).size;

    return {
      graphSnapshotId,
      runId,
      somHyperparameters: somParams,
      alignedRows: aligned,
      alignmentMetrics: {
        nodesAligned: aligned.length,
        somCellsUsed,
        pagerankL1Range: [minL1, maxL1],
        manifoldVariance: zVariance
      }
    };
  }

  /**
   * Persist 4D topology manifold to Postgres
   */
  async persistTopologyManifold(
    alignment: PageRankSOMAlignment
  ): Promise<number> {
    const insertQuery = `
      INSERT INTO atlas_graph_topology_manifold (
        graph_snapshot_id,
        run_id,
        node_key,
        som_row,
        som_col,
        pagerank_l1,
        community_id,
        manifold_x,
        manifold_y,
        manifold_z,
        manifold_w,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (graph_snapshot_id, node_key) DO UPDATE SET
        manifold_x = EXCLUDED.manifold_x,
        manifold_y = EXCLUDED.manifold_y,
        manifold_z = EXCLUDED.manifold_z,
        manifold_w = EXCLUDED.manifold_w,
        updated_at = NOW()
    `;

    let insertedCount = 0;
    for (const row of alignment.alignedRows) {
      try {
        const result = await this.db.query(insertQuery, [
          alignment.graphSnapshotId,
          alignment.runId,
          row.nodeKey,
          row.somRow,
          row.somCol,
          row.pagerankL1,
          row.communityId || null,
          row.manifoldX,
          row.manifoldY,
          row.manifoldZ,
          row.manifoldW
        ]);
        insertedCount += result.rowCount;
      } catch (err) {
        console.error(`Failed to insert manifold row ${row.nodeKey}:`, err);
      }
    }

    return insertedCount;
  }

  /**
   * Generate Neo4j Cypher for topology projection
   * Uses 4D manifold coordinates for node placement
   */
  generateNeo4jTopologyProjection(
    alignment: PageRankSOMAlignment
  ): {
    mergeNodes: string;
    createEdges: string;
    setProperties: string;
  } {
    // Merge manifold nodes into Neo4j
    const mergeNodes = `
      WITH $alignedRows AS rows
      UNWIND rows AS row
      MERGE (n:TopologyNode {nodeKey: row.nodeKey})
      SET n.somRow = row.somRow,
          n.somCol = row.somCol,
          n.pagerankL1 = row.pagerankL1,
          n.manifoldX = row.manifoldX,
          n.manifoldY = row.manifoldY,
          n.manifoldZ = row.manifoldZ,
          n.manifoldW = row.manifoldW,
          n.graphSnapshotId = $graphSnapshotId
      RETURN count(n) AS nodesCreated
    `;

    // Create edges between adjacent SOM cells (topology similarity)
    const createEdges = `
      MATCH (a:TopologyNode {graphSnapshotId: $graphSnapshotId})
      MATCH (b:TopologyNode {graphSnapshotId: $graphSnapshotId})
      WHERE a.somRow = b.somRow AND ABS(a.somCol - b.somCol) = 1
        OR a.somCol = b.somCol AND ABS(a.somRow - b.somRow) = 1
      MERGE (a)-[:SIMILAR_TOPOLOGY {
        distance: sqrt(pow(a.manifoldX - b.manifoldX, 2) +
                      pow(a.manifoldY - b.manifoldY, 2) +
                      pow(a.manifoldZ - b.manifoldZ, 2) +
                      pow(a.manifoldW - b.manifoldW, 2))
      }]->(b)
      RETURN count(*) AS edgesCreated
    `;

    // Index manifold coordinates for spatial queries
    const setProperties = `
      MATCH (n:TopologyNode {graphSnapshotId: $graphSnapshotId})
      SET n.manifoldDistance = sqrt(pow(n.manifoldX, 2) +
                                     pow(n.manifoldY, 2) +
                                     pow(n.manifoldZ, 2) +
                                     pow(n.manifoldW, 2))
      RETURN count(n) AS nodesIndexed
    `;

    return {
      mergeNodes,
      createEdges,
      setProperties
    };
  }

  /**
   * Validate alignment: ensure SOM coordinates and PageRank scores are coherent
   */
  async validateAlignment(
    alignment: PageRankSOMAlignment
  ): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check node count
    if (alignment.alignedRows.length === 0) {
      issues.push('No aligned rows found');
      return { valid: false, issues };
    }

    // Check SOM bounds (0-19 for 20×20 grid)
    const invalidSOMCoords = alignment.alignedRows.filter(
      (r) =>
        r.somRow < 0 ||
        r.somRow >= alignment.somHyperparameters.gridSize ||
        r.somCol < 0 ||
        r.somCol >= alignment.somHyperparameters.gridSize
    );

    if (invalidSOMCoords.length > 0) {
      issues.push(
        `${invalidSOMCoords.length} rows with invalid SOM coordinates`
      );
    }

    // Check PageRank L1 bounds [0, 1]
    const invalidL1 = alignment.alignedRows.filter(
      (r) => r.pagerankL1 < 0 || r.pagerankL1 > 1
    );

    if (invalidL1.length > 0) {
      issues.push(`${invalidL1.length} rows with invalid L1 scores`);
    }

    // Check manifold coordinates [0, 1]
    const invalidManifold = alignment.alignedRows.filter(
      (r) =>
        r.manifoldX < 0 ||
        r.manifoldX > 1 ||
        r.manifoldY < 0 ||
        r.manifoldY > 1 ||
        r.manifoldZ < 0 ||
        r.manifoldZ > 1 ||
        r.manifoldW < 0 ||
        r.manifoldW > 1
    );

    if (invalidManifold.length > 0) {
      issues.push(`${invalidManifold.length} rows with invalid manifold coords`);
    }

    // Check metrics
    if (alignment.alignmentMetrics.somCellsUsed < 10) {
      issues.push(
        `SOM grid underutilized: only ${alignment.alignmentMetrics.somCellsUsed} cells used`
      );
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}
