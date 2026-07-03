#!/usr/bin/env node
/**
 * backfill-packet-lineage.mjs
 *
 * Additive lineage backfill for atlas_packets.
 *
 * Populates:
 *   - packet_ulid: sortable lineage/order id
 *   - title_id: semantic grouping key derived from summary / feature labels
 *   - canonical_source_ref: normalized lineage anchor for joins
 *
 * This script does not mutate canonical packet_id or packet_key.
 */

import pg from 'pg';
import crypto from 'node:crypto';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { normalizeSourceRef } from './lib/normalize-source-ref.mjs';

const { Pool } = pg;

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);
const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : 0;
const BATCH_SIZE = 250;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'was', 'were', 'will', 'with', 'use', 'used', 'using', 'via', 'their', 'your',
  'summary', 'chunk', 'packet', 'file', 'code', 'codes', 'function',
]);

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(time, length = 10) {
  let value = Math.floor(time);
  let out = '';
  for (let i = 0; i < length; i++) {
    out = ULID_ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandom(bytes) {
  let out = '';
  let value = 0;
  let bits = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ULID_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    out += ULID_ALPHABET[(value << (5 - bits)) & 31];
  }

  return out.padEnd(16, '0').slice(0, 16);
}

function makePacketUlid(now = Date.now()) {
  return `${encodeTime(now, 10)}${encodeRandom(crypto.randomBytes(10))}`;
}

function slugifyTitleId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
}

function deriveTitleId(row) {
  const direct =
    row.title_id ??
    row.metadata?.title_id ??
    row.metadata?.titleId ??
    row.payload?.title_id ??
    row.payload?.titleId ??
    row.feature_label ??
    row.feature_id ??
    null;

  if (direct) {
    const cleanDirect = slugifyTitleId(direct);
    if (cleanDirect) return cleanDirect;
  }

  const summary = String(row.summary ?? row.metadata?.summary ?? row.payload?.summary ?? '').trim();
  if (summary) {
    const tokens = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s._/-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token && !STOP_WORDS.has(token))
      .slice(0, 4);
    if (tokens.length) return slugifyTitleId(tokens.join(' '));
  }

  const fallback = slugifyTitleId(row.feature_id ?? row.packet_key ?? row.source_ref ?? 'packet');
  return fallback || 'packet';
}

function canonicalizeTitleId(value) {
  const clean = slugifyTitleId(value);
  return clean || null;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const mode = APPLY ? 'APPLY' : 'DRY-RUN';
  let total = 0;
  let scanned = 0;
  let updated = 0;
  let already = 0;
  let skipped = 0;

  try {
    const countRes = await pool.query(`
      SELECT count(*)::int AS total
      FROM atlas_packets
      WHERE (packet_ulid IS NULL OR packet_ulid = '')
         OR (title_id IS NULL OR title_id = '')
         OR (canonical_source_ref IS NULL OR canonical_source_ref = '')
    `);
    total = countRes.rows[0]?.total ?? 0;

    console.log(`[packet-lineage] mode=${mode} total=${total}${LIMIT > 0 ? ` limit=${LIMIT}` : ''}`);
    if (!total) {
      console.log('[packet-lineage] nothing to backfill');
      return;
    }

    while (true) {
      if (LIMIT > 0 && scanned >= LIMIT) break;
      const query = `
        SELECT packet_id, packet_key, source_ref, canonical_source_ref, title_id, feature_id, feature_label, summary, metadata, payload
        FROM atlas_packets
        WHERE (packet_ulid IS NULL OR packet_ulid = '')
           OR (title_id IS NULL OR title_id = '')
           OR (canonical_source_ref IS NULL OR canonical_source_ref = '')
        ORDER BY created_at NULLS LAST, updated_at NULLS LAST, packet_id
        LIMIT $1
      `;
      const batchLimit = LIMIT > 0 ? Math.min(BATCH_SIZE, LIMIT - scanned) : BATCH_SIZE;
      const res = await pool.query(query, [batchLimit]);
      if (res.rows.length === 0) break;

      for (const row of res.rows) {
        if (LIMIT > 0 && scanned >= LIMIT) break;
        scanned++;

        const canonicalSourceRef = normalizeSourceRef(
          row.canonical_source_ref || row.source_ref || row.packet_key || ''
        );
        const packetUlid = row.packet_ulid && String(row.packet_ulid).trim()
          ? String(row.packet_ulid).trim()
          : makePacketUlid();
        const titleId = canonicalizeTitleId(deriveTitleId(row));

        const needsUpdate =
          String(row.packet_ulid ?? '').trim() !== packetUlid ||
          String(row.title_id ?? '').trim() !== titleId ||
          String(row.canonical_source_ref ?? '').trim() !== canonicalSourceRef;

        if (!needsUpdate) {
          already++;
          continue;
        }

        if (!APPLY) {
          console.log(`[dry] ${row.packet_id} packet_ulid=${packetUlid} title_id=${titleId} canonical_source_ref=${canonicalSourceRef}`);
          skipped++;
          continue;
        }

        await pool.query(
          `
            UPDATE atlas_packets
            SET packet_ulid = $2,
                title_id = $3,
                canonical_source_ref = $4
            WHERE packet_id = $1
          `,
          [row.packet_id, packetUlid, titleId, canonicalSourceRef]
        );
        updated++;
      }
    }

    console.log(JSON.stringify({
      mode,
      total,
      scanned,
      updated,
      already,
      skipped,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[packet-lineage] fatal:', err.message);
  process.exit(1);
});
