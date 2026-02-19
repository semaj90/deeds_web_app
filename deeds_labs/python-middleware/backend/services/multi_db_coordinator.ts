/**
 * ═══════════════════════════════════════════════════════════════════════
 * Agentic Knowledge Integration V2 - Multi-Database Coordinator (TypeScript)
 * ═══════════════════════════════════════════════════════════════════════
 * Date: January 2, 2026
 * Purpose: Atomic transaction management across 6 databases
 * ═══════════════════════════════════════════════════════════════════════
 */

import { Pool } from 'pg';
import { createClient as createRedisClient } from 'redis';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';

export enum TransactionStatus {
  PENDING = 'pending',
  COMMITTED = 'committed',
  ROLLED_BACK = 'rolled_back',
  FAILED = 'failed',
}

export enum DatabaseType {
  POSTGRESQL = 'postgresql',
  NEO4J = 'neo4j',
  QDRANT = 'qdrant',
  COUCHDB = 'couchdb',
  REDIS = 'redis',
  MINIO = 'minio',
}

export interface DBOperation<T = any, R = any> {
  database: DatabaseType;
  operationType: 'insert' | 'update' | 'delete';
  executeFn: (payload: T) => Promise<R>;
  rollbackFn: (payload: T, result?: R) => Promise<void>;
  payload: T;
  executed?: boolean;
  result?: R;
  error?: string;
}

export interface Transaction {
  id: string;
  operations: DBOperation[];
  status: TransactionStatus;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface TransactionStats {
  totalTransactions: number;
  committed: number;
  rolledBack: number;
  failed: number;
  pending: number;
  successRate: number;
}

export interface MultiDBCoordinatorConfig {
  postgresUrl?: string;
  neo4jUrl?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  qdrantUrl?: string;
  couchdbUrl?: string;
  redisUrl?: string;
}

export class MultiDBCoordinator {
  private pgPool: Pool;
  private neo4jDriver: neo4j.Driver;
  private qdrantClient: QdrantClient;
  private redisClient: ReturnType<typeof createRedisClient>;
  private transactions: Map<string, Transaction> = new Map();
  private connected: boolean = false;

  constructor(config: MultiDBCoordinatorConfig = {}) {
    // PostgreSQL
    this.pgPool = new Pool({
      connectionString:
        config.postgresUrl ||
        process.env.DATABASE_URL ||
        'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
    });

    // Neo4j
    const neo4jUrl = config.neo4jUrl || process.env.NEO4J_URL || 'bolt://localhost:7687';
    const neo4jUser = config.neo4jUser || process.env.NEO4J_USER || 'neo4j';
    const neo4jPassword = config.neo4jPassword || process.env.NEO4J_PASSWORD || 'password';
    this.neo4jDriver = neo4j.driver(neo4jUrl, neo4j.auth.basic(neo4jUser, neo4jPassword));

    // Qdrant
    const qdrantUrl = config.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333';
    this.qdrantClient = new QdrantClient({ url: qdrantUrl });

    // Redis
    const redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redisClient = createRedisClient({ url: redisUrl });

    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }

  async connect(): Promise<void> {
    try {
      // Test PostgreSQL
      await this.pgPool.query('SELECT 1');
      console.log('✅ PostgreSQL connected');

      // Test Neo4j
      await this.neo4jDriver.verifyConnectivity();
      console.log('✅ Neo4j connected');

      // Test Qdrant
      await this.qdrantClient.getCollections();
      console.log('✅ Qdrant connected');

      // Connect Redis
      await this.redisClient.connect();
      console.log('✅ Redis connected');

      this.connected = true;
      console.log('🎉 All databases connected successfully!');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pgPool.end();
      await this.neo4jDriver.close();
      await this.redisClient.quit();
      this.connected = false;
      console.log('✅ All databases disconnected');
    } catch (error) {
      console.error('❌ Disconnect error:', error);
    }
  }

