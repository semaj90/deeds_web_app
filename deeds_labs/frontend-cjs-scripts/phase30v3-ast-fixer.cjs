#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * PHASE 30v3: AST-BASED TS1005 FIXER (Conservative Edition)
 *
 * Uses ts-morph for bullet-proof TypeScript AST traversal
 * Zero false positives - semantically aware of all contexts
 *
 * Features:
 * - AST-based property signature semicolons (ONLY)
 * - Import statements naturally protected (AST won't match them)
 * - Safe and minimal changes only
 */

const fs = require('fs');
const path = require('path');

// Check for ts-morph
let Project, SyntaxKind;
try {
  const tsMorph = require('ts-morph');
  Project = tsMorph.Project;
  SyntaxKind = tsMorph.SyntaxKind;
} catch (err) {
  console.error('❌ ts-morph not installed. Run: npm install ts-morph --save-dev');
  process.exit(1);
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const log = (...m) => console.log(...m);

const project = new Project({
  tsConfigFilePath: path.join(ROOT, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: false,
  manipulationSettings: { indentationText: '  ' },
});

let filesProcessed = 0;
let filesChanged = 0;
let semicolonsAdded = 0;

function fixInterfaceSemicolons(sf) {
  let changed = false;
  sf.getInterfaces().forEach((iface) => {
    const members = iface.getMembers();
    members.forEach((m) => {
      // Only property signatures (not methods, index sigs, etc.)
      if (m.getKind() !== SyntaxKind.PropertySignature) return;

      // If text already ends with ;, skip
      const txt = m.getText();
      if (/\;\s*$/.test(txt)) return;

      // Safest: append semicolon to the member range
      m.replaceWithText(txt.replace(/\s*$/, ';'));
      semicolonsAdded++;
      changed = true;
    });
  });
  return changed;
}

function run() {
  const sfs = project.getSourceFiles().filter((sf) => {
    const fp = sf.getFilePath();
    // Skip generated/cache folders
    return (
      fp.includes(path.sep + 'src' + path.sep) &&
      !fp.includes(path.sep + '.svelte-kit' + path.sep) &&
      !fp.includes(path.sep + 'node_modules' + path.sep)
    );
  });

  log(`🔧 AST pass over ${sfs.length} files…${isDryRun ? ' (dry run)' : ''}`);

  for (const sf of sfs) {
    filesProcessed++;
    const before = sf.getFullText();
    const changed = fixInterfaceSemicolons(sf);

    if (changed) {
      const after = sf.getFullText();
      if (!isDryRun && before !== after) {
        sf.saveSync();
      }
      filesChanged++;
      if (filesChanged <= 15) {
        log(`✅ ${sf.getBaseName()} — interface semicolons added`);
      }
    }
  }

  log('\n=== Phase 30v3 (AST) Summary ===');
  log(`Files processed: ${filesProcessed}`);
  log(`Files changed:   ${filesChanged}`);
  log(`Semicolons added: ${semicolonsAdded}`);
  if (isDryRun) log('\n💡 Dry run only — no files were written.');
}

try {
  run();
  process.exit(0);
} catch (e) {
  console.error('❌ AST fixer failed:', e?.message || e);
  process.exit(1);
}
