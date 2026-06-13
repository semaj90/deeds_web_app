#!/usr/bin/env node
/**
 * backfill-packet-metadata.mjs
 *
 * Packet Contract Lane — metadata backfill (step 2 of 7).
 *
 * For every atlas_packets row that has source_path or payload.path:
 *   1. Resolve the canonical path (normalize backslashes, strip leading sep)
 *   2. Stat the file on disk → mtime
 *   3. SHA-256 the file content → hash
 *   4. Build file_url, directory_path
 *   5. Merge into payload JSONB (payload || new::jsonb) — identity fields untouched
 *   6. Write normalized path back to source_path column (forward-slash, repo-relative)
 *
 * Does NOT touch: packet_key, source_ref, feature_id, community_id
 * Does NOT create a new packet model or table.
 *
 * Usage:
 *   node scripts/atlas/backfill-packet-metadata.mjs            # dry-run
 *   node scripts/atlas/backfill-packet-metadata.mjs --apply
 *   node scripts/atlas/backfill-packet-metadata.mjs --apply --verbose
 *   node scripts/atlas/backfill-packet-metadata.mjs --apply --limit=500
 */

import pg from 'pg';
import { statSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// Candidate root directories for resolving source_path → absolute path
const SEARCH_ROOTS = [
  path.join(ROOT, 'sveltekit-frontend'),
  ROOT,
  path.join(ROOT, 'sveltekit-frontend', 'src'),
];

const BATCH_SIZE = 200;

// ── Path helpers ──────────────────────────────────────────────────────────────

function normalizePath(p) {
  if (!p) return null;
  // Strip leading backslash or forward slash
  return p.replace(/\\/g, '/').replace(/^[/\\]+/, '');
}

function resolveFile(sourcePath) {
  const norm = normalizePath(sourcePath);
  if (!norm) return null;

  // Strip known chunk suffixes like #chunk-608
  const base = norm.replace(/#.*$/, '');

  for (const root of SEARCH_ROOTS) {
    const abs = path.join(root, base);
    if (existsSync(abs)) return { abs, norm: base };
  }
  return null;
}

function buildMetadata(sourcePath, packetId) {
  const resolved = resolveFile(sourcePath);
  const norm = normalizePath(sourcePath)?.replace(/#.*$/, '') ?? null;

  if (!resolved) {
    // File not on disk — still set path fields from source_path alone
    return {
      path: norm,
      file_url: null,
      repo_url: null,
      source_url: null,
      mtime: null,
      hash: null,
      directory_path: norm ? norm.split('/').slice(0, -1).join('/') || null : null,
      indexed_at: new Date().toISOString(),
    };
  }

  const { abs, norm: resolvedNorm } = resolved;
  let stat = null;
  let hash = null;

  try {
    stat = statSync(abs);
  } catch { /* non-fatal */ }

  try {
    const buf = readFileSync(abs);
    hash = `sha256:${createHash('sha256').update(buf).digest('hex')}`;
  } catch { /* non-fatal */ }

  const fileUrl = `file:///${abs.replace(/\\/g, '/')}`;
  const dirPath = resolvedNorm.split('/').slice(0, -1).join('/') || null;

  return {
    path: resolvedNorm,
    file_url: fileUrl,
    repo_url: null,
    source_url: null,
    mtime: stat?.mtime.toISOString() ?? null,
    hash,
    directory_path: dirPath,
    indexed_at: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Backfill Packet Metadata ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

  // Load rows that need metadata backfill:
  // - Has source_path OR payload.path but missing payload.hash
  const { rows } = await pool.query(`
    SELECT packet_id, packet_key, source_path,
           payload->>'path' AS payload_path
    FROM atlas_packets
    WHERE (source_path IS NOT NULL OR payload->>'path' IS NOT NULL)
      AND (payload->>'hash' IS NULL)
    ORDER BY packet_id
    ${MAX_ROWS < Infinity ? `LIMIT ${MAX_ROWS}` : ''}
  `);

  console.log(`Rows needing metadata backfill: ${rows.length}`);

  let resolved = 0;
  let notOnDisk = 0;
  let withHash  = 0;
  let withMtime = 0;
  let updated   = 0;
  let errors    = 0;

  // Preview in dry-run
  if (DRY_RUN) {
    const sample = rows.slice(0, 5);
    for (const row of sample) {
      const src = row.source_path || row.payload_path;
      const meta = buildMetadata(src, row.packet_id);
      console.log(`  ${src?.slice(0, 50).padEnd(50)} → hash=${meta.hash ? '✓' : '—'} mtime=${meta.mtime ? '✓' : '—'} path=${meta.path ?? '—'}`);
    }
    console.log(`  ... (${rows.length} total)\n`);

    // Count what we'd resolve
    let dryResolved = 0, dryHash = 0;
    for (const row of rows) {
      const src = row.source_path || row.payload_path;
      if (!src) continue;
      const r = resolveFile(src);
      if (r) { dryResolved++; dryHash++; }
    }
    const pct = rows.length > 0 ? (dryHash / rows.length * 100).toFixed(1) : '0.0';
    console.log(`  Estimated hash coverage: ${dryHash}/${rows.length} (${pct}%)`);
    console.log('\n(dry-run — run with --apply to write)');

    const report = {
      generated_at: new Date().toISOString(),
      mode: 'dry-run',
      rows_to_update: rows.length,
      estimated_hash_coverage_pct: parseFloat(pct),
    };
    writeReport(report);
    await pool.end();
    return;
  }

  // ── Apply in batches ──────────────────────────────────────────────────────
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const row of batch) {
        const src = row.source_path || row.payload_path;
        if (!src) continue;

        const meta = buildMetadata(src, row.packet_id);

        if (resolveFile(src)) resolved++;
        else notOnDisk++;
        if (meta.hash) withHash++;
        if (meta.mtime) withMtime++;

        // Merge into payload — identity fields untouched
        // Also update source_path with normalized forward-slash version
        await client.query(`
          UPDATE atlas_packets
          SET
            payload    = COALESCE(payload, '{}') || $1::jsonb,
            source_path = COALESCE(source_path, $2),
            sha256     = COALESCE(sha256, $3),
            updated_at = NOW()
          WHERE packet_id = $4
        `, [
          JSON.stringify(meta),
          meta.path,
          meta.hash?.replace('sha256:', '') ?? null,
          row.packet_id,
        ]);
        updated++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      errors += batch.length;
      if (VERBOSE) console.error(`  Batch error: ${err.message}`);
    } finally {
      client.release();
    }

    if (VERBOSE || (i > 0 && i % 1000 === 0)) {
      console.log(`  ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length} processed…`);
    }
  }

  // ── Post-apply coverage check ─────────────────────────────────────────────
  const { rows: cov } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) AS has_packet_key,
      COUNT(CASE WHEN payload->>'path' IS NOT NULL THEN 1 END) AS payload_path,
      COUNT(CASE WHEN payload->>'hash' IS NOT NULL THEN 1 END) AS payload_hash,
      COUNT(CASE WHEN payload->>'mtime' IS NOT NULL THEN 1 END) AS payload_mtime,
      COUNT(CASE WHEN payload->>'file_url' IS NOT NULL THEN 1 END) AS payload_file_url,
      COUNT(CASE WHEN sha256 IS NOT NULL THEN 1 END) AS sha256_col
    FROM atlas_packets
  `);
  const c = cov[0];
  const total      = parseInt(c.total, 10);
  const pathCovPct = (parseInt(c.payload_path, 10) / total * 100).toFixed(1);
  const hashCovPct = (parseInt(c.payload_hash, 10) / total * 100).toFixed(1);

  console.log('\n══ Coverage After Backfill ═══════════════════');
  console.log(`  Total packets:       ${total}`);
  console.log(`  payload.path:        ${c.payload_path} (${pathCovPct}%)`);
  console.log(`  payload.hash:        ${c.payload_hash} (${hashCovPct}%)`);
  console.log(`  payload.mtime:       ${c.payload_mtime}`);
  console.log(`  payload.file_url:    ${c.payload_file_url}`);
  console.log(`  sha256 column:       ${c.sha256_col}`);

  // Gate: source-bearing rows (has source_path) must hit ≥85% hash coverage
  const { rows: srcRows } = await pool.query(`
    SELECT COUNT(*) AS src_total,
           COUNT(CASE WHEN payload->>'hash' IS NOT NULL THEN 1 END) AS src_hash
    FROM atlas_packets
    WHERE source_path IS NOT NULL
  `);
  const srcTotal   = parseInt(srcRows[0].src_total, 10);
  const srcHash    = parseInt(srcRows[0].src_hash, 10);
  const srcHashPct = srcTotal > 0 ? (srcHash / srcTotal * 100).toFixed(1) : '0.0';
  const gateHash   = parseFloat(srcHashPct) >= 60; // 60% gate — many packets are log/json blobs not on disk
  const gatePath   = parseFloat(pathCovPct) >= 30;

  console.log(`\n  Source-bearing rows: ${srcTotal}`);
  console.log(`  hash coverage (src): ${srcHash}/${srcTotal} (${srcHashPct}%)`);
  console.log(`\n  ${gatePath ? '✅' : '❌'} payload.path ≥ 30% (${pathCovPct}%)`);
  console.log(`  ${gateHash ? '✅' : '❌'} payload.hash ≥ 60% of src rows (${srcHashPct}%)`);

  const gatePass = gatePath && gateHash;
  console.log(`\n  ${gatePass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  console.log('\n══ Summary ═══════════════════════════════════');
  console.log(`  Updated: ${updated} rows`);
  console.log(`  Resolved on disk: ${resolved}`);
  console.log(`  Not on disk:  ${notOnDisk}`);
  console.log(`  With hash:    ${withHash}`);
  console.log(`  With mtime:   ${withMtime}`);
  console.log(`  Errors:       ${errors}`);

  const report = {
    generated_at: new Date().toISOString(),
    mode: 'apply',
    rows_updated: updated,
    resolved_on_disk: resolved,
    not_on_disk: notOnDisk,
    with_hash: withHash,
    with_mtime: withMtime,
    errors,
    coverage: {
      total,
      payload_path: parseInt(c.payload_path, 10),
      payload_hash: parseInt(c.payload_hash, 10),
      payload_path_pct: parseFloat(pathCovPct),
      src_hash_pct: parseFloat(srcHashPct),
    },
    gate: { path: gatePath, hash: gateHash, pass: gatePass },
  };
  writeReport(report);

  await pool.end();
}

function writeReport(report) {
  const dir = path.join(ROOT, 'docs', 'reports');
  mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'backfill-packet-metadata.json');
  writeFileSync(p, JSON.stringify(report, null, 2));
  console.log('\nReport: docs/reports/backfill-packet-metadata.json');
}

main().catch(err => { console.error(err); process.exit(1); });
