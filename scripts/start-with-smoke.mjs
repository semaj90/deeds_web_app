#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    p.on('close', (code) => (code === 0 ? resolve(code) : reject(new Error(`Exit ${code}`))));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: start-with-smoke <npm-script> [-- <args>]');
    process.exit(2);
  }

  // find separator '--' for passthrough args
  const sepIndex = args.indexOf('--');
  const script = sepIndex === -1 ? args[0] : args.slice(0, sepIndex).join(' ');
  const passArgs = sepIndex === -1 ? [] : args.slice(sepIndex + 1);

  try {
    console.log('Running opencode smoke validator...');
    await run('node', ['scripts/opencode/smoke-validate.js']);
    console.log('Smoke OK — running target script:', script);
    // run via npm so lifecycle scripts resolve correctly
    const npmArgs = ['run', script, '--', ...passArgs];
    await run('npm', npmArgs, { cwd: process.cwd() });
  } catch (err) {
    console.error('Aborting: smoke check failed or target failed.', err.message);
    process.exit(1);
  }
}

main();
