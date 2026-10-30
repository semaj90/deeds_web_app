/**
 * Step 6-7: Transactional Promotion with Outbox Pattern
 *
 * Reliable promotion of retrieval results back through canonical layers.
 * Uses transactional outbox pattern to ensure no loss on process restart.
 *
 * Pipeline:
 *   1. Postgres transaction: Insert summaries into atlas_packets, record in promotion_outbox
 *   2. Outbox worker: Dequeue pending promotion jobs, process in order
 *   3. Stage handlers: Promote to each destination (Qdrant, Neo4j, Redis, cold storage)
 *   4. Rollback on error: Mark as failed, requeue with retry count
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import type { FeatureEnvelope } from './feature-envelope.js';
import { enrichPacketSemantics } from '$lib/server/ace/promotion-enrichment-service.js';
import { syncSummaryPayloadToQdrant } from './qdrant-summary-sync.js';

export enum PromotionOperation {
  PROMOTE_SUMMARY = 'promote_summary',
  PROMOTE_QDRANT = 'promote_qdrant',
  PROMOTE_NEO4J = 'promote_neo4j',
}

export interface PromotionJob {
  id: bigint;
  packet_key: string;
  source_ref: string;
  content_hash: string | null;
  summary: string | null;
  operation: PromotionOperation;
  payload: Record<string, unknown>;
  retry_count?: number;
}

export interface PromotionResult {
  job_id: bigint;
  success: boolean;
  operation: string;
  message: string;
  stages_completed: string[];
  stages_failed: string[];
}

/**
 * Stage 1: Record promotion intent in Postgres transaction
 * Enqueues outbox jobs atomically with the rest of the transaction
 * Includes semantic enrichment (domain classification + title generation) before persistence
 */
export async function recordPromotionIntent(
  packets: FeatureEnvelope[],
  context: {
    queryText?: string;
    userId?: string;
  }
): Promise<number> {
  if (packets.length === 0) return 0;

  try {
    // Batch enqueue all promotion jobs in a single transaction
    // This eliminates N+1 database round-trips and improves hot-path latency
    const jobs: Array<{
      packet_key: string;
      source_ref: string;
      content_hash: string | null;
      summary: string | null;
      operation: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const packet of packets) {
      const packetKey = packet.packet_key?.trim();
      const sourceRef = packet.source_ref?.trim();
      const sourceRevision = packet.source_revision?.trim();
      const contentHash = packet.content_hash?.trim();
      if (
        !packetKey
        || !sourceRef
        || !contentHash
        || !/^sha256:[0-9a-f]{64}$/i.test(contentHash)
        || !sourceRevision
        || !/^sha256:[0-9a-f]{64}$/i.test(sourceRevision)
      ) {
        continue;
      }

      // Step 1: Enrich packet with semantic metadata (domain + title_id)
      const enriched = enrichPacketSemantics(packet);

      if (!enriched._enrichmentValid) {
        console.warn(
          `Enrichment validation failed for packet ${packet.packet_key}; promotion will proceed but metadata may be incomplete`
        );
      }

      // Step 2: Enqueue summary promotion (now includes domain_class, title_id, title_generator_version)
      jobs.push({
        packet_key: packetKey,
        source_ref: sourceRef,
        content_hash: contentHash,
        summary: packet.summary || null,
        operation: 'promote_summary',
        payload: {
          query_text: context.queryText,
          user_id: context.userId,
          retrieval_score: packet.retrieval_score,
          fusion_score: packet.fusion_score,
          rerank_score: packet.retrieval_score,
          // Enrichment fields: semantic title, domain classification, title identity
          semantic_title: enriched._enrichment.semanticTitle,
          title_id: enriched._enrichment.titleId,
          title_generator_version: enriched._enrichment.titleGeneratorVersion,
          classifier_version: enriched._enrichment.classifierVersion,
          domain_class: enriched._enrichment.domainClass,
          domain_classification: enriched._enrichment.domainClassification,
          domain_class_source: enriched._enrichment.domainClassSource,
          enrichment_valid: enriched._enrichmentValid,
          source_revision: sourceRevision,
        },
      });

      // Step 4: Enqueue Qdrant promotion if vector reference exists
      if (packet.qdrant_point_id) {
        jobs.push({
          packet_key: packetKey,
          source_ref: sourceRef,
          content_hash: contentHash,
          summary: packet.summary || null,
          operation: 'promote_qdrant',
          payload: {
            qdrant_point_id: packet.qdrant_point_id,
            query_text: context.queryText,
            // Include enrichment fields in Qdrant payload mirror
            semantic_title: enriched._enrichment.semanticTitle,
            title_id: enriched._enrichment.titleId,
            domain_class: enriched._enrichment.domainClass,
            classifier_version: enriched._enrichment.classifierVersion,
          source_revision: sourceRevision,
          },
        });
      }
    }

    // Batch insert all jobs in a single transaction
    // Keep retries idempotent while allowing a new source or content revision to queue.
    if (jobs.length > 0) {
      const result = await db.execute(sql`
        INSERT INTO promotion_outbox (packet_key, source_ref, content_hash, source_revision, summary, operation, payload, status)
        VALUES ${sql.join(
          jobs.map(
            job => sql`(
              ${job.packet_key},
              ${job.source_ref},
              ${job.content_hash},
              ${job.payload.source_revision as string},
              ${job.summary},
              ${job.operation},
              ${JSON.stringify(job.payload)}::jsonb,
              'pending'
            )`
          ),
          sql`, `
        )}
        ON CONFLICT (packet_key, source_ref, operation, content_hash, source_revision)
          WHERE status = 'pending' AND content_hash IS NOT NULL AND source_revision IS NOT NULL
        DO NOTHING
      `);
      console.log(`Enqueued ${jobs.length} promotion jobs from ${packets.length} packets`);
      return jobs.length;
    }

    return 0;
  } catch (error) {
    console.error('Failed to record promotion intent:', error);
    throw error;
  }
}

