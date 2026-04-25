#!/usr/bin/env node
/**
 * Phase 99: Restoration & Targeted Fixer
 * 
 * enhanced to:
 * 1. REVERSE the damage caused by the Colon/Comma corruption loop
 * 2. Fix Export aliases (export { A: B } -> export { A as B })
 * 3. Fix definition signatures (constructor(a, Type) -> constructor(a: Type))
 * 
 * Uses strict context checking to avoid re-corrupting function calls.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', 'src');

// CLI Arguments
const ARGS = process.argv.slice(2);
const DRY_RUN = !ARGS.includes('--apply');
const LIMIT = parseInt(ARGS.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 'Infinity');
const VERBOSE = ARGS.includes('--verbose');

console.log('🛡️  Phase 99: Restoration Fixer');
console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (Preview)' : 'LIVE (Applying Fixes)'}`);
console.log(`   Root: ${ROOT_DIR}`);
console.log(`   Limit: ${LIMIT === Infinity ? 'All files' : LIMIT}`);
console.log('');

let stats = {
  scanned: 0,
  fixed: 0,
  patterns: {
    exports: 0,
    constructors: 0,
    definitions: 0
  }
};

/**
 * Main Processing Loop
 */
function main() {
  const files = getAllFiles(ROOT_DIR);
  console.log(`📂 Scanned ${files.length} files. Analyzing for corruption patterns...\n`);

  for (const file of files) {
    if (stats.fixed >= LIMIT) break;
    processFile(file);
    stats.scanned++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Fixed Files: ${stats.fixed}`);
  console.log(`   Patterns Matched:`);
  console.log(`     - Exports ( { A: B } ): ${stats.patterns.exports}`);
  console.log(`     - Constructors ( (a, Type) ): ${stats.patterns.constructors}`);
  console.log(`     - Definitions ( (a, Type) ): ${stats.patterns.definitions}`);
  
  if (DRY_RUN && stats.fixed > 0) {
    console.log(`\n💡 To apply these fixes, run: node scripts/phase99-targeted-fixer.mjs --apply`);
  }
}

/**
 * Recursive file scanner
 */
function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (file === 'node_modules' || file === '.git' || file === '.svelte-kit') continue;
      getAllFiles(filePath, fileList);
    } else {
      if (filePath.endsWith('.ts') || filePath.endsWith('.svelte')) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

/**
 * Error Fixer Logic
 */
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;
  let modified = false;

  // --- Pattern 1: Export Aliases ---
  // Corruption: export { Old: New }
  // Correct: export { Old as New }
  const exportRegex = /export\s*\{\s*([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)\s*\}/g;
  if (exportRegex.test(content)) {
    const matches = content.match(exportRegex).length;
    stats.patterns.exports += matches;
    content = content.replace(exportRegex, 'export { $1 as $2 }');
    modified = true;
    if (VERBOSE || DRY_RUN) console.log(`   [Export] ${path.relative(ROOT_DIR, filePath)}`);
  }

  // --- Pattern 2: Constructor/Method explicit type corruption ---
  // Corruption: constructor(config?, Partial<Config>)
  // Correct: constructor(config?: Partial<Config>)
  // Corruption: function foo(arg, Type)
  // Correct: function foo(arg: Type)

  const argTypeRegex = /(\b[a-z][a-zA-Z0-9_]*?)(\??)\s*,\s*([A-Z][a-zA-Z0-9_<>\[\]]*)/g;

  content = content.replace(argTypeRegex, (match, p1, p2, p3, offset, string) => {
    // Lookbehind Context
    const lookbehind = string.slice(Math.max(0, offset - 100), offset);
    
    // 1. Is it a definition keyword?
    const isDefKeywords = /(function|constructor|class|interface|type)\s*[\w<>\s]*\(.*?$/.test(lookbehind);
    
    // 2. Is it a method definition? ( public foo( | async foo( | foo( )
    // Heuristic: If it's NOT preceded by return, =, or call syntax keys.
    const isNotValue = !/(return\s+|[=:]\s*|\(\s*)$/.test(lookbehind.trim());

    // 3. Does the "Type" look like a known Type?
    // Exclude Math, JSON, Object (could be values)
    const isValueGlobal = ['Math', 'JSON', 'Object', 'Array', 'Date', 'Promise'].includes(p3.split('<')[0]);
    
    // Special Types found in our codebase that were corrupted
    const knownTypes = ['Partial', 'Record', 'SimilarError', 'ErrorReport', 'FixStrategy', 'ValidationRule', 'FixResult'];
    const isKnownType = knownTypes.some(t => p3.startsWith(t));

    // Allow correction if:
    if (isKnownType || (isDefKeywords && !isValueGlobal)) {
      stats.patterns.constructors++; // bucket as constructors
      return `${p1}${p2}: ${p3}`;
    }

    if (p3.startsWith('Partial') || p3.startsWith('Record')) {
         stats.patterns.definitions++;
         return `${p1}${p2}: ${p3}`;
    }

    return match;
  });

  if (content !== original) {
    stats.fixed++;
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content);
      if (VERBOSE) console.log(`   ✅ Fixed ${path.relative(ROOT_DIR, filePath)}`);
    } else {
        console.log(`   📝 [Would Fix] ${path.relative(ROOT_DIR, filePath)}`);
    }
  }
}

main();
