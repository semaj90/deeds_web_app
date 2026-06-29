#!/usr/bin/env node
/**
 * Spawn `npm run <script>` detached from the repo root.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const script = process.argv[2];

if (!script) {
  console.error('Usage: node scripts/startup/run-detached.mjs <npm-script>');
  process.exit(1);
}

const logDir = resolve(ROOT, 'logs/task-output/pipeline-test');
mkdirSync(logDir, { recursive: true });

const safeName = script.replace(/[:/\\]/g, '-');
const out = openSync(resolve(logDir, `${safeName}.out.log`), 'a');
const err = openSync(resolve(logDir, `${safeName}.err.log`), 'a');

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'cmd.exe' : 'npm';
const launchArgs = isWindows ? ['/d', '/s', '/c', 'npm.cmd', 'run', script] : ['run', script];

const child = spawn(npmCommand, launchArgs, {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', out, err],
  windowsHide: true,
});

const message = `[detached] ${new Date().toISOString()} npm run ${script} pid=${child.pid} cwd=${ROOT}\n`;
writeSync(out, message);

child.on('error', (error) => {
  writeSync(err, `Detached startup failed: ${error.message}\n`);
});

child.unref();
console.log(message.trim());
