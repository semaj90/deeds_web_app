#!/usr/bin/env node

import process from 'node:process';
import { spawn } from 'node:child_process';

function parseHeapSize(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 12288;
}

function buildNodeOptions(existing, heapMb) {
  const parts = String(existing ?? '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('--max-old-space-size='));
  parts.push(`--max-old-space-size=${heapMb}`);
  return parts.join(' ').trim();
}

async function main() {
  const args = process.argv.slice(2);
  const shellModeIndex = args.indexOf('--shell');
  const shellMode = shellModeIndex >= 0;
  const argsAfterShell = shellMode ? args.slice(shellModeIndex + 1) : args;
  const separatorIndex = argsAfterShell.indexOf('--');
  const commandArgs = separatorIndex >= 0 ? argsAfterShell.slice(separatorIndex + 1) : argsAfterShell;
  const command = commandArgs.shift();

  if (!command) {
    console.error('[with-node-memory] Usage: node scripts/with-node-memory.mjs [--shell] -- <command> [...args]');
    process.exit(1);
  }

  const heapMb = parseHeapSize(process.env.MAX_OLD_SPACE_SIZE);
  const env = {
    ...process.env,
    NODE_OPTIONS: buildNodeOptions(process.env.NODE_OPTIONS, heapMb),
  };

  const startChild = (resolvedCommand, resolvedArgs, fallbackUsed = false) =>
    shellMode
      ? spawn('cmd.exe', ['/d', '/s', '/c', [resolvedCommand, ...resolvedArgs].join(' ')], {
          stdio: 'inherit',
          env: {
            ...env,
            NODE_MEMORY_FALLBACK_USED: fallbackUsed ? '1' : env.NODE_MEMORY_FALLBACK_USED ?? '',
          },
          shell: false,
          windowsHide: true,
        })
      : spawn(resolvedCommand, resolvedArgs, {
          stdio: 'inherit',
          env: {
            ...env,
            NODE_MEMORY_FALLBACK_USED: fallbackUsed ? '1' : env.NODE_MEMORY_FALLBACK_USED ?? '',
          },
          shell: false,
          windowsHide: true,
        });

  const child = startChild(command, commandArgs);

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on('error', (err) => {
    if (!shellMode && err && err.code === 'ENOENT' && env.NODE_MEMORY_FALLBACK_USED !== '1') {
      const npmExecPath = process.env.npm_execpath;
      if (!npmExecPath) {
        console.error('[with-node-memory] npm_execpath is not available for fallback execution.');
        process.exit(1);
      }

      const fallback = spawn(process.execPath, [npmExecPath, 'exec', '--', command, ...commandArgs], {
        stdio: 'inherit',
        env: {
          ...env,
          NODE_MEMORY_FALLBACK_USED: '1',
        },
        shell: false,
        windowsHide: true,
      });
      fallback.on('exit', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal);
          return;
        }
        process.exit(code ?? 1);
      });
      fallback.on('error', (fallbackErr) => {
        console.error('[with-node-memory] Failed to start fallback command:', fallbackErr);
        process.exit(1);
      });
      return;
    }
    console.error('[with-node-memory] Failed to start command:', err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[with-node-memory] Unexpected failure:', err);
  process.exit(1);
});
