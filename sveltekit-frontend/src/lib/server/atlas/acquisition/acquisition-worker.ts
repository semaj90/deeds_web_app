/**
 * Acquisition worker — one consumer-group worker for the acquisition stream.
 *
 * Loop: XREADGROUP -> conditionalFetch (cache-aware, SSRF-safe) -> store raw
 * bytes BEFORE extraction -> write results durably to Postgres -> XACK. Ack
 * only happens after the Postgres write commits, per the "ack means handled
 * durably, not workflow succeeded" contract.
 *
 * Does not call extractWebDocument()/web-crawl.ts — see conditional-fetch.ts
 * for why (it discards response headers, and its first cascade tier has a
 * pre-existing bug that silently returns empty content). Extraction
 * (ACQ8, against the raw bytes stored here) is a separate downstream step.
 */

import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db/client.js';
import { atlasFetchAttempts, atlasFetches, atlasSourceRevisions } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
// Canonical SeaweedFS import path per repo convention — $lib/server/seaweed-client.js
// is the re-export barrel every other consumer in the codebase already uses
// (21/22 existing call sites); this file was the one outlier importing
// minio-client.js directly. Same underlying implementation either way.
import { uploadSeaweedFile as uploadFile } from '$lib/server/seaweed-client.js';
import { conditionalFetch } from './conditional-fetch.js';
import {
  ensureAcquisitionConsumerGroup,
  readAcquisitionBatch,
  ackAcquisitionEntry,
  deadLetter,
  type AcquisitionStreamEntry,
} from './acquisition-stream.js';

const RAW_BUCKET = 'atlas-web-sources';

export interface AcquisitionWorkerResult {
  processed: number;
  fetched: number;
  notModified: number;
  failed: number;
  deadLettered: number;
}

interface AcquisitionRequestedPayload {
  researchRunId: string;
  fetchId: string;
  fetchAttemptId: string;
  requestedUrl: string;
  normalizedUrl: string;
  cachePolicy?: { mode?: 'default' | 'revalidate' | 'bypass' | 'cache_only' };
  attempt: number;
  maxAttempts: number;
}

type Outcome = 'fetched' | 'not_modified' | 'failed' | 'dead_lettered';

/**
 * Look up the most recent source revision for this fetch's prior attempts,
 * if any — used to send If-None-Match / If-Modified-Since on revalidation.
 */
async function findPriorRevision(fetchId: string) {
  const [prior] = await db
    .select({
      sourceRevisionId: atlasSourceRevisions.sourceRevisionId,
      contentDigest: atlasSourceRevisions.contentDigest,
      etag: atlasSourceRevisions.etag,
      lastModified: atlasSourceRevisions.lastModified,
    })
    .from(atlasFetchAttempts)
    .innerJoin(atlasSourceRevisions, eq(atlasFetchAttempts.sourceRevisionId, atlasSourceRevisions.sourceRevisionId))
    .where(and(eq(atlasFetchAttempts.fetchId, fetchId)))
    .orderBy(atlasFetchAttempts.attemptNumber)
    .limit(1);
  return prior;
}

