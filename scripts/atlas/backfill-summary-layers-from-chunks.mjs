#!/usr/bin/env node
/**
 * Backfill atlas_summary_layers from codebase_chunk_index summaries.
 *
 * Purpose:
 *   Promote the already-generated Gemma4 chunk summaries into the canonical
 *   summary layer so downstream retrieval, packet promotion, and envelope
 *   backfills can operate from one stable surface.
 *
 * Canonical rule:
 *   - codebase_chunk_index is the source of existing chunk summaries
 *   - atlas_summary_layers is the canonical summary promotion surface
 *   - packet_key is the stable identity used by downstream joins
 *
 * Usage:
 *   node scripts/atlas/backfill-summary-layers-from-chunks.mjs --dry-run
 *   node scripts/atlas/backfill-summary-layers-from-chunks.mjs --apply
 *   node scripts/atlas/backfill-summary-layers-from-chunks.mjs --apply --limit=500
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { buildSummaryContext } from './lib/summary-context-map.mjs';
import {
  isUsableGemma4Summary,
  sanitizeGemma4Summary,
} from './lib/gemma4-summary-sanitizer.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 50000);
const BATCH_SIZE = Number(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ?? 500);
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'summary-layer-backfill-from-chunks.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'summary-layer-backfill-from-chunks.md');

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function pct(part, total) {
  const numerator = Number(part ?? 0);
  const denominator = Number(total ?? 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => cleanText(value)).filter(Boolean))];
}

function chunk(values, size) {
  const batches = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

function asText(value) {
  return cleanText(value);
}

function canonicalSourceRef(relativePath) {
  const source = cleanText(relativePath);
  if (!source) return '';
  if (
    source.startsWith('src/') ||
    source.startsWith('docs/') ||
    source.startsWith('tests/') ||
    source.startsWith('static/') ||
    source.startsWith('routes/') ||
    source.startsWith('lib/') ||
    source.startsWith('components/')
  ) {
    return `sveltekit-frontend/${source}`;
  }
  return source;
}

function asArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function summaryTextFor(row) {
  const sanitized = sanitizeGemma4Summary(row.summary ?? row.signature ?? row.summary_text ?? '');
  return {
    safe: sanitized.safe,
    changed: sanitized.changed,
    summary: cleanText(sanitized.summary),
    raw: cleanText(sanitized.raw),
  };
}

function derivePacketKey(row) {
  const sourceRef = canonicalSourceRef(row.relative_path ?? row.source_ref ?? row.sourceRef ?? '');
  if (!sourceRef) return '';
  return `packet:${stableHash(sourceRef).slice(0, 12)}`;
}

function deriveTitleId(row, packetRow) {
  const direct =
    packetRow?.title_id ??
    packetRow?.feature_id ??
    row?.title_id ??
    row?.metadata?.title_id ??
    row?.metadata?.titleId ??
    row?.output_meta?.title_id ??
    row?.output_meta?.titleId ??
    row?.feature_id ??
    row?.symbol ??
    '';

  const clean = cleanText(direct);
  if (!clean) return 'packet';
  return clean
    .replace(/\./g, ':')
    .replace(/[^a-z0-9:_-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^[-:._]+|[-:._]+$/g, '')
    .toLowerCase() || 'packet';
}

function inferOntologyLabel(packetRow, chunkRow) {
  return cleanText(
    packetRow?.ontology_label ??
    packetRow?.metadata?.ontology_label ??
    packetRow?.payload?.ontology_label ??
    packetRow?.topology?.ontology_label ??
    chunkRow?.metadata?.ontology_label ??
    chunkRow?.output_meta?.ontology_label ??
    ''
  );
}

function inferTopologyLabel(packetRow, chunkRow) {
  return cleanText(
    packetRow?.topology_label ??
    packetRow?.metadata?.topology_label ??
    packetRow?.payload?.topology_label ??
    packetRow?.topology?.topology_label ??
    packetRow?.topology?.cluster_key ??
    packetRow?.som_cluster ??
    chunkRow?.som_cluster ??
    chunkRow?.gpu_cluster ??
    ''
  );
}

function buildMetadata(chunkRow, packetRow, summary, summaryContext) {
  const titleId = deriveTitleId(chunkRow, packetRow);
  const semanticTags = asArray(chunkRow.semantic_tags);
  const tagsFromJson = Array.isArray(chunkRow.tags)
    ? asArray(chunkRow.tags)
    : [];

  return {
    source: 'codebase_chunk_index',
    worker: 'backfill-summary-layers-from-chunks',
    source_table: 'codebase_chunk_index',
    chunk_id: cleanText(chunkRow.chunk_id),
    qdrant_id: cleanText(chunkRow.qdrant_id),
    repo_id: cleanText(chunkRow.repo_id),
    relative_path: cleanText(chunkRow.relative_path),
    source_ref: cleanText(chunkRow.relative_path),
    source_ref_key: cleanText(chunkRow.relative_path),
    packet_key: cleanText(chunkRow.packet_key),
    title_id: titleId,
    feature_id: cleanText(packetRow?.feature_id ?? chunkRow?.metadata?.feature_id ?? chunkRow?.output_meta?.feature_id ?? ''),
    feature_label: cleanText(packetRow?.feature_label ?? chunkRow?.metadata?.feature_label ?? chunkRow?.output_meta?.feature_label ?? ''),
    domain_class: cleanText(packetRow?.domain_class ?? chunkRow.domain ?? chunkRow?.metadata?.domain_class ?? chunkRow?.output_meta?.domain_class ?? ''),
    ontology_label: inferOntologyLabel(packetRow, chunkRow),
    topology_label: inferTopologyLabel(packetRow, chunkRow),
    community_id: packetRow?.community_id ?? chunkRow.community_id ?? null,
    cluster_id: packetRow?.cluster_id ?? chunkRow.gpu_cluster ?? null,
    som_cluster: packetRow?.som_cluster ?? chunkRow.som_cluster ?? null,
    pagerank: packetRow?.pagerank ?? chunkRow.page_rank_score ?? null,
    symbol: cleanText(chunkRow.symbol),
    kind: cleanText(chunkRow.kind),
    language: cleanText(chunkRow.language),
    extension: cleanText(chunkRow.extension),
    line_start: chunkRow.line_start ?? null,
    line_end: chunkRow.line_end ?? null,
    token_count: chunkRow.token_count ?? null,
    content_hash: cleanText(chunkRow.content_hash),
    summary_hash: stableHash(summary),
    summary_length: summary.length,
    summary_model: cleanText(chunkRow.summary_model ?? ''),
    summary_context: summaryContext,
    semantic_tags: semanticTags,
    chunk_tags: tagsFromJson,
    generated_at: new Date().toISOString(),
  };
}

function buildKeywords(chunkRow, packetRow, summaryContext) {
  return uniqueStrings([
    packetRow?.title_id,
    chunkRow.symbol,
    chunkRow.kind,
    chunkRow.domain,
    chunkRow.language,
    chunkRow.extension,
    ...(asArray(chunkRow.semantic_tags) ?? []),
    summaryContext?.feature_label,
    summaryContext?.domain_class,
    summaryContext?.ontology_label,
    summaryContext?.topology_label,
    packetRow?.feature_id,
  ]);
}

function buildEntities(chunkRow, packetRow) {
  return uniqueStrings([
    chunkRow.symbol,
    packetRow?.function_symbol,
    packetRow?.feature_id,
  ]);
}

async function loadPacketContext(pool, sourceRefs) {
  if (!sourceRefs.length) return new Map();
  const packetMap = new Map();
  const batches = chunk(sourceRefs, 1000);

  for (const batch of batches) {
    const { rows } = await pool.query(
      `
        SELECT
          packet_key,
          source_ref,
          file_path,
          canonical_source_ref,
          title_id,
          feature_id,
          feature_label,
          domain_class,
          community_id,
          cluster_id,
          som_cluster,
          pagerank,
          function_symbol,
          metadata,
          payload,
          topology
        FROM atlas_packets
        WHERE source_ref = ANY($1::text[])
           OR file_path = ANY($1::text[])
           OR canonical_source_ref = ANY($1::text[])
      `,
      [batch],
    );

    for (const row of rows) {
      const sourceRef = canonicalSourceRef(row.canonical_source_ref ?? row.source_ref ?? row.file_path ?? '');
      if (sourceRef) packetMap.set(sourceRef, row);
      if (cleanText(row.packet_key)) packetMap.set(cleanText(row.packet_key), row);
    }
  }

  return packetMap;
}

function rowForInsert(chunkRow, packetRow) {
  const sourceRef = canonicalSourceRef(chunkRow.relative_path);
  const summaryResult = summaryTextFor(chunkRow);
  const summary = summaryResult.summary;
  const summaryContext = buildSummaryContext({
    packet_key: cleanText(packetRow?.packet_key ?? chunkRow?.packet_key ?? ''),
    source_ref: sourceRef,
    relative_path: sourceRef,
    feature_id: packetRow?.feature_id ?? chunkRow?.metadata?.feature_id ?? chunkRow?.output_meta?.feature_id ?? '',
    feature_label: packetRow?.feature_label ?? chunkRow?.metadata?.feature_label ?? chunkRow?.output_meta?.feature_label ?? '',
    domain_class: packetRow?.domain_class ?? chunkRow.domain ?? chunkRow?.metadata?.domain_class ?? chunkRow?.output_meta?.domain_class ?? '',
    ontology_label: inferOntologyLabel(packetRow, chunkRow),
    topology_label: inferTopologyLabel(packetRow, chunkRow),
    community_id: packetRow?.community_id ?? chunkRow.community_id ?? null,
    cluster_id: packetRow?.cluster_id ?? chunkRow.gpu_cluster ?? null,
    som_cluster: packetRow?.som_cluster ?? chunkRow.som_cluster ?? null,
    pagerank: packetRow?.pagerank ?? chunkRow.page_rank_score ?? null,
    function_symbol: packetRow?.function_symbol ?? chunkRow.symbol ?? '',
    metadata: packetRow?.metadata ?? {},
    payload: packetRow?.payload ?? {},
    topology: packetRow?.topology ?? {},
  });

  const metadata = buildMetadata(chunkRow, packetRow, summary, summaryContext);
  const packetKey = cleanText(packetRow?.packet_key ?? chunkRow?.packet_key ?? derivePacketKey(chunkRow));

  return {
    packet_key: packetKey,
    source_ref: sourceRef,
    source_ref_key: sourceRef,
    title_id: cleanText(metadata.title_id),
    feature_id: cleanText(packetRow?.feature_id ?? chunkRow?.metadata?.feature_id ?? chunkRow?.output_meta?.feature_id ?? ''),
    summary,
    summary_text: summary,
    layer_type: 'gemma4_offline',
    summary_level: 'chunk',
    model_name: cleanText(chunkRow.summary_model) || 'gemma4-legal-iq4xs-direct.gguf',
    keywords: buildKeywords(chunkRow, packetRow, summaryContext),
    entities: buildEntities(chunkRow, packetRow),
    metadata,
    summary_context: summaryContext,
    raw_changed: summaryResult.changed,
    packet_context_found: Boolean(packetRow),
  };
}

async function upsertBatch(client, rows) {
  if (!rows.length) return { upserted: 0 };

  const values = [];
  const inputColumns = [
    'packet_key',
    'source_ref',
    'source_ref_key',
    'feature_id',
    'summary',
    'summary_text',
    'layer_type',
    'model_name',
    'summary_level',
    'keywords',
    'entities',
    'metadata',
    'generated_at',
    'created_at',
    'updated_at',
  ];
  const placeholders = rows.map((row, index) => {
    const base = index * 15;
    values.push(
      row.packet_key,
      row.source_ref,
      row.source_ref_key || null,
      row.feature_id || null,
      row.summary,
      row.summary_text,
      row.layer_type,
      row.model_name,
      row.summary_level,
      row.keywords,
      row.entities,
      JSON.stringify(row.metadata),
      row.metadata.generated_at,
      row.metadata.generated_at,
      row.metadata.generated_at,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}::text[], $${base + 11}::text[], $${base + 12}::jsonb, $${base + 13}::timestamptz, $${base + 14}::timestamptz, $${base + 15}::timestamptz)`;
  });

  const inputSql = `
    (${inputColumns.join(', ')})
    AS (
      VALUES
        ${placeholders.join(',\n        ')}
    )
  `;

  const updateSql = `
    WITH input ${inputSql}
    UPDATE atlas_summary_layers AS target
    SET
      source_ref = input.source_ref,
      source_ref_key = COALESCE(input.source_ref_key, target.source_ref_key),
      feature_id = COALESCE(input.feature_id, target.feature_id),
      summary = input.summary,
      summary_text = input.summary_text,
      layer_type = input.layer_type,
      model_name = input.model_name,
      summary_level = input.summary_level,
      keywords = COALESCE(input.keywords, target.keywords),
      entities = COALESCE(input.entities, target.entities),
      metadata = COALESCE(target.metadata, '{}'::jsonb) || COALESCE(input.metadata, '{}'::jsonb),
      generated_at = input.generated_at,
      updated_at = input.updated_at
    FROM input
    WHERE target.packet_key = input.packet_key
  `;

  const insertSql = `
    WITH input ${inputSql}
    INSERT INTO atlas_summary_layers (
      ${inputColumns.join(',\n      ')}
    )
    SELECT
      input.packet_key,
      input.source_ref,
      input.source_ref_key,
      input.feature_id,
      input.summary,
      input.summary_text,
      input.layer_type,
      input.model_name,
      input.summary_level,
      input.keywords,
      input.entities,
      input.metadata,
      input.generated_at,
      input.created_at,
      input.updated_at
    FROM input
    WHERE NOT EXISTS (
      SELECT 1
      FROM atlas_summary_layers AS target
      WHERE target.packet_key = input.packet_key
    )
  `;

  const updateResult = await client.query(updateSql, values);
  const insertResult = await client.query(insertSql, values);
  return { upserted: (updateResult.rowCount ?? 0) + (insertResult.rowCount ?? 0) };
}

function writeReport(report) {
  return Promise.all([
    fs.mkdir(path.dirname(REPORT_JSON), { recursive: true }),
  ]).then(async () => {
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Summary Layer Backfill From Chunks',
        '',
        `Generated: ${report.generated_at}`,
        `Mode: ${report.mode}`,
        `Status: ${report.status}`,
        '',
        '## Counts',
        '',
        `- chunks read: ${report.counts.chunks_read}`,
        `- candidates with usable summaries: ${report.counts.usable_candidates}`,
        `- leaky summaries skipped: ${report.counts.skipped_leaky}`,
        `- short summaries skipped: ${report.counts.skipped_short}`,
        `- rows without packet context skipped: ${report.counts.skipped_no_packet_context}`,
        `- packet context joins found: ${report.counts.packet_context_found}`,
        `- title_id enriched rows: ${report.counts.title_id_enriched}`,
        `- deduped packet rows: ${report.counts.deduped_packet_rows}`,
        `- rows upserted: ${report.counts.upserted}`,
        '',
        '## Coverage',
        '',
        `- usable candidate pct: ${report.coverage.usable_candidate_pct}%`,
        `- packet context join pct: ${report.coverage.packet_context_join_pct}%`,
        `- summary_context pct: ${report.coverage.summary_context_pct}%`,
        '',
        '## Sample',
        '',
        ...report.sample.map((row) => `- ${row.packet_key} | ${row.source_ref} | ${row.summary_length} chars`),
        '',
        '## Notes',
        '',
        ...report.notes.map((note) => `- ${note}`),
      ].join('\n'),
      'utf8',
    );
  });
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(ENV), max: 1 });

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    status: 'WARN',
    source_table: 'codebase_chunk_index',
    target_table: 'atlas_summary_layers',
    limit: LIMIT,
    batch_size: BATCH_SIZE,
    counts: {
      chunks_read: 0,
      usable_candidates: 0,
      skipped_leaky: 0,
      skipped_short: 0,
      skipped_no_packet_context: 0,
      packet_context_found: 0,
      summary_context_found: 0,
      title_id_enriched: 0,
      deduped_packet_rows: 0,
      upserted: 0,
    },
    coverage: {
      usable_candidate_pct: 0,
      packet_context_join_pct: 0,
      summary_context_pct: 0,
    },
    sample: [],
    notes: [
      'Promotes existing Gemma4 chunk summaries from codebase_chunk_index into atlas_summary_layers.',
      'Uses canonical packet_key from atlas_packets when present; rows without packet context are skipped to satisfy the foreign key on atlas_summary_layers.packet_key.',
      'atlas_packets is used for optional title_id / feature / topology enrichment; Postgres remains canonical truth.',
    ],
  };

  try {
    const { rows } = await pool.query(
      `
        SELECT
          id,
          qdrant_id,
          chunk_id,
          repo_id,
          relative_path,
          symbol,
          kind,
          domain,
          language,
          extension,
          line_start,
          line_end,
          token_count,
          content_hash,
          summary,
          summary_model,
          gpu_cluster,
          som_cluster,
          community_id,
          page_rank_score,
          semantic_tags,
          tags,
          metadata,
          output_meta,
          indexed_at,
          updated_at
        FROM codebase_chunk_index
        WHERE summary IS NOT NULL
          AND btrim(summary) <> ''
        ORDER BY length(btrim(summary)) DESC NULLS LAST, relative_path ASC, line_start ASC NULLS LAST, line_end ASC NULLS LAST, id ASC
        LIMIT $1
      `,
      [LIMIT],
    );

    report.counts.chunks_read = rows.length;

    const prepared = rows
      .map((row) => {
        const packetKey = derivePacketKey(row);
        const summaryResult = summaryTextFor(row);
        const sourceRef = asText(row.relative_path);
        if (!packetKey || !sourceRef) return null;
        if (!summaryResult.safe) {
          report.counts.skipped_leaky += 1;
          return null;
        }
        if (summaryResult.summary.length < 40 || wordCount(summaryResult.summary) < 8 || !isUsableGemma4Summary(summaryResult.summary)) {
          report.counts.skipped_short += 1;
          return null;
        }
        return {
          ...row,
          packet_key: packetKey,
          relative_path: sourceRef,
          source_ref: sourceRef,
          summary: summaryResult.summary,
          summary_changed: summaryResult.changed,
        };
      })
      .filter(Boolean);

    report.counts.usable_candidates = prepared.length;
    report.coverage.usable_candidate_pct = pct(prepared.length, report.counts.chunks_read);

    const sourceRefs = [...new Set(prepared.map((row) => row.relative_path).filter(Boolean))];
    const packetContextMap = await loadPacketContext(pool, sourceRefs);

    const summaryRows = prepared.map((row) => {
      const packetRow = packetContextMap.get(row.relative_path) ?? packetContextMap.get(row.packet_key) ?? null;
      if (!packetRow) {
        report.counts.skipped_no_packet_context += 1;
        return null;
      }
      const insertRow = rowForInsert(row, packetRow);
      if (insertRow.summary_context) {
        report.counts.summary_context_found += 1;
      }
      if (packetRow) {
        report.counts.packet_context_found += 1;
      }
      if (insertRow.metadata?.title_id) {
        report.counts.title_id_enriched += 1;
      }
      return insertRow;
    }).filter(Boolean);

    report.coverage.packet_context_join_pct = pct(report.counts.packet_context_found, summaryRows.length);
    report.coverage.summary_context_pct = pct(report.counts.summary_context_found, summaryRows.length);

    const applyRows = [...new Map(summaryRows.map((row) => [row.packet_key, row])).values()];
    report.counts.deduped_packet_rows = summaryRows.length - applyRows.length;
    report.sample = applyRows.slice(0, 5).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      title_id: row.title_id ?? row.metadata?.title_id ?? null,
      summary_length: row.summary.length,
      packet_context_found: row.packet_context_found,
      summary_changed: row.raw_changed,
    }));

    if (APPLY && applyRows.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const batch of chunk(applyRows, BATCH_SIZE)) {
          const { upserted } = await upsertBatch(client, batch);
          report.counts.upserted += upserted;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const verification = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_rows,
          COUNT(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::int AS with_summary,
          COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata <> '{}'::jsonb)::int AS with_metadata,
          COUNT(*) FILTER (
            WHERE metadata ? 'summary_context'
              AND jsonb_typeof(metadata->'summary_context') = 'object'
          )::int AS with_summary_context
        FROM atlas_summary_layers
        WHERE metadata->>'worker' = 'backfill-summary-layers-from-chunks'
      `,
    );

    const verifyRow = verification.rows[0] ?? {};
    const totalRows = Number(verifyRow.total_rows ?? 0);
    const withSummary = Number(verifyRow.with_summary ?? 0);
    const withMetadata = Number(verifyRow.with_metadata ?? 0);
    const withSummaryContext = Number(verifyRow.with_summary_context ?? 0);

    if (APPLY) {
      report.status = totalRows > 0 && withSummary > 0 ? 'PASS' : 'WARN';
    } else {
      report.status = 'DRY_RUN';
    }

    report.notes.push(
      `Verification rows: ${totalRows} total, ${withSummary} with summary, ${withMetadata} with metadata, ${withSummaryContext} with summary_context.`,
      'Run atlas:packet-summaries:backfill:apply and atlas:feature-envelope:backfill:apply after this script to complete the promotion chain.',
    );

    await writeReport(report);

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