  createTransaction(): Transaction {
    const transaction: Transaction = {
      id: uuidv4(),
      operations: [],
      status: TransactionStatus.PENDING,
      createdAt: new Date(),
    };

    this.transactions.set(transaction.id, transaction);
    console.log(`📝 Created transaction: ${transaction.id}`);
    return transaction;
  }

  addOperation<T = any, R = any>(
    transaction: Transaction,
    database: DatabaseType,
    operationType: 'insert' | 'update' | 'delete',
    executeFn: (payload: T) => Promise<R>,
    rollbackFn: (payload: T, result?: R) => Promise<void>,
    payload: T
  ): void {
    const operation: DBOperation<T, R> = {
      database,
      operationType,
      executeFn,
      rollbackFn,
      payload,
      executed: false,
    };

    transaction.operations.push(operation);
    console.log(
      `➕ Added ${database} ${operationType} operation to transaction ${transaction.id}`
    );
  }

  async executeTransaction(transaction: Transaction): Promise<boolean> {
    console.log(
      `🚀 Executing transaction ${transaction.id} with ${transaction.operations.length} operations`
    );

    // Log transaction start
    await this.logTransactionStart(transaction);

    const executedOperations: DBOperation[] = [];

    try {
      // Execute all operations
      for (const operation of transaction.operations) {
        console.log(`   ⚙️  Executing ${operation.database} ${operation.operationType}...`);

        try {
          const result = await operation.executeFn(operation.payload);
          operation.executed = true;
          operation.result = result;
          executedOperations.push(operation);
          console.log(`   ✅ ${operation.database} operation succeeded`);
        } catch (error) {
          operation.error = error instanceof Error ? error.message : String(error);
          console.error(`   ❌ ${operation.database} operation failed:`, error);
          throw error;
        }
      }

      // All operations succeeded
      transaction.status = TransactionStatus.COMMITTED;
      transaction.completedAt = new Date();

      // Log transaction commit
      await this.logTransactionCommit(transaction);

      console.log(`✅ Transaction ${transaction.id} committed successfully!`);
      return true;
    } catch (error) {
      // Rollback all executed operations
      console.error(`❌ Transaction ${transaction.id} failed:`, error);
      transaction.status = TransactionStatus.FAILED;
      transaction.errorMessage = error instanceof Error ? error.message : String(error);
      transaction.completedAt = new Date();

      await this.rollbackOperations(executedOperations, transaction);

      // Log transaction rollback
      await this.logTransactionRollback(transaction);

      return false;
    }
  }

  private async rollbackOperations(
    operations: DBOperation[],
    transaction: Transaction
  ): Promise<void> {
    console.warn(`🔄 Rolling back ${operations.length} operations...`);

    // Rollback in reverse order
    for (const operation of operations.reverse()) {
      if (operation.executed) {
        try {
          console.log(`   ↩️  Rolling back ${operation.database}...`);
          await operation.rollbackFn(operation.payload, operation.result);
          console.log(`   ✅ ${operation.database} rollback succeeded`);
        } catch (error) {
          console.error(`   ❌ ${operation.database} rollback failed:`, error);
          // Continue rolling back other operations
        }
      }
    }

    transaction.status = TransactionStatus.ROLLED_BACK;
    console.log(`✅ Transaction ${transaction.id} rolled back`);
  }

