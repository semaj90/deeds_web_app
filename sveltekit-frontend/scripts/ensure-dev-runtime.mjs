#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptName = process.argv[2] || 'dev';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const requiredPackages = ['cross-env', 'vite'];
const missing = [];

for (const pkg of requiredPackages) {
  const packageJsonPath = path.join(projectRoot, 'node_modules', ...pkg.split('/'), 'package.json');
  if (!existsSync(packageJsonPath)) {
    missing.push(pkg);
  }
}

if (missing.length === 0) {
  process.exit(0);
}

console.error('');
console.error(`Cannot run npm run ${scriptName}: missing required development packages.`);
console.error(`Missing: ${missing.join(', ')}`);
console.error('');
console.error('This repo needs a full development install inside sveltekit-frontend.');
console.error('Do not use npm ci --omit=dev, npm ci --only=production, or NODE_ENV=production for local dev.');
console.error('');
console.error('Run:');
console.error('  cd sveltekit-frontend');
console.error('  npm ci');
console.error('');
console.error('For production images, build and run the adapter-node output instead of npm run dev.');
process.exit(1);
