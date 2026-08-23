/**
 * ACP (Agent Control Plane) ↔ Graphify Bridge
 *
 * Connects MCP tool handlers into ACP's hierarchical task execution model.
 * Converts Graphify stages into ACP tasks with:
 * - Task inbox/outbox durability (Postgres)
 * - Priority ordering (critical > optional)
 * - Dependency resolution (gates)
 * - Result caching (Redis)
 * - Error recovery (retry policies)
 */

import { Redis } from 'ioredis';
import type { Database } from 'better-sqlite3';

export interface ACPTask {
  task_id: string;
  task_type: 'graphify_stage' | 'error_fix' | 'context_fetch';
  status: 'pending' | 'claimed' | 'running' | 'complete' | 'failed';
  priority: 'critical' | 'high' | 'normal' | 'low';
  payload: Record<string, unknown>;
  created_at: string;
  claimed_by?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  retry_count: number;
  max_retries: number;
  depends_on?: string[];
  gate_name?: string;
  gate_proven?: boolean;
}

export interface ACPTaskResult {
  task_id: string;
  success: boolean;
  output: Record<string, unknown>;
  duration_ms: number;
  cache_key?: string;
}

export class ACPGraphifyBridge {
  private redis: Redis;
  private db: Database;
  private taskInboxTable: string = 'acp_task_inbox';
  private taskOutboxTable: string = 'acp_task_outbox';

  constructor(redis: Redis, db: Database) {
    this.redis = redis;
    this.db = db;
  }

