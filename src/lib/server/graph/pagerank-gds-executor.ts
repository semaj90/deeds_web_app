import neo4j from 'neo4j-driver';

export interface PageRankGDSConfig {
  graphName: string;
  dampingFactor: number;
  maxIterations: number;
  tolerance: number;
}

export interface PageRankRawRow {
  nodeKey: string;
  pagerankRaw: number;
}

export interface PageRankL1Row {
  nodeKey: string;
  pagerankL1: number;
}

export interface PageRankGDSResult {
  rawScores: PageRankRawRow[];
  l1Scores: PageRankL1Row[];
  didConverge: boolean;
  ranIterations: number;
  nodeCount: number;
}

export class PageRankGDSExecutor {
  constructor(private driver: neo4j.Driver) {}

  async executeRawPageRank(
    config: PageRankGDSConfig
  ): Promise<{
    rows: PageRankRawRow[];
    stats: Record<string, unknown>;
  }> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `CALL gds.pageRank.stream(
          $graphName,
          {
            dampingFactor: $dampingFactor,
            maxIterations: $maxIterations,
            tolerance: $tolerance,
            scaler: 'None'
          }
        )
        YIELD nodeId, score
        RETURN
          gds.util.asNode(nodeId).nodeKey AS nodeKey,
          score AS pagerankRaw
        ORDER BY nodeKey`,
        {
          graphName: config.graphName,
          dampingFactor: config.dampingFactor,
          maxIterations: config.maxIterations,
          tolerance: config.tolerance
        }
      );

      const rows: PageRankRawRow[] = result.records.map(
        (record) => ({
          nodeKey: record.get('nodeKey'),
          pagerankRaw: record.get('pagerankRaw')
        })
      );

      return {
        rows,
        stats: result.summary.counters.toObject()
      };
    } finally {
      await session.close();
    }
  }

  async executeL1NormalizedPageRank(
    config: PageRankGDSConfig
  ): Promise<{
    rows: PageRankL1Row[];
    stats: Record<string, unknown>;
  }> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `CALL gds.pageRank.stream(
          $graphName,
          {
            dampingFactor: $dampingFactor,
            maxIterations: $maxIterations,
            tolerance: $tolerance,
            scaler: 'L1Norm'
          }
        )
        YIELD nodeId, score
        RETURN
          gds.util.asNode(nodeId).nodeKey AS nodeKey,
          score AS pagerankL1
        ORDER BY nodeKey`,
        {
          graphName: config.graphName,
          dampingFactor: config.dampingFactor,
          maxIterations: config.maxIterations,
          tolerance: config.tolerance
        }
      );

      const rows: PageRankL1Row[] = result.records.map(
        (record) => ({
          nodeKey: record.get('nodeKey'),
          pagerankL1: record.get('pagerankL1')
        })
      );

      return {
        rows,
        stats: result.summary.counters.toObject()
      };
    } finally {
      await session.close();
    }
  }

  async executeFullPageRank(
    config: PageRankGDSConfig
  ): Promise<PageRankGDSResult> {
    const [rawResult, l1Result] = await Promise.all([
      this.executeRawPageRank(config),
      this.executeL1NormalizedPageRank(config)
    ]);

    const session = this.driver.session();
    try {
      const statsResult = await session.run(
        `CALL gds.pageRank.stats(
          $graphName,
          {
            dampingFactor: $dampingFactor,
            maxIterations: $maxIterations,
            tolerance: $tolerance,
            scaler: 'None'
          }
        )
        YIELD didConverge, ranIterations, nodeCount`,
        {
          graphName: config.graphName,
          dampingFactor: config.dampingFactor,
          maxIterations: config.maxIterations,
          tolerance: config.tolerance
        }
      );

      const statsRecord = statsResult.records[0];
      const didConverge = statsRecord.get('didConverge');
      const ranIterations = statsRecord.get('ranIterations');
      const nodeCount = statsRecord.get('nodeCount');

      return {
        rawScores: rawResult.rows,
        l1Scores: l1Result.rows,
        didConverge,
        ranIterations,
        nodeCount
      };
    } finally {
      await session.close();
    }
  }
}
