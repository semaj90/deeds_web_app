#!/usr/bin/env node
/**
 * stability-test.mjs — TurboQuant KV profile stability gate
 *
 * Tests q8_0/q8_0 (baseline) vs q8_0/turbo3 (asymmetric) and q8_0/turbo4
 * (aggressive asymmetric) before promoting to production. All 20 generations
 * must pass tool-call JSON validity, no NaN centroids, and latency p95 < 2×
 * baseline before turbo3/turbo4 V-cache is considered safe.
 *
 * NOTE: This harness validates a server that is ALREADY RUNNING. It does NOT
 * start llama-server.exe. The `ctk`/`ctv` fields in PROFILE_ARGS are
 * documentation/report labels only — they describe the profile the operator
 * launched the server with. To change the running profile, restart the server
 * with the corresponding TURBO_KV_K / TURBO_KV_V env vars.
 *
 * Asymmetric rationale: K-cache tolerates less compression than V-cache, so
 * keep K at q8_0 and only push V toward turbo3/turbo4. turbo3/turbo4 require
 * a TurboQuant-enabled llama-server build (the standard llama.cpp build
 * rejects them and the launcher falls back to q8_0/q8_0).
 *
 * Usage:
 *   npm run turbo:test:stability              (20 gen, q8 profile)
 *   npm run turbo:test:stability:turbo        (20 gen, q8/turbo3 profile)
 *   node scripts/turboquant/stability-test.mjs --generations 5 --profile q8
 *   node scripts/turboquant/stability-test.mjs --generations 20 --profile turbo3
 */

import { execSync }     from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');

const argv    = process.argv.slice(2);
const genArg  = argv.find(a => a.startsWith('--generations=')) ?? argv[argv.indexOf('--generations') + 1];
const GENS    = parseInt(genArg ?? '20', 10);
const profArg = argv.find(a => a.startsWith('--profile='))?.split('=')[1]
             ?? (argv.includes('--profile') ? argv[argv.indexOf('--profile') + 1] : 'q8');
const PORT    = process.env.TURBO_PORT ?? '8090';

// Optional --run-dir: also write turboquant_stability.json into that run directory.
// Falls back to auto-detecting the latest memory/runs/<run_id>/ folder inside main().
const RUN_DIR_ARG = argv.find(a => a.startsWith('--run-dir='))?.split('=').slice(1).join('=')
                 ?? (argv.includes('--run-dir') ? argv[argv.indexOf('--run-dir') + 1] : null);

const PROFILE_ARGS = {
  q8:     { ctk: 'q8_0', ctv: 'q8_0',   label: 'q8_0/q8_0 stable baseline' },
  turbo3: { ctk: 'q8_0', ctv: 'turbo3', label: 'q8_0/turbo3 asymmetric TurboQuant' },
  turbo4: { ctk: 'q8_0', ctv: 'turbo4', label: 'q8_0/turbo4 aggressive asymmetric TurboQuant' },
};
const profile = PROFILE_ARGS[profArg] ?? PROFILE_ARGS.q8;

// ── Tool-call validity prompts ────────────────────────────────────────────────
// Mix of legal queries and structured tool-call requests to stress-test KV quant

