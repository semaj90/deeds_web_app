#!/usr/bin/env node
/**
 * Export Parent Atlas OKF bundle for agentic retrieval.
 *
 * Output layout:
 *   .okf/functions/*.md
 *   .okf/tools/*.md
 *   .okf/features/*.md
 *   .okf/packets/*.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_ROOT = path.join(REPO_ROOT, '.okf');
const PACKETS_CANDIDATES = [
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.enriched.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.vectorized.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.topology.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.validated.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson'),
];

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

function yamlValue(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return JSON.stringify(String(value));
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function frontmatter(entries) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function cardFromRegistryRow(row, kindLabel = 'function') {
  const keywords = ensureArray(row.keywords);
  const workflowLane = ensureArray(row.workflow_lane ?? row.workflowLane);
  const permissionLane = row.permission_lane ?? row.permissionLane ?? null;
  const runtimeLane = row.runtime_lane ?? row.runtimeLane ?? null;
  const sourceRef = row.source_ref ?? row.sourceRef ?? '';
  const featureId = row.feature_id ?? row.featureId ?? '';
  const featureLabel = row.feature_label ?? row.featureLabel ?? '';
  const symbol = row.symbol ?? '';
  const filePath = row.file_path ?? row.filePath ?? null;

  return [
    frontmatter({
      type: kindLabel,
      source_ref: sourceRef,
      file_path: filePath,
      symbol,
      kind: row.kind ?? kindLabel,
      feature_id: featureId,
      feature_label: featureLabel,
      runtime_lane: runtimeLane,
      workflow_lane: workflowLane,
      permission_lane: permissionLane,
      keywords,
    }),
    `# ${featureLabel || featureId || symbol}`,
    '',
    `- source_ref: ${sourceRef}`,
    filePath ? `- file_path: ${filePath}` : null,
    symbol ? `- symbol: ${symbol}` : null,
    featureId ? `- feature_id: ${featureId}` : null,
    runtimeLane ? `- runtime_lane: ${runtimeLane}` : null,
    workflowLane.length ? `- workflow_lane: ${workflowLane.join(', ')}` : null,
    permissionLane ? `- permission_lane: ${permissionLane}` : null,
    keywords.length ? `- keywords: ${keywords.join(', ')}` : null,
    row.summary ? '' : null,
    row.summary ? row.summary : null,
    row.copy_merge_use ? '' : null,
    row.copy_merge_use ? `Use: ${row.copy_merge_use}` : null,
    '',
  ].filter((line) => line !== null).join('\n');
}

async function readNdjson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
}

async function loadPacketRows() {
  for (const candidate of PACKETS_CANDIDATES) {
    try {
      return {
        rows: await readNdjson(candidate),
        source: candidate,
      };
    } catch {
      // continue
    }
  }
  return { rows: [], source: null };
}

async function loadRegistryRows(pool) {
  const { rows } = await pool.query(`
    SELECT
      source_ref,
      file_path,
      symbol,
      kind,
      feature_id,
      feature_label,
      runtime_lane,
      workflow_lane,
      permission_lane,
      keywords,
      summary,
      copy_merge_use,
      metadata,
      created_at,
      updated_at
    FROM repo_function_registry
    ORDER BY feature_id, source_ref, symbol
  `);
  return rows;
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  await fs.mkdir(OUT_ROOT, { recursive: true });
  await fs.rm(OUT_ROOT, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(path.join(OUT_ROOT, 'functions'), { recursive: true });
  await fs.mkdir(path.join(OUT_ROOT, 'tools'), { recursive: true });
  await fs.mkdir(path.join(OUT_ROOT, 'features'), { recursive: true });
  await fs.mkdir(path.join(OUT_ROOT, 'packets'), { recursive: true });

  const pool = new Pool({
    connectionString: resolveDatabaseUrl(process.env),
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  });

  const summary = {
    generated_at: new Date().toISOString(),
    function_count: 0,
    tool_count: 0,
    feature_count: 0,
    packet_count: 0,
    packet_source: null,
  };

  try {
    const rows = await loadRegistryRows(pool).catch(() => []);
    const packetInput = await loadPacketRows();
    const packets = packetInput.rows;
    summary.function_count = rows.length;
    summary.tool_count = rows.filter((row) => String(row.kind ?? '').toLowerCase().includes('tool')).length;
    summary.feature_count = new Set(rows.map((row) => String(row.feature_id ?? '').trim()).filter(Boolean)).size;
    summary.packet_count = packets.length;
    summary.packet_source = packetInput.source;

    const featureGroups = new Map();
    for (const row of rows) {
      const featureId = String(row.feature_id ?? '').trim() || 'unknown-feature';
      if (!featureGroups.has(featureId)) featureGroups.set(featureId, []);
      featureGroups.get(featureId).push(row);
    }

    const functionDocs = [];
    const toolDocs = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const base = `${String(i + 1).padStart(4, '0')}-${slug(row.feature_id)}-${slug(row.symbol)}`;
      const doc = cardFromRegistryRow(row, 'function');
      functionDocs.push({ name: `${base}.md`, doc });
      if (String(row.kind ?? '').toLowerCase().includes('tool')) {
        toolDocs.push({ name: `${base}.md`, doc });
      }
    }

    for (const item of functionDocs) {
      await fs.writeFile(path.join(OUT_ROOT, 'functions', item.name), item.doc, 'utf8');
    }

    for (const item of toolDocs) {
      await fs.writeFile(path.join(OUT_ROOT, 'tools', item.name), item.doc, 'utf8');
    }

    for (const [featureId, featureRows] of featureGroups.entries()) {
      const first = featureRows[0] ?? {};
      const symbols = unique(featureRows.map((row) => row.symbol));
      const sourceRefs = unique(featureRows.map((row) => row.source_ref));
      const keywords = unique(featureRows.flatMap((row) => ensureArray(row.keywords)));
      const workflowLane = unique(featureRows.flatMap((row) => ensureArray(row.workflow_lane ?? row.workflowLane)));
      const md = [
        frontmatter({
          type: 'feature',
          feature_id: featureId,
          feature_label: first.feature_label ?? first.featureLabel ?? featureId,
          source_refs: sourceRefs,
          symbols,
          keywords,
          workflow_lane: workflowLane,
          row_count: featureRows.length,
        }),
        `# ${first.feature_label ?? featureId}`,
        '',
        `- feature_id: ${featureId}`,
        `- row_count: ${featureRows.length}`,
        sourceRefs.length ? `- source_refs: ${sourceRefs.slice(0, 10).join(', ')}` : null,
        symbols.length ? `- symbols: ${symbols.slice(0, 10).join(', ')}` : null,
        keywords.length ? `- keywords: ${keywords.slice(0, 10).join(', ')}` : null,
        workflowLane.length ? `- workflow_lane: ${workflowLane.join(', ')}` : null,
        '',
        first.summary ? first.summary : 'Feature registry summary unavailable.',
        '',
      ].filter((line) => line !== null).join('\n');
      await fs.writeFile(path.join(OUT_ROOT, 'features', `${slug(featureId)}.md`), md, 'utf8');
    }

    const packetsNdjson = packets.map((row) => JSON.stringify(row)).join('\n') + (packets.length ? '\n' : '');
    await fs.writeFile(path.join(OUT_ROOT, 'packets', 'packets.ndjson'), packetsNdjson, 'utf8');

    const packetTop = packets
      .slice()
      .sort((a, b) => Number(b.rank ?? b.score ?? 0) - Number(a.rank ?? a.score ?? 0))
      .slice(0, 50);
    const packetIndexMd = [
      '# Parent Atlas Packet Bundle',
      '',
      `Generated: ${summary.generated_at}`,
      '',
      `- packet_count: ${summary.packet_count}`,
      `- function_count: ${summary.function_count}`,
      `- tool_count: ${summary.tool_count}`,
      `- feature_count: ${summary.feature_count}`,
      '',
      '## Top Packets',
      '',
      ...packetTop.map((row, idx) => {
        const sourceRef = row.source_ref ?? row.canonical_source_ref ?? row.sourceRef ?? '';
        const featureId = row.feature_id ?? row.featureId ?? '';
        const packetKey = row.packet_key ?? row.packetKey ?? '';
        const summaryText = row.summary ?? row.summary_lod0 ?? row.summary_lod1 ?? '';
        return `${idx + 1}. ${packetKey || sourceRef || featureId} — ${featureId}${summaryText ? `\n   - ${String(summaryText).slice(0, 180)}` : ''}`;
      }),
      '',
    ].join('\n');
    await fs.writeFile(path.join(OUT_ROOT, 'packets', 'index.md'), packetIndexMd, 'utf8');

    const manifest = {
      ...summary,
      functions_dir: 'functions',
      tools_dir: 'tools',
      features_dir: 'features',
      packets_dir: 'packets',
      packet_inputs: PACKETS_CANDIDATES,
    };
    await fs.writeFile(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    await fs.writeFile(
      path.join(OUT_ROOT, 'README.md'),
      [
        '# Parent Atlas OKF Bundle',
        '',
        `Generated: ${summary.generated_at}`,
        '',
        '- functions: `./functions`',
        '- tools: `./tools`',
        '- features: `./features`',
        '- packets: `./packets`',
        '',
        'This bundle is read-only and derived from Parent Atlas registries and packet exports.',
        '',
      ].join('\n'),
      'utf8',
    );

    console.log(`[export-okf-bundle] wrote bundle to ${path.relative(REPO_ROOT, OUT_ROOT)}`);
    console.log(`[export-okf-bundle] functions=${summary.function_count} tools=${summary.tool_count} features=${summary.feature_count} packets=${summary.packet_count}`);
  } catch (error) {
    console.error('[export-okf-bundle] failed:', error?.stack || error?.message || String(error));
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[export-okf-bundle] fatal:', error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
