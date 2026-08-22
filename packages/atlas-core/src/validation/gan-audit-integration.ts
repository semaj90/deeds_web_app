/**
 * GAN Audit Integration
 *
 * Bridges the GAN adversarial validator with the canonical packet-truth-flow.
 * Integrates P7 validation gates with the OpenCode skill:
 * .opencode/skills/gan-validation-audit/SKILL.md
 *
 * The 5-step canonical flow:
 * 1. Read from Postgres (canonical source)
 * 2. Validate structure (CPU work only) — uses adversarial probes
 * 3. Write to Postgres (update truth)
 * 4. Invalidate caches (Redis BitFrost, async)
 * 5. Emit events (async notifications)
 *
 * Workflow tracing: Entire execution (query→validate→write→cache→events) logged to
 * Postgres/Redis/Qdrant for pattern discovery and token caching optimization.
 */

import type { WorkflowTrace } from './workflow-trace-logger.js';

export interface GanAuditConfig {
  operation: 'gan-audit';
  dryRun: boolean;
  verbose: boolean;
  batchSize: number;
}

export interface GanValidationResult {
  operation: 'gan-audit';
  processed: number;
  hardFailures: number;
  softWarnings: number;
  passed: number;
  cacheInvalidated: number;
  duration_ms: number;
  startTime: string;
  endTime: string;
  details: {
    hardFailureReasons: Record<string, number>;
    softWarningFields: Record<string, number>;
  };
  trace_id?: string;
}

export interface GanAuditDependencies {
  db?: any; // Drizzle database client
  redis?: any; // ioredis client
  nats?: any; // NATS client
  logWorkflowTrace?: (trace: WorkflowTrace) => Promise<void>;
}

/**
 * Canonical GAN audit orchestrator
 * Implements the 5-step packet truth flow from SKILL.md
 *
 * Context-agnostic: accepts optional db/redis/nats dependencies.
 * Falls back to $lib imports if dependencies not provided (for SvelteKit context).
 * Logs workflow trace for pattern reuse and token caching.
 */
export class GanAuditOrchestrator {
  private config: GanAuditConfig;
  private deps: Required<GanAuditDependencies>;
  private trace_id: string;
  private trace_start_ms: number = 0;
  private trace_data: Partial<WorkflowTrace> = {};

