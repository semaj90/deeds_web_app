#!/usr/bin/env node
/**
 * startup-analysis.mjs
 *
 * Detached startup analysis: runs smoke checks + topology validation,
 * formats the results as a context brief, POSTs to the local Gemma4 agent,
 * and writes a timestamped plan file to next_steps/plans/ for ACE indexing.
 *
 * Usage (detached — fire and forget at dev server start):
 *   node scripts/startup-analysis.mjs &
 *   node scripts/startup-analysis.mjs --no-gemma    (skip LLM, write raw report)
 *   node scripts/startup-analysis.mjs --dry-run     (print report, no file write)
 *
 * Output:
 *   logs/startup/<YYYY-MM-DD-HH>-analysis.log     (raw combined output)
 *   next_steps/plans/<YYYY-MM-DD-HH>-analysis.md  (Gemma4 plan or raw report)
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const NO_GEMMA  = process.argv.includes('--no-gemma');
const DRY_RUN   = process.argv.includes('--dry-run');

const NOW        = new Date();
const TIMESTAMP  = NOW.toISOString().slice(0, 13).replace('T', '-'); // YYYY-MM-DD-HH
const LOG_DIR    = resolve(ROOT, 'logs/startup');
const PLANS_DIR  = resolve(ROOT, 'next_steps/plans');
const LOG_FILE   = resolve(LOG_DIR, `${TIMESTAMP}-analysis.log`);
const PLAN_FILE  = resolve(PLANS_DIR, `${TIMESTAMP}-analysis.md`);

// ── helpers ──────────────────────────────────────────────────────────────────

const lines = [];
function log(line = '') {
  lines.push(line);
  if (!DRY_RUN) process.stdout.write(line + '\n');
}

function run(cmd, label) {
  log(`\n## ${label}`);
  log('```');
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    log(out.trim());
    log('```');
    return { ok: true, output: out.trim() };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    log(out.trim() || e.message);
    log('```');
    return { ok: false, output: out.trim() || e.message };
  }
}

// ── run checks ───────────────────────────────────────────────────────────────

log(`# Startup Analysis — ${NOW.toISOString()}`);
log('');
log(`Platform: ${process.platform}  Node: ${process.version}`);

const graphSmoke   = run('node scripts/tests/smoke-graphify.mjs', '5-Pillar Graphify Smoke');
const topoValidate = run(
  'node scripts/validate-nes-glyph-architecture.mjs --json',
  'Topology Validator (JSON)'
);
const fastAst      = run('node scripts/tests/smoke-fast-ast-ace.mjs', 'ACE Fast-AST Smoke');

// Parse topology JSON if available
let topoSummary = '';
try {
  const tv = JSON.parse(topoValidate.output.match(/\{[\s\S]+\}/)?.[0] ?? '{}');
  topoSummary = [
    `ok=${tv.ok}`,
    `errors=${tv.errors}`,
    `warnings=${tv.warnings}`,
    tv.nes   ? `NES: ${tv.nes.nodeCount}N/${tv.nes.edgeCount}E  dangling=${tv.nes.trueDangling}` : '',
    tv.multihop ? `Multihop: ${tv.multihop.nodeCount}N/${tv.multihop.edgeCount}E  dangling=${tv.multihop.trueDangling}` : '',
  ].filter(Boolean).join('  ');
} catch { /* raw output already logged */ }

const overallOk = graphSmoke.ok && topoValidate.ok && fastAst.ok;

log('\n---');
log(`\n### Summary`);
log(`- Graphify smoke: ${graphSmoke.ok ? '✅' : '❌'}`);
log(`- Topology validate: ${topoValidate.ok ? '✅' : '❌'} ${topoSummary}`);
log(`- ACE fast-AST smoke: ${fastAst.ok ? '✅' : '❌'}`);
log(`- Overall: ${overallOk ? '✅ CLEAN' : '❌ NEEDS ATTENTION'}`);

const rawReport = lines.join('\n');

// ── write log ────────────────────────────────────────────────────────────────

if (!DRY_RUN) {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(LOG_FILE, rawReport, 'utf8');
}

// ── call Gemma4 agent for a plan ──────────────────────────────────────────────

let planContent = rawReport;

if (!NO_GEMMA && !DRY_RUN) {
  const prompt = `You are a senior engineer reviewing a startup health report for a SvelteKit legal AI platform.

Below is the automated analysis from today's startup checks. Produce a concise prioritised action plan in Markdown:
- List any failures as P0 items with a one-line fix hint
- List any warnings as P1 items
- If everything is clean, write a 2-3 sentence "all clear" block and suggest 1 optional improvement
- End with a \`## Next best move\` section (one specific task)

Keep the plan under 400 words.

---
${rawReport.slice(0, 6000)}
---`;

  try {
    const payload = JSON.stringify({
      query:    prompt,
      pipeline: 'code',
    });

    const result = spawnSync(
      'node',
      ['-e', `
        const https=require('http');
        const body=${JSON.stringify(payload)};
        const req=https.request({host:'localhost',port:5173,path:'/api/ai/agent',method:'POST',
          headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),
                   'Cookie':'startup-analysis=1'}},res=>{
          let d='';
          res.on('data',c=>d+=c);
          res.on('end',()=>{
            try{const j=JSON.parse(d);process.stdout.write(j.answer||j.response||d);}
            catch{process.stdout.write(d);}
          });
        });
        req.on('error',e=>process.stderr.write(e.message));
        req.write(body);req.end();
      `],
      { encoding: 'utf8', timeout: 90_000 }
    );

    if (result.stdout && result.stdout.trim().length > 50) {
      planContent = [
        `# Startup Analysis Plan — ${NOW.toISOString()}`,
        '',
        '> Generated by Gemma4 agent from startup health report.',
        '',
        result.stdout.trim(),
        '',
        '---',
        '',
        '## Raw Health Report',
        '',
        rawReport,
      ].join('\n');
    }
  } catch (e) {
    // Gemma4 unavailable — fall back to raw report
    planContent = rawReport;
  }
}

// ── write plan ────────────────────────────────────────────────────────────────

if (DRY_RUN) {
  process.stdout.write(planContent + '\n');
} else {
  mkdirSync(PLANS_DIR, { recursive: true });
  writeFileSync(PLAN_FILE, planContent, 'utf8');
  process.stdout.write(`[startup-analysis] Plan written → ${PLAN_FILE}\n`);
  if (!overallOk) {
    process.stdout.write('[startup-analysis] ❌ One or more checks failed — see plan for details\n');
    process.exit(1);
  }
}