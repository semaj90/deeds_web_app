#!/usr/bin/env node
/**
 * Phase 81: Delimiter Corruption Fixer
 * Fixes the remaining TS1005 patterns that the aggressive fixer doesn't catch:
 * - Colon-as-comma in object literals: `key: value: key2:` → `key: value, key2:`
 * - Mixed delimiter in params: `(prompt: string), any:` → `(prompt: string, options: any):`
 * - Bare true/false after colons: `, false:` → `, fromCache: false,`
 * - Trailing colons without keys: `value:` at line end
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const stats = { filesProcessed: 0, filesModified: 0, fixes: 0, patterns: {} };

function findFiles(dir, extensions = ['.ts', '.tsx']) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'dist', '.git', 'build'].includes(entry.name)) {
          results.push(...findFiles(fullPath, extensions));
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch (e) { }
  return results;
}

function countPattern(name, count = 1) {
  stats.patterns[name] = (stats.patterns[name] || 0) + count;
}

function fixFile(filePath, dryRun = false) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { fixes: 0, modified: false };
  }

  let modified = content;
  let fixCount = 0;

  // Pattern 1: `: capabilities.X.available:` → `, X: capabilities.X.available,`
  // Matches: `key: value.prop.available:` where the trailing colon should be comma
  const beforeP1 = modified;
  modified = modified.replace(/(\w+):\s*(\w+(?:\.\w+)+\.available):/g, (match, key, value) => {
    countPattern('available-colon-fix');
    return `${key}: ${value},`;
  });
  if (modified !== beforeP1) fixCount += (beforeP1.match(/\w+:\s*\w+(?:\.\w+)+\.available:/g) || []).length;

  // Pattern 2: `method: this.activeInferenceMethod: capabilities` → `method: this.activeInferenceMethod, capabilities`
  // General: `key: this.something:` where colon follows identifier
  const beforeP2 = modified;
  modified = modified.replace(/(\w+):\s*(this\.\w+(?:\.\w+)*)\s*:\s*(\w+)/g, (match, key1, value1, key2) => {
    countPattern('this-colon-chain');
    return `${key1}: ${value1}, ${key2}`;
  });
  if (modified !== beforeP2) fixCount += (beforeP2.match(/\w+:\s*this\.\w+(?:\.\w+)*\s*:\s*\w+/g) || []).length;

  // Pattern 3: Function signature corruption: `(prompt: string), any:` → `(prompt: string, options: any):`
  const beforeP3 = modified;
  modified = modified.replace(/\(([^)]+)\),\s*any:\s*Promise/g, (match, params) => {
    countPattern('param-list-comma-fix');
    return `(${params}, options: any): Promise`;
  });
  if (modified !== beforeP3) fixCount += (beforeP3.match(/\([^)]+\),\s*any:\s*Promise/g) || []).length;

  // Pattern 4: `(prompt: string), number:` → `(prompt: string, chunkSize: number):`
  const beforeP4 = modified;
  modified = modified.replace(/\(([^)]+)\),\s*number:\s*(string\[\]|void|number|boolean|Promise)/g, (match, params, retType) => {
    countPattern('param-number-fix');
    return `(${params}, size: number): ${retType}`;
  });
  if (modified !== beforeP4) fixCount += (beforeP4.match(/\([^)]+\),\s*number:\s*(string\[\]|void|number|boolean|Promise)/g) || []).length;

  // Pattern 5: `modelUsed: this.currentModel, false:` → `modelUsed: this.currentModel, fromCache: false,`
  const beforeP5 = modified;
  modified = modified.replace(/,\s*false:\s*$/gm, ', fromCache: false,');
  modified = modified.replace(/,\s*false:\s*\n/g, ', fromCache: false,\n');
  if (modified !== beforeP5) {
    fixCount += (beforeP5.match(/,\s*false:\s*($|\n)/gm) || []).length;
    countPattern('bare-false-fix', (beforeP5.match(/,\s*false:\s*($|\n)/gm) || []).length);
  }

  // Pattern 6: `gpuAccelerated, true:` → `gpuAccelerated: true,`
  const beforeP6 = modified;
  modified = modified.replace(/(\w+),\s*true:\s*(\w+),\s*true:/g, (match, key1, key2) => {
    countPattern('bare-true-chain');
    return `${key1}: true, ${key2}: true,`;
  });
  if (modified !== beforeP6) fixCount += (beforeP6.match(/\w+,\s*true:\s*\w+,\s*true:/g) || []).length;

  // Pattern 7: `initial: value: maximum: value2:` → `initial: value, maximum: value2,`
  const beforeP7 = modified;
  modified = modified.replace(/(\w+):\s*(\d+|\w+(?:\.\w+)*(?:\s*\*\s*\d+)?)\s*:\s*(\w+):\s*/g, (match, key1, val1, key2) => {
    countPattern('double-colon-chain');
    return `${key1}: ${val1}, ${key2}: `;
  });
  if (modified !== beforeP7) fixCount += (beforeP7.match(/\w+:\s*(\d+|\w+(?:\.\w+)*(?:\s*\*\s*\d+)?)\s*:\s*\w+:\s*/g) || []).length;

  // Pattern 8: `shared, false:` → `shared: false,`
  const beforeP8 = modified;
  modified = modified.replace(/(\w+),\s*false:\s*(?=\/\/|$|\n)/gm, (match, key) => {
    countPattern('key-comma-false');
    return `${key}: false, `;
  });
  if (modified !== beforeP8) fixCount += (beforeP8.match(/\w+,\s*false:\s*(?=\/\/|$|\n)/gm) || []).length;

  // Pattern 9: Object literal with trailing key-only: `key: value, key2: value2: key3:`
  // Actually catches: `value: key:` where key should start new property
  const beforeP9 = modified;
  modified = modified.replace(/:\s*(\w+(?:\.\w+)*)\s*:\s*(\w+):/g, (match, val, key2) => {
    countPattern('value-key-colon');
    return `: ${val}, ${key2}:`;
  });
  if (modified !== beforeP9) fixCount += (beforeP9.match(/:\s*\w+(?:\.\w+)*\s*:\s*\w+:/g) || []).length;

  // Pattern 10: `: processingTime: confidence:` → `: processingTime, confidence:`
  const beforeP10 = modified;
  modified = modified.replace(/:\s*(processingTime)\s*:\s*(confidence)/g, ': $1, $2');
  if (modified !== beforeP10) {
    fixCount += 1;
    countPattern('processingTime-confidence');
  }

  // Pattern 11: Fix function param with bare type: `abort: (msg: number, file: number, line: number): number: number =>`
  const beforeP11 = modified;
  modified = modified.replace(/\(([^)]+)\):\s*number:\s*number\s*=>/g, '($1, col: number): number =>');
  if (modified !== beforeP11) {
    fixCount += 1;
    countPattern('abort-param-fix');
  }

  // Pattern 12: `log: (level: number): number: number =>` → `log: (level: number, message: number): number =>`
  const beforeP12 = modified;
  modified = modified.replace(/\(level:\s*number\):\s*number:\s*number\s*=>/g, '(level: number, message: number): number =>');
  if (modified !== beforeP12) {
    fixCount += 1;
    countPattern('log-param-fix');
  }

  // Pattern 13: Hanging type annotations in object: `size: usage:` → `size, usage:`
  const beforeP13 = modified;
  modified = modified.replace(/(\w+):\s*usage:\s*GPU/g, '$1, usage: GPU');
  if (modified !== beforeP13) {
    fixCount += 1;
    countPattern('size-usage-fix');
  }

  // Pattern 14: Object property missing comma: `key: value key2:` (no comma between)
  // This is tricky - only apply in clear contexts
  const beforeP14 = modified;
  modified = modified.replace(/((?:true|false|null|undefined|\d+|'[^']*'|"[^"]*"))\s+(\w+):/g, '$1, $2:');
  if (modified !== beforeP14) {
    const matches = beforeP14.match(/(true|false|null|undefined|\d+|'[^']*'|"[^"]*")\s+\w+:/g) || [];
    fixCount += matches.length;
    countPattern('missing-comma-before-key', matches.length);
  }

  // Pattern 15: `temperature: options.temperature || this.config.temperature: max_tokens`
  // Should be: `temperature: options.temperature || this.config.temperature, max_tokens`
  const beforeP15 = modified;
  modified = modified.replace(/(\w+\.(?:temperature|maxTokens|model))\s*:\s*(max_tokens|model|temperature)/g, '$1, $2');
  if (modified !== beforeP15) {
    const matches = beforeP15.match(/\w+\.(?:temperature|maxTokens|model)\s*:\s*(?:max_tokens|model|temperature)/g) || [];
    fixCount += matches.length;
    countPattern('config-chain-fix', matches.length);
  }

  if (fixCount > 0 && !dryRun) {
    fs.writeFileSync(filePath, modified, 'utf8');
  }

  return { fixes: fixCount, modified: fixCount > 0 };
}

// Main
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirArg = args.find(a => a.startsWith('--dir='));
const fileArg = args.find(a => a.startsWith('--file='));
const listArg = args.find(a => a.startsWith('--list='));
const outArg = args.find(a => a.startsWith('--out='));

console.log(`\n🔧 Phase 81: Delimiter Corruption Fixer${dryRun ? ' (DRY RUN)' : ''}`);
console.log('='.repeat(60));

let files = [];
if (fileArg) {
  files = [path.resolve(rootDir, fileArg.replace('--file=', ''))];
} else if (dirArg) {
  files = findFiles(path.resolve(rootDir, dirArg.replace('--dir=', '')));
} else if (listArg) {
  const listPath = path.resolve(process.cwd(), listArg.replace('--list=', ''));
  try {
    const content = fs.readFileSync(listPath, 'utf8');
    files = content.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => path.resolve(rootDir, l));
  } catch (e) {
    console.error(`Error reading list file: ${e.message}`);
    process.exit(1);
  }
} else {
  files = findFiles(path.join(rootDir, 'src'));
}

console.log(`\n📁 Found ${files.length} files to process\n`);

const results = [];

for (const file of files) {
  stats.filesProcessed++;
  // Check if file exists
  if (!fs.existsSync(file)) {
      console.log(`  ⚠️ File not found: ${file}`);
      continue;
  }

  const relPath = path.relative(rootDir, file);
  const result = fixFile(file, dryRun);

  if (result.fixes > 0) {
    console.log(`  ✅ ${relPath}: ${result.fixes} fixes`);
    stats.filesModified++;
    stats.fixes += result.fixes;
    results.push({ file: relPath, fixes: result.fixes, modified: true });
  } else {
    results.push({ file: relPath, fixes: 0, modified: false });
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 Summary');
console.log('='.repeat(60));
console.log(`Files processed: ${stats.filesProcessed}`);
console.log(`Files modified: ${stats.filesModified}`);
console.log(`Total fixes: ${stats.fixes}`);
if (Object.keys(stats.patterns).length > 0) {
  console.log('\n📈 Pattern breakdown:');
  for (const [pattern, count] of Object.entries(stats.patterns)) {
    console.log(`   ${pattern}: ${count}`);
  }
}

if (outArg) {
    const outDir = path.resolve(process.cwd(), outArg.replace('--out=', ''));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const summaryPath = path.join(outDir, 'summary.json');
    const jsonlPath = path.join(outDir, 'results.jsonl');

    const summary = {
        dryRun,
        stats,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(jsonlPath, results.map(r => JSON.stringify(r)).join('\n'));
    console.log(`\n📁 Wrote results to ${outDir}`);
}

console.log(`\n✅ Complete!${dryRun ? ' (no changes written)' : ''}`);
