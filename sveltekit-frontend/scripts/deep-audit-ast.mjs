#!/usr/bin/env node
/**
 * Deep AST Audit — joins Graphify's codebase-graph.json with AST-level checks
 * that the directory-level PRODUCTION_HARDENING_AUDIT_2026-04-07.md missed.
 *
 * Catches:
 *   D1  @vite-ignore variable imports (CLAUDE.md G4)
 *   D2  CJS require() calls in .ts/.mjs (G3)
 *   D3  Native .node addon loads via createRequire (G14)
 *   D4  worker_threads / new Worker(...) couplings (G16)
 *   D5  Proto / gRPC contract refs (G15)
 *   D6  Hardcoded localhost / 127.0.0.1 outside env.server.ts (G17)
 *   D7  Browser globals (window/document/localStorage/IndexedDB) outside
 *       onMount / typeof window guard, in SSR-enabled .svelte files (G20)
 *   D8  Files marked ssrUnsafe + sv4Legacy in graphify but still served by
 *       a route that has NOT set `export const ssr = false`
 *   D9  Files in graphify with 0 fanIn AND 0 dynImports referencing them —
 *       likely orphans that the prune-codebase skill missed
 *   D10 LLM-output cache write-paths NOT followed by recordLlmOutputHit
 *       (i.e. ACE wrote a synthesis but didn't index it for fast recall)
 *
 * Output:
 *   docs/graph/deep-audit-ast.json    — machine-readable findings
 *   docs/graph/deep-audit-ast.md      — human report (capped at 30/category)
 *
 * Usage:
 *   node scripts/deep-audit-ast.mjs                # full audit
 *   node scripts/deep-audit-ast.mjs --gate D7,D8   # specific gates only
 *   node scripts/deep-audit-ast.mjs --strict       # exit 1 if any findings
 *   node scripts/deep-audit-ast.mjs --quiet        # write files, minimal stdout
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative }          from 'node:path';
import { glob }                        from 'glob';
import { verifyReferences, summarise } from './lib/reference-verifier.mjs';

const ROOT       = process.cwd();
const GRAPH_PATH = resolve(ROOT, 'docs/graph/codebase-graph.json');
const OUT_JSON   = resolve(ROOT, 'docs/graph/deep-audit-ast.json');
const OUT_MD     = resolve(ROOT, 'docs/graph/deep-audit-ast.md');

const args = new Set(process.argv.slice(2));
const QUIET   = args.has('--quiet');
const STRICT  = args.has('--strict');
const GATE_ARG = process.argv.find((a) => a.startsWith('--gate'));
const ONLY_GATES = GATE_ARG
  ? new Set(GATE_ARG.split('=')[1]?.split(',').map((s) => s.trim().toUpperCase()) ?? [])
  : null;

const MAX_PER_CATEGORY = 30;

const log = (...a) => { if (!QUIET) console.log(...a); };

// ── Load graph ────────────────────────────────────────────────────────────────

async function loadGraph() {
  const raw = await readFile(GRAPH_PATH, 'utf8').catch(() => null);
  if (!raw) {
    console.error('[deep-audit] codebase-graph.json missing — run `npm run graphify:map` first');
    process.exit(2);
  }
  const j = JSON.parse(raw);
  return Array.isArray(j) ? j : (j.files ?? []);
}

// ── Gate D1: @vite-ignore variable imports ────────────────────────────────────

async function gateD1(_files) {
  // @vite-ignore is a comment, so AST scanners miss it. Use plain regex.
  const VITE_IGNORE_RE = /@vite-ignore[^*\n]*?import\s*\(/g;
  const targets = await glob('src/**/*.{ts,svelte,mjs,js}', { ignore: ['**/*.d.ts'] });
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    if (!src.includes('@vite-ignore')) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (VITE_IGNORE_RE.test(lines[i]) || /@vite-ignore/.test(lines[i])) {
        findings.push({ file: relative(ROOT, f), line: i + 1, snippet: lines[i].trim().slice(0, 140) });
      }
      VITE_IGNORE_RE.lastIndex = 0;
    }
  }
  return findings;
}

// ── Gate D2: CJS require() in .ts/.mjs ────────────────────────────────────────

async function gateD2() {
  const REQ_RE = /^(?!\s*\/\/).*\brequire\s*\(\s*['"]/;
  const targets = await glob('src/**/*.{ts,mjs}', { ignore: ['**/*.d.ts', 'src/**/*.test.ts'] });
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (REQ_RE.test(lines[i]) && !/from\s*['"]/.test(lines[i])) {
        findings.push({ file: relative(ROOT, f), line: i + 1, snippet: lines[i].trim().slice(0, 140) });
      }
    }
  }
  return findings;
}

