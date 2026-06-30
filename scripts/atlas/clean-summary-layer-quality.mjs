#!/usr/bin/env node
/**
 * Clean atlas_summary_layers before mirror fanout.
 *
 * Non-canonical enrichment only:
 * - Does not mutate atlas_packets identity fields.
 * - Does not delete rows.
 * - Marks duplicate/bad summary rows in metadata and clears their summary text
 *   and embedding so they are regenerated instead of mirrored to Qdrant/Redis.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? process.env.LIMIT ?? 5000);
const REPORT_JSON = path.join(ROOT, 'docs/reports/summary-layer-quality-cleanup.json');
const REPORT_MD = path.join(ROOT, 'docs/reports/summary-layer-quality-cleanup.md');

const env = loadRepoEnv(process.env);
Object.assign(process.env, env);

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 4,
});

const LEAK_RE = /<\|channel>thought|Thinking Process|Here's a thinking process|Reasoning:|Analysis:/i;

function hasLeak(text) {
  return LEAK_RE.test(String(text ?? ''));
}

function hashPreview(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function cleanSummaryText(input) {
  let text = String(input ?? '').trim();
  if (!text) return '';

  const finalMarker = '<|channel>final';
  const finalIndex = text.lastIndexOf(finalMarker);
  if (finalIndex >= 0) text = text.slice(finalIndex + finalMarker.length).trim();

  text = text
    .replace(/<\|channel>(?:analysis|thought|final)/gi, '')
    .replace(/<\|(?:start|end|message)>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const labeled = text.match(/(?:^|\n)\s*(?:Summary|Final Summary|Response):\s*([\s\S]+)$/i);
  if (labeled?.[1]) text = labeled[1].trim();

  if (/^(Thinking Process|Here's a thinking process|Reasoning|Analysis):?/i.test(text)) return '';
  if (hasLeak(text)) return '';
  return text.replace(/\s+/g, ' ').trim();
}

async function getCounts() {
  const [summaryLayers, packets] = await Promise.all([
    pool.query(`
      select
        count(*)::int as total_rows,
        count(*) filter (where coalesce(summary, summary_text, '') <> '')::int as summary_text_rows,
        count(*) filter (where embedding is not null)::int as embedded_rows,
        count(*) filter (where coalesce(summary, summary_text, '') ~ '<\\|channel>thought|Thinking Process|Here''s a thinking process|Reasoning:|Analysis:')::int as leaked_rows,
        count(distinct packet_key)::int as distinct_packet_keys,
        (count(*) - count(distinct packet_key))::int as duplicate_rows
      from atlas_summary_layers
    `),
    pool.query(`
      select
        count(*)::int as total_rows,
        count(*) filter (where coalesce(summary, '') <> '')::int as summary_text_rows,
        count(*) filter (where coalesce(summary, '') ~ '<\\|channel>thought|Thinking Process|Here''s a thinking process|Reasoning:|Analysis:')::int as leaked_rows
      from atlas_packets
    `),
  ]);
  return {
    atlas_summary_layers: summaryLayers.rows[0] ?? {},
    atlas_packets: packets.rows[0] ?? {},
  };
}

async function selectRows() {
  const { rows } = await pool.query(`
    with ranked as (
      select
        ctid::text as ctid,
        packet_key,
        source_ref,
        feature_id,
        layer_type,
        summary_level,
        coalesce(summary, summary_text, '') as summary_text,
        embedding is not null as has_embedding,
        row_number() over (
          partition by packet_key
          order by
            case when coalesce(summary, summary_text, '') ~ '<\\|channel>thought|Thinking Process|Here''s a thinking process|Reasoning:|Analysis:' then 1 else 0 end asc,
            case when nullif(source_ref, '') is not null then 0 else 1 end asc,
            case when nullif(feature_id, '') is not null then 0 else 1 end asc,
            case when coalesce(layer_type, summary_level) in ('file', 'packet', 'gemma4_packet_summary') then 0 else 1 end asc,
            case when embedding is not null then 0 else 1 end asc,
            updated_at desc nulls last,
            created_at desc nulls last
        ) as packet_rank
      from atlas_summary_layers
    )
    select *
    from ranked
    where (packet_rank > 1 and (summary_text <> '' or has_embedding))
       or summary_text ~ '<\\|channel>thought|Thinking Process|Here''s a thinking process|Reasoning:|Analysis:'
    order by packet_rank desc, packet_key
    limit $1
  `, [LIMIT]);
  return rows;
}

async function applyRow(client, row, action, cleaned = '') {
  const quality = {
    summary_quality_status: action,
    summary_quality_checked_at: new Date().toISOString(),
    previous_summary_preview: hashPreview(row.summary_text),
    previous_had_embedding: Boolean(row.has_embedding),
  };

  if (action === 'cleaned_reasoning_leak') {
    await client.query(`
      update atlas_summary_layers
      set
        summary = $1,
        summary_text = $1,
        embedding = null,
        metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb,
        updated_at = now()
      where ctid = $3::tid
    `, [cleaned, JSON.stringify(quality), row.ctid]);
    return;
  }

  await client.query(`
    update atlas_summary_layers
    set
      summary = null,
      summary_text = null,
      embedding = null,
      metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb,
      updated_at = now()
    where ctid = $2::tid
  `, [JSON.stringify(quality), row.ctid]);
}

async function cleanPacketSummaries(client) {
  const { rows } = await client.query(`
    select packet_key, left(summary, 240) as preview
    from atlas_packets
    where coalesce(summary, '') ~ '<\\|channel>thought|Thinking Process|Here''s a thinking process|Reasoning:|Analysis:'
    limit $1
  `, [LIMIT]);

  if (!APPLY) return { selected: rows.length, invalidated: 0, samples: rows.slice(0, 10) };

  const result = await client.query(`
    update atlas_packets
    set
      summary = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'summary_quality_status', 'requires_regeneration',
        'summary_quality_checked_at', now(),
        'previous_summary_preview', left(summary, 240)
      ),
      updated_at = now()
    where packet_key in (
      select packet_key
      from atlas_packets
      where coalesce(summary, '') ~ '<\\|channel>thought|Thinking Process|Here''s a thinking process|Reasoning:|Analysis:'
      limit $1
    )
  `, [LIMIT]);

  return { selected: rows.length, invalidated: result.rowCount ?? 0, samples: rows.slice(0, 10) };
}

function render(report) {
  const renderValue = (key, value) => {
    if (value && typeof value === 'object') {
      return [
        `- ${key}:`,
        ...Object.entries(value).map(([childKey, childValue]) => `  - ${childKey}: ${childValue}`),
      ];
    }
    return [`- ${key}: ${value}`];
  };

  return [
    '# Summary Layer Quality Cleanup',
    '',
    `- generated_at: ${report.generated_at}`,
    `- mode: ${report.mode}`,
    `- status: ${report.status}`,
    `- selected_rows: ${report.selected_rows}`,
    `- packet_summaries_invalidated: ${report.packet_cleanup.invalidated}`,
    `- cleaned_reasoning_leaks: ${report.actions.cleaned_reasoning_leak}`,
    `- marked_duplicate_superseded: ${report.actions.duplicate_superseded}`,
    `- marked_requires_regeneration: ${report.actions.requires_regeneration}`,
    '',
    '## Before',
    '',
    ...Object.entries(report.before).flatMap(([key, value]) => renderValue(key, value)),
    '',
    '## After',
    '',
    ...Object.entries(report.after).flatMap(([key, value]) => renderValue(key, value)),
    '',
    '## Notes',
    '',
    '- This script does not delete rows.',
    '- Bad duplicate/unusable summaries are nulled so they are not mirrored as semantic truth.',
    '- Embeddings are cleared when summary text changes or is invalidated.',
    '- Run Gemma4 summary widening and EmbeddingGemma embedding after cleanup.',
    '',
  ].join('\n');
}

async function main() {
  const before = await getCounts();
  const rows = await selectRows();
  const actions = {
    cleaned_reasoning_leak: 0,
    duplicate_superseded: 0,
    requires_regeneration: 0,
  };
  const samples = [];

  const client = await pool.connect();
  try {
    if (APPLY) await client.query('begin');
    for (const row of rows) {
      let action = 'requires_regeneration';
      let cleaned = '';
      if (Number(row.packet_rank) > 1) {
        action = 'duplicate_superseded';
      } else if (hasLeak(row.summary_text)) {
        cleaned = cleanSummaryText(row.summary_text);
        action = cleaned.length >= 40 ? 'cleaned_reasoning_leak' : 'requires_regeneration';
      }

      actions[action] += 1;
      if (samples.length < 20) {
        samples.push({
          packet_key: row.packet_key,
          rank: Number(row.packet_rank),
          action,
          had_embedding: row.has_embedding,
          preview: hashPreview(row.summary_text),
          cleaned_preview: cleaned ? hashPreview(cleaned) : null,
        });
      }
      if (APPLY) await applyRow(client, row, action, cleaned);
    }
    var packetCleanup = await cleanPacketSummaries(client);
    if (APPLY) await client.query('commit');
  } catch (error) {
    if (APPLY) await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const after = await getCounts();
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    status: 'PASS',
    limit: LIMIT,
    selected_rows: rows.length,
    packet_cleanup: packetCleanup ?? { selected: 0, invalidated: 0, samples: [] },
    actions,
    before,
    after,
    samples,
    outputs: {
      json: REPORT_JSON,
      markdown: REPORT_MD,
    },
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(REPORT_MD, render(report));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
