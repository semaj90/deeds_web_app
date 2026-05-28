#!/usr/bin/env node
import fs from 'fs/promises';
import {spawnSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

// --- Absolute path resolution (never rely on CWD) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_INPUT = path.resolve(REPO_ROOT, '.tmp', 'phase17-pytorch-features.jsonl');
const OUT_JSONL = path.resolve(REPO_ROOT, '.tmp', 'phase18-xgboost-rerank.jsonl');
const OUT_REPORT = path.resolve(REPO_ROOT, 'reports', 'phase18-xgboost-rerank-summary.md');
const PY_SCRIPT = path.resolve(__dirname, 'phase18_xgboost_reranker.py');

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {
    input: DEFAULT_INPUT,
    out: OUT_JSONL,
    report: OUT_REPORT,
    py: true,           // default: try Python, fallback to JS
    requirePy: false,   // --require-py: fail loudly if Python absent
    publish: false       // --publish: allow Redis writes (never write without this)
  };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--input') out.input = path.resolve(a[++i]);
    else if (a[i] === '--out') out.out = path.resolve(a[++i]);
    else if (a[i] === '--report') out.report = path.resolve(a[++i]);
    else if (a[i] === '--no-py') out.py = false;
    else if (a[i] === '--require-py') { out.requirePy = true; out.py = true; }
    else if (a[i] === '--publish') out.publish = true;
  }
  return out;
}

async function jsFallback(inputPath, outPath, reportPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const data = await fs.readFile(inputPath, 'utf8');
  const lines = data.split(/\r?\n/).filter(Boolean);
  const outLines = [];
  let i = 0;
  let missingSourceRef = 0;

  for (const l of lines) {
    try {
      const row = JSON.parse(l);
      const score = (row.card_id ? row.card_id.length : 1) % 100 / 100;
      const rec = score > 0.6 ? 'index' : 'review';
      const sourceRef = row.sourceRef || 'unknown';
      if (sourceRef === 'unknown' || sourceRef === null) missingSourceRef++;

      const outRow = {
        card_id: row.card_id,
        sourceRef,
        lane: row.lane || 'unknown',
        score,
        rank_reason: 'js-fallback-heuristic',
        recommended_action: row.signals?.has_sourceRef ? rec : 'needs_sourceRef',
        risk_notes: sourceRef === 'unknown'
          ? 'WARN: no sourceRef — cannot verify provenance'
          : 'js evaluation complete'
      };
      outLines.push(JSON.stringify(outRow));
      i++;
    } catch (e) { continue; }
  }

  await fs.writeFile(outPath, outLines.join('\n') + '\n', 'utf8');
  const report = [
    `# Phase 18 XGBoost Reranker (JS fallback)`,
    ``,
    `- **input**: ${inputPath}`,
    `- **rows_reranked**: ${i}`,
    `- **missing_sourceRef**: ${missingSourceRef}`,
    `- **notes**: Python/XGBoost not executed or failed; used JS heuristics.`,
    `- **redis_publish**: disabled (offline only)`
  ].join('\n');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report, 'utf8');
  return { ok: true, rows: i, missingSourceRef };
}

async function run() {
  const opts = parseArgs();
  console.log('[phase18] flags:', { py: opts.py, requirePy: opts.requirePy, publish: opts.publish });

  // --- Guard: never write Redis without --publish ---
  if (!opts.publish) {
    console.log('[phase18] --publish not set → Redis writes disabled (offline grinder mode).');
  }

  // --- Input resolution ---
  const inputPath = path.resolve(opts.input);
  try {
    await fs.access(inputPath);
  } catch (e) {
    console.error('[phase18] Input not found:', inputPath);
    process.exit(1);
  }

  // --- Python path ---
  if (opts.py) {
    const py = spawnSync('python', [PY_SCRIPT, '--input', inputPath, '--out', opts.out, '--report', opts.report], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'inherit'
    });
    if (py.status === 0) {
      console.log('[phase18] Python completed successfully.');
      process.exit(0);
    }
    // --require-py: fail loudly if Python fails
    if (opts.requirePy) {
      console.error('[phase18] FATAL: --require-py set but Python failed (exit %d). Aborting.', py.status);
      process.exit(1);
    }
    console.warn('[phase18] Python failed or not available; falling back to JS heuristics.');
  } else {
    console.log('[phase18] --no-py set → skipping Python, using JS fallback.');
  }

  // --- JS fallback ---
  const res = await jsFallback(inputPath, opts.out, opts.report);
  console.log('[phase18] JS fallback complete:', res);
}

run().catch(e => { console.error(e); process.exit(1); });
