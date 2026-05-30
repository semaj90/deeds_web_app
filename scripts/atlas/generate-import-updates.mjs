#!/usr/bin/env node
/**
 * generate-import-updates.mjs
 *
 * Generates a shell script that updates import paths after files are moved to feature domains.
 * This is a dry-run generator to preview what changes will be made.
 *
 * Usage:
 *   node scripts/atlas/generate-import-updates.mjs > import-updates.sh
 *   bash import-updates.sh  # Apply changes
 */

import { readFileSync } from 'fs';
import { resolve, relative } from 'path';

const REPO_ROOT = resolve('.');
const auditFile = 'docs/phase100/file-consolidation-audit.json';

let audit;
try {
  audit = JSON.parse(readFileSync(auditFile, 'utf-8'));
} catch (e) {
  console.error(`Error reading ${auditFile}:`, e.message);
  console.error('Run: node scripts/atlas/audit-filesystem.mjs');
  process.exit(1);
}

const files = audit.files;

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE MAPPING: OLD PATH → NEW PATH
// ═══════════════════════════════════════════════════════════════════════════════

const pathMap = {};

for (const file of files) {
  if (file.domain === 'unclassified' || !file.relPath.startsWith('lib/')) continue;

  // OLD: src/lib/ai/client-router.ts
  // NEW: src/lib/features/llm/client-router.ts

  const parts = file.relPath.split('/');
  if (parts[0] !== 'lib') continue; // Skip non-lib files

  const baseName = parts.slice(1).join('/');
  const newPath = `lib/features/${file.domain}/${baseName}`;

  pathMap[file.relPath] = newPath;

  // Also register the old "from '$lib/ai/...' style imports
  if (parts[1]) {
    const oldAlias = `$lib/${parts.slice(1).join('/')}`;
    const newAlias = `$lib/features/${file.domain}/${parts.slice(2).join('/')}`;
    pathMap[oldAlias] = newAlias;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE SED COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`#!/bin/bash`);
console.log(`# Auto-generated import update script`);
console.log(`# Generated: ${new Date().toISOString()}`);
console.log(`# Usage: bash import-updates.sh`);
console.log(`# Note: This is a dry-run generator. Review before applying.`);
console.log(`\n`);

console.log(`# Create feature domain directories`);
const domains = ['auth', 'rag', 'graph', 'vector', 'llm', 'ui', 'cache', 'admin'];
for (const domain of domains) {
  console.log(`mkdir -p sveltekit-frontend/src/lib/features/${domain}`);
}
console.log(`\n`);

console.log(`# Move files (git mv to preserve history)`);
console.log(`# NOTE: Manual step — uncomment and review each move before running`);
console.log(`\n`);

let moveCount = 0;
for (const file of files) {
  if (file.domain === 'unclassified' || !file.relPath.startsWith('lib/')) continue;

  const oldPath = `sveltekit-frontend/src/${file.relPath}`;
  const parts = file.relPath.split('/');
  const baseName = parts.slice(1).join('/');
  const newPath = `sveltekit-frontend/src/lib/features/${file.domain}/${baseName}`;

  console.log(`# git mv "${oldPath}" "${newPath}"`);
  moveCount++;
}

console.log(`\n# ${moveCount} files would be moved`);
console.log(`\n`);

console.log(`# Update import statements in all TypeScript/Svelte files`);
console.log(`# This is a complex operation — use find+sed carefully`);
console.log(`\n`);

for (const [oldPath, newPath] of Object.entries(pathMap)) {
  if (oldPath.startsWith('$lib/')) {
    // Svelte alias import
    const escaped = oldPath.replace(/\//g, '\\/').replace(/\$/g, '\\$');
    console.log(`# find . -name "*.ts" -o -name "*.tsx" -o -name "*.svelte" | xargs sed -i 's/${escaped}/${newPath.replace(/\//g, '\\/')}/g'`);
  }
}

console.log(`\n`);
console.log(`# Summary`);
console.log(`# ${Object.keys(pathMap).length} import paths identified for updates`);
console.log(`# ${moveCount} files to move`);
console.log(`\n`);
