#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnvFiles } from '../atlas/lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(ROOT, 'docs', 'reports');
const INPUT_JSON = path.join(DOCS_DIR, 'repo-function-registry.json');
const INPUT_MD = path.join(DOCS_DIR, 'repo-function-registry.md');
const OUTPUT_JSON = path.join(DOCS_DIR, 'repo-function-registry-query.json');
const OUTPUT_MD = path.join(DOCS_DIR, 'repo-function-registry-query.md');
const FRONTEND_ROOT = path.join(ROOT, 'sveltekit-frontend');

const argv = process.argv.slice(2);
const queryIndex = argv.indexOf('--query');
const topKIndex = argv.indexOf('--topk');
const envQuery = String(process.env.npm_config_query ?? process.env.QUERY ?? '').trim();
const envTopK = Number.parseInt(String(process.env.npm_config_topk ?? process.env.TOPK ?? ''), 10);
const envWrite = String(process.env.npm_config_write ?? process.env.WRITE ?? '').toLowerCase();
const query = (queryIndex >= 0 ? argv[queryIndex + 1] : envQuery || argv.filter((arg) => !arg.startsWith('--')).join(' ') || '').trim();
const topK = Number.parseInt(topKIndex >= 0 ? argv[topKIndex + 1] : Number.isFinite(envTopK) ? String(envTopK) : '10', 10) || 10;
const writeOutputs = argv.includes('--write') || envWrite === 'true' || envWrite === '1' || process.argv.includes('--write');

function readJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_.:-]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreRow(row, tokens) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  const aliasSources = Array.isArray(metadata?.source_ref_aliases) ? metadata.source_ref_aliases : [];
  const haystack = [
    row.source_ref,
    row.file_path,
    row.symbol,
    row.kind,
    row.feature_id,
    row.feature_label,
    row.summary,
    row.copy_merge_use,
    ...(Array.isArray(row.keywords) ? row.keywords : []),
    ...(Array.isArray(row.workflow_lane) ? row.workflow_lane : []),
    ...aliasSources,
    row.permission_lane,
    row.runtime_lane,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ');

  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (haystack.includes(token)) score += token.length > 3 ? 3 : 1;
  }
  if (row.feature_id && String(row.feature_id).toLowerCase().includes(query.toLowerCase())) score += 4;
  if (row.source_ref && String(row.source_ref).toLowerCase().includes(query.toLowerCase())) score += 4;
  return score;
}

async function loadEnv() {
  const rootEnv = await loadAtlasEnvFiles(ROOT);
  const frontendEnv = await loadAtlasEnvFiles(FRONTEND_ROOT);
  return Object.assign({}, rootEnv, frontendEnv, process.env);
}

async function loadDbRows() {
  const env = await loadEnv();
  const databaseUrl =
    env.DATABASE_URL ||
    env.ADMIN_DATABASE_URL ||
    'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const tableResult = await pool.query(`select to_regclass('public.repo_function_registry') as table_name`);
    if (!tableResult.rows?.[0]?.table_name) return { rows: null, source: 'file', databaseUrl };

    const result = await pool.query(`
      select
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
        metadata
      from repo_function_registry
      order by feature_id asc, source_ref asc
    `);

    return { rows: result.rows, source: 'db', databaseUrl };
  } catch (error) {
    return { rows: null, source: 'file', databaseUrl, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const raw = await fs.readFile(INPUT_JSON, 'utf8').catch(() => null);
  const registry = raw ? readJsonText(raw) : null;
  const db = await loadDbRows();
  const registryTotalRows = registry?.summary?.total_rows ?? registry?.rows?.length ?? 0;
  const dbRowCount = Array.isArray(db.rows) ? db.rows.length : 0;
  const useDb = dbRowCount > 0 && (registryTotalRows === 0 || dbRowCount >= registryTotalRows);
  const activeRows = useDb ? db.rows : registry?.rows;
  if (!activeRows) {
    console.error(`repo-function-registry not found or invalid: ${path.relative(ROOT, INPUT_JSON)}`);
    process.exit(1);
  }

  const tokens = tokenize(query);
  const rows = [...activeRows]
    .map((row) => ({
      ...row,
      score: scoreRow(row, tokens),
    }))
    .filter((row) => row.score > 0 || !query)
    .sort((a, b) => b.score - a.score || String(a.feature_id).localeCompare(String(b.feature_id)))
    .slice(0, topK);

  const summary = {
    generated_at: new Date().toISOString(),
    query,
    topk: topK,
    total_rows: useDb ? dbRowCount : registryTotalRows,
    matches: rows.length,
    registry_source: useDb ? 'postgres' : 'file',
    registry_table: 'repo_function_registry',
    input_files: {
      registry: path.relative(ROOT, INPUT_JSON).replace(/\\/g, '/'),
      registry_md: path.relative(ROOT, INPUT_MD).replace(/\\/g, '/'),
    },
  };

  const payload = { summary, rows };
  if (writeOutputs) {
    await fs.mkdir(DOCS_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    const md = `# Repo Function Registry Query

Generated: ${summary.generated_at}
Query: ${summary.query || '(empty)'}
Matches: ${summary.matches}

${rows.map((row, idx) => `${idx + 1}. ${row.feature_id} | ${row.source_ref || row.file_path || row.symbol} | score=${row.score}`).join('\n')}
`;
    await fs.writeFile(OUTPUT_MD, md, 'utf8');
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