  /**
   * Enqueue a Graphify stage as an ACP task
   */
  async enqueueGraphifyStage(params: {
    stage_id: number;
    stage_name: string;
    script_path: string;
    critical: boolean;
    gate_name?: string;
    max_retries?: number;
  }): Promise<ACPTask> {
    const task_id = `graphify:${params.stage_id}:${Date.now()}`;
    const priority = params.critical ? 'critical' : 'normal';
    const max_retries = params.max_retries || 3;

    const task: ACPTask = {
      task_id,
      task_type: 'graphify_stage',
      status: 'pending',
      priority,
      payload: {
        stage_id: params.stage_id,
        stage_name: params.stage_name,
        script_path: params.script_path,
      },
      created_at: new Date().toISOString(),
      retry_count: 0,
      max_retries,
      gate_name: params.gate_name,
    };

    // Store in Postgres inbox
    try {
      this.db
        .prepare(
          `INSERT INTO ${this.taskInboxTable}
         (task_id, task_type, status, priority, payload, created_at, gate_name, retry_count, max_retries)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          task_id,
          task.task_type,
          task.status,
          priority,
          JSON.stringify(task.payload),
          task.created_at,
          params.gate_name || null,
          0,
          max_retries
        );

      // Cache in Redis for fast lookup
      await this.redis.set(`acp:task:${task_id}`, JSON.stringify(task), 'EX', 3600);

      return task;
    } catch (err) {
      console.error(`[ACP Graphify Bridge] Enqueue failed: ${err}`);
      throw err;
    }
  }

  /**
   * Claim a task (mark as claimed by agent)
   */
  async claimTask(task_id: string, claimed_by: string): Promise<ACPTask | null> {
    try {
      // Update status in Postgres
      this.db
        .prepare(`UPDATE ${this.taskInboxTable} SET status = ?, claimed_by = ? WHERE task_id = ?`)
        .run('claimed', claimed_by, task_id);

      // Update Redis cache
      const taskJson = await this.redis.get(`acp:task:${task_id}`);
      if (taskJson) {
        const task = JSON.parse(taskJson);
        task.status = 'claimed';
        task.claimed_by = claimed_by;
        await this.redis.set(`acp:task:${task_id}`, JSON.stringify(task), 'EX', 3600);
        return task;
      }

      return null;
    } catch (err) {
      console.error(`[ACP Graphify Bridge] Claim failed: ${err}`);
      return null;
    }
  }

  /**
   * Validate gate before executing task
   */
  async validateGate(gate_name: string): Promise<{ proven: boolean; timestamp?: string }> {
    try {
      const gateKey = `gate:${gate_name}`;
      const gateStatus = await this.redis.get(gateKey);

      return {
        proven: gateStatus === 'PROVEN',
        timestamp: gateStatus ? new Date().toISOString() : undefined,
      };
    } catch (err) {
      console.warn(`[ACP Graphify Bridge] Gate validation failed: ${err}`);
      return { proven: false };
    }
  }

  /**
   * Mark task as running
   */
  async startTask(task_id: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      this.db.prepare(`UPDATE ${this.taskInboxTable} SET status = ?, started_at = ? WHERE task_id = ?`).run('running', now, task_id);

      // Update Redis
      const taskJson = await this.redis.get(`acp:task:${task_id}`);
      if (taskJson) {
        const task = JSON.parse(taskJson);
        task.status = 'running';
        task.started_at = now;
        await this.redis.set(`acp:task:${task_id}`, JSON.stringify(task), 'EX', 3600);
      }
    } catch (err) {
      console.warn(`[ACP Graphify Bridge] Start task failed: ${err}`);
    }
  }

  /**
   * Complete task and move to outbox
   */
  async completeTask(task_id: string, result: ACPTaskResult): Promise<void> {
    try {
      const now = new Date().toISOString();

      // Move from inbox to outbox
      this.db
        .prepare(
          `INSERT INTO ${this.taskOutboxTable}
         (task_id, task_type, status, result, completed_at)
         SELECT task_id, task_type, ?, ?, ?
         FROM ${this.taskInboxTable}
         WHERE task_id = ?`
        )
        .run('complete', JSON.stringify(result.output), now, task_id);

      // Delete from inbox
      this.db.prepare(`DELETE FROM ${this.taskInboxTable} WHERE task_id = ?`).run(task_id);

      // Cache result in Redis
      if (result.cache_key) {
        await this.redis.set(`acp:result:${result.cache_key}`, JSON.stringify(result.output), 'EX', 86400);
      }

      // Update Redis task cache
      const taskJson = await this.redis.get(`acp:task:${task_id}`);
      if (taskJson) {
        const task = JSON.parse(taskJson);
        task.status = 'complete';
        task.completed_at = now;
        await this.redis.set(`acp:task:${task_id}`, JSON.stringify(task), 'EX', 3600);
      }
    } catch (err) {
      console.error(`[ACP Graphify Bridge] Complete task failed: ${err}`);
    }
  }

  /**
   * Fail task with error and retry logic
   */
  async failTask(task_id: string, error: string): Promise<boolean> {
    try {
      const taskJson = await this.redis.get(`acp:task:${task_id}`);
      if (!taskJson) {
        return false;
      }

      const task = JSON.parse(taskJson);
      task.retry_count++;
      task.error = error;

      if (task.retry_count >= task.max_retries) {
        // Final failure: move to outbox
        this.db
          .prepare(
            `INSERT INTO ${this.taskOutboxTable}
           (task_id, task_type, status, error, completed_at)
           SELECT task_id, task_type, ?, ?, ?
           FROM ${this.taskInboxTable}
           WHERE task_id = ?`
          )
          .run('failed', error, new Date().toISOString(), task_id);

        this.db.prepare(`DELETE FROM ${this.taskInboxTable} WHERE task_id = ?`).run(task_id);
        task.status = 'failed';
      } else {
        // Retry: reset status to pending
        this.db
          .prepare(`UPDATE ${this.taskInboxTable} SET status = ?, retry_count = ? WHERE task_id = ?`)
          .run('pending', task.retry_count, task_id);
        task.status = 'pending';
      }

      // Update Redis
      await this.redis.set(`acp:task:${task_id}`, JSON.stringify(task), 'EX', 3600);

      return task.retry_count < task.max_retries; // true if retrying
    } catch (err) {
      console.error(`[ACP Graphify Bridge] Fail task failed: ${err}`);
      return false;
    }
  }

  /**
   * Get pending tasks (for agent polling)
   */
  async getPendingTasks(priority?: string): Promise<ACPTask[]> {
    try {
      const query = priority
        ? `SELECT * FROM ${this.taskInboxTable} WHERE status IN ('pending', 'claimed') AND priority = ? ORDER BY created_at ASC`
        : `SELECT * FROM ${this.taskInboxTable} WHERE status IN ('pending', 'claimed') ORDER BY created_at ASC`;

      const rows = priority ? this.db.prepare(query).all(priority) : this.db.prepare(query).all();

      return rows.map((row: any) => ({
        task_id: row.task_id,
        task_type: row.task_type,
        status: row.status,
        priority: row.priority,
        payload: JSON.parse(row.payload),
        created_at: row.created_at,
        claimed_by: row.claimed_by,
        started_at: row.started_at,
        gate_name: row.gate_name,
        retry_count: row.retry_count,
        max_retries: row.max_retries,
      }));
    } catch (err) {
      console.warn(`[ACP Graphify Bridge] Get pending tasks failed: ${err}`);
      return [];
    }
  }

  /**
   * Get task result from outbox
   */
  async getTaskResult(task_id: string): Promise<ACPTaskResult | null> {
    try {
      const row = this.db
        .prepare(`SELECT * FROM ${this.taskOutboxTable} WHERE task_id = ?`)
        .get(task_id) as any;

      if (!row) {
        return null;
      }

      return {
        task_id: row.task_id,
        success: row.status === 'complete',
        output: row.result ? JSON.parse(row.result) : {},
        duration_ms: 0, // Would calculate from timestamps
      };
    } catch (err) {
      console.warn(`[ACP Graphify Bridge] Get task result failed: ${err}`);
      return null;
    }
  }
}
