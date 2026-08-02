/**
 * Acquisition writer — atomically creates canonical Postgres rows and an
 * outbox_events row in one transaction, mirroring the proven pattern in
 * $lib/server/agent/action-writer.ts (agentRuns/agentRunActions/workflowEvents
 * -> outboxEvents). Reuses the generic outbox_events table (aggregateType
 * distinguishes acquisition rows from agent-run rows) rather than creating a
 * parallel atlas_outbox_events table.
 *
 * Does NOT publish to Valkey Streams itself — that is the outbox worker's job
 * (see atlas-acquisition-outbox-handler.ts), same separation of concerns as
 * the existing outbox-worker.ts.
 */

import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db/client.js';
import {
  atlasResearchRuns,
  atlasFetches,
  atlasFetchAttempts,
  outboxEvents,
  type NewAtlasResearchRun,
  type NewAtlasFetch,
  type NewAtlasFetchAttempt,
} from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

export interface RequestAcquisitionInput {
  workflowRunId?: string | null;
  workspaceId: string;
  workspaceRevision: number;
  query: string;
  requestedUrl: string;
  normalizedUrl: string;
  acquisitionMode?: 'auto' | 'static' | 'playwright' | 'crawl4ai';
  cachePolicyMode?: 'default' | 'revalidate' | 'bypass' | 'cache_only';
  /** Reuse an existing research run instead of creating a new one. */
  researchRunId?: string;
}

export interface RequestAcquisitionResult {
  researchRunId: string;
  fetchId: string;
  fetchAttemptId: string;
  attemptNumber: number;
  outboxId: string;
  duplicate: boolean;
}

/**
 * Validates input (caller must have already Zod-parsed the request shape),
 * creates/reuses the research run, creates or reuses the fetch row (dedupe
 * on research_run_id + normalized_url), inserts a fetch_attempt row, and
 * commits an outbox_events row — all in one transaction.
 */
export async function requestAcquisition(
  input: RequestAcquisitionInput
): Promise<RequestAcquisitionResult> {
  const now = new Date();

  return db.transaction(async (tx) => {
    // 1. Research run — reuse if caller supplied one, else create.
    let researchRunId = input.researchRunId;
    if (!researchRunId) {
      researchRunId = randomUUID();
      await tx.insert(atlasResearchRuns).values({
        researchRunId,
        workflowRunId: input.workflowRunId ?? null,
        workspaceId: input.workspaceId,
        workspaceRevision: input.workspaceRevision,
        query: input.query,
        status: 'acquiring',
      } satisfies NewAtlasResearchRun);
    }

    // 2. Fetch row — dedupe on (research_run_id, normalized_url). A second
    //    request for the same URL in the same research run reuses the fetch
    //    row and just records another attempt.
    const existingFetch = await tx
      .select({ fetchId: atlasFetches.fetchId, maxAttempts: atlasFetches.maxAttempts })
      .from(atlasFetches)
      .where(
        and(eq(atlasFetches.researchRunId, researchRunId), eq(atlasFetches.normalizedUrl, input.normalizedUrl))
      )
      .limit(1);

    let fetchId: string;
    let duplicate = false;
    if (existingFetch.length > 0) {
      fetchId = existingFetch[0]!.fetchId;
      duplicate = true;
    } else {
      fetchId = randomUUID();
      await tx.insert(atlasFetches).values({
        fetchId,
        researchRunId,
        requestedUrl: input.requestedUrl,
        normalizedUrl: input.normalizedUrl,
        acquisitionMode: input.acquisitionMode ?? 'auto',
        cachePolicyMode: input.cachePolicyMode ?? 'default',
        status: 'pending',
      } satisfies NewAtlasFetch);
    }

    // Attempt number = count of existing attempts + 1 (per-fetch sequence).
    const priorAttempts = await tx
      .select({ attemptNumber: atlasFetchAttempts.attemptNumber })
      .from(atlasFetchAttempts)
      .where(eq(atlasFetchAttempts.fetchId, fetchId));
    const attemptNumber = priorAttempts.length + 1;

    // 3. Fetch attempt row — created BEFORE any network I/O happens (the
    //    caller performs the actual fetch after this transaction commits).
    const fetchAttemptId = randomUUID();
    await tx.insert(atlasFetchAttempts).values({
      fetchAttemptId,
      fetchId,
      researchRunId,
      attemptNumber,
      requestedUrl: input.requestedUrl,
      normalizedUrl: input.normalizedUrl,
      acquisitionMode: input.acquisitionMode ?? 'auto',
      cacheMode: input.cachePolicyMode ?? 'default',
      startedAt: now,
    } satisfies NewAtlasFetchAttempt);

    // 4. Outbox event — same transaction, reusing the generic outbox_events
    //    table. Not marked published here; the outbox worker publishes to
    //    Valkey Streams and sets published_at only after XADD succeeds.
    const eventId = randomUUID();
    const [outboxRow] = await tx
      .insert(outboxEvents)
      .values({
        aggregateType: 'atlas_fetch',
        aggregateId: fetchId,
        eventType: 'atlas.acquisition.requested.v1',
        payload: {
          schemaVersion: 'atlas.acquisition.request.v1',
          eventId,
          workflowRunId: input.workflowRunId ?? null,
          researchRunId,
          fetchId,
          fetchAttemptId,
          workspaceId: input.workspaceId,
          workspaceRevision: input.workspaceRevision,
          requestedUrl: input.requestedUrl,
          normalizedUrl: input.normalizedUrl,
          acquisitionMode: input.acquisitionMode ?? 'auto',
          cachePolicy: { mode: input.cachePolicyMode ?? 'default' },
          attempt: attemptNumber,
          maxAttempts: existingFetch[0]?.maxAttempts ?? 4,
          requestedAt: now.toISOString(),
        } as Record<string, unknown>,
      })
      .returning({ outboxId: outboxEvents.outboxId });

    return {
      researchRunId,
      fetchId,
      fetchAttemptId,
      attemptNumber,
      outboxId: outboxRow!.outboxId,
      duplicate,
    };
  });
}
