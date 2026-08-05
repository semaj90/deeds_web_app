#!/usr/bin/env node
/**
 * KV-cache compression eval harness — Stage 1 (synthetic/local benchmarks).
 *
 * Answers the practical question: "is this KV cache type safe/worth using on
 * this GPU with this model", using the standard llama.cpp tooling already
 * present (llama-perplexity.exe). Does NOT reproduce paper-grade experiments —
 * see "Stage 2" notes below for what that would require.
 *
 * What this measures per cache-type config:
 *   - Perplexity (PPL) over wikitext-2-raw (standard llama.cpp corpus)
 *   - KL-divergence vs an f16 baseline (attention-logit fidelity proxy —
 *     `--kl-divergence-base` compares the *loaded* config's logits against
 *     saved f16 logits, token-by-token, over the same corpus)
 *   - Wall-clock time (proxy for prefill/decode throughput)
 *
 * What this does NOT measure (Stage 2 — needs more infra than a local script):
 *   - Real attention-logit fidelity (needs per-layer/per-head logit dumps,
 *     not just final-layer KL-divergence — would need llama.cpp instrumented
 *     to export intermediate attention tensors, or a Python/PyTorch harness
 *     against the un-quantized HF checkpoint)
 *   - Retrieval metrics (needle-in-haystack / long-context recall) — needs a
 *     synthetic long-context dataset + an answer-extraction eval loop, not
 *     wired here
 *   - QJL (Quantized Johnson-Lindenstrauss) residual correction — TurboQuant's
 *     stage-2 error-correction step. Not implemented in any llama.cpp fork
 *     available in this repo; would require a custom CUDA kernel or a Python
 *     reference implementation run against raw KV tensors outside llama.cpp
 *     entirely. Out of scope until a QJL reference implementation exists.
 *   - RotorQuant `iso3`/`planar3` or TurboQuant `turbo3`/`turbo4` KV types —
 *     these require a non-stock llama.cpp fork. This harness detects whether
 *     the configured binary supports them (`--help` probe) and SKIPS those
 *     rows with an explicit reason if not, rather than silently omitting them.
 *
 * Usage:
 *   node scripts/atlas/kv-cache-eval-harness.mjs [--model <path>] [--binary <path>] [--ctx 4096] [--dry-run]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
function argVal(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const DRY_RUN = args.includes('--dry-run');

const MODEL_PATH = argVal('model', path.join(REPO_ROOT, 'models/hfor/hforf.gguf'));
const BINARY_PATH = argVal('binary', 'C:/Users/james/Desktop/llama-server-cuda/llama-perplexity.exe');
const CTX_SIZE = argVal('ctx', '4096');
const WIKITEXT_DIR = path.join(REPO_ROOT, '.tmp/wikitext-2-raw');
const WIKITEXT_FILE = path.join(WIKITEXT_DIR, 'wiki.test.raw');
const WIKITEXT_URL = 'https://huggingface.co/datasets/ggml-org/ci/resolve/main/wikitext-2-raw-v1.zip';
const REPORT_DIR = path.join(REPO_ROOT, 'reports');
const LOGITS_DIR = path.join(REPO_ROOT, '.tmp/kv-eval-logits');

// Standard cache types the stock binary always supports.
const STOCK_CACHE_CONFIGS = [
  { label: 'f16 (baseline)', k: 'f16', v: 'f16', isBaseline: true },
  { label: 'q8_0', k: 'q8_0', v: 'q8_0' },
  { label: 'q4_0', k: 'q4_0', v: 'q4_0' },
];

// Fork-only types (RotorQuant / TurboQuant). Only attempted if the configured
// binary's --help output advertises them.
const FORK_CACHE_CONFIGS = [
  { label: 'q8_0/turbo3 (TurboQuant, asymmetric)', k: 'q8_0', v: 'turbo3', requiresFlag: 'turbo3' },
  { label: 'iso3/iso3 (RotorQuant)', k: 'iso3', v: 'iso3', requiresFlag: 'iso3' },
];

function log(msg) {
  console.log(`[kv-eval] ${msg}`);
}

function checkBinaryFlags(binaryPath) {
  try {
    const help = execFileSync(binaryPath, ['--help'], { encoding: 'utf-8', timeout: 15_000 });
    return help;
  } catch (err) {
    // llama-perplexity.exe --help exits non-zero on some builds despite printing help to stdout.
    return err.stdout ? String(err.stdout) : '';
  }
}

async function ensureWikitext() {
  if (existsSync(WIKITEXT_FILE)) {
    log(`wikitext-2-raw already present: ${WIKITEXT_FILE}`);
    return;
  }
  if (DRY_RUN) {
    log('[dry-run] would download wikitext-2-raw-v1.zip');
    return;
  }
  mkdirSync(WIKITEXT_DIR, { recursive: true });
  const zipPath = path.join(WIKITEXT_DIR, 'wikitext-2-raw-v1.zip');
  log(`Downloading wikitext-2-raw-v1.zip (~13MB) to ${zipPath}...`);
  await downloadFile(WIKITEXT_URL, zipPath);
  log('Extracting...');
  execFileSync('tar', ['-xf', zipPath, '-C', WIKITEXT_DIR], { stdio: 'inherit' });
  // tar produces wikitext-2-raw/wiki.test.raw under WIKITEXT_DIR; normalize path.
  const extracted = path.join(WIKITEXT_DIR, 'wikitext-2-raw', 'wiki.test.raw');
  if (existsSync(extracted) && !existsSync(WIKITEXT_FILE)) {
    execFileSync('cp', [extracted, WIKITEXT_FILE]);
  }
  if (!existsSync(WIKITEXT_FILE)) {
    throw new Error(`wikitext extraction did not produce ${WIKITEXT_FILE}`);
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          res2.pipe(file);
          file.on('finish', () => file.close(resolve));
        }).on('error', reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

function runPerplexity(config, { klBaseFile, saveLogitsTo } = {}) {
  const flags = [
    '-m', MODEL_PATH,
    '-f', WIKITEXT_FILE,
    '-c', CTX_SIZE,
    '-ctk', config.k,
    '-ctv', config.v,
    '-fa', 'on',
    '-ngl', '99',
    '--chunks', '8', // small chunk count — this is a local sanity harness, not a full paper run
  ];
  if (saveLogitsTo) {
    flags.push('--kl-divergence-base', saveLogitsTo);
  } else if (klBaseFile) {
    flags.push('--kl-divergence-base', klBaseFile, '--kl-divergence');
  }

  log(`Running: ${config.label} (ctk=${config.k} ctv=${config.v})`);
  if (DRY_RUN) {
    log(`[dry-run] ${BINARY_PATH} ${flags.join(' ')}`);
    return { config, ppl: null, klDivergence: null, wallClockMs: 0, dryRun: true };
  }

  const startTime = Date.now();
  const result = spawnSync(BINARY_PATH, flags);
  const wallClockMs = Date.now() - startTime;

  const output = (result.stdout || '') + (result.stderr || '');
  const pplMatch = output.match(/Final estimate: PPL = ([\d.]+)/);
  const klMatch = output.match(/KL divergence.*?mean\s*[:=]\s*([\d.eE+-]+)/i);

  return {
    config,
    ppl: pplMatch ? parseFloat(pplMatch[1]) : null,
    klDivergence: klMatch ? parseFloat(klMatch[1]) : null,
    wallClockMs,
    rawOutput: output,
  };
}

async function main() {
  log(`Model: ${MODEL_PATH}`);
  log(`Binary: ${BINARY_PATH}`);
  log(`Context: ${CTX_SIZE}`);

  if (!existsSync(MODEL_PATH)) {
    throw new Error(`Model not found: ${MODEL_PATH}`);
  }
  if (!existsSync(BINARY_PATH)) {
    throw new Error(`llama-perplexity binary not found: ${BINARY_PATH}`);
  }

  const modelSizeGb = (statSync(MODEL_PATH).size / 1e9).toFixed(2);
  log(`Model size: ${modelSizeGb} GB`);

  await ensureWikitext();

  const helpText = checkBinaryFlags(BINARY_PATH);
  const supportedForkConfigs = FORK_CACHE_CONFIGS.filter((c) => {
    const supported = new RegExp(c.requiresFlag, 'i').test(helpText);
    if (!supported) {
      log(`SKIP: "${c.label}" — binary at ${BINARY_PATH} does not advertise "${c.requiresFlag}" in --help. ` +
        'Needs a TurboQuant/RotorQuant-enabled fork build (see llama-cpp-turboquant-gemma4/ — cloned but not built).');
    }
    return supported;
  });

  mkdirSync(LOGITS_DIR, { recursive: true });
  const baselineLogits = path.join(LOGITS_DIR, 'f16-baseline.kldiv');

  const results = [];

  // Baseline run: save logits for KL-divergence comparisons.
  const baseline = STOCK_CACHE_CONFIGS.find((c) => c.isBaseline);
  log('--- Baseline (f16): perplexity + saving logits for KL-divergence ---');
  const baselineResult = runPerplexity(baseline, { saveLogitsTo: baselineLogits });
  results.push(baselineResult);

  // Remaining stock configs: perplexity + KL-divergence vs baseline.
  for (const config of STOCK_CACHE_CONFIGS.filter((c) => !c.isBaseline)) {
    results.push(runPerplexity(config, { klBaseFile: baselineLogits }));
  }

  // Fork-only configs, only if supported.
  for (const config of supportedForkConfigs) {
    results.push(runPerplexity(config, { klBaseFile: baselineLogits }));
  }

  // Record skipped fork configs explicitly (no silent omission).
  const skipped = FORK_CACHE_CONFIGS.filter((c) => !supportedForkConfigs.includes(c)).map((c) => ({
    label: c.label,
    reason: `binary does not support --cache-type-{k,v} ${c.k}/${c.v} (requires TurboQuant/RotorQuant fork)`,
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    model: MODEL_PATH,
    modelSizeGb: Number(modelSizeGb),
    binary: BINARY_PATH,
    contextSize: Number(CTX_SIZE),
    corpus: 'wikitext-2-raw/wiki.test.raw (8 chunks — local sanity check, not full-corpus)',
    stage: 'stage-1-synthetic',
    results: results.map((r) => ({
      config: r.config.label,
      cacheTypeK: r.config.k,
      cacheTypeV: r.config.v,
      perplexity: r.ppl,
      klDivergenceVsF16: r.klDivergence,
      wallClockMs: r.wallClockMs,
    })),
    skippedForkConfigs: skipped,
    nextSteps: {
      stage2ResidualCorrection: 'QJL not implemented in any available binary — needs a reference implementation.',
      attentionLogitFidelity: 'Needs per-layer logit export, not just final KL-divergence — requires instrumented build or PyTorch reference.',
      retrievalMetrics: 'Needs a needle-in-haystack dataset + answer-extraction eval loop — not wired here.',
      fullCorpusRun: 'Increase --chunks (this run used 8) for a statistically meaningful PPL — full wikitext-2-raw is ~280 chunks at ctx=4096.',
    },
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `kv-cache-eval-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`Report written: ${reportPath}`);

  console.log('\n| Config | PPL | KL-div vs f16 | Wall clock (s) |');
  console.log('|---|---|---|---|');
  for (const r of report.results) {
    console.log(`| ${r.config} | ${r.perplexity ?? '—'} | ${r.klDivergenceVsF16 ?? '—'} | ${(r.wallClockMs / 1000).toFixed(1)} |`);
  }
  if (skipped.length) {
    console.log('\nSkipped (fork required):');
    for (const s of skipped) console.log(`  - ${s.label}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error('[kv-eval] FAILED:', err.message);
  process.exit(1);
});
