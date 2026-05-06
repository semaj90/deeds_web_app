/**
 * CouchDB _changes feed consumer.
 *
 * Polls each memory database with longpoll and mirrors changed documents
 * into the hot-cache / vector / graph layers. Seq is persisted in Redis so
 * restarts resume from where they left off.
 *
 * Usage (in hooks.server.ts or a startup job):
 *   import { startChangesConsumer } from '$lib/server/couchdb/changes-consumer.js';
 *   await startChangesConsumer();
 *
 * Shutdown (via await using in TS 5.2+):
 *   const consumer = await startChangesConsumer();
 *   await consumer[Symbol.asyncDispose]();
 */

import { getRedis } from '$lib/server/redis.js';
import { MEMORY_DATABASES } from './mango-indexes.js';
import type { MemoryDatabase, MemoryDoc } from './mango-indexes.js';
import { mirrorMemoryDoc } from './memory-mirror.js';

// ── Config ─────────────────────────────────────────────────────────────────────

const COUCHDB_URL  = process.env.COUCHDB_URL  ?? 'http://localhost:5984';
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = (process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass');

const POLL_TIMEOUT_MS = 30_000;   // longpoll heartbeat
const ERROR_BACKOFF_MS = 5_000;   // wait between retries on error
const SEQ_KEY_PREFIX = 'couchdb:changes:seq:';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChangeRow {
  seq:     string | number;
  id:      string;
  changes: { rev: string }[];
  deleted?: boolean;
  doc?:    MemoryDoc;
}

interface ChangesResponse {
  results: ChangeRow[];
  last_seq: string | number;
  pending?: number;
}

// ── Per-DB consumer ───────────────────────────────────────────────────────────

function authHeader(): string {
  return 'Basic ' + Buffer.from(COUCHDB_USER + ':' + COUCHDB_PASS).toString('base64');
}

async function getLastSeq(dbName: string): Promise<string> {
  try {
    const redis = getRedis();
    const seq = await redis.get(SEQ_KEY_PREFIX + dbName);
    return seq ?? '0';
  } catch {
    return '0';
  }
}

async function saveLastSeq(dbName: string, seq: string | number): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(SEQ_KEY_PREFIX + dbName, 86_400, String(seq)); // 24h TTL
  } catch {
    // Non-fatal — next run starts from 0
  }
}

async function pollOnce(dbName: MemoryDatabase, since: string): Promise<{
  rows: ChangeRow[];
  lastSeq: string | number;
}> {
  const url =
    `${COUCHDB_URL}/${dbName}/_changes` +
    `?feed=longpoll&include_docs=true&since=${encodeURIComponent(since)}&timeout=${POLL_TIMEOUT_MS}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS + 5_000),
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) throw new Error(`[changes-consumer] ${dbName} poll failed: ${res.status}`);

  const data = await res.json() as ChangesResponse;
  return { rows: data.results, lastSeq: data.last_seq };
}

// ── Consumer loop ─────────────────────────────────────────────────────────────

export interface ChangesConsumer {
  [Symbol.asyncDispose](): Promise<void>;
}

const _activeLoops = new Map<MemoryDatabase, boolean>();

async function runLoop(dbName: MemoryDatabase): Promise<void> {
  _activeLoops.set(dbName, true);
  let since = await getLastSeq(dbName);

  while (_activeLoops.get(dbName)) {
    try {
      const { rows, lastSeq } = await pollOnce(dbName, since);

      for (const row of rows) {
        if (row.deleted || !row.doc) continue;
        // Fire-and-forget mirror; errors logged inside
        mirrorMemoryDoc(dbName, row.doc).catch((err) =>
          console.warn(`[changes-consumer] mirror failed for ${row.id}:`, err)
        );
      }

      if (rows.length > 0 || since !== String(lastSeq)) {
        since = String(lastSeq);
        await saveLastSeq(dbName, lastSeq);
      }
    } catch (err) {
      if (!_activeLoops.get(dbName)) break; // was stopped
      console.warn(`[changes-consumer] ${dbName} error, retrying in ${ERROR_BACKOFF_MS}ms:`, err);
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }
}

/**
 * Start _changes consumers for all memory databases.
 * Returns a disposable that stops all loops on disposal.
 */
export async function startChangesConsumer(
  databases: MemoryDatabase[] = [...MEMORY_DATABASES],
): Promise<ChangesConsumer> {
  for (const db of databases) {
    if (!_activeLoops.get(db)) {
      // Don't await — runs in background
      runLoop(db).catch((err) =>
        console.error('[changes-consumer] fatal loop error on', db, err)
      );
    }
  }

  return {
    async [Symbol.asyncDispose]() {
      for (const db of databases) _activeLoops.set(db, false);
      // Short wait for current poll to finish
      await new Promise((r) => setTimeout(r, 500));
    },
  };
}

/**
 * Stop consumers for specific (or all) databases.
 */
export function stopChangesConsumer(databases?: MemoryDatabase[]): void {
  const targets = databases ?? [...MEMORY_DATABASES];
  for (const db of targets) _activeLoops.set(db, false);
}

/**
 * Check if a consumer loop is active.
 */
export function isConsumerActive(dbName: MemoryDatabase): boolean {
  return _activeLoops.get(dbName) === true;
}