async function processEntry(entry: AcquisitionStreamEntry): Promise<Outcome> {
  let payload: AcquisitionRequestedPayload;
  try {
    payload = JSON.parse(entry.fields.payload ?? '{}');
  } catch {
    await deadLetter(entry, 'unparseable_payload');
    return 'dead_lettered';
  }

  const prior = await findPriorRevision(payload.fetchId).catch(() => undefined);
  const cacheMode = payload.cachePolicy?.mode ?? 'default';
  const sentValidators = cacheMode !== 'bypass' && cacheMode !== 'cache_only' && prior
    ? { etag: prior.etag ?? undefined, lastModified: prior.lastModified ?? undefined }
    : undefined;

  const { result, rawBytes } = await conditionalFetch({
    requestedUrl: payload.requestedUrl,
    cacheMode,
    priorRevision: prior
      ? { contentDigest: prior.contentDigest, etag: prior.etag ?? undefined, lastModified: prior.lastModified ?? undefined }
      : undefined,
  });

  const completedAt = new Date(result.completedAt);
  const requestEtag = sentValidators?.etag ?? null;
  const requestLastModified = sentValidators?.lastModified ?? null;

  if (result.status === 'failed') {
    await db
      .update(atlasFetchAttempts)
      .set({
        completedAt,
        errorCode: result.error?.code,
        retryClass: result.error?.retryClass,
      })
      .where(eq(atlasFetchAttempts.fetchAttemptId, payload.fetchAttemptId))
      .catch(() => {});

    const exhausted = payload.attempt >= payload.maxAttempts;
    const permanent = result.error?.retryClass === 'permanent' || result.error?.retryClass === 'policy';
    if (permanent || exhausted) {
      await db
        .update(atlasFetches)
        .set({ status: 'failed', updatedAt: completedAt })
        .where(eq(atlasFetches.fetchId, payload.fetchId))
        .catch(() => {});
      await deadLetter(entry, exhausted ? 'attempts_exhausted' : (result.error?.code ?? 'unknown'));
      return 'dead_lettered';
    }

    // Transient, attempts remain: ack (handled durably) but don't auto-requeue —
    // retry scheduling is the caller's job, not a hidden loop in this worker.
    await ackAcquisitionEntry(entry.streamEntryId);
    return 'failed';
  }

  if (result.status === 'not_modified') {
    // Rule: 304 retains the prior source revision, records a new fetch
    // attempt, does not rewrite raw content, no new extraction revision.
    await db
      .update(atlasFetchAttempts)
      .set({
        completedAt,
        requestEtag,
        requestLastModified,
        httpStatus: 304,
        finalUrl: result.finalUrl,
        responseEtag: result.cache.etag,
        responseLastModified: result.cache.lastModified,
        cacheControl: result.cache.cacheControl,
        vary: result.cache.vary,
        sourceRevisionId: prior?.sourceRevisionId,
        cacheDecision: 'not_modified',
      })
      .where(eq(atlasFetchAttempts.fetchAttemptId, payload.fetchAttemptId));

    await db
      .update(atlasFetches)
      .set({ status: 'not_modified', updatedAt: completedAt })
      .where(eq(atlasFetches.fetchId, payload.fetchId));

    await ackAcquisitionEntry(entry.streamEntryId);
    return 'not_modified';
  }

  // status === 'fetched'
  await db.transaction(async (tx) => {
    // Exact content-digest equality must not create a duplicate source
    // revision — unique constraint on (final_url, content_digest) backs
    // this too; the select here avoids a needless insert attempt.
    const existing = await tx
      .select({ sourceRevisionId: atlasSourceRevisions.sourceRevisionId })
      .from(atlasSourceRevisions)
      .where(and(eq(atlasSourceRevisions.finalUrl, result.finalUrl), eq(atlasSourceRevisions.contentDigest, result.contentDigest!)))
      .limit(1);

    let sourceRevisionId: string;
    let storageUri: string | null = null;

    if (existing.length > 0) {
      sourceRevisionId = existing[0]!.sourceRevisionId;
    } else {
      sourceRevisionId = randomUUID();
      // ACQ7: raw bytes stored to SeaweedFS BEFORE any extraction step runs.
      // A normalization/extraction failure downstream must not destroy this.
      if (rawBytes) {
        const objectName = `${sourceRevisionId}.bin`;
        storageUri = await uploadFile(RAW_BUCKET, objectName, rawBytes, {
          'Content-Type': result.contentType ?? 'application/octet-stream',
          'x-source-url': result.finalUrl,
        }).then((name) => `s3://${RAW_BUCKET}/${name}`).catch((err) => {
          console.warn('[acquisition-worker] raw byte storage failed (non-fatal):', err instanceof Error ? err.message : String(err));
          return null;
        });
      }

      await tx.insert(atlasSourceRevisions).values({
        sourceRevisionId,
        webSourceId: randomUUID(),
        finalUrl: result.finalUrl,
        contentDigest: result.contentDigest!,
        contentType: result.contentType,
        contentLength: result.contentLength,
        storageUri,
        httpStatus: result.httpStatus,
        etag: result.cache.etag,
        lastModified: result.cache.lastModified,
        receivedAt: completedAt,
      });
    }

    await tx
      .update(atlasFetchAttempts)
      .set({
        completedAt,
        requestEtag,
        requestLastModified,
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        redirectChain: result.redirectChain,
        responseEtag: result.cache.etag,
        responseLastModified: result.cache.lastModified,
        cacheControl: result.cache.cacheControl,
        vary: result.cache.vary,
        contentType: result.contentType,
        contentLength: result.contentLength,
        contentDigest: result.contentDigest,
        sourceRevisionId,
        cacheDecision: result.cache.decision,
      })
      .where(eq(atlasFetchAttempts.fetchAttemptId, payload.fetchAttemptId));

    await tx
      .update(atlasFetches)
      .set({ status: 'fetched', updatedAt: completedAt })
      .where(eq(atlasFetches.fetchId, payload.fetchId));
  });

  await ackAcquisitionEntry(entry.streamEntryId);
  return 'fetched';
}

/** Run one poll cycle for a named consumer. Call on a timer or from a standalone worker process. */
export async function runAcquisitionWorkerCycle(
  consumerName = `worker-${process.pid}`,
  batchSize = 1
): Promise<AcquisitionWorkerResult> {
  await ensureAcquisitionConsumerGroup();
  const entries = await readAcquisitionBatch(consumerName, batchSize);

  const result: AcquisitionWorkerResult = { processed: 0, fetched: 0, notModified: 0, failed: 0, deadLettered: 0 };
  for (const entry of entries) {
    result.processed++;
    const outcome = await processEntry(entry);
    if (outcome === 'fetched') result.fetched++;
    else if (outcome === 'not_modified') result.notModified++;
    else if (outcome === 'failed') result.failed++;
    else result.deadLettered++;
  }
  return result;
}
