#!/usr/bin/env node
/**
 * ASTG-01..04 capability receipt — proves ast-grep version convergence and
 * writes a re-checkable receipt so a future drift (a fresh global npm install,
 * a package.json bump on one side only, etc.) is caught mechanically instead
 * of rediscovered by hand.
 *
 * Verifies:
 *  - @ast-grep/napi (in-process, request-time) version — read from
 *    node_modules/@ast-grep/napi/package.json (the actual resolved install,
 *    not the package.json range).
 *  - @ast-grep/cli (project-local, node_modules/.bin) version — spawned.
 *  - Global `ast-grep`/`sg` binary version — spawned via PATH, shell:true,
 *    matching exactly how scripts/atlas/lib/ast-grep-symbol-extraction.mjs
 *    invokes it (spawnSync('ast-grep', [...], {shell:true})). This is the
 *    binary that actually runs in production, not node_modules/.bin.
 *  - Grammar/query smoke: a real napi parse + findAll proves the in-process
 *    binding isn't just installed but functionally correct.
 *
 * Fails (exit 1) if the three version strings disagree, or if the napi smoke
 * parse doesn't return the expected match. Run from sveltekit-frontend/ so
 * @ast-grep/napi resolves (see CLAUDE.md's NPX Execution Context rule).
 *
 * Usage: cd sveltekit-frontend && node ../scripts/atlas/astg-01-capability-receipt.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

function readInstalledNapiVersion() {
  const pkgPath = path.join(FRONTEND_ROOT, 'node_modules', '@ast-grep', 'napi', 'package.json');
  if (!existsSync(pkgPath)) return null;
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? null;
}

function readInstalledLocalCliVersion() {
  const pkgPath = path.join(FRONTEND_ROOT, 'node_modules', '@ast-grep', 'cli', 'package.json');
  if (!existsSync(pkgPath)) return null;
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? null;
}

function spawnVersion(bin) {
  // shell:true + bare binary name matches scripts/atlas/lib/ast-grep-symbol-extraction.mjs's
  // real invocation exactly — this is what actually resolves via PATH in production, which is
  // NOT necessarily node_modules/.bin.
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', shell: true });
  if (r.status !== 0 || !r.stdout) return { ok: false, raw: r.stderr || r.error?.message || 'no output' };
  const m = r.stdout.trim().match(/(\d+\.\d+\.\d+)/);
  return { ok: true, version: m ? m[1] : null, raw: r.stdout.trim() };
}

function napiSmoke() {
  try {
    // Resolve @ast-grep/napi (a CJS native addon) relative to the frontend's node_modules,
    // via a require() shim scoped to this ESM module — createRequire is the correct ESM
    // interop mechanism, not eval('require') (which is undefined in strict ESM scope).
    const require = createRequire(path.join(FRONTEND_ROOT, 'package.json'));
    const ag = require('@ast-grep/napi');
    const src = 'function foo(a,b) { return a+b; }';
    const root = ag.ts.parse(src).root();
    const matches = root.findAll('function $NAME($$$ARGS) { $$$BODY }');
    const names = matches.map((m) => m.getMatch('NAME')?.text());
    return { ok: matches.length === 1 && names[0] === 'foo', matchCount: matches.length, names };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

const napiVersion = readInstalledNapiVersion();
const localCliVersion = readInstalledLocalCliVersion();
const globalAstGrep = spawnVersion('ast-grep');
const globalSg = spawnVersion('sg');
const smoke = napiSmoke();

const versions = [napiVersion, localCliVersion, globalAstGrep.version, globalSg.version].filter(Boolean);
const distinct = [...new Set(versions)];
const converged = distinct.length === 1 && versions.length === 4;

const receipt = {
  schema: 'atlas.astg-01-capability-receipt.v1',
  generatedAt: new Date().toISOString(),
  canonicalVersion: converged ? distinct[0] : null,
  components: {
    napi: { version: napiVersion, source: 'sveltekit-frontend/node_modules/@ast-grep/napi/package.json' },
    localCli: { version: localCliVersion, source: 'sveltekit-frontend/node_modules/@ast-grep/cli/package.json' },
    globalAstGrepBinary: { version: globalAstGrep.version, ok: globalAstGrep.ok, raw: globalAstGrep.raw, note: 'PATH-resolved, shell:true — matches real production spawnSync call in ast-grep-symbol-extraction.mjs' },
    globalSgBinary: { version: globalSg.version, ok: globalSg.ok, raw: globalSg.raw, note: 'deprecated alias of ast-grep upstream; developer convenience only, not a runtime dependency' }
  },
  napiSmoke: smoke,
  versionsConverged: converged,
  status: converged && smoke.ok ? 'ASTG_01_02_03_PROVEN' : 'ASTG_DRIFT_DETECTED',
  rule: 'ASTG-01/02: project @ast-grep/cli, @ast-grep/napi, and the PATH-resolved global ast-grep binary must all match. ASTG-03: global `sg` is developer-only (deprecated upstream alias of ast-grep), never assumed as a runtime dependency by any script. Re-run this receipt after any npm install (local or -g) that touches ast-grep.'
};

const outPath = path.join(REPO_ROOT, 'docs', 'reports', 'astg-01-capability-receipt.json');
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');

console.log(JSON.stringify(receipt, null, 2));
if (!converged || !smoke.ok) {
  console.error(`\nASTG_DRIFT_DETECTED: versions=${JSON.stringify(versions)} smoke.ok=${smoke.ok}`);
  process.exit(1);
}
