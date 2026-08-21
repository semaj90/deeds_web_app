#!/usr/bin/env node
/**
 * Merkle Checkpoint Demo — proves buildAnalyticsCheckpoint() against real data
 *
 * Pulls the N most recent rows from the real `analytics_events` table,
 * builds a real RFC-9162 Merkle checkpoint over them via
 * atlas/merkle/checkpoint-builder.ts, validates the result against the
 * live checkpointCommitEventSchema (event-fabric.ts), and — unless
 * --dry-run is passed — emits it through the ALREADY-WIRED
 * emitEventFabricAnalyticsProjection() path (projectCheckpointCommit ->
 * makeEvent -> emit -> real Postgres insert + Redis Streams XADD), then
 * reads the new row back from Postgres to prove the write actually landed.
 *
 * This is a manually-invoked proof script, same class as
 * pagerank-authority-demo.mts — NOT wired into graphify:daily or any
 * automatic pipeline. Run from sveltekit-frontend/ so $lib aliases resolve:
 *
 *   npx tsx scripts/atlas/merkle-checkpoint-demo.mts [--limit=10] [--dry-run]
 *
 * Deliberately does NOT wire runParentAtlasDailyCompiler() — its
 * compileGpuFeatures/deriveRecommendations ports have no real backing
 * implementation anywhere in this repo yet (see workstation-todo.md, GPU/
 * RAPIDS sidecar lane). Wiring that now would mean fabricated stub ports,
 * which defeats the point of proving against real infra.
 */

import 'dotenv/config';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { analyticsEvents } from '$lib/server/db/schema-postgres.js';
import {
  buildAnalyticsCheckpoint,
  type CanonicalCheckpointEvent,
  type MerkleLeafReceiptV1,
} from '$lib/server/atlas/merkle/checkpoint-builder.js';
import {
  checkpointCommitEventSchema,
  type CheckpointCommitEventV1,
} from '$lib/server/queue/event-fabric.js';
import { emitEventFabricAnalyticsProjection } from '$lib/server/queue/event-fabric-analytics-projection.js';
import { stableStringify, sha256Hex } from '$lib/server/analysis/stable-hash.js';

function parseLimitArg(defaultValue: number): number {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  if (!arg) return defaultValue;
  const value = Number.parseInt(arg.split('=', 2)[1] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

const isDryRun = process.argv.includes('--dry-run');
const limit = parseLimitArg(10);
const runId = `merkle-demo-${Date.now()}`;
const CHECKPOINT_SCHEMA_REVISION = 'merkle-checkpoint-demo.v1';
const CHECKPOINT_ALGORITHM_REVISION = 'rfc9162-sha256.v1';

async function persistLeafManifest(
  leaves: readonly MerkleLeafReceiptV1[],
): Promise<{ ref: string; hashHex: string }> {
  // DEMO-SCOPE: no durable leaf-manifest table exists in this repo yet, so
  // this returns a deterministic in-memory reference rather than inventing
  // new schema. Honestly reported as demo-scope, not a real persistence
  // path — do not treat `ref` below as resolvable outside this run.
  const manifestJson = stableStringify(leaves);
  return {
    ref: `demo:in-memory:${runId}`,
    hashHex: sha256Hex(manifestJson),
  };
}

async function main() {
  console.log('\n=== Merkle Checkpoint Demo ===');
  console.log(`runId=${runId} limit=${limit} dryRun=${isDryRun}\n`);

  const rows = await db
    .select()
    .from(analyticsEvents)
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(limit);

  if (rows.length === 0) {
    console.log('NOT_PROVEN: analytics_events has zero rows — nothing to checkpoint.');
    console.log('This is an honest empty result, not a failure of the checkpoint builder.');
    return;
  }

  console.log(`Fetched ${rows.length} real analytics_events row(s) (most recent first).`);

  // buildAnalyticsCheckpoint expects oldest-first ordering for startOffset/endOffset.
  const ordered = [...rows].reverse();
  const events: CanonicalCheckpointEvent[] = ordered.map((row, index) => {
    const canonicalJson = stableStringify(row);
    return {
      streamOffset: String(index),
      eventId: row.id,
      occurredAt: row.createdAt.toISOString(),
      canonicalJson,
      canonicalEventHashHex: sha256Hex(canonicalJson),
    };
  });

  const { payload, leafManifestRef, leafManifestHashHex } = await buildAnalyticsCheckpoint({
    checkpointId: runId,
    stream: 'analytics_events',
    events,
    schemaRevision: CHECKPOINT_SCHEMA_REVISION,
    checkpointAlgorithmRevision: CHECKPOINT_ALGORITHM_REVISION,
    persistLeafManifest,
  });

  console.log('\nCREATED: checkpoint payload built.');
  console.log(`  checkpointId=${payload.checkpointId}`);
  console.log(`  eventCount=${payload.eventCount}`);
  console.log(`  merkleRoot=${payload.merkleRoot}`);
  console.log(`  leafManifestRef=${leafManifestRef} (demo-scope, see persistLeafManifest note)`);
  console.log(`  leafManifestHashHex=${leafManifestHashHex}`);

  const envelope: CheckpointCommitEventV1 = checkpointCommitEventSchema.parse({
    eventId: crypto.randomUUID(),
    eventType: 'checkpoint.commit',
    occurredAt: new Date().toISOString(),
    traceId: `checkpoint:${runId}`,
    schemaRevision: CHECKPOINT_SCHEMA_REVISION,
    payload,
  });

  console.log('\nWIRED: envelope validated against the live checkpointCommitEventSchema (Zod).');

  if (isDryRun) {
    console.log('\nDRY_RUN_PROVEN: checkpoint build + schema validation proven. No write performed.');
    return;
  }

  emitEventFabricAnalyticsProjection(envelope);
  // emit() is intentionally fire-and-forget; give both transports a moment
  // before attempting readback proof.
  await new Promise((resolve) => setTimeout(resolve, 500));

  const readback = await db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.eventType, 'lane.result'))
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(20);

  const traceId = envelope.traceId;
  const found = readback.find((row) => {
    const p = row.payload as { traceId?: string } | null;
    return p?.traceId === traceId;
  });

  if (found) {
    console.log('\nAPPLY_PROVEN: readback confirms the projected checkpoint.commit event');
    console.log(`  landed in Postgres analytics_events, id=${found.id}, traceId=${traceId}`);
  } else {
    console.log('\nNOT_PROVEN: emit() was called but readback did not find a matching row');
    console.log(`  within 500ms (traceId=${traceId}). Postgres write may be delayed, or failed`);
    console.log('  silently per emit()\'s fire-and-forget contract — check server logs.');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Standalone script — the Drizzle pg.Pool and ioredis client are module-level
    // singletons imported from $lib/server/db/client.js and $lib/server/redis.js
    // with no direct handle exposed here to close cleanly. Force exit rather than
    // hang on open connections, matching the CLI-script convention this repo uses
    // elsewhere (batch-a-structural-materializer.mts etc. call pool.end()).
    process.exit(process.exitCode ?? 0);
  });