#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const APP_ROOT = process.cwd();
export const OUT_DIR = path.join(APP_ROOT, 'memory', 'index');
export function ensureOutDir() { fs.mkdirSync(OUT_DIR, { recursive: true }); }
export function slash(file) { return file.split(path.sep).join('/'); }
export function stableHash(value) { return createHash('sha256').update(value).digest('hex').slice(0, 16); }
export function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortObject(v)]));
}
export function writeJsonl(fileName, rows) {
  ensureOutDir();
  const out = path.join(OUT_DIR, fileName);
  fs.writeFileSync(out, rows.map((row) => JSON.stringify(sortObject(row))).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  return out;
}
export function writeJson(fileName, value) {
  ensureOutDir();
  const out = path.join(OUT_DIR, fileName);
  fs.writeFileSync(out, JSON.stringify(sortObject(value), null, 2) + '\n', 'utf8');
  return out;
}
export function listFiles({ extensions, roots = ['src', 'scripts', 'tests', 'docs'] }) {
  const results = [];
  const wanted = new Set(extensions);
  const ignored = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'coverage', 'phase104-backups']);
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (wanted.has(path.extname(entry.name).toLowerCase())) results.push(slash(path.relative(APP_ROOT, full)));
    }
  }
  for (const root of roots) walk(path.join(APP_ROOT, root));
  return results.sort();
}
export function readRel(file) { return fs.readFileSync(path.join(APP_ROOT, file), 'utf8'); }
export function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  return spawnSync(probe, args, { stdio: 'ignore', shell: process.platform !== 'win32' }).status === 0;
}
export function run(command, args) {
  return spawnSync(command, args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}
