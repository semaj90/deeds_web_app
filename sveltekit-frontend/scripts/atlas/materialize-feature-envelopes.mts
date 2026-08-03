#!/usr/bin/env node
/**
 * Phase 3: Materialize Feature Envelopes
 *
 * Every atlas_packets row gets a FeatureEnvelope JSONB:
 * {
 *   dense: 0-1 score from embeddings
 *   lexical: 0-1 score from BM25
 *   ast: 0-1 score from symbol coverage
 *   graph: 0-1 score from topology edges
 *   pagerank: 0-1 score from graph authority
 *   ontology: 0-1 score from semantic relationships
 *   telemetry: 0-1 score from usage frequency
 *   reranker: pending (populated by reranking stage)
 *   recommendation: pending (populated by recommendation engine)
 * }
 */

import pkg from 'pg';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
const { Pool } = pkg;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function parseLimitArg(defaultValue: number): number {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  if (!limitArg) return defaultValue;

  const value = Number.parseInt(limitArg.split('=', 2)[1] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

function parseAfterArg(): string | null {
  const afterArg = process.argv.find((arg) => arg.startsWith('--after='));
  return afterArg ? afterArg.split('=', 2)[1] ?? null : null;
}

// Keyset-pagination cursor, persisted only for --force-refresh runs (normal mode
// self-excludes already-materialized rows via the feature_envelope IS NULL filter,
// so it doesn't need a persisted cursor to make forward progress). Without this,
// --force-refresh repeatedly rewrote the same first `fetchLimit` packet_ids on every
// invocation and never reached the rest of the corpus — the same bug class the
// non-force-refresh path had before its own skip-guard fix.
const FORCE_REFRESH_CURSOR_FILE = resolve('.tmp', 'materialize-feature-envelopes-force-refresh-cursor.json');

function loadPersistedCursor(): string | null {
  try {
    if (!existsSync(FORCE_REFRESH_CURSOR_FILE)) return null;
    const data = JSON.parse(readFileSync(FORCE_REFRESH_CURSOR_FILE, 'utf-8'));
    return typeof data.next_after_packet_id === 'string' ? data.next_after_packet_id : null;
  } catch {
    return null;
  }
}

function savePersistedCursor(nextAfterPacketId: string | null): void {
  try {
    mkdirSync(resolve('.tmp'), { recursive: true });
    writeFileSync(FORCE_REFRESH_CURSOR_FILE, JSON.stringify({ next_after_packet_id: nextAfterPacketId, saved_at: new Date().toISOString() }, null, 2));
  } catch {
    // Non-fatal — worst case, the next force-refresh run restarts from the beginning.
  }
}

// Direct pg.Pool connection — matches the canonical pattern used by
// materialize-addressable-packets.mjs. execSync + `docker exec psql` was
// replaced here because piping large result sets (tens of thousands of
// rows) through Windows cmd.exe hits ENOBUFS (see CLAUDE.md "Qdrant API
// Strategy" / "Docker: Use docker exec directly (NOT Node.js wrappers)").
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin',
  password: process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456',
  database: process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db',
  max: 1,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 5000,
  query_timeout: 90000,
  statement_timeout: 90000,
  allowExitOnIdle: true,
});

function normalizeScore(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0.5;
  const num = Number(value);
  if (isNaN(num)) return 0.5;
  return Math.max(0, Math.min(1, num));
}

interface FeatureEnvelope {
  dense: number;
  lexical: number;
  ast: number;
  graph: number;
  pagerank: number;
  ontology: number;
  telemetry: number;
  reranker: null;
  recommendation: null;
  semantic_feature_dim: number;
  total_feature_dim: number;
  feature_schema_version: string;
}

const SEMANTIC_FEATURE_DIM = 768;
const TOTAL_FEATURE_DIM = 7;
const FEATURE_SCHEMA_VERSION = 'atlas.feature_envelope.v1';

interface PacketRow {
  packet_id: string;
  dense_score: number | null;
  lexical_score: number | null;
  ast_score: number | null;
  graph_score: number | null;
  pagerank_score: number | null;
  ontology_score: number | null;
  telemetry_score: number | null;
}