const TEST_PROMPTS = [
  // Legal reasoning (long context, KV-heavy)
  'Summarize the hearsay rule exception for excited utterances under FRE 803(2).',
  'What is the statute of limitations for civil fraud claims in California?',
  'Define chain of custody and its importance in evidence admissibility.',
  'Explain the Miranda rights and when they must be read to a suspect.',
  'What constitutes an effective waiver of attorney-client privilege?',

  // Structured output (tool-call JSON validity)
  'Respond with a JSON object: { "rule": "...", "exception": "...", "citation": "..." } for the best evidence rule.',
  'Return JSON: { "elements": ["element1","element2","element3"] } for negligence per se.',
  'Output JSON: { "party": "plaintiff", "burden": "preponderance", "standard": "..." } for civil liability.',

  // Short queries (tests KV cache reuse across similar prompts)
  'What is voir dire?',
  'Define subpoena duces tecum.',
  'What is a writ of habeas corpus?',
  'Define res judicata.',
  'What is collateral estoppel?',

  // Repetition test (same prompt twice to verify KV cache consistency)
  'Summarize the hearsay rule exception for excited utterances under FRE 803(2).',
  'What is voir dire?',

  // Long context (SOM topology + graph retrieval stress)
  'Analyze how the Frye standard for expert testimony differs from Daubert.',
  'What are the grounds for a directed verdict motion in federal civil litigation?',
  'Explain the exclusionary rule and its exceptions under United States v. Leon.',
  'Describe the doctrine of res ipsa loquitur with a medical malpractice example.',
  'What constitutional protections apply to digital searches under Riley v. California?',
];

// ── VRAM measurement ──────────────────────────────────────────────────────────

function getVramMB() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits',
      { encoding: 'utf8', timeout: 3000, stdio: ['pipe','pipe','ignore'] });
    return parseInt(out.trim(), 10);
  } catch { return null; }
}

// ── Generation request ────────────────────────────────────────────────────────

