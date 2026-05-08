#!/usr/bin/env node
/**
 * run-detached.mjs
 *
 * Spawns `npm run <script>` as a detached child so VS Code's task system
 * returns immediately. Logs go to logs/task-output/pipeline-test/<script>.{out,err}.log.
 *
 * Use for any startup task that must not block the editor.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const script = process.argv[2] ?? 'startup:ace';
const logDir = resolve(ROOT, 'logs/task-output/pipeline-test');
mkdirSync(logDir, { recursive: true });

const safeName = script.replace(/[:/\\]/g, '-');
const out = openSync(resolve(logDir, `${safeName}.out.log`), 'a');
const err = openSync(resolve(logDir, `${safeName}.err.log`), 'a');

const child = spawn('npm', ['run', script], {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', out, err],
  shell: process.platform === 'win32',
});

child.unref();

console.log(`[detached] npm run ${script} pid=${child.pid} → logs/task-output/pipeline-test/${safeName}.{out,err}.log`);