  private async logTransactionStart(transaction: Transaction): Promise<void> {
    try {
      await this.pgPool.query(
        `
        INSERT INTO multi_db_transactions (id, operation, status, databases, created_at)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          transaction.id,
          'multi_db_transaction',
          transaction.status,
          transaction.operations.map((op) => op.database),
          transaction.createdAt,
        ]
      );
    } catch (error) {
      console.error('Failed to log transaction start:', error);
    }
  }

  private async logTransactionCommit(transaction: Transaction): Promise<void> {
    try {
      await this.pgPool.query(
        `
        UPDATE multi_db_transactions
        SET status = $1, completed_at = $2
        WHERE id = $3
        `,
        [transaction.status, transaction.completedAt, transaction.id]
      );
    } catch (error) {
      console.error('Failed to log transaction commit:', error);
    }
  }

  private async logTransactionRollback(transaction: Transaction): Promise<void> {
    try {
      await this.pgPool.query(
        `
        UPDATE multi_db_transactions
        SET status = $1, completed_at = $2, error_message = $3
        WHERE id = $4
        `,
        [transaction.status, transaction.completedAt, transaction.errorMessage, transaction.id]
      );
    } catch (error) {
      console.error('Failed to log transaction rollback:', error);
    }
  }

  getTransactionStats(): TransactionStats {
    const transactions = Array.from(this.transactions.values());
    const total = transactions.length;
    const committed = transactions.filter((t) => t.status === TransactionStatus.COMMITTED).length;
    const rolledBack = transactions.filter(
      (t) => t.status === TransactionStatus.ROLLED_BACK
    ).length;
    const failed = transactions.filter((t) => t.status === TransactionStatus.FAILED).length;
    const pending = transactions.filter((t) => t.status === TransactionStatus.PENDING).length;

    return {
      totalTransactions: total,
      committed,
      rolledBack,
      failed,
      pending,
      successRate: total > 0 ? Math.round((committed / total) * 10000) / 100 : 0,
    };
  }

  getTransaction(id: string): Transaction | undefined {
    return this.transactions.get(id);
  }

  // Convenience methods for common operations

  async insertEnhancedTag(tagData: {
    id: string;
    name: string;
    category: string;
    filePath: string;
    embedding: number[];
    summary?: string;
  }): Promise<boolean> {
    const transaction = this.createTransaction();

    // PostgreSQL operation
    this.addOperation(
      transaction,
      DatabaseType.POSTGRESQL,
      'insert',
      async (payload) => {
        const result = await this.pgPool.query(
          `
          INSERT INTO enhanced_tags (id, name, category, file_path, summary, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
          `,
          [payload.id, payload.name, payload.category, payload.filePath, payload.summary, new Date()]
        );
        return result.rows[0].id;
      },
      async (payload, result) => {
        await this.pgPool.query('DELETE FROM enhanced_tags WHERE id = $1', [result]);
      },
      tagData
    );

    // Qdrant operation
    this.addOperation(
      transaction,
      DatabaseType.QDRANT,
      'insert',
      async (payload) => {
        await this.qdrantClient.upsert('knowledge_base_v2', {
          points: [
            {
              id: payload.id,
              vector: payload.embedding,
              payload: {
                tag_id: payload.id,
                name: payload.name,
                category: payload.category,
                file_path: payload.filePath,
                summary: payload.summary,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });
        return payload.id;
      },
      async (payload, result) => {
        await this.qdrantClient.delete('knowledge_base_v2', {
          points: [result],
        });
      },
      tagData
    );

    return await this.executeTransaction(transaction);
  }
}

// Singleton instance
let coordinatorInstance: MultiDBCoordinator | null = null;

export function getMultiDBCoordinator(config?: MultiDBCoordinatorConfig): MultiDBCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new MultiDBCoordinator(config);
  }
  return coordinatorInstance;
}

// Example usage
export async function exampleUsage() {
  const coordinator = getMultiDBCoordinator();
  await coordinator.connect();

  // Insert an enhanced tag across PostgreSQL and Qdrant
  const success = await coordinator.insertEnhancedTag({
    id: uuidv4(),
    name: 'TestComponent',
    category: 'component',
    filePath: '/src/components/TestComponent.svelte',
    embedding: new Array(384).fill(0.1),
    summary: 'A test component for demonstration',
  });

  console.log('Transaction result:', success ? '✅ Success' : '❌ Failed');

  // Get statistics
  const stats = coordinator.getTransactionStats();
  console.log('Transaction stats:', stats);

  await coordinator.disconnect();
}