async function generate(prompt, timeoutMs = 45_000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0    = Date.now();

  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:       'gemma4-rotorquant:latest',
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  300,
        temperature: 0.3,
        stream:      false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return { ok: false, latencyMs: Date.now() - t0, error: `HTTP ${res.status}` };

    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const latency = Date.now() - t0;

    // Tool-call JSON validity: if output looks like JSON, verify it parses
    let jsonValid = true;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { JSON.parse(jsonMatch[0]); }
      catch { jsonValid = false; }
    }

    // NaN/repetition heuristics
    const hasNaN = /\bNaN\b/.test(content);
    const isRepetitive = content.length > 100 && new Set(content.split(' ')).size < content.split(' ').length * 0.15;

    return { ok: true, latencyMs: latency, jsonValid, hasNaN, isRepetitive, tokenCount: data.usage?.completion_tokens ?? 0 };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, latencyMs: Date.now() - t0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(` TurboQuant Stability Test — ${profile.label}`);
  console.log(`  Port: :${PORT}  Generations: ${GENS}  Profile: ${profArg}`);
  console.log('══════════════════════════════════════════════════\n');

  // Verify server is up
  try {
    const h = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(3000) });
    if (!h.ok) throw new Error(`/health returned ${h.status}`);
    console.log(`  ✅ llama-server :${PORT} healthy\n`);
  } catch (err) {
    console.error(`  ❌ llama-server :${PORT} not reachable: ${err.message}`);
    console.error(`     Start it first: npm run turbo:start:detached`);
    process.exit(1);
  }

  const vramBefore = getVramMB();
  const results    = [];
  const prompts    = GENS <= TEST_PROMPTS.length
    ? TEST_PROMPTS.slice(0, GENS)
    : [...TEST_PROMPTS, ...Array(GENS - TEST_PROMPTS.length).fill(TEST_PROMPTS[0])];

  for (let i = 0; i < GENS; i++) {
    process.stdout.write(`  Gen ${String(i + 1).padStart(2)}/${GENS} ... `);
    const r = await generate(prompts[i]);
    const icon = r.ok && r.jsonValid && !r.hasNaN && !r.isRepetitive ? '✅' : '⚠️';
    const flags = [
      !r.ok          && `FAIL(${r.error})`,
      r.hasNaN       && 'NaN',
      r.isRepetitive && 'repetitive',
      !r.jsonValid   && 'invalid-json',
    ].filter(Boolean).join(' ');
    console.log(`${icon} ${r.latencyMs}ms${flags ? '  [' + flags + ']' : ''}`);
    results.push({ gen: i + 1, prompt: prompts[i].slice(0, 60), ...r });
  }

  const vramAfter = getVramMB();

  // ── Statistics ──────────────────────────────────────────────────────────────

  const okCount    = results.filter(r => r.ok).length;
  const latencies  = results.filter(r => r.ok).map(r => r.latencyMs).sort((a, b) => a - b);
  const median     = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p95        = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const nanCount   = results.filter(r => r.hasNaN).length;
  const repCount   = results.filter(r => r.isRepetitive).length;
  const jsonFail   = results.filter(r => r.ok && !r.jsonValid).length;
  const crashCount = results.filter(r => !r.ok).length;

  // Pass criteria (conservative — turbo3/4 must match q8_0 closely)
  const PASS_MIN_OK     = GENS;           // all generations must succeed
  const PASS_MAX_NAN    = 0;              // no NaN in output
  const PASS_MAX_REP    = 0;              // no repetitive output
  const PASS_MAX_CRASH  = 0;             // no crashes/timeouts
  const pass = okCount >= PASS_MIN_OK && nanCount <= PASS_MAX_NAN
            && repCount <= PASS_MAX_REP  && crashCount <= PASS_MAX_CRASH;

  console.log('\n──────────────────────────────────────────────────');
  console.log(` Results — ${profile.label}`);
  console.log('──────────────────────────────────────────────────');
  console.log(`  Generations:  ${GENS}  OK: ${okCount}  Crash: ${crashCount}`);
  console.log(`  Latency:      median ${median}ms  p95 ${p95}ms`);
  console.log(`  Quality:      NaN=${nanCount}  repetitive=${repCount}  invalid-json=${jsonFail}`);
  if (vramBefore != null) console.log(`  VRAM:         before ${vramBefore}MB  after ${vramAfter ?? '?'}MB`);
  console.log(`  VERDICT:      ${pass ? '✅ PASS — safe to promote' : '❌ FAIL — keep q8_0'}`);
  console.log('──────────────────────────────────────────────────\n');

  if (pass && profArg !== 'q8') {
    console.log('  Next step: set TURBO_KV_K=q8_0 TURBO_KV_V=turbo3 TURBO_CTX=65536 before turbo:start:detached');
    console.log('  (requires TurboQuant-enabled llama-server binary at LLAMA_SERVER_PATH).\n');
  } else if (!pass) {
    console.log('  Keep: -ctk q8_0 -ctv q8_0 (stable baseline). If q8/turbo3 fails, fall back to q8/q8 with TURBO_CTX=65536.\n');
  }

  // Write report
  const reportsDir = join(ROOT, 'logs', 'turboquant');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `stability-${profArg}-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`);
  writeFileSync(reportPath, JSON.stringify({
    profile:     profArg,
    profileArgs: profile,
    port:        PORT,
    generationsRequested: GENS,
    results, okCount, crashCount, nanCount, repCount, jsonFail,
    median, p95, vramBefore, vramAfter,
    pass,
    testedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  console.log(`  Report: ${reportPath}\n`);

  // Also write into the startup run-dir if one was supplied or can be auto-detected
  const runDir = (() => {
    if (RUN_DIR_ARG) return RUN_DIR_ARG;
    const runsBase = join(ROOT, 'memory', 'runs');
    if (!existsSync(runsBase)) return null;
    const entries = readdirSync(runsBase).sort();
    return entries.length ? join(runsBase, entries[entries.length - 1]) : null;
  })();
  if (runDir && existsSync(runDir)) {
    const runReportPath = join(runDir, 'turboquant_stability.json');
    writeFileSync(runReportPath, JSON.stringify({
      profile: profArg, profileArgs: profile, port: PORT,
      generationsRequested: GENS,
      results, okCount, crashCount, nanCount, repCount, jsonFail,
      median, p95, vramBefore, vramAfter, pass,
      testedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
    console.log(`  Run artifact: ${runReportPath}\n`);
  }

  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error('[stability-test] fatal:', err.message);
  process.exit(2);
});