// ── Gate D3: Native .node addon loads ─────────────────────────────────────────

async function gateD3() {
  const NODE_RE = /\.node['"`)]|createRequire\s*\(/;
  const targets = await glob('src/**/*.{ts,mjs}', { ignore: ['**/*.d.ts'] });
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (NODE_RE.test(lines[i])) {
        findings.push({ file: relative(ROOT, f), line: i + 1, snippet: lines[i].trim().slice(0, 140) });
      }
    }
  }
  return findings;
}

// ── Gate D4: worker_threads / new Worker(...) ─────────────────────────────────

async function gateD4() {
  const WORKER_RE = /worker_threads|new\s+Worker\s*\(/;
  const targets = await glob('src/**/*.{ts,svelte,mjs}', { ignore: ['**/*.d.ts'] });
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (WORKER_RE.test(lines[i])) {
        findings.push({ file: relative(ROOT, f), line: i + 1, snippet: lines[i].trim().slice(0, 140) });
      }
    }
  }
  return findings;
}

// ── Gate D5: Proto / gRPC refs ────────────────────────────────────────────────

async function gateD5() {
  const PROTO_RE = /\.proto['"`]|loadPackageDefinition|@grpc\/grpc-js|protoLoader/;
  const targets = await glob('src/**/*.{ts,mjs}', { ignore: ['**/*.d.ts'] });
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    if (!PROTO_RE.test(src)) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (PROTO_RE.test(lines[i])) {
        findings.push({ file: relative(ROOT, f), line: i + 1, snippet: lines[i].trim().slice(0, 140) });
        break; // one per file
      }
    }
  }
  return findings;
}

// ── Gate D6: Hardcoded localhost/127.0.0.1 outside env ────────────────────────

