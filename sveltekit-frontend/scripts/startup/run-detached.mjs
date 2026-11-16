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
import { mkdirSync, openSync, writeSync } from 'node:fs';
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

const isWindows = process.platform === 'win32';
// Windows: run npm's CLI through node directly. A detached `cmd.exe /c npm.cmd`
// child exits silently with no console (verified 2026-11-16: even a trivial
// detached cmd child produced no output), so dev:gpu never started.
const npmCli = resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCommand = isWindows ? process.execPath : 'npm';
const launchArgs = isWindows ? [npmCli, 'run', script] : ['run', script];
const child = spawn(npmCommand, launchArgs, {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', out, err],
  windowsHide: true,
});

const startupMessage = `[detached] ${new Date().toISOString()} npm run ${script} pid=${child.pid} cwd=${ROOT} cmd=${npmCommand} ${launchArgs.join(' ')}\n`;
writeSync(out, startupMessage);

child.on('spawn', () => {
  const spawnMessage = `Detached helper spawned child pid=${child.pid}\n`;
  writeSync(out, spawnMessage);
});

child.on('error', (error) => {
  const errMessage = `Detached startup failed: ${error.message}\n`;
  writeSync(err, errMessage);
});

child.on('exit', (code, signal) => {
  const exitMessage = `Detached child exited code=${code} signal=${signal}\n`;
  if (code === 0) {
    writeSync(out, exitMessage);
  } else {
    writeSync(err, exitMessage);
  }
});

child.unref();

console.log(startupMessage.trim());
