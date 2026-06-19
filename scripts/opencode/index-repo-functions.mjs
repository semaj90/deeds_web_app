#!/usr/bin/env node

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(ROOT, 'docs', 'reports');

const OUT_JSON = path.join(DOCS_DIR, 'repo-function-registry.json');
const OUT_MD = path.join(DOCS_DIR, 'repo-function-registry.md');

const CONSOLIDATION_MAP = path.join(DOCS_DIR, 'repo-consolidation-feature-map.json');
const MCP_REGISTRY = path.join(DOCS_DIR, 'mcp-tool-registry-index.json');
const ROUTE_RUNTIME_REPORT = path.join(DOCS_DIR, 'route-runtime-packets-report.json');

// Helper to load env
function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT, 'sveltekit-frontend', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const ENV = loadEnv();
const DB_URL = ENV.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function toSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
}

function titleize(value) {
  return String(value ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[./_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function clamp(value, max = 160) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeWorkflowLane(layers = []) {
  return [...new Set(
    layers
      .map((layer) => String(layer ?? '').trim().toLowerCase())
      .filter(Boolean),
  )];
}

function buildCodePathRows(consolidation) {
  const paths = Array.isArray(consolidation?.production_ready_code_paths)
    ? consolidation.production_ready_code_paths
    : [];
  return paths.map((filePath) => {
    const base = path.basename(filePath);
    const stem = base.replace(/\.[^.]+$/, '');
    return {
      source_ref: filePath,
      file_path: filePath,
      symbol: stem,
      kind: 'repo_file',
      feature_id: `repo.file.${toSlug(filePath)}`,
      feature_label: titleize(stem),
      runtime_lane: /scripts|mjs|ts|js/i.test(filePath) ? 'cpu' : 'unknown',
      workflow_lane: normalizeWorkflowLane([
        /retrieval/i.test(filePath) ? 'retrieval' : '',
        /atlas/i.test(filePath) ? 'atlas' : '',
        /scripts/i.test(filePath) ? 'scripts' : '',
        /server/i.test(filePath) ? 'server' : '',
      ]),
      permission_lane: 'read_only',
      keywords: [base, stem, filePath.split(/[\\/]/).pop() ?? base].filter(Boolean),
      summary: `Production-ready repo file from the consolidation map: ${filePath}`,
      copy_merge_use: 'Use this file path as a canonical ship-path reference for merge planning.',
    };
  });
}

function buildToolRows(registry) {
  const tools = Array.isArray(registry?.tools) ? registry.tools : [];
  return tools.map((tool) => {
    const sourceRef = tool.source_ref || tool.tool_name;
    const keywords = [
      tool.tool_name,
      tool.namespace,
      tool.primary_layer,
      ...(Array.isArray(tool.identity_fields) ? tool.identity_fields : []),
      ...(Array.isArray(tool.layers) ? tool.layers : []),
    ].filter(Boolean);
    return {
      source_ref: sourceRef,
      file_path: null,
      symbol: tool.tool_name,
      kind: 'mcp_tool',
      feature_id: `mcp.tool.${toSlug(tool.tool_name)}`,
      feature_label: tool.tool_name,
      runtime_lane: tool.transport === 'stdio' ? 'cpu' : 'service',
      workflow_lane: normalizeWorkflowLane(tool.layers ?? [tool.primary_layer].filter(Boolean)),
      permission_lane: tool.permissions ?? 'unknown',
      keywords: [...new Set(keywords.map(String))],
      summary: clamp(tool.description || `MCP tool ${tool.tool_name}`),
      copy_merge_use: `Use ${tool.tool_name} when retrieving or manipulating ${tool.primary_layer ?? 'tool'}-lane packets.`,
    };
  });
}

async function main() {
  await fsPromises.mkdir(DOCS_DIR, { recursive: true });

  const consolidation = readJson(CONSOLIDATION_MAP, {});
  const registry = readJson(MCP_REGISTRY, {});
  const routeRuntime = readJson(ROUTE_RUNTIME_REPORT, {});

  const codeRows = buildCodePathRows(consolidation);
  const toolRows = buildToolRows(registry);
  const rows = [...codeRows, ...toolRows].sort((a, b) =>
    String(a.feature_id).localeCompare(String(b.feature_id)) ||
    String(a.source_ref ?? '').localeCompare(String(b.source_ref ?? '')),
  );

  const summary = {
    generated_at: new Date().toISOString(),
    total_rows: rows.length,
    code_paths: codeRows.length,
    mcp_tools: toolRows.length,
    route_runtime_packets: Number(routeRuntime?.summary?.total ?? 0),
    cache_hit_pct: Number(routeRuntime?.summary?.cache_hit_pct ?? 0),
    low_context_density: Number(routeRuntime?.summary?.low_context_density ?? 0),
    source_files: {
      consolidation_map: fs.existsSync(CONSOLIDATION_MAP),
      mcp_registry: fs.existsSync(MCP_REGISTRY),
      route_runtime_report: fs.existsSync(ROUTE_RUNTIME_REPORT),
    },
  };

  const payload = { summary, rows };
  await fsPromises.writeFile(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const md = `# Repo Function Registry

Generated: ${summary.generated_at}

## Summary

- Code paths: ${summary.code_paths}
- MCP tools: ${summary.mcp_tools}
- Total rows: ${summary.total_rows}
- Route runtime packets: ${summary.route_runtime_packets}
- Cache hit %: ${summary.cache_hit_pct}%
- Low context density: ${summary.low_context_density}

## Canonical Sources

- \`${path.relative(ROOT, CONSOLIDATION_MAP)}\`
- \`${path.relative(ROOT, MCP_REGISTRY)}\`
- \`${path.relative(ROOT, ROUTE_RUNTIME_REPORT)}\`

## Top Rows

${rows.slice(0, 25).map((row, idx) => `${idx + 1}. \`${row.kind}\` \`${row.feature_id}\` → ${row.source_ref ?? row.symbol}`).join('\n')}
`;

  await fsPromises.writeFile(OUT_MD, md, 'utf8');

  console.log(JSON.stringify(summary, null, 2));

  // ── Database Backfill ─────────────────────────────────────────────────────────
  console.log('Backfilling function registry rows into Postgres...');
  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    for (const row of rows) {
      await pool.query(
        `INSERT INTO repo_function_registry (
          source_ref, file_path, symbol, kind, feature_id, feature_label,
          runtime_lane, workflow_lane, permission_lane, keywords, summary, copy_merge_use,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (feature_id) DO UPDATE SET
          source_ref = EXCLUDED.source_ref,
          file_path = EXCLUDED.file_path,
          symbol = EXCLUDED.symbol,
          kind = EXCLUDED.kind,
          feature_label = EXCLUDED.feature_label,
          runtime_lane = EXCLUDED.runtime_lane,
          workflow_lane = EXCLUDED.workflow_lane,
          permission_lane = EXCLUDED.permission_lane,
          keywords = EXCLUDED.keywords,
          summary = EXCLUDED.summary,
          copy_merge_use = EXCLUDED.copy_merge_use,
          updated_at = NOW()`,
        [
          row.source_ref,
          row.file_path,
          row.symbol,
          row.kind,
          row.feature_id,
          row.feature_label,
          row.runtime_lane,
          row.workflow_lane,
          row.permission_lane,
          row.keywords,
          row.summary,
          row.copy_merge_use
        ]
      );
    }
    console.log(`✅ Successfully backfilled ${rows.length} rows into repo_function_registry table.`);
  } catch (dbErr) {
    console.error('❌ Database backfill failed:', dbErr.message);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
