import { Redis } from 'ioredis';
import crypto from 'crypto';

export interface ModelSnapshot {
  model_id: string;
  model_version: string;
  snapshot_date: string;
  row_count: number;
  schema_hash: string;
  records: Record<string, unknown>[];
}

export interface RedisExportConfig {
  redisClient: Redis;
  keyPrefix: string;
  ttlSeconds: number;
  compressionEnabled: boolean;
  batchSize: number;
}

export class SQLAlchemyToJsonRedis {
  private redis: Redis;
  private keyPrefix: string;
  private ttlSeconds: number;
  private compressionEnabled: boolean;
  private batchSize: number;

  constructor(config: RedisExportConfig) {
    this.redis = config.redisClient;
    this.keyPrefix = config.keyPrefix;
    this.ttlSeconds = config.ttlSeconds;
    this.compressionEnabled = config.compressionEnabled;
    this.batchSize = config.batchSize || 1000;
  }

  /**
   * Export SQLAlchemy model records to Redis as JSON
   * Batches writes to prevent overwhelming Redis memory
   */
  async exportToRedis(
    modelName: string,
    records: Record<string, unknown>[],
    modelVersion: string = '1.0'
  ): Promise<{ written: number; errors: number; totalSize: number }> {
    const startTime = Date.now();
    let written = 0;
    let errors = 0;
    let totalSize = 0;

    // Generate metadata
    const schemaHash = this.computeSchemaHash(records[0] || {});
    const snapshot: ModelSnapshot = {
      model_id: modelName,
      model_version: modelVersion,
      snapshot_date: new Date().toISOString(),
      row_count: records.length,
      schema_hash: schemaHash,
      records: [],
    };

    // Write metadata first
    const metadataKey = `${this.keyPrefix}:${modelName}:metadata`;
    const metadataJson = JSON.stringify({
      model_id: snapshot.model_id,
      model_version: snapshot.model_version,
      snapshot_date: snapshot.snapshot_date,
      row_count: snapshot.row_count,
      schema_hash: snapshot.schema_hash,
      exported_at_ms: Date.now(),
    });

    try {
      await this.redis.set(metadataKey, metadataJson, 'EX', this.ttlSeconds);
      totalSize += metadataJson.length;
    } catch (err) {
      console.warn(`[SQLAlchemyToJsonRedis] Metadata write failed: ${err}`);
      errors++;
    }

    // Batch write records
    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, Math.min(i + this.batchSize, records.length));
      const pipeline = this.redis.pipeline();

      for (const record of batch) {
        // Extract primary key or use index
        const pk = this.extractPrimaryKey(record, i);
        const key = `${this.keyPrefix}:${modelName}:${pk}`;

        try {
          const json = JSON.stringify(record);
          totalSize += json.length;

          // Store in Redis with TTL
          pipeline.set(key, json, 'EX', this.ttlSeconds);
          written++;
        } catch (err) {
          console.warn(`[SQLAlchemyToJsonRedis] Record serialization failed: ${err}`);
          errors++;
        }
      }

      // Execute batch
      try {
        await pipeline.exec();
      } catch (err) {
        console.warn(`[SQLAlchemyToJsonRedis] Batch execution failed: ${err}`);
        errors += batch.length;
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[SQLAlchemyToJsonRedis] Export complete: ${written} written, ${errors} errors, ${totalSize} bytes in ${duration}ms`
    );

    return { written, errors, totalSize };
  }

  /**
   * Load records from Redis back to memory
   * Useful for recovery or inspection
   */
  async loadFromRedis(modelName: string, limit?: number): Promise<Record<string, unknown>[]> {
    try {
      const pattern = `${this.keyPrefix}:${modelName}:*`;
      const keys = await this.redis.keys(pattern);

      // Filter out metadata key
      const dataKeys = keys.filter((k) => !k.includes(':metadata'));
      const limitedKeys = limit ? dataKeys.slice(0, limit) : dataKeys;

      const results: Record<string, unknown>[] = [];

      for (const key of limitedKeys) {
        try {
          const json = await this.redis.get(key);
          if (json) {
            results.push(JSON.parse(json));
          }
        } catch (err) {
          console.warn(`[SQLAlchemyToJsonRedis] Record load failed for ${key}: ${err}`);
        }
      }

      return results;
    } catch (err) {
      console.error(`[SQLAlchemyToJsonRedis] Load failed: ${err}`);
      return [];
    }
  }

  /**
   * Invalidate all records for a model
   */
  async invalidateModel(modelName: string): Promise<number> {
    try {
      const pattern = `${this.keyPrefix}:${modelName}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }

      const results = await pipeline.exec();
      const deleted = results?.filter((r) => r && typeof r === 'number').length || 0;

      console.log(`[SQLAlchemyToJsonRedis] Invalidated ${deleted} keys for model ${modelName}`);
      return deleted;
    } catch (err) {
      console.warn(`[SQLAlchemyToJsonRedis] Invalidation failed: ${err}`);
      return 0;
    }
  }

  /**
   * Get metadata for a model snapshot
   */
  async getMetadata(modelName: string): Promise<ModelSnapshot | null> {
    try {
      const metadataKey = `${this.keyPrefix}:${modelName}:metadata`;
      const json = await this.redis.get(metadataKey);

      if (!json) {
        return null;
      }

      const parsed = JSON.parse(json);
      return {
        model_id: parsed.model_id,
        model_version: parsed.model_version,
        snapshot_date: parsed.snapshot_date,
        row_count: parsed.row_count,
        schema_hash: parsed.schema_hash,
        records: [],
      };
    } catch (err) {
      console.warn(`[SQLAlchemyToJsonRedis] Metadata retrieval failed: ${err}`);
      return null;
    }
  }

  /**
   * Compute schema hash for drift detection
   */
  private computeSchemaHash(sample: Record<string, unknown>): string {
    const keys = Object.keys(sample || {})
      .sort()
      .join('|');
    return crypto.createHash('sha256').update(keys).digest('hex').slice(0, 16);
  }

  /**
   * Extract primary key from record or generate from index
   */
  private extractPrimaryKey(record: Record<string, unknown>, index: number): string {
    // Try common PK field names
    const pkCandidates = ['id', 'pk', 'primary_key', 'packet_key', 'key', 'uid', 'uuid'];

    for (const candidate of pkCandidates) {
      if (record[candidate] !== undefined && record[candidate] !== null) {
        return String(record[candidate]);
      }
    }

    // Fallback to index
    return `row_${index}`;
  }
}
