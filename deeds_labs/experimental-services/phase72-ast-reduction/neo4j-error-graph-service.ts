/**
 * Phase 72: Neo4j Error Graph Service
 * Manages AST error relationships and graph analysis
 */

import neo4j, { Driver, Session } from 'neo4j-driver';

export interface ErrorRelationship {
  fromError: string;
  toError: string;
  type: 'depends_on' | 'similar_to' | 'caused_by' | 'fixed_by';
  weight: number;
  metadata?: Record<string, any>;
}

export interface GraphPattern {
  pattern: string;
  frequency: number;
  affectedFiles: string[];
  suggestedFix?: string;
}

export class Neo4jErrorGraphService {
  private driver: Driver;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async initializeSchema(): Promise<void> {
    const session = this.driver.session();

    try {
      // Create constraints and indexes
      await session.run('CREATE CONSTRAINT error_id IF NOT EXISTS FOR (e:ASTError) REQUIRE e.id IS UNIQUE');
      await session.run('CREATE INDEX error_file IF NOT EXISTS FOR (e:ASTError) ON (e.file)');
      await session.run('CREATE INDEX error_category IF NOT EXISTS FOR (e:ASTError) ON (e.category)');

      // Create cluster nodes
      await session.run('CREATE CONSTRAINT cluster_id IF NOT EXISTS FOR (c:ErrorCluster) REQUIRE c.id IS UNIQUE');

      console.log('✅ Neo4j schema initialized');
    } finally {
      await session.close();
    }
  }

  async storeErrorNode(error: any): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(`
        MERGE (e:ASTError {id: $id})
        SET e.file = $file,
            e.line = $line,
            e.column = $column,
            e.code = $code,
            e.message = $message,
            e.category = $category,
            e.severity = $severity,
            e.fixAttempts = $fixAttempts,
            e.lastAttempt = datetime($lastAttempt),
            e.embedding = $embedding,
            e.clusterId = $clusterId
      `, {
        id: error.id,
        file: error.file,
        line: error.line,
        column: error.column,
        code: error.code,
        message: error.message,
        category: error.category,
        severity: error.severity,
        fixAttempts: error.fixAttempts,
        lastAttempt: error.lastAttempt.toISOString(),
        embedding: error.embedding || null,
        clusterId: error.clusterId || null
      });
    } finally {
      await session.close();
    }
  }

  async createErrorRelationship(relationship: ErrorRelationship): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(`
        MATCH (from:ASTError {id: $fromId}), (to:ASTError {id: $toId})
        MERGE (from)-[r:${relationship.type}]->(to)
        SET r.weight = $weight,
            r.created = datetime(),
            r.metadata = $metadata
      `, {
        fromId: relationship.fromError,
        toId: relationship.toError,
        weight: relationship.weight,
        metadata: relationship.metadata || {}
      });
    } finally {
      await session.close();
    }
  }

  async storeErrorCluster(cluster: any): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(`
        MERGE (c:ErrorCluster {id: $id})
        SET c.centroid = $centroid,
            c.errorCount = $errorCount,
            c.pattern = $pattern,
            c.suggestedFix = $suggestedFix,
            c.confidence = $confidence,
            c.appliedCount = $appliedCount,
            c.created = datetime()
      `, cluster);
    } finally {
      await session.close();
    }
  }

  async assignErrorsToCluster(clusterId: string, errorIds: string[]): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(`
        MATCH (c:ErrorCluster {id: $clusterId})
        UNWIND $errorIds AS errorId
        MATCH (e:ASTError {id: errorId})
        MERGE (e)-[:belongs_to]->(c)
        SET e.clusterId = $clusterId
      `, { clusterId, errorIds });
    } finally {
      await session.close();
    }
  }

  async findSimilarErrors(errorId: string, limit: number = 10): Promise<any[]> {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (e:ASTError {id: $errorId})-[:similar_to]-(similar:ASTError)
        RETURN similar
        ORDER BY similar.weight DESC
        LIMIT $limit
      `, { errorId, limit });

      return result.records.map(record => record.get('similar').properties);
    } finally {
      await session.close();
    }
  }

  async detectErrorPatterns(): Promise<GraphPattern[]> {
    const session = this.driver.session();

    try {
      // Find common error patterns using graph algorithms
      const result = await session.run(`
        MATCH (e:ASTError)
        WITH e.category as category, e.code as code, count(*) as freq
        WHERE freq > 5
        RETURN category + ':' + code as pattern, freq
        ORDER BY freq DESC
        LIMIT 20
      `);

      const patterns: GraphPattern[] = [];

      for (const record of result.records) {
        const pattern = record.get('pattern');
        const frequency = record.get('freq');

        // Get affected files for this pattern
        const filesResult = await session.run(`
          MATCH (e:ASTError)
          WHERE e.category + ':' + e.code = $pattern
          RETURN DISTINCT e.file as file
        `, { pattern });

        const affectedFiles = filesResult.records.map(r => r.get('file'));

        patterns.push({
          pattern,
          frequency,
          affectedFiles
        });
      }

      return patterns;
    } finally {
      await session.close();
    }
  }

  async getErrorClusters(): Promise<any[]> {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (c:ErrorCluster)
        OPTIONAL MATCH (c)<-[:belongs_to]-(e:ASTError)
        RETURN c, count(e) as errorCount
        ORDER BY errorCount DESC
      `);

      return result.records.map(record => ({
        cluster: record.get('c').properties,
        errorCount: record.get('errorCount').toInt()
      }));
    } finally {
      await session.close();
    }
  }

  async getClusterErrors(clusterId: string): Promise<any[]> {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (c:ErrorCluster {id: $clusterId})<-[:belongs_to]-(e:ASTError)
        RETURN e
        ORDER BY e.fixAttempts ASC, e.severity DESC
      `, { clusterId });

      return result.records.map(record => record.get('e').properties);
    } finally {
      await session.close();
    }
  }

  async updateErrorFixAttempt(errorId: string, success: boolean): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(`
        MATCH (e:ASTError {id: $errorId})
        SET e.fixAttempts = e.fixAttempts + 1,
            e.lastAttempt = datetime()
        ${success ? ', e.fixed = true, e.fixedAt = datetime()' : ''}
      `, { errorId });
    } finally {
      await session.close();
    }
  }

  async getFixSuccessRate(): Promise<{ total: number, successful: number, rate: number }> {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (e:ASTError)
        RETURN count(e) as total,
               count(CASE WHEN e.fixed = true THEN 1 END) as successful
      `);

      const record = result.records[0];
      const total = record.get('total').toInt();
      const successful = record.get('successful').toInt();
      const rate = total > 0 ? successful / total : 0;

      return { total, successful, rate };
    } finally {
      await session.close();
    }
  }

  async cleanupOldErrors(olderThanDays: number = 30): Promise<number> {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (e:ASTError)
        WHERE e.fixed = true AND
              duration.between(e.fixedAt, datetime()).days > $days
        DETACH DELETE e
        RETURN count(*) as deleted
      `, { days: olderThanDays });

      return result.records[0].get('deleted').toInt();
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}