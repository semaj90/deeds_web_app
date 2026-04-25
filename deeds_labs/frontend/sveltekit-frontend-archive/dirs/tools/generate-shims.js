#!/usr/bin/env node
// generate-shims.js
// Preview tool: scans for .svelte.ts companion files and prepares move + shim operations.
// Dry-run by default. Use --apply to actually rename/move files.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frontendSrc = path.join(root, 'src');
const helpersDir = path.join(frontendSrc, 'lib', 'helpers', 'headless');

function findCompanionFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...findCompanionFiles(full));
    } else if (e.isFile() && e.name.endsWith('.svelte.ts')) {
      results.push(full);
    }
  }
  return results;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log('Scanning for .svelte.ts companion files (root:', frontendSrc, ')');
  const files = findCompanionFiles(frontendSrc);
  console.log(`Found ${files.length} companion files (preview)
`);
  if (files.length === 0) return;

  ensureDir(helpersDir);

  for (const f of files) {
    const rel = path.relative(frontendSrc, f);
    const base = path.basename(f);
    const newPath = path.join(helpersDir, base);
    const shimPath = f; // original path will become shim

    console.log(`
- Companion: ${rel}`);
    console.log(`  -> Move to: src/lib/helpers/headless/${base}`);
    console.log(`  -> Shim at: ${path.relative(frontendSrc, shimPath)}`);

    if (!apply) continue;

    // Move file to helpersDir (overwrite if exists)
    try {
      fs.copyFileSync(f, newPath);
      fs.unlinkSync(f);
      // Write shim
      const shimContent = `export * from '$lib/helpers/headless/${base.replace(/\\\\/g, '/')}';\n`;
      fs.writeFileSync(shimPath, shimContent, { encoding: 'utf8' });
      console.log('  Applied move and shim');
    } catch (err) {
      console.error('  Failed to apply for', f, err.message);
    }
  }
  if (!apply)
    console.log('\nDry-run complete. Re-run with --apply to perform moves and create shims.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
