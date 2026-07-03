import type { Pool } from 'pg';

export interface WorkerLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  event: string;
  duration_ms?: number;
  chunk_id?: string;
  message?: string;
  error?: string;
}

export interface WorkerMetrics {
  total_processed: number;
  total_errors: number;
  avg_duration_ms: number;
  throughput_per_min: number;
  cache_hits: number;
  cache_misses: number;
  uptime_seconds: number;
}

export class WorkerLogger {
  private logs: WorkerLogEntry[] = [];
  private durations: number[] = [];
  private startTime = Date.now();
  private tableName = 'worker_activity_log';

  constructor(
    private pgPool: Pool,
    private workerName: string
  ) {}

  log(
    level: 'info' | 'warn' | 'error' | 'debug',
    event: string,
    options?: {
      duration_ms?: number;
      chunk_id?: string;
      message?: string;
      error?: string;
    }
  ) {
    const entry: WorkerLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...options,
    };

    this.logs.push(entry);

    // Track durations for throughput metrics
    if (options?.duration_ms) {
      this.durations.push(options.duration_ms);
    }

    // Console output with colors
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const msg = `${prefix} ${event}`;

    if (level === 'error' && options?.error) {
      console.error(`${msg}: ${options.error}`);
    } else if (level === 'warn') {
      console.warn(msg);
    } else {
      console.log(msg);
    }
  }

  async persist() {
    if (this.logs.length === 0) return;

    try {
      // Create table if it doesn't exist
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id SERIAL PRIMARY KEY,
          worker_name VARCHAR(255),
          timestamp TIMESTAMP,
          level VARCHAR(20),
          event VARCHAR(500),
          duration_ms INTEGER,
          chunk_id VARCHAR(255),
          message TEXT,
          error TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Insert logs
      for (const log of this.logs) {
        await this.pgPool.query(
          `INSERT INTO ${this.tableName} (worker_name, timestamp, level, event, duration_ms, chunk_id, message, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            this.workerName,
            log.timestamp,
            log.level,
            log.event,
            log.duration_ms || null,
            log.chunk_id || null,
            log.message || null,
            log.error || null,
          ]
        );
      }

      // Clear in-memory logs after persisting
      this.logs = [];
    } catch (err) {
      console.error('Failed to persist logs:', err);
    }
  }

  getMetrics(): WorkerMetrics {
    const uptime = (Date.now() - this.startTime) / 1000;
    const avgDuration = this.durations.length > 0 ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length : 0;

    return {
      total_processed: this.logs.filter((l) => l.event === 'chunk_processed').length,
      total_errors: this.logs.filter((l) => l.level === 'error').length,
      avg_duration_ms: Math.round(avgDuration),
      throughput_per_min: this.calculateThroughput(uptime),
      cache_hits: this.logs.filter((l) => l.event === 'cache_hit').length,
      cache_misses: this.logs.filter((l) => l.event === 'cache_miss').length,
      uptime_seconds: Math.round(uptime),
    };
  }

  private calculateThroughput(uptime: number): number {
    const processed = this.logs.filter((l) => l.event === 'chunk_processed').length;
    return uptime > 0 ? (processed / uptime) * 60 : 0;
  }
}
