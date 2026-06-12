#!/usr/bin/env node
/**
 * backfill-atlas-packet-summaries-from-files.mjs
 *
 * Reads atlas_packets where summary is null/empty/path-only,
 * reads actual source files from disk, extracts bounded text windows,
 * and writes summary + payload.bm25_text + payload.summary_source.
 *
 * Gate:
 *   useful_summary coverage >= 80%   (length > 80 AND summary != source_ref)
 *
 * Usage:
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --dry-run
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --apply
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --dry-run --limit=100
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs --apply --verbose
 */

import pg from 'pg';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const VERBOSE   = process.argv.includes('--verbose');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// Text extraction config
const MAX_LINES        = 120;   // max lines to include from a file
const MIN_SUMMARY_LEN  = 80;    // below this = not useful
const MAX_SUMMARY_LEN  = 2000;  // cap to avoid bloating payload

// Root candidates to search for source files (in priority order)
const SEARCH_ROOTS = [
  join(ROOT, 'sveltekit-frontend', 'src'),
  join(ROOT, 'sveltekit-frontend'),
  join(ROOT, 'scripts'),
  join(ROOT, 'go-microservice'),
  ROOT,
];

// Extensions that yield useful BM25 text
const CODE_EXTENSIONS = new Set([
  '.ts', '.svelte', '.js', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.md', '.json', '.sql',
  '.css', '.scss', '.html', '.yaml', '.yml', '.toml',
]);

