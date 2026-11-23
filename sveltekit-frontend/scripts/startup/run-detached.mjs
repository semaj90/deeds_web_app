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
import { closeSync, mkdirSync, openSync, readSync, statSync, writeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const script = process.argv[2] ?? 'startup:ace';
const logDir = resolve(ROOT, 'logs/task-output/pipeline-test');
mkdirSync(logDir, { recursive: true });

const safeName = script.replace(/[:/\\]/g, '-');
// Each launch gets its own files. The canonical <name>.{out,err}.log is appended by every
// launch, including a server started earlier that is still writing to it, so tailing it
// would show another process's output.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const launchOutPath = resolve(logDir, `${safeName}.${stamp}.out.log`);
const launchErrPath = resolve(logDir, `${safeName}.${stamp}.err.log`);
const canonicalOutPath = resolve(logDir, `${safeName}.out.log`);
const out = openSync(launchOutPath, 'a');
const err = openSync(launchErrPath, 'a');
const canonicalFd = openSync(canonicalOutPath, 'a');
writeSync(canonicalFd, `[detached] ${new Date().toISOString()} launch logs: ${launchOutPath}\n`);
closeSync(canonicalFd);

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
console.log(`[detached] logs: ${launchOutPath} | ${launchErrPath}`);

// Show what this launch prints during its first seconds, in this terminal.
// Reads only this launch's own files. DETACHED_TAIL_SECONDS=0 disables it.
const tailParsed = Number(process.env.DETACHED_TAIL_SECONDS ?? 20);
const tailSeconds = Number.isFinite(tailParsed) && tailParsed >= 0 ? tailParsed : 20;
if (tailSeconds > 0) {
  setTimeout(() => {
    const printTail = (label, path) => {
      const size = statSync(path).size;
      if (size === 0) return;
      const length = Math.min(size, 64 * 1024);
      const buffer = Buffer.alloc(length);
      const fd = openSync(path, 'r');
      try {
        readSync(fd, buffer, 0, length, size - length);
      } finally {
        closeSync(fd);
      }
      const shown = buffer.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-40);
      console.log(`[detached] --- last ${shown.length} ${label} line(s) ---`);
      for (const line of shown) console.log(line);
    };
    printTail('stdout', launchOutPath);
    printTail('stderr', launchErrPath);
    // A launch that finds a server already running writes only its own two lines. The running
    // server keeps writing to the canonical log, so show that tail too.
    printTail(`canonical ${safeName}.out.log (all launches; running server output)`, canonicalOutPath);
    console.log(`[detached] (first ${tailSeconds}s of this launch; full logs at the paths above)`);
    process.exit(0);
  }, tailSeconds * 1000);
} else {
  process.exit(0);
}
