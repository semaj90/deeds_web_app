#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// If a .env.memory file exists, parse it and inject into process.env
try {
  const envPath = path.resolve(process.cwd(), '.env.memory');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) {
        const [, k, v] = m;
        // strip surrounding quotes
        const val = v.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        if (!process.env[k]) process.env[k] = val;
      }
    });
  }
} catch (err) {
  // ignore parse errors
}

const [, , targetScript = 'dev'] = process.argv;
const root = path.resolve(process.cwd());

const MAX_OLD_SPACE_SIZE = process.env.MAX_OLD_SPACE_SIZE || process.env.MAX_OLD_MEM || '12288';
const env = { ...process.env, NODE_OPTIONS: `--max-old-space-size=${MAX_OLD_SPACE_SIZE}` };

console.log(`Launching npm script "${targetScript}" with NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE}`);

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', targetScript], {
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('Failed to start child process:', err);
  process.exit(1);
});
