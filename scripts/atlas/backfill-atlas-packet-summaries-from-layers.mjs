#!/usr/bin/env node
/**
 * Backfill atlas_packets.summary from atlas_summary_layers.
 *
 * Purpose:
 *   Promote the higher-level summary layer back onto the canonical packet row
 *   for packets that are missing a useful summary.
 *
 * Canonical rule:
 *   - atlas_packets remains truth
 *   - atlas_summary_layers is the enrichment source
 *   - packet_key is the join key
 *
 * Default behavior:
 *   - fill only packets with missing/short summaries
 *   - do not overwrite already-useful packet summaries
 *
 * Usage:
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-layers.mjs --dry-run
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-layers.mjs --apply
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-layers.mjs --apply --replace
 *   node scripts/atlas/backfill-atlas-packet-summaries-from-layers.mjs --apply --limit=1000
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { sanitizeGemma4Summary } from './lib/gemma4-summary-sanitizer.mjs';

const { Pool } = pg;
const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');
const DRY_RUN = !APPLY;
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 2000);
const MIN_CURRENT_LEN = Number(process.argv.find((arg) => arg.startsWith('--min-current-len='))?.split('=')[1] ?? 30);
const MIN_LAYER_LEN = Number(process.argv.find((arg) => arg.startsWith('--min-layer-len='))?.split('=')[1] ?? 30);
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'atlas-packet-summary-backfill.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'atlas-packet-summary-backfill.md');

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function hashSummary(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function currentSummaryIsUseful(value) {
  const text = cleanText(value);
  return text.length >= MIN_CURRENT_LEN;
}

function layerSummaryIsUsable(value) {
  const sanitized = sanitizeGemma4Summary(value);
  if (!sanitized.safe) return { ok: false, summary: '' };
  const summary = cleanText(sanitized.summary);
  if (summary.length < MIN_LAYER_LEN) return { ok: false, summary };
  if (wordCount(summary) < 6) return { ok: false, summary };
  return { ok: true, summary };
}

function pickBestSummary(row) {
  const candidates = [
    { source: 'summary', value: row.summary },
    { source: 'summary_text', value: row.summary_text },
  ]
    .map((entry) => ({
      ...entry,
      text: cleanText(entry.value),
    }))
    .filter((entry) => entry.text.length >= MIN_LAYER_LEN);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const lenDiff = b.text.length - a.text.length;
    if (lenDiff !== 0) return lenDiff;
    return a.source.localeCompare(b.source);
  });

  const best = candidates[0];
  const sanitized = layerSummaryIsUsable(best.text);
  if (!sanitized.ok) return null;

  return {
    summary: sanitized.summary,
    summary_hash: hashSummary(sanitized.summary),
    source_field: best.source,
  };
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(ENV), max: 1 });

  try {
    const CTE = `
      with ranked_layers as (
        select
          packet_key,
          summary,
          summary_text,
          layer_type,
          summary_level,
          model_name,
          generated_at,
          updated_at,
          row_number() over (
            partition by packet_key
            order by
              length(coalesce(nullif(btrim(summary), ''), nullif(btrim(summary_text), ''))) desc nulls last,
              generated_at desc nulls last,
              updated_at desc nulls last
          ) as rn
        from atlas_summary_layers
        where coalesce(nullif(btrim(summary), ''), nullif(btrim(summary_text), '')) is not null
      )
    `;

    const counts = await pool.query(
      `
        ${CTE}
        select
          count(*)::int as joinable_packets,
          count(*) filter (
            where ap.summary is null or length(btrim(ap.summary)) < $1
          )::int as candidate_packets,
          count(*) filter (
            where ap.summary is not null and length(btrim(ap.summary)) >= $1
          )::int as already_useful_packets
        from atlas_packets ap
        join ranked_layers rl
          on rl.packet_key = ap.packet_key
         and rl.rn = 1
      `,
      [MIN_CURRENT_LEN],
    );

    const joined = await pool.query(
      `
        ${CTE}
        select
          ap.packet_id,
          ap.packet_key,
          ap.title_id,
          ap.feature_id,
          ap.source_ref,
          ap.summary as packet_summary,
          rl.summary,
          rl.summary_text,
          rl.layer_type,
          rl.summary_level,
          rl.model_name,
          rl.generated_at,
          rl.updated_at as layer_updated_at
        from atlas_packets ap
        join ranked_layers rl
          on rl.packet_key = ap.packet_key
         and rl.rn = 1
        where $3::boolean
           or ap.summary is null
           or length(btrim(ap.summary)) < $2
        order by ap.packet_key asc
        limit $1
      `,
      [LIMIT, MIN_CURRENT_LEN, REPLACE],
    );

    const rows = joined.rows.map((row) => {
      const best = pickBestSummary(row);
      const current = cleanText(row.packet_summary);
      const currentUseful = currentSummaryIsUseful(current);
      const currentHash = current ? hashSummary(current) : null;
      return {
        packet_id: row.packet_id,
        packet_key: row.packet_key,
        title_id: row.title_id,
        feature_id: row.feature_id,
        source_ref: row.source_ref,
        current_summary: current,
        current_summary_len: current.length,
        current_useful: currentUseful,
        current_hash: currentHash,
        layer_summary: best?.summary ?? '',
        layer_summary_len: best?.summary?.length ?? 0,
        layer_hash: best?.summary_hash ?? null,
        layer_source_field: best?.source_field ?? null,
        layer_type: row.layer_type,
        summary_level: row.summary_level,
        model_name: row.model_name,
        generated_at: row.generated_at,
        layer_updated_at: row.layer_updated_at,
        action: !best
          ? 'skip_no_usable_layer_summary'
          : currentUseful && !REPLACE
            ? 'skip_current_summary_useful'
            : currentHash && currentHash === best.summary_hash
              ? 'skip_same_summary'
              : 'update',
      };
    });

    const candidates = rows.filter((row) => row.action === 'update');
    const skippedUseful = REPLACE ? 0 : Number(counts.rows[0]?.already_useful_packets ?? 0);
    const skippedNoLayer = rows.filter((row) => row.action === 'skip_no_usable_layer_summary').length;
    const skippedSame = rows.filter((row) => row.action === 'skip_same_summary').length;

    let updated = 0;
    if (APPLY && candidates.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of candidates) {
          const result = await client.query(
            `
              update atlas_packets
              set summary = $2,
                  updated_at = now()
              where packet_key = $1
                and (
                  $4::boolean
                  or summary is null
                  or length(btrim(summary)) < $3
                )
            `,
            [row.packet_key, row.layer_summary, MIN_CURRENT_LEN, REPLACE],
          );
          updated += result.rowCount ?? 0;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const verify = await pool.query(
      `
        select
          count(*)::int as total_rows,
          count(*) filter (where summary is not null and length(btrim(summary)) >= $1)::int as useful_summaries,
          count(*) filter (where summary is null or length(btrim(summary)) < $1)::int as missing_or_short,
          count(*) filter (
            where packet_key in (
              select distinct packet_key
              from atlas_summary_layers
              where coalesce(nullif(btrim(summary), ''), nullif(btrim(summary_text), '')) is not null
            )
          )::int as joinable_packets
        from atlas_packets
      `,
      [MIN_CURRENT_LEN],
    );

    const report = {
      generated_at: new Date().toISOString(),
      apply: APPLY,
      replace: REPLACE,
      limit: LIMIT,
      min_current_len: MIN_CURRENT_LEN,
      min_layer_len: MIN_LAYER_LEN,
      joined_rows: rows.length,
      updated,
      skipped: {
        current_useful: skippedUseful,
        no_layer_summary: skippedNoLayer,
        same_summary: skippedSame,
      },
      coverage: {
        total_rows: Number(verify.rows[0]?.total_rows ?? 0),
        useful_summaries: Number(verify.rows[0]?.useful_summaries ?? 0),
        missing_or_short: Number(verify.rows[0]?.missing_or_short ?? 0),
        joinable_packets: Number(counts.rows[0]?.joinable_packets ?? 0),
        candidate_packets: Number(counts.rows[0]?.candidate_packets ?? 0),
        already_useful_packets: Number(counts.rows[0]?.already_useful_packets ?? 0),
      },
      samples: candidates.slice(0, 10).map((row) => ({
        packet_key: row.packet_key,
        title_id: row.title_id,
        feature_id: row.feature_id,
        source_ref: row.source_ref,
        current_summary_len: row.current_summary_len,
        layer_summary_len: row.layer_summary_len,
        layer_type: row.layer_type,
        summary_level: row.summary_level,
        model_name: row.model_name,
      })),
      status: updated > 0 || candidates.length > 0 ? 'PASS' : 'WARN',
      notes: [
        'Promotes summary-layer text back onto atlas_packets.summary by packet_key.',
        'Does not rewrite already-useful packet summaries unless --replace is set.',
        'Keeps atlas_packets canonical and atlas_summary_layers as enrichment source.',
      ],
    };

    await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Atlas Packet Summary Backfill',
        '',
        `Generated: ${report.generated_at}`,
        `Apply: ${report.apply ? 'yes' : 'no'}`,
        `Replace: ${report.replace ? 'yes' : 'no'}`,
        `Status: ${report.status}`,
        '',
        '## Counts',
        '',
        `- joined rows: ${report.joined_rows}`,
        `- updated: ${report.updated}`,
        `- skipped current useful: ${report.skipped.current_useful}`,
        `- skipped missing layer summary: ${report.skipped.no_layer_summary}`,
        `- skipped same summary: ${report.skipped.same_summary}`,
        `- total atlas_packets: ${report.coverage.total_rows}`,
        `- useful summaries: ${report.coverage.useful_summaries}`,
        `- missing or short summaries: ${report.coverage.missing_or_short}`,
        `- joinable packets: ${report.coverage.joinable_packets}`,
        `- candidate packets: ${report.coverage.candidate_packets}`,
        `- already useful packets: ${report.coverage.already_useful_packets}`,
        '',
        '## Samples',
        '',
        ...report.samples.map((row) => `- ${row.packet_key} | ${row.title_id || '(no title)'} | ${row.feature_id || '(no feature)'} | ${row.current_summary_len} -> ${row.layer_summary_len}`),
        '',
      ].join('\n'),
      'utf8',
    );

    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) {
      console.log('Dry run only. Re-run with --apply to write atlas_packets.summary.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
