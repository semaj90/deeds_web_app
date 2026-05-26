#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const timeoutMs = Math.max(60_000, Number(process.env.CHECK_TIMEOUT_MS ?? '240000'));

function runCommand(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
      ...opts,
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        // Windows requires killing the full process tree to terminate npx + spawned tooling.
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          shell: false,
        });
      } else {
        child.kill('SIGTERM');
      }
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, timedOut });
    });
  });
}

async function main() {
  const svelteCheckArgs = ['svelte-check', '--tsconfig', './tsconfig.json'];
  const result = await runCommand('npx', svelteCheckArgs);

  if (result.timedOut) {
    // Give detached descendants a brief moment to unwind before fallback check.
    await delay(250);
  }

  if (!result.timedOut) {
    process.exit(result.code);
    return;
  }

  console.warn(
    `[check-with-timeout] svelte-check timed out after ${timeoutMs}ms; falling back to tsgo --noEmit.`
  );

  const fallback = await runCommand('npx', ['tsgo', '--noEmit']);
  process.exit(fallback.code);
}

main().catch((error) => {
  console.error('[check-with-timeout] Fatal error:', error?.message ?? String(error));
  process.exit(1);
});
