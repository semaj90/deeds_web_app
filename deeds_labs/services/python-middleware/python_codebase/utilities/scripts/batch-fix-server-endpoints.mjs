#!/usr/bin/env node
/**
 * Batch fix stray commas in all +server.ts API route files
 */

import fs from 'fs';
import path from 'path';
import { readdirSync, statSync } from 'fs';

const SRC_DIR = path.join(process.cwd(), 'sveltekit-frontend', 'src');

console.log('🔧 Scanning for all +server.ts files...\n');

// Recursive file finder
function findServerFiles(dir) {
  const files = [];

  function walk(current) {
    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;

        const fullPath = path.join(current, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (entry === '+server.ts') {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip
    }
  }

  walk(dir);
  return files;
}

// Fix patterns in a file
function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;
  let fixCount = 0;

  // Pattern 1: {, field
  content = content.replace(/(\{),\s+([a-zA-Z_$])/g, (match, brace, field) => {
    fixCount++;
    return brace + ' ' + field;
  });

  // Pattern 2: ;, field
  content = content.replace(/;,\s+([a-zA-Z_$])/g, (match, field) => {
    fixCount++;
    return '; ' + field;
  });

  // Pattern 3: leading comma
  content = content.replace(/\n\s*,\s+([a-zA-Z_$])/g, (match, field) => {
    fixCount++;
    return '\n  ' + field;
  });

  // Pattern 4: export const,
  content = content.replace(/export const,\s+/g, () => {
    fixCount++;
    return 'export const ';
  });

  // Pattern 5: from,
  content = content.replace(/from,\s+'/g, () => {
    fixCount++;
    return "from '";
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return fixCount;
  }

  return 0;
}

// Find all +server.ts files
const serverFiles = findServerFiles(SRC_DIR);
console.log(`Found ${serverFiles.length} +server.ts files\n`);
console.log('═'.repeat(100));

let totalFixed = 0;
const results = [];

for (const file of serverFiles) {
  const shortPath = file.replace(SRC_DIR + path.sep, '');
  const fixes = fixFile(file);

  if (fixes > 0) {
    totalFixed += fixes;
    results.push({ path: shortPath, fixes });
    console.log(`✅ ${shortPath}`);
    console.log(`   └─ ${fixes} stray commas fixed\n`);
  }
}

console.log('═'.repeat(100));
console.log(`\n🎉 Total files processed: ${serverFiles.length}`);
console.log(`✅ Files with fixes: ${results.length}`);
console.log(`🔧 Total stray commas fixed: ${totalFixed}\n`);

if (totalFixed > 0) {
  console.log('💡 Next steps:');
  console.log('   1. Run: npm run check');
  console.log('   2. Review remaining errors');
  console.log('   3. Run again: node scripts/prioritize-error-fixes.mjs\n');
}

// Save summary
const summary = {
  timestamp: new Date().toISOString(),
  phase: 'Phase 2: API Route Handlers',
  totalFiles: serverFiles.length,
  filesFixed: results.length,
  totalFixesApplied: totalFixed,
  details: results
};

const summaryPath = path.join(process.cwd(), '.vscode', 'phase2-fixes.json');
fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

console.log(`📊 Summary saved to: .vscode/phase2-fixes.json`);