async function gateD6() {
  // Hard leaks only: hardcoded URL NOT inside an `?? '...'` env fallback,
  // not in a comment, not in a test fixture, not in a JSDoc example.
  const URL_RE        = /https?:\/\/(?:localhost|127\.0\.0\.1)/;
  // env-driven fallback patterns (acceptable):
  //   X ?? 'http://localhost:...'
  //   X || 'http://localhost:...'
  //   { fallback: 'http://localhost:...', ... }   (service-discovery descriptors)
  const ENV_FALLBACK  = /(\?\?|\|\|)\s*['"`]https?:\/\/(?:localhost|127\.0\.0\.1)/;
  const FALLBACK_KEY  = /\bfallback\s*:\s*['"`]https?:\/\/(?:localhost|127\.0\.0\.1)/;
  const JSDOC_EXAMPLE = /\/\*\*?[^*]*?https?:\/\/(?:localhost|127\.0\.0\.1)[^*]*?\*\//;
  const ASSIGN_DEFAULT = /=\s*['"`]https?:\/\/(?:localhost|127\.0\.0\.1)/; // const X = 'http://...'
  const targets = await glob('src/lib/server/**/*.ts', {
    ignore: ['**/env.server.ts', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts', '**/__tests__/**'],
  });
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    if (!URL_RE.test(src)) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!URL_RE.test(ln)) continue;
      const trim = ln.trim();
      if (trim.startsWith('//') || trim.startsWith('*')) continue;
      // Allowed: env-driven fallback (ENV.X ?? 'http://localhost:...') or simple
      // module-level default constants (e.g. const QDRANT_URL = process.env.X ?? 'http://...')
      if (ENV_FALLBACK.test(ln)) continue;
      if (FALLBACK_KEY.test(ln)) continue;
      if (JSDOC_EXAMPLE.test(ln)) continue;
      // Opt-out comment on the line itself or the previous line
      if (/audit:ignore-localhost/.test(ln) || /audit:ignore-localhost/.test(lines[i - 1] ?? '')) continue;
      // Variable named *Fallback, *Default, *Candidate — explicit fallback constants.
      // Look back up to 8 lines to catch multi-line array literals like
      //   const CANDIDATE_BASE_URLS = [
      //     ENV.X,
      //     'http://localhost:8095', // ← the URL line
      //   ]
      const FALLBACK_NAME = /\b(localFallback|localhostFallback|defaultUrl|defaultBaseUrl|fallbackUrl|candidateUrls?|CANDIDATE_BASE_URLS|FALLBACK_URLS|DISCOVERY_URLS)\b/;
      if (FALLBACK_NAME.test(ln)) continue;
      let foundFallbackName = false;
      for (let k = 1; k <= 8 && i - k >= 0; k++) {
        if (FALLBACK_NAME.test(lines[i - k])) { foundFallbackName = true; break; }
        // Stop at the start of a different declaration — don't bleed across blocks
        if (/^\s*(const|let|var|function|class|export)\s/.test(lines[i - k])) break;
      }
      if (foundFallbackName) continue;
      // Look back up to 8 lines for the audit:ignore-localhost opt-out
      let foundOptOut = false;
      for (let k = 1; k <= 8 && i - k >= 0; k++) {
        if (/audit:ignore-localhost/.test(lines[i - k])) { foundOptOut = true; break; }
        if (/^\s*(const|let|var|function|class|export)\s/.test(lines[i - k])) break;
      }
      if (foundOptOut) continue;
      // String inside a Docker port-scan probe (template literal with ${port})
      if (/https?:\/\/127\.0\.0\.1:\$\{[a-zA-Z_]+\}/.test(ln)) continue;
      // Inside a multi-line template literal — count unescaped backticks before this line.
      // Console-log examples / heredocs commonly contain `curl http://localhost:...`.
      const before = lines.slice(0, i).join('\n');
      const backticks = (before.match(/(?<!\\)`/g) ?? []).length;
      if (backticks % 2 === 1) continue;
      // Allowed: assignment to a const/let/var (default constant), as long as the
      // line also references process.env or ENV — pure inline assignment without
      // an env source IS a leak.
      if (ASSIGN_DEFAULT.test(ln) && (/process\.env|\bENV\b/.test(ln) || /process\.env|\bENV\b/.test(lines[i - 1] ?? ''))) continue;
      findings.push({ file: relative(ROOT, f), line: i + 1, snippet: trim.slice(0, 140) });
    }
  }
  return findings;
}

// ── Gate D7: Browser globals in SSR-enabled .svelte without guards ───────────

async function gateD7() {
  // SSR-unsafe = browser global referenced at MODULE TOP-LEVEL of a .svelte
  // <script> body (depth 0). References inside any function body / arrow / event
  // handler / $effect / onMount run only on the client and are safe.
  const BROWSER_RE = /\b(window|document|localStorage|sessionStorage|indexedDB|navigator)\.\w/;
  const targets = await glob('src/**/*.svelte', { ignore: ['**/*.d.ts'] });
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    if (/export\s+const\s+ssr\s*=\s*false/.test(src)) continue;
    if (!BROWSER_RE.test(src)) continue;
    const scriptMatch = src.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) continue;
    const scriptBody = scriptMatch[1];

    // Walk the script body line-by-line, maintain a brace-depth counter that
    // strips strings/comments first to avoid noise.
    let depth = 0;
    const lines = scriptBody.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const cleaned = raw
        .replace(/\/\/.*$/, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
      const trim = cleaned.trim();
      // Flag only when at module top-level depth==0 AND the reference is on
      // this line (before any opening brace on the same line increments depth)
      if (depth === 0 && BROWSER_RE.test(cleaned) && !trim.startsWith('//')) {
        // Skip type-only references and import lines
        if (/^(import|export|type|interface)\s/.test(trim)) {
          // fallthrough to depth update
        } else if (
          // Test against RAW line — string-stripping erases the 'undefined' literal
          /typeof\s+(window|document|navigator)\s*[!=]==?\s*['"]undefined['"]/.test(raw) ||
          /\bbrowser\s*[?&]/.test(raw) ||
          /\bbrowser\s*&&/.test(raw) ||
          /\bif\s*\(\s*browser\b/.test(raw)
        ) {
          // already guarded inline
        } else {
          findings.push({ file: relative(ROOT, f), line: i + 1, snippet: raw.trim().slice(0, 140) });
        }
      }
      // Update depth AFTER scanning the line (so handlers at the END of
      // statements are still flagged, but bodies of those handlers aren't)
      const opens = (cleaned.match(/[{(]/g) ?? []).length;
      const closes = (cleaned.match(/[})]/g) ?? []).length;
      depth = Math.max(0, depth + opens - closes);
    }
  }
  return findings;
}

// ── Gate D8: ssrUnsafe routes that haven't disabled SSR ──────────────────────

async function gateD8(files) {
  // Graphify's ssrUnsafe flag is regex-based and over-counts:
  //   - `document.X` inside `{#each docs as document}` is a loop variable, not DOM
  //   - `window.X` inside event handlers runs only client-side
  // Re-validate by walking the <script> body with brace-depth tracking
  // (same heuristic as D7). A route only needs ssr=false when at least
  // one TRUE module-level browser global is present without an inline guard.
  const BROWSER_RE = /\b(window|document|localStorage|sessionStorage|indexedDB|navigator)\.\w/;
  const findings = [];

  const hasTrueModuleLevelBrowserRef = (src) => {
    const scriptMatch = src.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return false;
    const body = scriptMatch[1];
    let depth = 0;
    for (const raw of body.split('\n')) {
      const cleaned = raw
        .replace(/\/\/.*$/, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
      const trim = cleaned.trim();
      if (depth === 0 && BROWSER_RE.test(cleaned) && !trim.startsWith('//')) {
        if (!/^(import|export|type|interface)\s/.test(trim)) {
          const guarded = /typeof\s+(window|document|navigator)\s*[!=]==?\s*['"]undefined['"]/.test(raw)
            || /\bbrowser\s*[?&]/.test(raw)
            || /\bbrowser\s*&&/.test(raw)
            || /\bif\s*\(\s*browser\b/.test(raw);
          if (!guarded) return true;
        }
      }
      const opens = (cleaned.match(/[{(]/g) ?? []).length;
      const closes = (cleaned.match(/[})]/g) ?? []).length;
      depth = Math.max(0, depth + opens - closes);
    }
    return false;
  };

  for (const f of files) {
    if (!f.ssrUnsafe || !f.isRoute) continue;
    const selfSrc = await readFile(resolve(ROOT, f.rel), 'utf8').catch(() => '');
    if (/export\s+const\s+ssr\s*=\s*false/.test(selfSrc)) continue;
    if (!hasTrueModuleLevelBrowserRef(selfSrc)) continue;

    const dir = f.rel.replace(/\/[^/]+$/, '');
    const siblings = ['+page.ts', '+page.server.ts', '+layout.ts', '+layout.server.ts'];
    let ssrFalse = false;
    for (const sib of siblings) {
      const src = await readFile(resolve(ROOT, `${dir}/${sib}`), 'utf8').catch(() => '');
      if (/export\s+const\s+ssr\s*=\s*false/.test(src)) { ssrFalse = true; break; }
    }
    if (!ssrFalse) {
      findings.push({
        file: f.rel,
        line: 1,
        snippet: `Module-level browser global without guard; no \`export const ssr = false\` on sibling`,
      });
    }
  }
  return findings;
}

// ── Gate D9: Orphan candidates (verified via reference-verifier.mjs) ─────────
//
// Graphify fanIn=0 is a CANDIDATE signal only. Each candidate is then run
// through the rg-aware reference verifier (static/dynamic/type/barrel/path)
// before being labeled as a true orphan. Route entrypoints and framework/
// config files are exempted up front.
//
// Side effect: writes reports/deep-audit/d9-orphan-verification.json with
// the full classification breakdown (counts + true-orphan list).

async function gateD9(files) {
  // Step 1: filter to fanIn=0 candidates from the graph (cheap)
  const candidates = files.filter((f) => Number(f.fanIn ?? 0) === 0)
                          .filter((f) => /\.(ts|tsx|svelte|svelte\.ts|js|mjs|cjs)$/.test(f.rel));

  // Step 2: run the reference verifier on each candidate (parallel, but sync rg
  //         spawn — keep small batch sizes to avoid OS process limits)
  const BATCH_SIZE = 12;
  const verified = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = batch.map((f) => verifyReferences(f.rel, ROOT));
    verified.push(...results);
  }

  const { counts, trueOrphans } = summarise(verified);

  // Step 3: write the durable verification artifact for downstream consumers
  //         (CI, /deep-audit slash command, prune-codebase skill)
  const reportPath = resolve(ROOT, 'reports/deep-audit/d9-orphan-verification.json');
  await mkdir(resolve(ROOT, 'reports/deep-audit'), { recursive: true }).catch(() => null);
  await writeFile(reportPath, JSON.stringify({
    gate:                 'D9',
    generatedAt:          new Date().toISOString(),
    reportedByFanIn:      candidates.length,
    verifiedTrueOrphans:  trueOrphans.length,
    falsePositives:       candidates.length - trueOrphans.length,
    classifications:      counts,
    trueOrphans,
    note:                 'D9 uses Graphify fanIn only as candidate source; final classification is rg-based static/dynamic/type/barrel/path-aware.',
  }, null, 2), 'utf8');

  // Step 4: return findings only for true-orphan-candidate classification
  return verified
    .filter((v) => v.classification === 'true-orphan-candidate')
    .map((v) => ({
      file: v.filePath,
      line: 1,
      snippet: `0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate`,
    }));
}

// ── Gate D10: ACE synthesis without recordLlmOutputHit follow-up ─────────────

async function gateD10() {
  const targets = await glob('src/lib/server/ace/**/*.ts', { ignore: ['**/types.ts', '**/*.test.ts', '**/*.spec.ts'] });
  // Only flag actual *call sites*, not JSDoc/types/identifiers in comments
  const CALL_RE = /\b(generateAnswer|synthesi[sz]e|gemma4Chat)\s*\(/;
  const findings = [];
  for (const f of targets) {
    const src = await readFile(f, 'utf8').catch(() => '');
    const indexes = /recordLlmOutputHit/.test(src);
    if (indexes) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (CALL_RE.test(ln)) {
        findings.push({
          file: relative(ROOT, f),
          line: i + 1,
          snippet: `LLM synthesis call without recordLlmOutputHit — cache miss permanent`,
        });
        break;
      }
    }
  }
  return findings;
}

// ── Driver ────────────────────────────────────────────────────────────────────

const GATES = [
  ['D1',  '@vite-ignore variable imports',                gateD1],
  ['D2',  'CJS require() in .ts/.mjs',                    gateD2],
  ['D3',  'Native .node addon loads',                     gateD3],
  ['D4',  'worker_threads / new Worker',                  gateD4],
  ['D5',  'Proto / gRPC contract refs',                   gateD5],
  ['D6',  'Hardcoded localhost outside env.server.ts',    gateD6],
  ['D7',  'Browser globals in SSR .svelte without guard', gateD7],
  ['D8',  'ssrUnsafe routes missing ssr=false',           gateD8],
  ['D9',  'Likely orphans (0 fanIn, no dynImport ref)',   gateD9],
  ['D10', 'ACE synthesis missing recordLlmOutputHit',     gateD10],
];

async function main() {
  log('🔍 Deep AST audit — loading graphify graph…');
  const files = await loadGraph();
  log(`   ${files.length} files in graph`);

  const report = { generatedAt: new Date().toISOString(), graphFiles: files.length, gates: {} };

  for (const [id, name, fn] of GATES) {
    if (ONLY_GATES && !ONLY_GATES.has(id)) continue;
    const t0 = Date.now();
    let findings = [];
    try {
      findings = await fn(files);
    } catch (e) {
      log(`   ${id} ${name} — ERROR: ${e?.message ?? e}`);
      report.gates[id] = { name, error: String(e?.message ?? e), findings: [] };
      continue;
    }
    report.gates[id] = { name, count: findings.length, findings };
    const dt = Date.now() - t0;
    const status = findings.length === 0 ? '✅' : findings.length < 5 ? '⚠️' : '🔴';
    log(`   ${status} ${id} ${name} — ${findings.length} findings (${dt}ms)`);
  }

  // ── Write artifacts ────────────────────────────────────────────────────────
  await writeFile(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const md = renderMarkdown(report);
  await writeFile(OUT_MD, md, 'utf8');

  const totalFindings = Object.values(report.gates).reduce((a, g) => a + (g.count ?? 0), 0);
  log(`\n   📄 ${relative(ROOT, OUT_JSON)}`);
  log(`   📄 ${relative(ROOT, OUT_MD)}`);
  log(`   total findings: ${totalFindings}`);

  // Emit follow-up skill recommendations based on which gates fired
  const skillSuggestions = recommendSkills(report);
  if (skillSuggestions.length && !QUIET) {
    log('\n   🤖 Recommended Claude Code skills for follow-up:');
    for (const s of skillSuggestions) log(`      • ${s}`);
  }

  if (STRICT && totalFindings > 0) process.exit(1);
}

function recommendSkills(report) {
  const out = [];
  const d6 = report.gates.D6?.count ?? 0;
  const d7 = report.gates.D7?.count ?? 0;
  const d8 = report.gates.D8?.count ?? 0;
  const d9 = report.gates.D9?.count ?? 0;
  const d10 = report.gates.D10?.count ?? 0;

  if (d9 > 0) {
    out.push(`/audit-components — verify ${d9} D9 orphan candidates with 8-gate test (G0 transitive-dep, G0.5 dynamic-import, G1-G8 disposition)`);
    out.push(`/prune-codebase — full archive flow with G6 route reachability + reverse-dependency chain`);
  }
  if (d7 > 0 || d8 > 0) {
    out.push(`/shallow-wiring-analysis — ${d7 + d8} SSR risks: trace component → handler → API → render to find dead chains`);
  }
  if (d10 > 0) {
    out.push(`/wire-modules — ${d10} ACE synthesis sites missing recordLlmOutputHit cache write-through`);
  }
  if (d6 === 0 && d7 === 0 && d8 === 0 && d9 === 0 && d10 === 0) {
    out.push(`/deep-audit — already clean; run for 47-gate health sweep across all tiers (Tier A code, Tier C infra, Tier H analytics)`);
  } else {
    out.push(`/deep-audit — full 47-gate sweep covering G1-G47 (compounds D1-D10 with infra, security, RL pipeline)`);
  }
  if (d9 > 0 || d7 > 0) {
    out.push(`/graphify — refresh codebase-graph.json + glyph_atlas + cluster_summaries; D9 false-positive count drops once new fanIn data lands`);
  }
  return out;
}

function renderMarkdown(report) {
  const lines = [
    '# Deep AST Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Graph files: ${report.graphFiles}`,
    '',
    '## Summary',
    '',
    '| Gate | Description | Count |',
    '| :--- | :--- | ---: |',
  ];
  for (const [id, g] of Object.entries(report.gates)) {
    lines.push(`| ${id} | ${g.name} | ${g.count ?? 0} |`);
  }
  lines.push('');

  for (const [id, g] of Object.entries(report.gates)) {
    if (!g.findings || g.findings.length === 0) continue;
    lines.push('---');
    lines.push('');
    lines.push(`## ${id} — ${g.name}`);
    lines.push('');
    // D9 — prominent disclaimer: not deletion-grade, must route through /audit-components
    if (id === 'D9') {
      lines.push('> **D9 is a candidate queue, not a deletion list.**');
      lines.push('>');
      lines.push('> D9 no longer uses Graphify `fanIn` as a deletion signal. It uses `fanIn=0` only as a candidate source, then verifies candidates by scanning runtime imports, dynamic imports, type-only imports, and barrel re-exports. SvelteKit route entrypoints, hooks, service workers, type shims, generated declarations, stores, and barrels are excluded.');
      lines.push('>');
      lines.push('> Files listed here are likely unused, but still require `/audit-components` disposition before deletion or archive. Do not bulk-prune — let the skill classify the first 20-30, then archive in batches.');
      lines.push('');
    }
    lines.push(`**${g.findings.length}** finding${g.findings.length === 1 ? '' : 's'}` +
      (g.findings.length > MAX_PER_CATEGORY ? ` (showing first ${MAX_PER_CATEGORY})` : ''));
    lines.push('');
    for (const f of g.findings.slice(0, MAX_PER_CATEGORY)) {
      lines.push(`- \`${f.file}:${f.line}\` — ${f.snippet}`);
    }
    lines.push('');
  }

  // Skill follow-up section
  const skills = recommendSkills(report);
  if (skills.length) {
    lines.push('---');
    lines.push('');
    lines.push('## Recommended Claude Code skills');
    lines.push('');
    lines.push('Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:');
    lines.push('');
    for (const s of skills) lines.push(`- ${s}`);
    lines.push('');
    lines.push('**Composition pattern**:');
    lines.push('1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)');
    lines.push('2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)');
    lines.push('3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)');
    lines.push('4. `/wire-modules` (D10 missing-import) — fix orphan call sites');
    lines.push('5. `/deep-audit` — 47-gate sweep including this audit\'s output as Tier A baseline');
    lines.push('');
  }

  return lines.join('\n');
}

main().catch((e) => {
  console.error('[deep-audit] fatal:', e);
  process.exit(2);
});