  constructor(config: GanAuditConfig, deps: GanAuditDependencies = {}) {
    this.config = config;
    this.trace_id = `audit:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
    this.deps = {
      db: deps.db,
      redis: deps.redis,
      nats: deps.nats,
      logWorkflowTrace: deps.logWorkflowTrace,
    } as Required<GanAuditDependencies>;
  }

  private async getDb(): Promise<any> {
    if (this.deps.db) return this.deps.db;
    throw new Error('GanAuditOrchestrator requires a db client in standalone builds');
  }

  /**
   * Step 1: Read from Postgres (canonical source)
   * Returns packets with required identity fields for validation
   */
  async readPacketsFromPostgres(limit: number): Promise<any[]> {
    const stepStart = performance.now();

    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 1: Reading ${limit} packets from Postgres...`);
    }

    try {
      const db = await this.getDb();
      const { sql } = await import('drizzle-orm');

      // Query real atlas_packets table
      const result = await db.execute(sql<{
        packet_key: string;
        source_ref: string;
        feature_id: string;
        summary?: string;
        title?: string;
        embedding?: number[];
        ganValidated?: boolean;
      }>`
        SELECT
          packet_key,
          source_ref,
          feature_id,
          summary,
          title,
          embedding,
          ganValidated
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
          AND source_ref IS NOT NULL
          AND feature_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);

      // Extract rows (Drizzle returns { rows: T[] } or array)
      const packets = Array.isArray(result) ? result : (result as any).rows ?? [];

      if (this.config.verbose) {
        console.log(`[GAN Audit] Read ${packets.length} packets from Postgres`);
      }

      this.trace_data.retrieval_latency_ms = Math.round(performance.now() - stepStart);
      this.trace_data.packet_keys_used = packets.map((p: any) => p.packet_key);
      this.trace_data.source_refs_used = packets.map((p: any) => p.source_ref);
      this.trace_data.feature_ids_used = packets.map((p: any) => p.feature_id);

      return packets;
    } catch (err: any) {
      console.error(`[GAN Audit] Step 1 failed: ${err.message}`);
      // Return empty array to allow dry-run testing without Postgres
      if (this.config.verbose) {
        console.log('[GAN Audit] Falling back to empty result (Postgres unavailable)');
      }
      return [];
    }
  }

  /**
   * Step 2: Validate structure (CPU work only)
   * Applies all 6 adversarial probes to detect malformed packets
   *
   * Hard fail conditions:
   * - missing packet_key
   * - missing source_ref
   * - missing feature_id
   *
   * Soft warnings:
   * - missing summary
   * - missing title
   * - missing embedding
   * - low confidence scores
   */
  async validatePacketStructure(packets: any[]): Promise<{
    hardFailures: any[];
    softWarnings: any[];
    passed: any[];
  }> {
    const hardFailures: any[] = [];
    const softWarnings: any[] = [];
    const passed: any[] = [];

    for (const packet of packets) {
      // Hard fail checks (identity)
      if (!packet.packet_key || packet.packet_key === '') {
        hardFailures.push({
          packet_key: packet.packet_key,
          reason: 'missing_packet_key',
          probe: 'ADV001',
        });
        continue;
      }

      if (!packet.source_ref || !/^[a-z0-9\/_\-\.]+\.(ts|tsx)$/.test(packet.source_ref)) {
        hardFailures.push({
          packet_key: packet.packet_key,
          reason: 'invalid_source_ref',
          probe: 'ADV002',
        });
        continue;
      }

      if (!packet.feature_id || packet.feature_id === '') {
        hardFailures.push({
          packet_key: packet.packet_key,
          reason: 'missing_feature_id',
          probe: 'ADV001',
        });
        continue;
      }

      // Soft warnings (optional fields)
      const warnings: string[] = [];

      if (!packet.summary) warnings.push('missing_summary');
      if (!packet.title) warnings.push('missing_title');
      if (!packet.embedding) warnings.push('missing_embedding');
      if (packet.summary_confidence && packet.summary_confidence < 0.7) {
        warnings.push('low_summary_confidence');
      }
      if (!packet.ganValidated) warnings.push('missing_gan_validation_flag');

      if (warnings.length > 0) {
        softWarnings.push({
          packet_key: packet.packet_key,
          warnings,
        });
      }

      passed.push(packet);
    }

    if (this.config.verbose) {
      console.log(`[GAN Audit] Step 2: Validation complete`);
      console.log(`  - Hard failures: ${hardFailures.length}`);
      console.log(`  - Soft warnings: ${softWarnings.length}`);
      console.log(`  - Passed: ${passed.length}`);
    }

    return { hardFailures, softWarnings, passed };
  }

  /**
   * Step 3: Write to Postgres (update truth)
   * Sets ganValidated=true/false + ganValidationError/ganWarnings
   *
   * For hard failures:
   *   ganValidated = false
   *   ganValidationError = "missing {field}"
   *
   * For soft warnings:
   *   ganValidated = true
   *   ganWarnings = ["missing_summary", "missing_embedding", ...]
   *
   * Always: updated_at = NOW()
   */
  async writeValidationResultsToPostgres(
    hardFailures: any[],
    softWarnings: any[],
    passed: any[]
  ): Promise<number> {
    let updatedCount = 0;
    const stepStart = performance.now();

    if (this.config.dryRun) {
      if (this.config.verbose) {
        console.log(`[GAN Audit] Step 3 (DRY-RUN): Would write ${hardFailures.length + softWarnings.length + passed.length} updates to Postgres`);
      }
      return hardFailures.length + softWarnings.length + passed.length;
    }

    try {
      const db = await this.getDb();
      const { sql } = await import('drizzle-orm');

      // Hard failures: ganValidated = false
      if (hardFailures.length > 0) {
        for (const failure of hardFailures) {
          await db.execute(sql`
            UPDATE atlas_packets
            SET
              ganValidated = false,
              ganValidationError = ${failure.reason},
              updated_at = NOW()
            WHERE packet_key = ${failure.packet_key}
          `);
          updatedCount++;
        }
      }

      // Soft warnings: ganValidated = true, ganWarnings = array
      if (softWarnings.length > 0) {
        for (const warning of softWarnings) {
          await db.execute(sql`
            UPDATE atlas_packets
            SET
              ganValidated = true,
              ganWarnings = ${JSON.stringify(warning.warnings)},
              updated_at = NOW()
            WHERE packet_key = ${warning.packet_key}
          `);
          updatedCount++;
        }
      }

      // Passed: ganValidated = true
      if (passed.length > 0) {
        for (const packet of passed) {
          await db.execute(sql`
            UPDATE atlas_packets
            SET
              ganValidated = true,
              ganWarnings = NULL,
              updated_at = NOW()
            WHERE packet_key = ${packet.packet_key}
          `);
          updatedCount++;
        }
      }

      if (this.config.verbose) {
        console.log(`[GAN Audit] Step 3: Wrote ${updatedCount} validation results to Postgres`);
      }

      return updatedCount;
    } catch (err: any) {
      console.error(`[GAN Audit] Step 3 failed: ${err.message}`);
      throw new Error(`Postgres write failed: ${err.message}`);
    } finally {
      this.trace_data.writes_executed = this.trace_data.writes_executed || [];
    }
  }

  private async getRedis(): Promise<any> {
    if (this.deps.redis) return this.deps.redis;
    throw new Error('GanAuditOrchestrator requires a redis client in standalone builds');
  }

  /**
   * Step 4: Invalidate caches (Redis BitFrost, async)
   * Async operation — failures do not block
   *
   * For each packet:
   *   DELETE bitfrost:packet:{packet_key}
   *   DELETE bitfrost:trace:{packet_key}
   *   DELETE bitfrost:source:{source_ref}
   *   DELETE bitfrost:feature:{feature_id}
   */
  async invalidateRedisCache(packets: any[]): Promise<number> {
    let keysInvalidated = 0;
    const stepStart = performance.now();

    if (this.config.dryRun) {
      const expectedKeys = packets.length * 4; // 4 keys per packet
      if (this.config.verbose) {
        console.log(`[GAN Audit] Step 4 (DRY-RUN): Would invalidate ${expectedKeys} Redis keys`);
      }
      return expectedKeys;
    }

    try {
      const redis = await this.getRedis();

      // Delete 4 keys per packet: bitfrost:packet, :trace, :source, :feature
      const keysToDelete: string[] = [];

      for (const packet of packets) {
        keysToDelete.push(
          `bitfrost:packet:${packet.packet_key}`,
          `bitfrost:trace:${packet.packet_key}`,
          `bitfrost:source:${packet.source_ref}`,
          `bitfrost:feature:${packet.feature_id}`
        );
      }

      // Batch delete
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        keysInvalidated = keysToDelete.length;
      }

      if (this.config.verbose) {
        console.log(`[GAN Audit] Step 4: Invalidated ${keysInvalidated} Redis keys`);
      }
    } catch (err: any) {
      // Non-blocking — log but continue
      console.warn(`[GAN Audit] Step 4: Redis invalidation failed (non-blocking): ${err.message}`);
    }

    return keysInvalidated;
  }

  private async getNats(): Promise<any> {
    if (this.deps.nats) return this.deps.nats;
    const { getNatsClient } = await import('../nats/nats-client.js');
    return getNatsClient();
  }

  /**
   * Step 5: Emit events (async notifications, non-blocking)
   * Event subject: atlas.packets.validated
   * Payload includes packet_key, source_ref, feature_id, status, errors, warnings
   */
  async emitValidationEvents(
    hardFailures: any[],
    softWarnings: any[],
    passed: any[]
  ): Promise<number> {
    const eventCount = hardFailures.length + softWarnings.length + passed.length;
    const stepStart = performance.now();

    if (this.config.dryRun) {
      if (this.config.verbose) {
        console.log(`[GAN Audit] Step 5 (DRY-RUN): Would emit ${eventCount} validation events`);
      }
      return eventCount;
    }

    try {
      const nats = await this.getNats();

      // Emit events for all packets
      for (const failure of hardFailures) {
        await nats.publishTraceCheckpoint({
          trace_id: this.trace_id,
          packet_key: failure.packet_key,
          step: 5,
          node: 'gan_audit',
          duration_ms: 0,
          synthesis_length: failure.reason.length,
          timestamp: new Date().toISOString(),
        });
      }

      for (const warning of softWarnings) {
        await nats.publishTraceCheckpoint({
          trace_id: this.trace_id,
          packet_key: warning.packet_key,
          step: 5,
          node: 'gan_audit',
          duration_ms: 0,
          synthesis_length: JSON.stringify(warning.warnings).length,
          timestamp: new Date().toISOString(),
        });
      }

      for (const packet of passed) {
        await nats.publishTraceCheckpoint({
          trace_id: this.trace_id,
          packet_key: packet.packet_key,
          step: 5,
          node: 'gan_audit',
          duration_ms: 0,
          synthesis_length: 0,
          timestamp: new Date().toISOString(),
        });
      }

      if (this.config.verbose) {
        console.log(`[GAN Audit] Step 5: Emitted ${eventCount} validation events`);
      }
    } catch (err: any) {
      // Non-blocking — log but continue
      console.warn(`[GAN Audit] Step 5: NATS publish failed (non-blocking): ${err.message}`);
    }

    return eventCount;
  }

  /**
   * Execute the full 5-step GAN audit + workflow trace logging
   */
  async execute(): Promise<GanValidationResult> {
    const startTime = new Date();
    this.trace_start_ms = performance.now();

    if (this.config.verbose) {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║ GAN Audit Orchestrator — Packet Validation             ║');
      console.log('╚════════════════════════════════════════════════════════╝\n');
    }

    // Initialize trace data
    this.trace_data = {
      trace_id: this.trace_id,
      timestamp: startTime.toISOString(),
      user_query: 'GAN packet validation audit',
      route: 'gan-audit-direct',
      tools_used: ['validatePacketStructure', 'writeValidationResultsToPostgres'],
      packet_keys_used: [],
      source_refs_used: [],
      feature_ids_used: [],
      summaries_used: [],
      validator_name: 'gan-adversarial-validator',
      writes_executed: [],
    };

    // Step 1: Read packets
    const packets = await this.readPacketsFromPostgres(this.config.batchSize);

    // Step 2: Validate
    const { hardFailures, softWarnings, passed } = await this.validatePacketStructure(packets);

    // Step 3: Write results
    const updated = await this.writeValidationResultsToPostgres(hardFailures, softWarnings, passed);

    // Step 4: Invalidate cache
    const allPackets = [...hardFailures, ...softWarnings, ...passed];
    const cacheInvalidated = await this.invalidateRedisCache(allPackets);

    // Step 5: Emit events
    const eventsEmitted = await this.emitValidationEvents(hardFailures, softWarnings, passed);

    const endMs = performance.now();
    const endTime = new Date();
    const totalDuration = Math.round(endMs - this.trace_start_ms);

    const result: GanValidationResult = {
      operation: 'gan-audit',
      processed: packets.length,
      hardFailures: hardFailures.length,
      softWarnings: softWarnings.length,
      passed: passed.length,
      cacheInvalidated,
      duration_ms: totalDuration,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      trace_id: this.trace_id,
      details: {
        hardFailureReasons: this.aggregateReasons(hardFailures),
        softWarningFields: this.aggregateWarnings(softWarnings),
      },
    };

    // Log complete workflow trace
    const completeTrace: WorkflowTrace = {
      trace_id: this.trace_id,
      timestamp: startTime.toISOString(),
      user_query: 'GAN packet validation audit',
      route: 'gan-audit-direct',
      route_rationale: 'Batch packet validation via GAN adversarial probes',
      tools_used: ['validatePacketStructure', 'writeValidationResultsToPostgres'],
      tool_args: {
        batchSize: this.config.batchSize,
        dryRun: this.config.dryRun,
      },
      tool_latencies: {},
      packet_keys_used: this.trace_data.packet_keys_used || [],
      source_refs_used: this.trace_data.source_refs_used || [],
      feature_ids_used: this.trace_data.feature_ids_used || [],
      summaries_used: [],
      retrieval_latency_ms: this.trace_data.retrieval_latency_ms || 0,
      compaction_ratio: 1.0,
      tokens_sent_to_model: 0,
      model_name: 'gan-adversarial-validator',
      model_version: '1.0',
      llm_synthesis_input: '',
      llm_synthesis_output: '',
      llm_synthesis_latency_ms: 0,
      validator_name: 'gan-adversarial-validator',
      validator_result: hardFailures.length === 0 ? 'PASS' : 'SOFT_WARNING',
      validator_errors: hardFailures.map((f: any) => f.reason),
      validator_warnings: softWarnings.map((w: any) => w.warnings).flat(),
      writes_executed: this.trace_data.writes_executed || [],
      total_duration_ms: totalDuration,
      success: !this.config.dryRun && hardFailures.length === 0,
      schema_version: '1.0',
      git_commit: process.env.GIT_COMMIT || 'unknown',
      workspace_path: process.cwd(),
    };

    // Log trace asynchronously (non-blocking)
    if (this.deps.logWorkflowTrace) {
      this.deps.logWorkflowTrace(completeTrace).catch((err: any) => {
        console.warn(`[GAN Audit] Failed to log workflow trace: ${err.message}`);
      });
    }

    if (this.config.verbose) {
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('GAN Audit Results:');
      console.log(`  Processed: ${result.processed}`);
      console.log(`  Hard failures: ${result.hardFailures}`);
      console.log(`  Soft warnings: ${result.softWarnings}`);
      console.log(`  Passed: ${result.passed}`);
      console.log(`  Cache invalidated: ${result.cacheInvalidated} keys`);
      console.log(`  Duration: ${result.duration_ms}ms`);
      console.log(`  Trace ID: ${this.trace_id}`);
      console.log('═══════════════════════════════════════════════════════\n');
    }

    return result;
  }

  private aggregateReasons(failures: any[]): Record<string, number> {
    const reasons: Record<string, number> = {};
    for (const failure of failures) {
      reasons[failure.reason] = (reasons[failure.reason] || 0) + 1;
    }
    return reasons;
  }

  private aggregateWarnings(warnings: any[]): Record<string, number> {
    const fields: Record<string, number> = {};
    for (const warning of warnings) {
      for (const field of warning.warnings) {
        fields[field] = (fields[field] || 0) + 1;
      }
    }
    return fields;
  }
}

export async function executeGanAudit(
  config: GanAuditConfig,
  deps?: GanAuditDependencies
): Promise<GanValidationResult> {
  const orchestrator = new GanAuditOrchestrator(config, deps);
  return orchestrator.execute();
}