// Shared advisory-lock key — same key used by scripts/atlas/backfill-latent-vectors.mjs
// (ATLAS_PACKETS_BULK_WRITER_LOCK_KEY there). Two separate incidents this session
// (2026-08-02, 2026-08-03 — OpenSpec GS1.43) deadlocked bulk batch-UPDATE writers
// against atlas_packets: first two concurrent invocations of this script, then this
// script against backfill-latent-vectors.mjs's independent latent_64/metadata writes.
// Neither script has internal concurrency (this one: pool max:1) — the only way to
// deadlock is two separate bulk-writer processes running against atlas_packets at
// once. Any future script doing a bulk batch UPDATE against atlas_packets should
// acquire this same key before its write phase.
const ADVISORY_LOCK_KEY = 847_662_501; // arbitrary, stable — hashtext('atlas:packets:bulk_writer') truncated to int4 range

const RETRYABLE_PG_ERROR_CODES = new Set(['57P03', '57P01', '08006', '08003']);
const RETRYABLE_PG_ERROR_PATTERNS = [
  /database system is in recovery mode/i,
  /the database system is starting up/i,
  /terminating connection due to administrator command/i,
  /connection terminated unexpectedly/i,
];

function isRetryablePgError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const error = err as Error & { code?: string };
  return Boolean(error.code && RETRYABLE_PG_ERROR_CODES.has(error.code))
    || RETRYABLE_PG_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  const batchSize = 500;
  const fetchLimit = parseLimitArg(dryRun ? 200 : 10_000);
  const maxAttempts = dryRun ? 1 : 3;
  const lockRetryDelayMs = 10_000;
  const maxLockAttempts = dryRun ? 1 : 30;

  console.log('Phase 3: Materialize Feature Envelopes');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (!dryRun) {
        let locked = false;
        for (let lockAttempt = 1; lockAttempt <= maxLockAttempts; lockAttempt += 1) {
          const lockResult = await pool.query('SELECT pg_try_advisory_lock($1) AS locked;', [ADVISORY_LOCK_KEY]);
          locked = Boolean(lockResult.rows[0]?.locked);
          if (locked) break;

          if (lockAttempt < maxLockAttempts) {
            console.warn(`Feature-envelope advisory lock is held by another writer (attempt ${lockAttempt}/${maxLockAttempts}); retrying in ${lockRetryDelayMs / 1000}s...`);
            await sleep(lockRetryDelayMs);
          }
        }

        if (!locked) {
          console.error('Another materialize-feature-envelopes --apply run holds the advisory lock after waiting. Exiting without writing.');
          await pool.end();
          process.exitCode = 1;
          return;
        }
      }

    console.log('[1/5] Counting atlas_packets...');
    const countResult = await pool.query('SELECT COUNT(*)::int AS cnt FROM atlas_packets;');
    const totalPackets = countResult.rows[0]?.cnt ?? 0;

    console.log(`  ✓ Total packets: ${totalPackets}`);
    console.log('');

    // --apply only touches packets that don't have a feature_envelope yet, so repeat
    // runs are incremental (new/backfilled packets) instead of re-walking the same
    // first `fetchLimit` packet_ids every time and never reaching the rest of the
    // corpus. --force-refresh opts back into the old unconditional-recompute behavior
    // (e.g. after a FEATURE_SCHEMA_VERSION bump where existing envelopes are stale) —
    // but still keyset-paginates via packet_id, so successive force-refresh runs
    // advance through the corpus rather than repeatedly rewriting the same rows.
    const forceRefresh = process.argv.includes('--force-refresh');
    const explicitAfter = parseAfterArg();
    const afterPacketId = explicitAfter ?? (forceRefresh ? loadPersistedCursor() : null) ?? '';
    console.log('[2/5] Fetching packets with score components...');
    console.log(`  Keyset cursor: packet_id > '${afterPacketId || '(start)'}' LIMIT ${fetchLimit}`);
    const fetchResult = await pool.query<PacketRow>(
      `
      SELECT
        packet_id,
        CASE WHEN embedding IS NOT NULL THEN 0.8 ELSE 0.5 END as dense_score,
        CASE WHEN array_length(concept_ids, 1) > 0 THEN LEAST(1.0, array_length(concept_ids, 1)::float / 10.0) ELSE 0.5 END as lexical_score,
        CASE WHEN payload->>'ast_symbols' IS NOT NULL THEN 0.85 ELSE 0.5 END as ast_score,
        CASE WHEN community_id IS NOT NULL THEN 0.75 ELSE 0.5 END as graph_score,
        CASE WHEN topology->>'pagerank_score' IS NOT NULL THEN (topology->>'pagerank_score')::float ELSE 0.5 END as pagerank_score,
        CASE WHEN array_length(concept_ids, 1) > 3 THEN 0.7 WHEN array_length(concept_ids, 1) > 0 THEN 0.5 ELSE 0.3 END as ontology_score,
        CASE WHEN metadata->>'access_count' IS NOT NULL THEN LEAST(1.0, (metadata->>'access_count')::float / 100.0) ELSE 0.5 END as telemetry_score
      FROM atlas_packets
      WHERE packet_id > $3
        AND ($4 OR feature_envelope IS NULL OR feature_envelope->>'feature_schema_version' IS DISTINCT FROM $2)
      ORDER BY packet_id
      LIMIT $1;
      `,
      [fetchLimit, FEATURE_SCHEMA_VERSION, afterPacketId, forceRefresh]
    );

    const envelopes: Array<{ packet_id: string; envelope: FeatureEnvelope }> = fetchResult.rows.map((packet) => ({
      packet_id: packet.packet_id,
      envelope: {
        dense: normalizeScore(packet.dense_score),
        lexical: normalizeScore(packet.lexical_score),
        ast: normalizeScore(packet.ast_score),
        graph: normalizeScore(packet.graph_score),
        pagerank: normalizeScore(packet.pagerank_score),
        ontology: normalizeScore(packet.ontology_score),
        telemetry: normalizeScore(packet.telemetry_score),
        reranker: null,
        recommendation: null,
        semantic_feature_dim: SEMANTIC_FEATURE_DIM,
        total_feature_dim: TOTAL_FEATURE_DIM,
        feature_schema_version: FEATURE_SCHEMA_VERSION,
      },
    }));

    console.log(`  ✓ Fetched ${envelopes.length} packets needing refresh`);
    console.log('');

    // Digests requested by Phase 7 of the Graphify recovery proof ladder
    // (openspec/changes/parent-atlas-graphify-recovery-proof-ladder/tasks.md) — computed over
    // the already-deterministic packet_id-ordered result set, so identical input data always
    // produces identical digests (no wall-clock/random content feeds into either hash).
    const inputDigest = sha256Hex(
      JSON.stringify(fetchResult.rows.map((r) => ({ packet_id: r.packet_id, dense_score: r.dense_score, lexical_score: r.lexical_score, ast_score: r.ast_score, graph_score: r.graph_score, pagerank_score: r.pagerank_score, ontology_score: r.ontology_score, telemetry_score: r.telemetry_score })))
    );
    const outputDigest = sha256Hex(
      JSON.stringify(envelopes.map((e) => ({ packet_id: e.packet_id, envelope: e.envelope })))
    );

    const firstPacketId = envelopes[0]?.packet_id ?? null;
    const lastPacketId = envelopes[envelopes.length - 1]?.packet_id ?? null;
    // A short page (< fetchLimit) means this pass exhausted the eligible set from this
    // cursor position — null signals "start over from the beginning next time", not
    // "stop forever". A full page means there's more; resume from lastPacketId.
    const nextAfterPacketId = envelopes.length === fetchLimit ? lastPacketId : null;

    async function writeReceipt(updatedCount: number) {
      let remaining = 0;
      try {
        const remainingResult = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM atlas_packets
           WHERE packet_id > $2
             AND ($3 OR feature_envelope IS NULL OR feature_envelope->>'feature_schema_version' IS DISTINCT FROM $1);`,
          [FEATURE_SCHEMA_VERSION, nextAfterPacketId ?? afterPacketId, forceRefresh],
        );
        remaining = remainingResult.rows[0]?.cnt ?? 0;
      } catch {
        // Non-fatal — remaining stays 0 (best-effort receipt field).
      }
      const receipt = {
        first_packet_id: firstPacketId,
        last_packet_id: lastPacketId,
        next_after_packet_id: nextAfterPacketId,
        selected: envelopes.length,
        updated: updatedCount,
        remaining,
        force_refresh: forceRefresh,
        dry_run: dryRun,
        input_digest: inputDigest,
        output_digest: outputDigest,
        generated_at: new Date().toISOString(),
      };
      try {
        mkdirSync(resolve('..', 'docs', 'reports'), { recursive: true });
        writeFileSync(resolve('..', 'docs', 'reports', 'materialize-feature-envelopes-receipt.json'), JSON.stringify(receipt, null, 2));
      } catch {
        // Non-fatal.
      }
      if (forceRefresh) savePersistedCursor(nextAfterPacketId);
      console.log('Receipt:', JSON.stringify(receipt, null, 2));
    }

    if (envelopes.length === 0) {
      console.log('No packets require a feature-envelope refresh for the current schema version.');
      await writeReceipt(0);
      await pool.end();
      return;
    }

    console.log('[3/5] Building feature envelopes...');
    console.log(`  ✓ Built ${envelopes.length} envelopes`);
    console.log('');

    if (dryRun) {
      console.log('DRY-RUN MODE:');
      console.log(`  Would update ${envelopes.length} packets with feature envelopes`);
      console.log('');
      console.log('Sample envelope:');
      if (envelopes.length > 0) {
        console.log(`  ${JSON.stringify(envelopes[0].envelope, null, 2)}`);
      }
      console.log('');
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/materialize-feature-envelopes.mts --apply`);
      await writeReceipt(0);
    } else {
      console.log('[4/5] Applying feature envelopes to Postgres...');

      // Single UNNEST-based batch UPDATE per chunk instead of one round-trip UPDATE per row
      // inside an open transaction — the exact anti-pattern the Graphify recovery proof
      // ladder's Phase 6 calls out ("Avoid hundreds of independent row updates in an open
      // transaction"). With batchSize=500 the old code issued 500 sequential round-trips per
      // transaction; this issues one. Uses pool.query() for BEGIN/UPDATE/COMMIT rather than a
      // checked-out client — correct only because this pool is max:1 (single connection), so
      // every query in this process necessarily runs on the same connection. If max is ever
      // raised above 1, this must switch to pool.connect() + client.query() or BEGIN/COMMIT
      // could silently run on different connections and never actually be transactional.
      for (let i = 0; i < envelopes.length; i += batchSize) {
        const batch = envelopes.slice(i, i + batchSize);
        const packetIds = batch.map((e) => e.packet_id);
        const envelopeJson = batch.map((e) => JSON.stringify(e.envelope));

        await pool.query('BEGIN');
        try {
          await pool.query(
            `
            UPDATE atlas_packets AS packet
            SET feature_envelope = incoming.feature_envelope
            FROM (
              SELECT * FROM UNNEST($1::text[], $2::jsonb[]) AS t(packet_id, feature_envelope)
            ) AS incoming
            WHERE packet.packet_id = incoming.packet_id;
            `,
            [packetIds, envelopeJson]
          );
          await pool.query('COMMIT');
        } catch (batchErr) {
          await pool.query('ROLLBACK');
          throw batchErr;
        }

        console.log(`  ✓ Applied batch ${Math.floor(i / batchSize) + 1} (${Math.min(i + batchSize, envelopes.length)}/${envelopes.length})`);
      }

      console.log('');
      console.log('[5/5] Verifying feature envelopes...');
      const verifyResult = await pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(CASE WHEN feature_envelope IS NOT NULL THEN 1 END)::int AS with_envelope FROM atlas_packets;`
      );
      console.log(verifyResult.rows[0]);
      console.log('');
      console.log('✅ FEATURE ENVELOPE MATERIALIZATION COMPLETE');
      await writeReceipt(envelopes.length);
    }
      await pool.end();
      return;
    } catch (err) {
      if (!dryRun && attempt < maxAttempts && isRetryablePgError(err)) {
        console.warn(`Transient Postgres recovery during feature-envelope materialization (attempt ${attempt}/${maxAttempts}): ${(err as Error).message}`);
        try { await pool.end(); } catch {}
        await sleep(5_000);
        continue;
      }

      console.error('Fatal error:', err);
      process.exitCode = 1;
      try { await pool.end(); } catch {}
      return;
    }
  }
}

main();
