#!/usr/bin/env node
/**
 * scripts/atlas/verify-generated-skill.mjs
 *
 * Smoke validation safeguard for generated files/scripts.
 *
 * Usage:
 *   node scripts/atlas/verify-generated-skill.mjs --file scripts/atlas/foo.mjs --dry-run-command "node scripts/atlas/foo.mjs --dry-run"
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const REPORT = path.join(REPORT_DIR, 'generated-skill-smoke-report.json');

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((x) => x.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function run(command, opts = {}) {
  const res = spawnSync(command, { shell: true, cwd: ROOT, encoding: 'utf8', timeout: opts.timeout ?? 120000 });
  return {
    command,
    status: res.status,
    ok: res.status === 0,
    stdout: (res.stdout || '').slice(-4000),
    stderr: (res.stderr || '').slice(-4000)
  };
}

function syntaxCommand(file) {
  const ext = path.extname(file).toLowerCase();
  if (['.mjs', '.cjs', '.js'].includes(ext)) return `node --check ${JSON.stringify(file)}`;
  if (['.json'].includes(ext)) return `node -e "JSON.parse(require('fs').readFileSync(${JSON.stringify(file)}, 'utf8')); console.log('json ok')"`;
  if (['.ts', '.tsx'].includes(ext)) return 'cd sveltekit-frontend && npx tsgo --noEmit';
  if (['.svelte'].includes(ext)) return 'cd sveltekit-frontend && npm run check';
  if (['.cc', '.cpp', '.h', '.hpp'].includes(ext)) return 'echo cpp syntax requires cmake build gate';
  return 'echo no syntax gate for this extension';
}

function scanPlaceholders(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const needles = [
    'Placeholder',
    'Assume this handles',
    'runAtlasBuildProcess',
    'dbClient',
    'TODO: Actual',
    'fake',
    'stub'
  ];
  return needles.filter((n) => text.includes(n));
}

function hasEnvHelper(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (!text.includes('process.env')) return true;
  return text.includes('getEnv(') || text.includes('requireEnv(') || text.includes('env(');
}

function main() {
  const file = arg('file');
  const dryRunCommand = arg('dry-run-command');
  if (!file) {
    console.error('Missing --file');
    process.exit(2);
  }

  const abs = path.join(ROOT, file);
  const fileExists = fs.existsSync(abs);
  const checks = [];
  let ok = true;

  checks.push({ gate: 'exists', ok: fileExists, file });
  if (!fileExists) ok = false;

  if (fileExists) {
    const syntax = run(syntaxCommand(file));
    checks.push({ gate: 'syntax', ...syntax });
    if (!syntax.ok) ok = false;

    const placeholders = scanPlaceholders(file);
    const placeholderOk = placeholders.length === 0;
    checks.push({ gate: 'placeholder_free', ok: placeholderOk, placeholders });
    if (!placeholderOk) ok = false;

    const envOk = hasEnvHelper(file);
    checks.push({ gate: 'env_helper', ok: envOk });
    if (!envOk) ok = false;
  }

  if (fileExists && dryRunCommand) {
    const dry = run(dryRunCommand, { timeout: 180000 });
    checks.push({ gate: 'dry_run', ...dry });
    if (!dry.ok) ok = false;
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    ok,
    generated_at: new Date().toISOString(),
    file,
    dry_run_command: dryRunCommand || null,
    checks,
    apply_allowed: ok,
    next_command: ok ? 'Proceed to --apply only if human-approved.' : 'Fix failed gates before --apply.',
    do_not_do: ok ? [] : ['Do not run --apply', 'Do not claim success', 'Do not ignore syntax/env/placeholder failures']
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

main();
