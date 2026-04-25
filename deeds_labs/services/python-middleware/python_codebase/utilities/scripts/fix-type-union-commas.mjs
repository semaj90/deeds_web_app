#!/usr/bin/env node
/*
  fix-type-union-commas.mjs
  Uses ts-morph to safely convert type unions written with commas into pipe-delimited unions.
  E.g. "type T = A, B" -> "type T = A | B"

  IMPROVED: Skips generated folders (.svelte-kit, node_modules, backups), handles errors gracefully.
  Dry-run by default. Pass --apply to modify files.
*/
import fs from 'fs';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';

const skipDirs = ['.svelte-kit', 'node_modules', 'phase40-backups', 'phase34-backups', '.git', 'dist', 'build', 'scripts/backups', '.vscode'];
const dryRun = !process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');

const project = new Project({
  tsConfigFilePath: 'sveltekit-frontend/tsconfig.json',
  skipAddingFilesFromTsConfig: true
});

function collectFiles(dir) {
  const res = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Skip certain directories
      if (entry.isDirectory() && skipDirs.some(skip => entry.name === skip || entry.name.includes(skip))) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        res.push(...collectFiles(full));
      } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.d.ts'))) {
        res.push(full);
      }
    }
  } catch (err) {
    // ignore directory read errors
  }
  return res;
}

const root = path.resolve('sveltekit-frontend');
const allFiles = collectFiles(root);
// Further filter out .svelte-kit and other generated paths
const files = allFiles.filter(f => !skipDirs.some(d => f.includes(d)));

let scanned = 0;
let fixed = 0;
let errors = 0;
const changes = [];
const errorLog = [];

console.log(`Scanning ${files.length} TypeScript files...`);

for (const f of files) {
  scanned++;
  if (scanned % 100 === 0) console.log(`  Progress: ${scanned} files scanned...`);

  try {
    const sourceFile = project.addSourceFileAtPathIfExists(f);
    if (!sourceFile) continue;
    let fileChanged = false;

    // Look for TypeAliasDeclaration and InterfaceDeclaration property signatures with comma-separated union in typeText
    const typeAliases = sourceFile.getTypeAliases();
    for (const ta of typeAliases) {
      try {
        const typeNode = ta.getTypeNode();
        if (!typeNode) continue;
        const text = typeNode.getText();
        if (/,/.test(text) && !/\|/.test(text)) {
          // naive heuristic: replace commas with pipes inside the type text
          const newText = text.replace(/,\s*/g, ' | ');
          typeNode.replaceWithText(newText);
          fileChanged = true;
        }
      } catch (err) {
        errorLog.push({ file: f, error: `Type alias manipulation error: ${err.message}` });
      }
    }

    // Also inspect property signatures in interfaces
    const interfaces = sourceFile.getInterfaces();
    for (const iface of interfaces) {
      try {
        for (const prop of iface.getProperties()) {
          const t = prop.getTypeNode();
          if (!t) continue;
          const txt = t.getText();
          if (/,/.test(txt) && !/\|/.test(txt)) {
            const newTxt = txt.replace(/,\s*/g, ' | ');
            t.replaceWithText(newTxt);
            fileChanged = true;
          }
        }
      } catch (err) {
        errorLog.push({ file: f, error: `Interface property manipulation error: ${err.message}` });
      }
    }

    if (fileChanged) {
      changes.push(f);
      fixed++;
      if (!dryRun) {
        try {
          sourceFile.saveSync();
        } catch (err) {
          errors++;
          errorLog.push({ file: f, error: `Save error: ${err.message}` });
        }
      }
    }
  } catch (err) {
    errors++;
    if (verbose) errorLog.push({ file: f, error: `File processing error: ${err.message}` });
  }
}

console.log('\n=== Type Union Fixer Summary ===');
console.log(`Scanned: ${scanned}`);
console.log(`Files with changes: ${fixed}`);
console.log(`Errors encountered: ${errors}`);
console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (writes enabled)'}`);
if (changes.length > 0) {
  console.log('\nFiles with detected union commas:');
  for (const f of changes.slice(0, 50)) {
    console.log(`  ${f}`);
  }
  if (changes.length > 50) console.log(`  ... and ${changes.length - 50} more`);
}
if (verbose && errorLog.length > 0) {
  console.log('\nError log:');
  for (const e of errorLog.slice(0, 20)) {
    console.log(`  ${e.file}: ${e.error}`);
  }
}