/**
 * Stage 2: Dequeue and process promotion jobs
 * Called by background worker to process pending outbox jobs
 */
/**
 * Claim and mark in ONE statement. The pooled client runs each db.execute in its own
 * autocommit transaction, so a separate SELECT ... FOR UPDATE SKIP LOCKED released its row
 * locks before the status UPDATE and two workers could claim the same pending rows.
 */
export function buildPromotionClaimQuery(batchSize: number) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError('Promotion batch size must be an integer between 1 and 100');
  }

  return sql`
    UPDATE promotion_outbox
    SET status = 'processing', started_at = NOW()
    WHERE id IN (
      SELECT id
      FROM promotion_outbox
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, packet_key, source_ref, content_hash, summary, operation, payload, retry_count, created_at
  `;
}

export async function dequeuePromotionJobs(batchSize: number = 10): Promise<PromotionJob[]> {
  try {
    const result = await db.execute(buildPromotionClaimQuery(batchSize));

    // RETURNING order is unspecified; restore oldest-first.
    const claimed = [...(result.rows as Array<Record<string, unknown>>)].sort(
      (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()
    );
    return claimed.map(({ created_at: _createdAt, ...job }) => job) as unknown as PromotionJob[];
  } catch (error) {
    // A failed claim is a queue failure, not an empty queue: surface it to the caller.
    console.error('Failed to dequeue promotion jobs:', error);
    throw error;
  }
}

export interface PromotionQueueMetrics {
  claimed: number;
  promoted: number;
  /** success=true results that matched no canonical row at the exact revisions (marked completed). */
  stale_noop: number;
  failed: number;
  /** Claimed attempts whose outbox row had already failed at least once. */
  retried: number;
}

/**
 * Separates real promotions from stale no-ops, which also report success=true.
 * Retry accounting lives in mark_promotion_completed (retry_count < max_retries requeues), so
 * "retried" is read from promotion_outbox.retry_count, not derived here.
 */
export function summarizePromotionResults(
  claimed: number,
  results: readonly PromotionResult[],
  retried = 0
): PromotionQueueMetrics {
  const metrics: PromotionQueueMetrics = { claimed, promoted: 0, stale_noop: 0, failed: 0, retried };
  for (const result of results) {
    if (!result.success) metrics.failed += 1;
    else if (result.stages_completed.some((stage) => stage.endsWith('_stale_revision_skipped'))) metrics.stale_noop += 1;
    else metrics.promoted += 1;
  }
  return metrics;
}

/**
 * Stage 3: Execute promotion operation
 * Handles the actual promotion (summary write, Qdrant update, etc.)
 */
export async function executePromotionJob(job: PromotionJob): Promise<PromotionResult> {
  const stagesCompleted: string[] = [];
  const stagesFailed: string[] = [];

  try {
    switch (job.operation) {
      case PromotionOperation.PROMOTE_SUMMARY:
        return await promoteSummary(job, stagesCompleted, stagesFailed);
      case PromotionOperation.PROMOTE_QDRANT:
        return await promoteQdrant(job, stagesCompleted, stagesFailed);
      case PromotionOperation.PROMOTE_NEO4J:
        return await promoteNeo4j(job, stagesCompleted, stagesFailed);
      default:
        const exhaustiveCheck: never = job.operation;
        throw new Error(`Unknown promotion operation: ${exhaustiveCheck}`);
    }
  } catch (error) {
    return {
      job_id: job.id,
      success: false,
      operation: job.operation,
      message: String(error),
      stages_completed: stagesCompleted,
      stages_failed: stagesFailed,
    };
  }
}

/**
 * Substage: Promote summary to atlas_packets in Postgres
 * Updates only an existing canonical packet row at the exact source/content revision.
 * Includes semantic enrichment fields: domain_class, title_id, title_generator_version.
 */
async function promoteSummary(
  job: PromotionJob,
  stagesCompleted: string[],
  stagesFailed: string[]
): Promise<PromotionResult> {
  try {
    const sourceRevision = job.payload.source_revision;
    if (
      typeof sourceRevision !== 'string'
      || !/^sha256:[0-9a-f]{64}$/i.test(sourceRevision)
      || typeof job.content_hash !== 'string'
      || !/^sha256:[0-9a-f]{64}$/i.test(job.content_hash)
    ) {
      stagesFailed.push('postgres_summary: revision_identity_missing_or_invalid');
      return {
        job_id: job.id,
        success: false,
        operation: job.operation,
        message: 'Summary promotion refused without a SHA-256 source revision',
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    }

    const result = await db.execute(buildPromotionSummaryQuery(job, sourceRevision));

    if (result.rows.length === 0) {
      stagesCompleted.push('postgres_summary_stale_revision_skipped');
      return {
        job_id: job.id,
        success: true,
        operation: job.operation,
        message: 'Stale summary job skipped; no canonical packet matched the exact source and content revisions',
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    }

    stagesCompleted.push('postgres_summary_upsert');

    return {
      job_id: job.id,
      success: true,
      operation: job.operation,
      message: 'Summary + enrichment metadata promoted to atlas_packets',
      stages_completed: stagesCompleted,
      stages_failed: stagesFailed,
    };
  } catch (error) {
    stagesFailed.push(`postgres_summary: ${String(error)}`);
    throw error;
  }
}

export function buildPromotionSummaryQuery(job: PromotionJob, sourceRevision: string) {
  return sql`
      UPDATE atlas_packets
      SET
        summary = ${job.summary},
        domain_class = ${(job.payload.domain_class as string) || null},
        title_id = ${(job.payload.title_id as string) || null},
        title_generator_version = ${(job.payload.title_generator_version as string) || null},
        updated_at = NOW()
      WHERE packet_key = ${job.packet_key}
        AND source_ref = ${job.source_ref}
        AND content_hash = ${job.content_hash}
        AND source_revision = ${sourceRevision}
      RETURNING packet_id
    `;
}

/**
 * Substage: Promote to Qdrant (vector sync)
 * Updates Qdrant point payload with latest summary/metadata from Postgres.
 * Qdrant payload must mirror Postgres packet data (summary, updated_at, source_ref).
 * Non-critical: failure does not block packet, just marks for manual reconciliation.
 */
async function promoteQdrant(
  job: PromotionJob,
  stagesCompleted: string[],
  stagesFailed: string[]
): Promise<PromotionResult> {
  try {
    const sourceRevision = job.payload.source_revision;
    if (
      typeof sourceRevision !== 'string'
      || !/^sha256:[0-9a-f]{64}$/i.test(sourceRevision)
      || typeof job.content_hash !== 'string'
      || !/^sha256:[0-9a-f]{64}$/i.test(job.content_hash)
    ) {
      stagesFailed.push('qdrant_payload_update: revision_identity_missing_or_invalid');
      return {
        job_id: job.id,
        success: false,
        operation: job.operation,
        message: 'Qdrant promotion refused without valid source and content revisions',
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    }

    const canonicalResult = await db.execute(sql`
      SELECT packet_id, summary
      FROM atlas_packets
      WHERE packet_key = ${job.packet_key}
        AND source_ref = ${job.source_ref}
        AND content_hash = ${job.content_hash}
        AND source_revision = ${sourceRevision}
      LIMIT 1
    `);

    if (canonicalResult.rows.length === 0) {
      stagesCompleted.push('qdrant_payload_stale_revision_skipped');
      return {
        job_id: job.id,
        success: true,
        operation: job.operation,
        message: 'Stale Qdrant job skipped; no canonical packet matched the exact source and content revisions',
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    }

    const canonicalRow = canonicalResult.rows[0];
    if (typeof canonicalRow !== 'object' || canonicalRow === null || !('summary' in canonicalRow)) {
      stagesFailed.push('qdrant_payload_update: canonical_summary_readback_invalid');
      return {
        job_id: job.id,
        success: false,
        operation: job.operation,
        message: 'Qdrant mirror deferred because the canonical PostgreSQL summary readback was malformed',
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    }

    if (canonicalRow.summary !== job.summary) {
      stagesFailed.push('qdrant_payload_update: postgres_summary_not_yet_current');
      return {
        job_id: job.id,
        success: false,
        operation: job.operation,
        message: 'Qdrant mirror deferred until the canonical PostgreSQL summary matches',
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    }

    if (!job.payload.qdrant_point_id) {
      console.warn(
        `[promotion-worker] Qdrant point id missing for ${job.packet_key}; falling back to packet_key lookup`,
      );
    }
    const syncResult = await syncSummaryPayloadToQdrant({
      packetKey: job.packet_key,
      sourceRevision,
      contentHash: job.content_hash,
      qdrantPointId: (job.payload.qdrant_point_id as string | null) ?? null,
      payload: {
        source_ref: job.source_ref,
        summary: job.summary,
        semantic_title: job.payload.semantic_title ?? null,
        title_id: job.payload.title_id ?? null,
        domain_class: job.payload.domain_class ?? null,
        classifier_version: job.payload.classifier_version ?? null,
        updated_at: new Date().toISOString(),
      },
    });

    if (syncResult.updatedPoints === 0) {
      stagesFailed.push('qdrant_payload_update: point_not_found');
      return {
        job_id: job.id,
        success: false,
        operation: job.operation,
        message: `Qdrant point not found for packet ${job.packet_key}`,
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    }

    stagesCompleted.push('qdrant_payload_update');
    return {
      job_id: job.id,
      success: true,
      operation: job.operation,
      message: `Qdrant payload updated for packet ${job.packet_key} (${syncResult.updatedPoints} point(s))`,
      stages_completed: stagesCompleted,
      stages_failed: stagesFailed,
    };
  } catch (error) {
    const message = `Qdrant sync failed: ${String(error)}`;
    stagesFailed.push(`qdrant_payload_update: ${String(error)}`);

    // Non-critical: log but don't escalate
    console.warn(`[promotion-worker] Qdrant promotion failed (non-critical): ${message}`);

    return {
      job_id: job.id,
      success: false,
      operation: job.operation,
      message,
      stages_completed: stagesCompleted,
      stages_failed: stagesFailed,
    };
  }
}

/**
 * Substage: Promote to Neo4j (topology sync)
 * Creates RETRIEVED_BY edges and updates node properties to reflect retrieval history.
 * Non-critical: failure does not block packet, just marks for manual reconciliation.
 */
async function promoteNeo4j(
  job: PromotionJob,
  stagesCompleted: string[],
  stagesFailed: string[]
): Promise<PromotionResult> {
  try {
    const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      // Match or create the packet node in Neo4j
      // Then create a RETRIEVED_BY edge to a synthetic retrieval event node
      const result = await session.run(
        `
        MATCH (p:Packet { packet_key: $packet_key })
        WITH p, datetime() AS now
        SET p.summary = COALESCE($summary, p.summary),
            p.retrieved_at = now,
            p.updated_at = now
        CREATE (e:RetrievalEvent {
          retrieved_at: now,
          source_ref: $source_ref,
          promotion_job_id: $job_id
        })
        CREATE (p)-[:RETRIEVED_BY]->(e)
        RETURN p, e
        `,
        {
          packet_key: job.packet_key,
          source_ref: job.source_ref,
          summary: job.summary || null,
          job_id: Number(job.id),
        }
      );

      if (!result.records || result.records.length === 0) {
        stagesFailed.push('neo4j_edge_creation: packet_node_not_found');
        console.warn(`[promotion-worker] Neo4j packet not found: ${job.packet_key}`);

        // Non-critical: allow packet to succeed even if Neo4j node doesn't exist yet
        return {
          job_id: job.id,
          success: true,
          operation: job.operation,
          message: `Neo4j packet node not found for key ${job.packet_key} (expected on first promotion)`,
          stages_completed: stagesCompleted,
          stages_failed: stagesFailed,
        };
      }

      stagesCompleted.push('neo4j_edge_creation');
      return {
        job_id: job.id,
        success: true,
        operation: job.operation,
        message: `Neo4j RETRIEVED_BY edge created for packet ${job.packet_key}`,
        stages_completed: stagesCompleted,
        stages_failed: stagesFailed,
      };
    } finally {
      await session.close();
    }
  } catch (error) {
    const message = `Neo4j sync failed: ${String(error)}`;
    stagesFailed.push(`neo4j_edge_creation: ${String(error)}`);

    // Non-critical: log but don't escalate
    console.warn(`[promotion-worker] Neo4j promotion failed (non-critical): ${message}`);

    return {
      job_id: job.id,
      success: false,
      operation: job.operation,
      message,
      stages_completed: stagesCompleted,
      stages_failed: stagesFailed,
    };
  }
}

/**
 * Stage 4: Mark job as completed or failed
 * Handles retry logic for failed jobs
 */
export async function markPromotionJobComplete(
  jobId: bigint,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  try {
    await db.execute(sql`
      SELECT mark_promotion_completed(
        ${jobId},
        ${success},
        ${errorMessage || null}
      )
    `);

    if (success) {
      console.log(`Promotion job ${jobId} completed successfully`);
    } else {
      console.warn(`Promotion job ${jobId} failed: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Failed to mark promotion job complete:', error);
    throw error;
  }
}

/**
 * Worker entrypoint: Process all pending promotion jobs
 * Should be called periodically by a background task
 */
export async function processPromotionQueue(batchSize: number = 10): Promise<PromotionResult[]> {
  const jobs = await dequeuePromotionJobs(batchSize);
  const results: PromotionResult[] = [];

  for (const job of jobs) {
    try {
      const result = await executePromotionJob(job);
      results.push(result);

      // Mark as completed
      await markPromotionJobComplete(job.id, result.success, result.message);
    } catch (error) {
      console.error(`Failed to process promotion job ${job.id}:`, error);
      await markPromotionJobComplete(job.id, false, String(error));
    }
  }

  const retried = jobs.filter((job) => (job.retry_count ?? 0) > 0).length;
  const metrics = summarizePromotionResults(jobs.length, results, retried);
  console.log(`[promotion-worker] claimed=${metrics.claimed} promoted=${metrics.promoted} stale_noop=${metrics.stale_noop} failed=${metrics.failed} retried=${metrics.retried}`);

  return results;
}
