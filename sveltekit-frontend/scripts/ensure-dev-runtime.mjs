#!/usr/bin/env node
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const scriptName = process.argv[2] || 'dev';

const requiredPackages = ['cross-env', 'vite'];
const missing = [];

for (const pkg of requiredPackages) {
  try {
    require.resolve(`${pkg}/package.json`);
  } catch {
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
