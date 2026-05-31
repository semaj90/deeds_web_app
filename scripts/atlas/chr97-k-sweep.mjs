#!/usr/bin/env node
/**
 * chr97-k-sweep.mjs
 *
 * Sweep K (cluster count) for GPU k-means + run CHR97 self-play eval at each K.
 * Picks the K that maximises avg win-rate spread (winner − loser) — i.e. the K
 * that best separates strong from weak training candidates.
 *
 * For each K in {8, 12, 16, 20, 24, 32}:
 *   1. Re-run gpu-enrich-parent-atlas.mjs --apply --k=K
 *   2. Re-run chr97-sprite-eval.mjs --apply --top 200 --bouts 1500
 *   3. Read memory/exports/chr97-eval-report.json
 *   4. Record: avgWinRate, topWinRate, bottomWinRate, spread
 *
 * Output:
 *   memory/exports/chr97-k-sweep-report.json
 *
 * Usage:
 *   node scripts/atlas/chr97-k-sweep.mjs --apply
 *   node scripts/atlas/chr97-k-sweep.mjs --apply --k-values=12,20,24
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
function flagVal(name, fallback) {
  const i = argv.findIndex((a) => a.startsWith(name));
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  return eq >= 0 ? argv[i].slice(eq + 1) : argv[i + 1];
}
const K_VALUES = (flagVal('--k-values', '8,12,16,20,24,32') || '8,12,16,20,24,32')
  .split(',')
  .map((s) => parseInt(s.trim(), 10));

const TOP = parseInt(flagVal('--top', '200'), 10);
const BOUTS = parseInt(flagVal('--bouts', '1500'), 10);
const EVAL_REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-eval-report.json');
const SWEEP_REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-k-sweep-report.json');

function runStep(label, cmd, args) {
  console.log(`  → ${label}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: false });
  if (r.status !== 0) {
    console.log(`    [warn] exit=${r.status}`);
    if (r.stderr) console.log('    stderr:', r.stderr.split('\n').slice(0, 5).join('\n'));
    return false;
  }
  return true;
}

async function main() {
  console.log('\n══ CHR97 K-Sweep ═════════════════════════════════════════');
  console.log(`  Mode:   ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  K vals: ${K_VALUES.join(', ')}`);
  console.log(`  Top N:  ${TOP}, Bouts: ${BOUTS}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] Use --apply to run sweep.');
    return;
  }

  const results = [];

  for (const k of K_VALUES) {
    console.log(`\n── K = ${k} ─────────────────────────────`);

    // Step A: GPU enrich with this K
    const ok1 = runStep('GPU enrich', 'node', [
      'scripts/atlas/gpu-enrich-parent-atlas.mjs',
      '--apply',
      `--k=${k}`,
    ]);
    if (!ok1) {
      results.push({ k, error: 'gpu-enrich failed' });
      continue;
    }

    // Step B: Sprite eval
    const ok2 = runStep('Sprite eval', 'node', [
      'scripts/atlas/chr97-sprite-eval.mjs',
      '--apply',
      `--top=${TOP}`,
      `--bouts=${BOUTS}`,
    ]);
    if (!ok2) {
      results.push({ k, error: 'sprite-eval failed' });
      continue;
    }

    // Step C: Read report
    if (!fs.existsSync(EVAL_REPORT)) {
      results.push({ k, error: 'eval report missing' });
      continue;
    }
    const report = JSON.parse(fs.readFileSync(EVAL_REPORT, 'utf8'));
    const top = report.topWinners?.[0];
    const bottom = report.bottomLosers?.[report.bottomLosers.length - 1];
    const allRates = (report.topWinners || []).concat(report.bottomLosers || []).map((s) => s.winRate);
    const uniqueRates = Array.from(new Set(allRates));
    const avg = uniqueRates.reduce((a, b) => a + b, 0) / uniqueRates.length;
    const spread = (top?.winRate ?? 0) - (bottom?.winRate ?? 0);

    results.push({
      k,
      uniqueGroups: report.eval?.uniqueGroups,
      topWinner: { key: `${top?.lane}|${top?.cluster}`, rate: top?.winRate, wins: top?.wins, total: top?.total },
      bottomLoser: { key: `${bottom?.lane}|${bottom?.cluster}`, rate: bottom?.winRate, total: bottom?.total },
      avgWinRate: parseFloat(avg.toFixed(4)),
      spread: parseFloat(spread.toFixed(4)),
    });
    console.log(`  ✅ K=${k}: top=${(top?.winRate * 100 || 0).toFixed(1)}%  bottom=${(bottom?.winRate * 100 || 0).toFixed(1)}%  spread=${(spread * 100).toFixed(1)}%`);
  }

  // Verdict: largest spread = clearest signal for training
  const ranked = [...results].filter((r) => !r.error).sort((a, b) => (b.spread || 0) - (a.spread || 0));
  const winner = ranked[0];

  const finalReport = {
    timestamp: new Date().toISOString(),
    params: { kValues: K_VALUES, topN: TOP, bouts: BOUTS },
    results,
    rankedBySpread: ranked.map((r) => ({ k: r.k, spread: r.spread, topRate: r.topWinner?.rate, bottomRate: r.bottomLoser?.rate })),
    recommendation: winner
      ? `Use K=${winner.k} — spread ${(winner.spread * 100).toFixed(1)}% (top=${(winner.topWinner.rate * 100).toFixed(1)}% vs bottom=${(winner.bottomLoser.rate * 100).toFixed(1)}%)`
      : 'No clean winner — re-run with more bouts',
  };

  fs.mkdirSync(path.dirname(SWEEP_REPORT), { recursive: true });
  fs.writeFileSync(SWEEP_REPORT, JSON.stringify(finalReport, null, 2), 'utf8');

  console.log('\n══ Sweep Results ═════════════════════════════════════════');
  console.log('  K   spread%  top%  bottom%  unique-groups');
  for (const r of results) {
    if (r.error) {
      console.log(`  ${String(r.k).padStart(2)}  ERROR: ${r.error}`);
      continue;
    }
    console.log(
      `  ${String(r.k).padStart(2)}  ${((r.spread || 0) * 100).toFixed(1).padStart(6)}  ${((r.topWinner?.rate || 0) * 100).toFixed(1).padStart(5)}  ${((r.bottomLoser?.rate || 0) * 100).toFixed(1).padStart(7)}  ${String(r.uniqueGroups).padStart(3)}`,
    );
  }
  console.log(`\n  ${finalReport.recommendation}`);
  console.log(`  📝 Report → ${SWEEP_REPORT}`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});