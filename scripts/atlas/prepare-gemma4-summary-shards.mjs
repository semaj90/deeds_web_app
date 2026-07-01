#!/usr/bin/env node
/**
 * Prepare self-contained Gemma4 summary shards from canonical atlas_packets.
 *
 * This is for local/Colab split work. It exports only packets missing summaries
 * and includes bounded source text so the offline worker does not need repo
 * checkout access. Existing summary-layer NDJSON can be supplied to prevent
 * duplicate Colab work.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const LIMIT = Number(args.get('limit') ?? 0);
const LOCAL_LIMIT = Number(args.get('local-limit') ?? 1000);
const SHARDS = Math.max(1, Number(args.get('shards') ?? 8));
const MAX_CHARS = Math.max(1000, Number(args.get('max-chars') ?? 12000));
const OUT_DIR = path.resolve(REPO_ROOT, String(args.get('out-dir') ?? '.tmp/gemma4-summary-shards'));
const EXISTING_SUMMARY_LAYERS = args.get('existing-summary-layers')
  ? path.resolve(REPO_ROOT, String(args.get('existing-summary-layers')))
  : '';
const APPLY = args.has('apply');

const SKIP_PATTERNS = [
  /^node_modules\//,
  /^\.git\//,
  /^\.svelte-kit\//,
  /^dist\//,
  /^build\//,
  /^models\//,
  /^backups\//,
  /^archive\/logs\//,
  /^archive\/tmp\//,
  /^\.tmp\//,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|mp4|mp3|gguf|bin|zip|tar|gz|zst|duckdb|parquet)$/i,
];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function readExistingSummaryKeys(filePath) {
  const keys = new Set();
  if (!filePath || !fs.existsSync(filePath)) return keys;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.packet_key && String(row.summary ?? row.summary_text ?? '').trim()) {
        keys.add(String(row.packet_key));
      }
    } catch {
      // ignore malformed evidence rows
    }
  }
  return keys;
}

function normalizeSourceRef(row) {
  return String(row.source_ref || row.file_path || row.source_path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function shouldSkipSourceRef(sourceRef) {
  return !sourceRef || SKIP_PATTERNS.some((pattern) => pattern.test(sourceRef));
}

function candidatePaths(row) {
  const refs = [
    normalizeSourceRef(row),
    String(row.file_path || '').replace(/\\/g, '/'),
    String(row.source_path || '').replace(/\\/g, '/'),
  ].filter(Boolean);
  const out = [];
  for (const ref of refs) {
    const clean = ref.replace(/^\/+/, '');
    out.push(path.resolve(REPO_ROOT, clean));
    if (clean.startsWith('sveltekit-frontend/')) out.push(path.resolve(REPO_ROOT, clean.slice('sveltekit-frontend/'.length)));
    else out.push(path.resolve(REPO_ROOT, 'sveltekit-frontend', clean));
  }
  return [...new Set(out)];
}

function readSourceText(row) {
  const sourceRef = normalizeSourceRef(row);
  if (shouldSkipSourceRef(sourceRef)) return { text: '', path: '', reason: 'skipped_path' };
  for (const filePath of candidatePaths(row)) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      if (stat.size > 2_000_000) return { text: '', path: filePath, reason: 'too_large' };
      const text = fs.readFileSync(filePath, 'utf8');
      if (!text.trim()) return { text: '', path: filePath, reason: 'empty' };
      if (text.includes('\u0000')) return { text: '', path: filePath, reason: 'binary' };
      return {
        text: text.slice(0, MAX_CHARS),
        path: filePath,
        reason: text.length > MAX_CHARS ? 'truncated' : 'ok',
      };
    } catch {
      // try next candidate
    }
  }
  return { text: '', path: '', reason: 'not_found' };
}

async function fetchRows(pool, excludeKeys) {
  const query = `
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.source_ref_key,
      ap.file_path,
      ap.source_path,
      ap.feature_id,
      ap.feature_label,
      ap.domain_class,
      ap.community_id,
      ap.cluster_id,
      ap.som_cluster,
      ap.pagerank,
      ap.metadata,
      ap.topology,
      ap.payload
    FROM atlas_packets ap
    WHERE ap.packet_key IS NOT NULL
      AND ap.source_ref IS NOT NULL
      AND (ap.summary IS NULL OR btrim(ap.summary) = '')
    ORDER BY
      CASE
        WHEN ap.source_ref LIKE 'src/%' THEN 0
        WHEN ap.source_ref LIKE 'scripts/%' THEN 0
        WHEN ap.source_ref LIKE 'sveltekit-frontend/src/%' THEN 0
        WHEN ap.source_ref LIKE 'sveltekit-frontend/scripts/%' THEN 0
        WHEN ap.source_ref LIKE 'packages/%' THEN 1
        WHEN ap.source_ref LIKE 'docs/%' THEN 2
        ELSE 3
      END,
      ap.pagerank DESC NULLS LAST,
      ap.source_ref ASC
    ${LIMIT > 0 ? 'LIMIT $1' : ''}
  `;
  const { rows } = await pool.query(query, LIMIT > 0 ? [LIMIT] : []);
  return rows.filter((row) => !excludeKeys.has(String(row.packet_key)));
}

function writeNdjson(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function main() {
  const env = loadRepoEnv();
  const excludeKeys = readExistingSummaryKeys(EXISTING_SUMMARY_LAYERS);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2 });
  const report = {
    generated_at: new Date().toISOString(),
    apply: APPLY,
    out_dir: OUT_DIR,
    existing_summary_layers: EXISTING_SUMMARY_LAYERS || null,
    excluded_existing_summary_keys: excludeKeys.size,
    limits: { limit: LIMIT, local_limit: LOCAL_LIMIT, shards: SHARDS, max_chars: MAX_CHARS },
    rows: { queried: 0, exported: 0, skipped_no_text: 0 },
    skip_reasons: {},
    outputs: [],
  };

  try {
    const rows = await fetchRows(pool, excludeKeys);
    report.rows.queried = rows.length;
    const exportRows = [];
    for (const row of rows) {
      const source = readSourceText(row);
      if (!source.text) {
        report.rows.skipped_no_text += 1;
        report.skip_reasons[source.reason] = (report.skip_reasons[source.reason] ?? 0) + 1;
        continue;
      }
      const sourceRef = normalizeSourceRef(row);
      exportRows.push({
        packet_key: row.packet_key,
        source_ref: sourceRef,
        source_ref_key: row.source_ref_key ?? `${sourceRef}:${row.packet_key}`,
        file_path: row.file_path ?? sourceRef,
        feature_id: row.feature_id,
        feature_label: row.feature_label,
        domain_class: row.domain_class ?? row.metadata?.domain_class ?? null,
        ontology_label: row.metadata?.ontology_label ?? row.payload?.ontology_label ?? null,
        topology_label: row.metadata?.topology_label ?? row.topology?.topology_label ?? row.payload?.topology_label ?? null,
        community_id: row.community_id ?? null,
        cluster_id: row.cluster_id ?? null,
        som_cluster: row.som_cluster ?? null,
        pagerank: row.pagerank ?? null,
        source_text: source.text,
        source_text_hash: `sha256:${sha256(source.text)}`,
        source_text_status: source.reason,
        source_disk_path: source.path,
        provenance: {
          exporter: 'prepare-gemma4-summary-shards',
          canonical_truth: 'postgres.atlas_packets',
          identity_mutated: false,
        },
      });
    }
    report.rows.exported = exportRows.length;

    const localRows = exportRows.slice(0, Math.max(0, LOCAL_LIMIT));
    const colabRows = exportRows.slice(localRows.length);
    const localPath = path.join(OUT_DIR, 'local-summary-backlog.ndjson');
    if (APPLY) writeNdjson(localPath, localRows);
    report.outputs.push({ lane: 'local', file: localPath, rows: localRows.length });

    const shardSize = Math.ceil(colabRows.length / SHARDS) || 0;
    for (let i = 0; i < SHARDS; i++) {
      const shardRows = shardSize ? colabRows.slice(i * shardSize, (i + 1) * shardSize) : [];
      const file = path.join(OUT_DIR, `colab-summary-shard-${String(i + 1).padStart(2, '0')}-of-${String(SHARDS).padStart(2, '0')}.ndjson`);
      if (APPLY) writeNdjson(file, shardRows);
      report.outputs.push({ lane: 'colab', shard: i + 1, file, rows: shardRows.length });
    }

    const reportPath = path.join(OUT_DIR, 'summary-shard-report.json');
    const mdPath = path.join(OUT_DIR, 'summary-shard-report.md');
    if (APPLY) {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
      fs.writeFileSync(mdPath, [
        '# Gemma4 Summary Shard Report',
        '',
        `- generated_at: ${report.generated_at}`,
        `- existing summaries excluded: ${report.excluded_existing_summary_keys}`,
        `- queried missing rows: ${report.rows.queried}`,
        `- exported rows with source_text: ${report.rows.exported}`,
        `- skipped no text: ${report.rows.skipped_no_text}`,
        '',
        '## Outputs',
        '',
        ...report.outputs.map((row) => `- ${row.lane}${row.shard ? ` ${row.shard}` : ''}: ${row.rows} rows -> \`${row.file}\``),
        '',
      ].join('\n') + '\n', 'utf8');
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