function normalizeSourceRef(sourceRef) {
  if (!sourceRef) return null;
  // Strip chunk suffix  e.g. #chunk-3
  let ref = sourceRef.replace(/#chunk-\d+$/, '').trim();
  // Strip leading sveltekit-frontend/
  ref = ref.replace(/^sveltekit-frontend\//, '');
  // Normalize backslashes
  ref = ref.replace(/\\/g, '/');
  return ref;
}

function isPathOnly(summary, sourceRef) {
  if (!summary) return true;
  if (summary.length < MIN_SUMMARY_LEN) return true;
  const normalized = normalizeSourceRef(sourceRef) ?? '';
  // If summary IS basically just the source_ref path, it's path-only
  if (summary.trim() === normalized.trim()) return true;
  // Very short and matches a path pattern
  if (summary.length < 120 && /^[\w/\\.@$-]+$/.test(summary.trim())) return true;
  return false;
}

function resolveFilePath(sourceRef) {
  const normalized = normalizeSourceRef(sourceRef);
  if (!normalized) return null;

  // Try direct candidates
  const candidates = [
    ...SEARCH_ROOTS.map(r => join(r, normalized)),
    join(ROOT, normalized),
    // with sveltekit-frontend prefix stripped already included above
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function extractBm25Text(filePath, content) {
  const ext = extname(filePath).toLowerCase();
  const lines = content.split('\n');

  if (!CODE_EXTENSIONS.has(ext)) {
    // Non-code: just first MAX_LINES lines
    return lines.slice(0, MAX_LINES).join('\n').substring(0, MAX_SUMMARY_LEN);
  }

  // Code files: extract semantically rich lines
  const importLines   = [];
  const exportLines   = [];
  const sigLines      = [];
  const commentLines  = [];
  const otherLines    = [];

  for (let i = 0; i < lines.length && otherLines.length + sigLines.length < MAX_LINES; i++) {
    const line = lines[i].trim();
    if (!line || line === '{' || line === '}' || line === '*/') continue;

    if (/^import\s/.test(line) || /^from\s/.test(line)) {
      importLines.push(line);
    } else if (/^export\s/.test(line) || /^export\s+default\s/.test(line)) {
      exportLines.push(line);
    } else if (
      /^(async\s+)?function\s+/.test(line) ||
      /^(export\s+)?(async\s+)?function\s+/.test(line) ||
      /^(export\s+)?class\s+/.test(line) ||
      /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/.test(line) ||
      /^(export\s+)?const\s+\w+\s*=\s*function/.test(line) ||
      /^(export\s+)?type\s+\w+/.test(line) ||
      /^(export\s+)?interface\s+\w+/.test(line) ||
      /^\s*(public|private|protected|static|async)\s+\w+\(/.test(line)
    ) {
      sigLines.push(line);
    } else if (/^\/\*\*|^\s*\*|^\/\//.test(line)) {
      if (commentLines.length < 20) commentLines.push(line);
    } else {
      if (otherLines.length < 40) otherLines.push(line);
    }
  }

  // Build ordered text: comments first (doc context), then imports, exports, sigs, other
  const parts = [
    ...commentLines.slice(0, 10),
    ...importLines.slice(0, 20),
    ...exportLines.slice(0, 20),
    ...sigLines.slice(0, 40),
    ...otherLines.slice(0, 30),
  ];

  return parts.join('\n').substring(0, MAX_SUMMARY_LEN);
}

function buildSummary(filePath, content) {
  const lines = content.split('\n');
  const meaningfulLines = lines.filter(l => {
    const t = l.trim();
    if (!t || t === '{' || t === '}' || t.startsWith('//') || t.startsWith('*')) return false;
    return t.length > 5;
  });

  // First 3 meaningful lines form the summary preview
  const preview = meaningfulLines.slice(0, 5).join(' ').replace(/\s+/g, ' ').substring(0, 200);
  const bm25Text = extractBm25Text(filePath, content);

  // Summary = bm25_text (used for FTS indexing + human preview)
  return {
    summary: bm25Text.length >= MIN_SUMMARY_LEN
      ? bm25Text.substring(0, MAX_SUMMARY_LEN)
      : preview || filePath,
    bm25Text,
    summarySource: 'filesystem',
  };
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`\n═══ Atlas Packet Summary Backfill ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);

  // ── 1. Load packets needing summary backfill ──────────────────────────────
  const { rows: packets } = await pool.query(`
    SELECT packet_id, source_ref, summary
    FROM atlas_packets
    WHERE summary IS NULL
       OR length(summary) < 80
       OR (summary = source_ref)
       OR (summary ~ '^[\\w/\\\\.@$\\-]+$' AND length(summary) < 120)
    ORDER BY source_ref
  `);

  const toProcess = packets.slice(0, MAX_ROWS);
  console.log(`Packets needing summary: ${packets.length} (processing: ${toProcess.length})`);

  // ── 2. Current coverage baseline ─────────────────────────────────────────
  const { rows: [baseline] } = await pool.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE length(summary) > 80 AND summary <> source_ref) AS useful_before
    FROM atlas_packets
  `);
  console.log(`Current useful summary coverage: ${baseline.useful_before}/${baseline.total} (${((baseline.useful_before/baseline.total)*100).toFixed(1)}%)`);

  // ── 3. Resolve files and build update plan ────────────────────────────────
  const updates   = [];
  let found       = 0;
  let notFound    = 0;
  let tooShort    = 0;
  let skippedBinary = 0;

  for (const pkt of toProcess) {
    const filePath = resolveFilePath(pkt.source_ref);
    if (!filePath) {
      notFound++;
      if (VERBOSE) console.log(`  MISS: ${pkt.source_ref}`);
      continue;
    }

    const ext = extname(filePath).toLowerCase();
    // Skip obvious binary/non-text
    if (['.png','.jpg','.jpeg','.gif','.svg','.ico','.wasm','.node','.bin','.zip','.lock'].includes(ext)) {
      skippedBinary++;
      continue;
    }

    let content;
    try {
      const raw = readFileSync(filePath);
      // Detect binary: if >5% non-printable bytes (excluding common whitespace), skip
      const sample = raw.slice(0, 512);
      let nonPrintable = 0;
      for (const b of sample) {
        if (b === 0 || (b < 9) || (b > 13 && b < 32 && b !== 27)) nonPrintable++;
      }
      if (nonPrintable / Math.min(raw.length, 512) > 0.05) {
        skippedBinary++;
        continue;
      }
      // Decode as UTF-8, replacing invalid sequences, then strip null bytes
      content = raw.toString('utf8').replace(/\0/g, '').replace(/[\x00-\x08\x0E-\x1F\x7F]/g, ' ');
    } catch {
      notFound++;
      continue;
    }

    if (!content || content.length < 10) {
      tooShort++;
      continue;
    }

    const { summary, bm25Text, summarySource } = buildSummary(filePath, content);

    if (summary.length < MIN_SUMMARY_LEN) {
      tooShort++;
      continue;
    }

    // Sanitize: strip null bytes and control chars that Postgres rejects
    const sanitize = (s) => s.replace(/\0/g, '').replace(/[\x00-\x08\x0E-\x1F\x7F]/g, ' ').substring(0, MAX_SUMMARY_LEN);

    found++;
    updates.push({
      packet_id:      pkt.packet_id,
      summary:        sanitize(summary),
      bm25_text:      sanitize(bm25Text),
      summary_source: summarySource,
    });

    if (VERBOSE) console.log(`  OK: ${pkt.source_ref} → ${summary.length} chars`);
  }

  console.log(`\nResolution:`);
  console.log(`  File found + extractable: ${found}`);
  console.log(`  File not found:           ${notFound}`);
  console.log(`  Too short after extract:  ${tooShort}`);
  console.log(`  Skipped binary:           ${skippedBinary}`);
  console.log(`  Updates to write:         ${updates.length}`);

  // ── Report ────────────────────────────────────────────────────────────────
  const reportDir = join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    packets_needing_summary: packets.length,
    processed: toProcess.length,
    found,
    not_found: notFound,
    too_short: tooShort,
    skipped_binary: skippedBinary,
    updates_planned: updates.length,
    baseline_coverage: {
      total: Number(baseline.total),
      useful_before: Number(baseline.useful_before),
      pct_before: ((baseline.useful_before / baseline.total) * 100).toFixed(1),
    },
  };

  if (DRY_RUN) {
    // Show a few examples
    console.log('\nSample updates (first 5):');
    for (const u of updates.slice(0, 5)) {
      const pkt = toProcess.find(p => p.packet_id === u.packet_id);
      console.log(`  [${pkt?.source_ref?.substring(0, 50)}] → "${u.summary.substring(0, 80)}..."`);
    }
    writeFileSync(join(reportDir, 'backfill-packet-summaries.json'), JSON.stringify(report, null, 2));
    console.log('\nReport: docs/reports/backfill-packet-summaries.json');
    console.log('\n(dry-run — no DB writes; run with --apply to commit)');
    await pool.end();
    return;
  }

  // ── 4. Apply in batches ───────────────────────────────────────────────────
  const BATCH = 200;
  let applied = 0;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);

    await pool.query(`
      UPDATE atlas_packets ap
      SET summary    = u.summary,
          payload    = COALESCE(payload, '{}'::jsonb)
                         || jsonb_build_object(
                              'bm25_text',      u.bm25_text,
                              'summary_source', u.summary_source
                            ),
          updated_at = now()
      FROM (
        SELECT unnest($1::text[]) AS packet_id,
               unnest($2::text[]) AS summary,
               unnest($3::text[]) AS bm25_text,
               unnest($4::text[]) AS summary_source
      ) u
      WHERE ap.packet_id = u.packet_id
    `, [
      batch.map(u => u.packet_id),
      batch.map(u => u.summary),
      batch.map(u => u.bm25_text),
      batch.map(u => u.summary_source),
    ]);

    applied += batch.length;
    process.stdout.write(`\r  Applied ${applied}/${updates.length}`);
  }
  process.stdout.write('\n');

  // ── 5. Gate evaluation ────────────────────────────────────────────────────
  const { rows: [gate] } = await pool.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE length(summary) > 80 AND summary <> source_ref) AS useful_after,
      count(*) FILTER (WHERE payload->>'summary_source' = 'filesystem')      AS filesystem_count,
      round(
        count(*) FILTER (WHERE length(summary) > 80 AND summary <> source_ref)::numeric
        / count(*) * 100, 1
      ) AS coverage_pct
    FROM atlas_packets
  `);
  await pool.end();

  const coverageGate = parseFloat(gate.coverage_pct) >= 80;

  console.log('\n══ Gate Evaluation ══════════════════════════════');
  console.log(`  Total packets:           ${gate.total}`);
  console.log(`  Useful summaries before: ${baseline.useful_before} (${((baseline.useful_before/gate.total)*100).toFixed(1)}%)`);
  console.log(`  Useful summaries after:  ${gate.useful_after} (${gate.coverage_pct}%)`);
  console.log(`  Filesystem sourced:      ${gate.filesystem_count}`);
  console.log(`  Coverage >= 80%:         ${coverageGate ? '✅' : '❌'}`);
  console.log(`\n  ${coverageGate ? '✅ GATE PASS' : '⚠️  GATE FAIL — re-check search roots or lower MIN_SUMMARY_LEN'}`);

  report.applied    = applied;
  report.gate_result = {
    total:            Number(gate.total),
    useful_before:    Number(baseline.useful_before),
    useful_after:     Number(gate.useful_after),
    filesystem_count: Number(gate.filesystem_count),
    coverage_pct:     gate.coverage_pct,
    gate_pass:        coverageGate,
  };
  writeFileSync(join(reportDir, 'backfill-packet-summaries.json'), JSON.stringify(report, null, 2));

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Applied:  ${applied} summary updates`);
  console.log(`  Report:   docs/reports/backfill-packet-summaries.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
