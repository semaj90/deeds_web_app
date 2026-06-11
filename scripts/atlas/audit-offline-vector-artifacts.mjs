#!/usr/bin/env node
/**
 * audit-offline-vector-artifacts.mjs
 *
 * Scans the repository for offline vector, binary, and database artifacts
 * and classifies them into lanes with recommended ingestion or storage actions.
 *
 * Target extensions:
 *   .parquet, .arrow, .duckdb, .jsonl, .ndjson, .msgpack, .bin, .pt, .safetensors, .json
 *
 * Outputs:
 *   docs/reports/offline-vector-artifacts-report.json
 *   docs/reports/offline-vector-artifacts-report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'offline-vector-artifacts-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'offline-vector-artifacts-report.md');

const TARGET_EXTENSIONS = new Set([
  '.parquet', '.arrow', '.duckdb', '.jsonl', '.ndjson', '.msgpack', '.bin', '.pt', '.safetensors', '.json'
]);

const EXCLUDE_DIR_PATTERNS = [
  'node_modules/',
  '.git/',
  '.svelte-kit/',
  '.vite/',
  '.venv/',
  '.venv-py313-backup/',
  '.python311/',
  '.cache/',
  '.vs/',
  'target/',
  'dist/',
  'build/',
  'coverage/',
  'deeds_labs/',
  '.gemini/',
  '.opencode/',
  'neschrom97/',
  'claude-mem/',
  '.cline/',
  '.vscode/',
  'logs/',
  'processed/',
  'task-output/',
  'vscode-extension/'
];

function normalizeRelPath(relPath) {
  return String(relPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function runRgFiles() {
  const result = spawnSync(
    'rg',
    ['--files', '-uu'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 128,
    },
  );

  if (result.status !== 0 && !result.stdout) {
    throw new Error(result.stderr?.trim() || `rg --files failed with exit ${result.status ?? 1}`);
  }

  return String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeRelPath(line))
    .filter(Boolean);
}

function checkGitIgnored(filePaths) {
  if (filePaths.length === 0) return new Map();

  const ignored = new Map();
  const chunkSize = 500;
  
  for (let i = 0; i < filePaths.length; i += chunkSize) {
    const chunk = filePaths.slice(i, i + chunkSize);
    const result = spawnSync('git', ['check-ignore', '-v', '--stdin'], {
      input: chunk.join('\n'),
      encoding: 'utf8',
      cwd: ROOT
    });

    if (result.status === 0 || result.status === 1) {
      const lines = result.stdout.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const tabIndex = line.indexOf('\t');
        if (tabIndex > 0) {
          const rulePart = line.slice(0, tabIndex);
          const filePart = normalizeRelPath(line.slice(tabIndex + 1));
          const ruleMatches = rulePart.split(':');
          if (ruleMatches.length >= 3) {
            ignored.set(filePart, {
              source: ruleMatches[0],
              line: parseInt(ruleMatches[1], 10),
              pattern: ruleMatches.slice(2).join(':')
            });
          } else {
            ignored.set(filePart, { source: 'git', line: 0, pattern: rulePart });
          }
        }
      }
    }
  }
  return ignored;
}

function classifyFile(relPath, sizeBytes) {
  const ext = path.extname(relPath).toLowerCase();
  const name = path.basename(relPath).toLowerCase();
  const sizeMb = sizeBytes / (1024 * 1024);

  let artifact_type = ext.slice(1) || 'unknown';
  let lane = 'cold';
  let recommended_action = 'cold_archive';

  // 1. GPU / TurboVec lane
  if (
    ['.bin', '.pt', '.safetensors'].includes(ext) || 
    name.includes('som-checkpoint') || 
    name.includes('vector') || 
    name.includes('autoencoder') || 
    name.includes('ae-train')
  ) {
    lane = 'gpu-turbovec';
    recommended_action = 'gpu_training_input';
    artifact_type = ext === '.pt' ? 'pytorch_model' : ext === '.safetensors' ? 'safetensors_weights' : 'binary_weights';
  }
  // 2. MessagePack chunks
  else if (ext === '.msgpack') {
    lane = 'runtime-safe';
    recommended_action = 'msgpack_ingest';
    artifact_type = 'msgpack_chunk';
  }
  // 3. JSONL / NDJSON
  else if (['.jsonl', '.ndjson'].includes(ext)) {
    artifact_type = ext === '.jsonl' ? 'jsonl_dataset' : 'ndjson_dataset';
    if (sizeMb < 25 && (name.includes('manifest') || name.includes('metadata') || name.includes('report') || name.includes('summary'))) {
      lane = 'runtime-safe';
      recommended_action = 'keep_runtime';
    } else if (name.includes('packet')) {
      lane = 'runtime-safe';
      recommended_action = 'msgpack_ingest';
    } else {
      lane = 'cold';
      recommended_action = 'ldjson_batch';
    }
  }
  // 4. DuckDB / Parquet / Arrow
  else if (['.duckdb', '.parquet', '.arrow'].includes(ext)) {
    lane = 'cold';
    recommended_action = 'cold_archive';
    artifact_type = ext === '.duckdb' ? 'duckdb_database' : ext === '.parquet' ? 'parquet_snapshot' : 'arrow_snapshot';
  }
  // 5. JSON files
  else if (ext === '.json') {
    artifact_type = 'json_document';
    if (sizeMb > 100) {
      lane = 'cold';
      recommended_action = 'cold_archive';
    } else if (name.includes('svelte-check') || name.includes('audit')) {
      lane = 'cold';
      recommended_action = 'ignore_generated';
    } else if (name.includes('report') || name.includes('summary') || name.includes('manifest')) {
      lane = 'runtime-safe';
      recommended_action = 'keep_runtime';
    } else {
      lane = 'runtime-safe';
      recommended_action = 'keep_runtime';
    }
  }

  return {
    artifact_type,
    lane,
    recommended_action,
    size_mb: Number(sizeMb.toFixed(3))
  };
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  console.log('🔍 Scanning repository for files...');
  const allFiles = runRgFiles();
  
  console.log(`🧹 Filtering out dependency and build directories...`);
  const filteredFiles = allFiles.filter(f => {
    const lower = f.toLowerCase();
    return !EXCLUDE_DIR_PATTERNS.some(pat => lower.includes(pat));
  });

  const targetFiles = filteredFiles.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return TARGET_EXTENSIONS.has(ext);
  });

  console.log(`📂 Discovered ${targetFiles.length} candidate files matching target extensions.`);

  console.log('🛡 Checking gitignore status...');
  const ignoredMap = checkGitIgnored(targetFiles);

  const auditedFiles = [];
  let totalSizeMb = 0;

  for (const file of targetFiles) {
    const fullPath = path.join(ROOT, file);
    let sizeBytes = 0;
    try {
      const stat = fs.statSync(fullPath);
      sizeBytes = stat.size;
    } catch (e) {
      console.warn(`⚠️ Failed to read stats for file ${file}: ${e.message}`);
      continue;
    }

    const classification = classifyFile(file, sizeBytes);
    const isIgnored = ignoredMap.has(file);
    const ignoreRule = ignoredMap.get(file) || null;

    auditedFiles.push({
      rel_path: file,
      gitignored: isIgnored,
      ignore_rule: ignoreRule,
      ...classification
    });

    totalSizeMb += classification.size_mb;
  }

  // Sort by size desc
  auditedFiles.sort((a, b) => b.size_mb - a.size_mb);

  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      total_files: auditedFiles.length,
      total_size_mb: Number(totalSizeMb.toFixed(3)),
      lanes: {
        'runtime-safe': auditedFiles.filter(f => f.lane === 'runtime-safe').length,
        'cold': auditedFiles.filter(f => f.lane === 'cold').length,
        'gpu-turbovec': auditedFiles.filter(f => f.lane === 'gpu-turbovec').length,
      },
      gitignored_count: auditedFiles.filter(f => f.gitignored).length,
      actions: {
        keep_runtime: auditedFiles.filter(f => f.recommended_action === 'keep_runtime').length,
        cold_archive: auditedFiles.filter(f => f.recommended_action === 'cold_archive').length,
        ldjson_batch: auditedFiles.filter(f => f.recommended_action === 'ldjson_batch').length,
        msgpack_ingest: auditedFiles.filter(f => f.recommended_action === 'msgpack_ingest').length,
        gpu_training_input: auditedFiles.filter(f => f.recommended_action === 'gpu_training_input').length,
        ignore_generated: auditedFiles.filter(f => f.recommended_action === 'ignore_generated').length,
      }
    },
    artifacts: auditedFiles
  };

  // Write JSON report
  ensureDir(REPORT_JSON);
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✓ Wrote JSON report: ${path.relative(ROOT, REPORT_JSON)}`);

  // Build MD report
  const mdLines = [
    '# Offline Vector and Binary Artifacts Audit',
    '',
    `**Generated**: ${report.generated_at}`,
    `**Total Files Audited**: ${report.summary.total_files}`,
    `**Total Size**: ${report.summary.total_size_mb.toFixed(3)} MB`,
    `**Gitignored Files**: ${report.summary.gitignored_count} / ${report.summary.total_files}`,
    '',
    '## Summary by Ingestion Lane',
    '',
    '| Lane | File Count | Description |',
    '|---|---|---|',
    `| **Runtime-safe** | ${report.summary.lanes['runtime-safe']} | Small manifests, packet metadata, and summary reports. Safe for active query pipelines. |`,
    `| **Cold / gitignored** | ${report.summary.lanes['cold']} | Large datasets (>100MB JSON), DuckDB database files, and Parquet/Arrow snapshots. |`,
    `| **GPU / TurboVec** | ${report.summary.lanes['gpu-turbovec']} | PyTorch models (.pt), SafeTensors weights, binary dumps, and vector checkpoints. |`,
    '',
    '## Recommended Actions Breakdown',
    '',
    '| Action | Count | Strategy |',
    '|---|---|---|',
    `| ` + '`keep_runtime`' + ` | ${report.summary.actions.keep_runtime} | Retain in active frontend workspace / hot cache. |`,
    `| ` + '`cold_archive`' + ` | ${report.summary.actions.cold_archive} | Move/keep in cold lanes. Prevent active loading to guard VRAM/RAM. |`,
    `| ` + '`ldjson_batch`' + ` | ${report.summary.actions.ldjson_batch} | Ingest as batch tasks without loading raw logs directly into memory. |`,
    `| ` + '`msgpack_ingest`' + ` | ${report.summary.actions.msgpack_ingest} | Process chunks via the Rust parser and upload structured metadata to Postgres. |`,
    `| ` + '`gpu_training_input`' + ` | ${report.summary.actions.gpu_training_input} | Reserve for LibTorch/PyTorch model loops and SOM autoencoding loops. |`,
    `| ` + '`ignore_generated`' + ` | ${report.summary.actions.ignore_generated} | Exclude from core indexing (e.g. svelte-check dumps, transient logs). |`,
    '',
    '## Detailed Artifact Inventory',
    '',
    '| Rel Path | Size (MB) | Type | Gitignored? | Lane | Action |',
    '|---|---|---|---|---|---|',
  ];

  for (const art of auditedFiles) {
    const gitignoreStatus = art.gitignored
      ? `✅ Yes (rule: \`${art.ignore_rule?.pattern ?? 'ignored'}\`)`
      : '❌ No';
    mdLines.push(
      `| \`${art.rel_path}\` | ${art.size_mb.toFixed(3)} | \`${art.artifact_type}\` | ${gitignoreStatus} | \`${art.lane}\` | \`${art.recommended_action}\` |`
    );
  }

  mdLines.push(
    '',
    '## Notes & Next Steps',
    '- **Postgres 18 / canonical truth**: Active retrieval query flows should filter against active Postgres rows.',
    '- **No multi-engine hybrid redundancy**: Keep CouchDB, DuckDB, and MapReduce scripts strictly in the offline/derived report pipeline.',
    '- **GPU autoencoder**: Prepare GPU training datasets (`gpu_training_input`) for the upcoming autoencoder loop.'
  );

  ensureDir(REPORT_MD);
  fs.writeFileSync(REPORT_MD, mdLines.join('\n') + '\n', 'utf8');
  console.log(`✓ Wrote Markdown report: ${path.relative(ROOT, REPORT_MD)}`);
}

main().catch(e => {
  console.error('❌ Audit script failed:', e);
  process.exit(1);
});
