#!/usr/bin/env node
/**
 * Delay execution of a command by N milliseconds to support cross-platform workflows.
 *
 * Usage:
 *   node scripts/delay-spawn.mjs --delay 3000 -- node scripts/start-dev-quic.mjs
 *   node scripts/delay-spawn.mjs --delay=5000 -- ollama run gemma3-legal:latest
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

function parseArgs(argv) {
  const args = [...argv];
  let delayMs = 0;

  const separatorIndex = args.indexOf('--');
  const optionArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const commandArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

  let command = null;
  const remaining = [];

  for (let i = 0; i < optionArgs.length; i++) {
    const token = optionArgs[i];
    if (token === '--delay' && optionArgs[i + 1]) {
      delayMs = Number(optionArgs[++i]) || 0;
    } else if (token.startsWith('--delay=')) {
      delayMs = Number(token.split('=')[1]) || 0;
    } else if (!command) {
      command = token;
    } else {
      remaining.push(token);
    }
  }

  const finalCommandArgs = [...remaining, ...commandArgs];
  if (!command && finalCommandArgs.length > 0) {
    command = finalCommandArgs.shift();
  }

  return { command, commandArgs: finalCommandArgs, delayMs };
}

async function main() {
  const { command, commandArgs, delayMs } = parseArgs(process.argv.slice(2));

  if (!command) {
    console.error(
      'Usage: node scripts/delay-spawn.mjs --delay <ms> -- <command> [args...]'
    );
    process.exit(1);
  }

  if (delayMs > 0) {
    console.log(`Waiting ${delayMs}ms before starting: ${command} ${commandArgs.join(' ')}`);
    await delay(delayMs);
  }

  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error('Failed to start command:', error);
    process.exit(1);
  });
}

await main();
