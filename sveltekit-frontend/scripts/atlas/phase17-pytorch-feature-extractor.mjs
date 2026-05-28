#!/usr/bin/env node
import fs from 'fs/promises';
import {spawnSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

// --- Absolute path resolution (never rely on CWD) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_INPUT = path.resolve(REPO_ROOT, 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl');
const OUT_DIR = path.resolve(REPO_ROOT, '.tmp');
const OUT_JSONL = path.resolve(OUT_DIR, 'phase17-pytorch-features.jsonl');
const OUT_REPORT = path.resolve(REPO_ROOT, 'reports', 'phase17-pytorch-feature-summary.md');
const PY_SCRIPT = path.resolve(__dirname, 'phase17_feature_extractor.py');

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
  let counted = 0;
  let missingSourceRef = 0;

  for (const l of lines) {
    try {
      const card = JSON.parse(l);
      const cardId = card.cardId || card.card_id || card.id || ('card_' + counted);
      const hasSource = (card.sourceRefs && card.sourceRefs.length > 0) || false;
      if (!hasSource) missingSourceRef++;
      const lane = cardId.startsWith('feature-gap:') ? 'schema_contract' : 'untracked_local';

      const row = {
        card_id: cardId,
        sourceRef: (card.sourceRefs && card.sourceRefs[0]) || null,
        lane,
        feature_vector_ref: null,
        metadata: {
          file_path: (card.entities && card.entities.files && card.entities.files[0]) || null,
          symbol: null,
          schema_name: null,
          retrieval_mode: 'offline-js-fallback',
          indexed: !!card.indexedState?.indexed,
          tracked_by_git: !!card.workspaceState?.tracked
        },
        signals: {
          has_sourceRef: !!hasSource,
          has_schema_contract: lane === 'schema_contract',
          has_mcp_route: false,
          is_untracked_local: lane === 'untracked_local',
          embedding_available: false
        }
      };
      outLines.push(JSON.stringify(row));
      counted++;
    } catch (e) { continue; }
  }

  await fs.writeFile(outPath, outLines.join('\n') + '\n', 'utf8');
  const report = [
    `# Phase 17 PyTorch Feature Extractor (JS fallback)`,
    ``,
    `- **input**: ${inputPath}`,
    `- **rows_extracted**: ${outLines.length}`,
    `- **missing_sourceRef**: ${missingSourceRef}`,
    `- **notes**: Python not executed or failed; used JS fallback heuristics.`,
    `- **redis_publish**: disabled (offline only)`
  ].join('\n');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report, 'utf8');
  return { ok: true, rows: outLines.length, missingSourceRef };
}

async function run() {
  const opts = parseArgs();
  console.log('[phase17] flags:', { py: opts.py, requirePy: opts.requirePy, publish: opts.publish });

  // --- Guard: never write Redis without --publish ---
  if (!opts.publish) {
    console.log('[phase17] --publish not set → Redis writes disabled (offline grinder mode).');
  }

  // --- Input resolution with fallback ---
  let inputPath = path.resolve(opts.input);
  try {
    await fs.access(inputPath);
  } catch (e) {
    const fallbackPath = path.resolve(path.join('..', opts.input));
    try {
      await fs.access(fallbackPath);
      inputPath = fallbackPath;
    } catch (err) {
      console.error('[phase17] Input not found (checked CWD and parent):', inputPath, fallbackPath);
      process.exit(1);
    }
  }

  // --- Python path ---
  if (opts.py) {
    const py = spawnSync('python', [PY_SCRIPT, '--input', inputPath, '--out', opts.out, '--report', opts.report], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'inherit'
    });
    if (py.status === 0) {
      console.log('[phase17] Python completed successfully.');
      process.exit(0);
    }
    // --require-py: fail loudly if Python fails
    if (opts.requirePy) {
      console.error('[phase17] FATAL: --require-py set but Python failed (exit %d). Aborting.', py.status);
      process.exit(1);
    }
    console.warn('[phase17] Python failed or not available; falling back to JS heuristics.');
  } else {
    console.log('[phase17] --no-py set → skipping Python, using JS fallback.');
  }

  // --- JS fallback ---
  const res = await jsFallback(inputPath, opts.out, opts.report);
  console.log('[phase17] JS fallback complete:', res);
}

run().catch(e => { console.error(e); process.exit(1); });
