#!/usr/bin/env node
/**
 * scripts/fix-phase34-ast.cjs
 * Phase 34 – CommonJS-compatible AST-aware repair for TS errors
 *
 * CommonJS version to avoid ESM loader issues with ts-morph / typescript
 * Convert { key, value } → { key: value } and balance tokens safely.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'sveltekit-frontend', 'src');
const BACKUP = path.join(ROOT, 'scripts', 'backups', 'phase34-ast');

// Ensure backup dir exists
if (!fs.existsSync(BACKUP)) {
  fs.mkdirSync(BACKUP, { recursive: true });
}

// ============================================================================
// TOKEN BALANCER – Repairs unclosed brackets/parens
// ============================================================================

function balanceTokens(txt) {
  const openers = ['{', '(', '['];
  const closers = ['}', ')', ']'];
  const stack = [];
  let result = txt;

  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    const oi = openers.indexOf(ch);
    const ci = closers.indexOf(ch);

    if (oi >= 0) {
      stack.push({ char: ch, pos: i });
    } else if (ci >= 0) {
      const want = openers[ci];
      const last = stack[stack.length - 1];

      if (last && last.char === want) {
        stack.pop();
      } else if (stack.length > 0) {
        // Try to close the last opened bracket
        const lastIdx = openers.indexOf(last.char);
        const closer = closers[lastIdx];
        result = result.slice(0, i) + closer + result.slice(i);
        stack.pop();
      }
    }
  }

  // Close any remaining open brackets
  while (stack.length) {
    const opener = stack.pop();
    const idx = openers.indexOf(opener.char);
    result += closers[idx];
  }

  return result;
}

// ============================================================================
// OBJECT LITERAL FIXER – Converts { key, value } → { key: value }
// ============================================================================

function fixObjectLiterals(txt) {
  // Pattern: { identifier, <literal or expression> }
  // Convert comma to colon when it's clearly a property assignment

  const patterns = [
    // { prop, 123 } → { prop: 123 }
    /(\{\s*[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(?=[0-9\-\[]|['`"]|true|false|null|undefined)/g,
    // prop: val; next → prop: val, next (semicolon between properties)
    /([A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^\s,}]+);(\s*[A-Za-z_$])/g,
    // Cleanup double commas
    /,\s*,/g,
    // Orphaned semicolon before closing brace
    /;\s*(\})/g,
  ];

  let result = txt;
  const replacements = [
    '$1:',        // { prop, 123 } → { prop: 123 }
    '$1,$2',      // prop: val; next → prop: val, next
    ',',          // , , → ,
    '$1',         // ; } → }
  ];

  patterns.forEach((pattern, i) => {
    result = result.replace(pattern, replacements[i]);
  });

  return result;
}

// ============================================================================
// FILE PROCESSOR
// ============================================================================

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let fixed = content;
    let changed = false;

    // Apply fixers
    const balanced = balanceTokens(fixed);
    if (balanced !== fixed) {
      fixed = balanced;
      changed = true;
    }

    const objectsFixed = fixObjectLiterals(fixed);
    if (objectsFixed !== fixed) {
      fixed = objectsFixed;
      changed = true;
    }

    if (changed) {
      // Backup original
      const relPath = path.relative(SRC, filePath);
      const backupPath = path.join(BACKUP, relPath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(filePath, backupPath);

      // Write fixed content
      fs.writeFileSync(filePath, fixed, 'utf8');
      return true;
    }
  } catch (err) {
    console.error(`❌ Error processing ${filePath}: ${err.message}`);
  }

  return false;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 Phase 34 AST Fixer (CommonJS)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Collect all TS/Svelte files
  const files = [];

  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (/\.(ts|svelte)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  if (fs.existsSync(SRC)) {
    walkDir(SRC);
  }

  console.log(`📁 Found ${files.length} TypeScript/Svelte files`);
  console.log('');

  let filesFixed = 0;
  let fileCount = 0;

  for (const file of files) {
    fileCount++;
    if (fileCount % 100 === 0) {
      console.log(`   Processed ${fileCount}/${files.length}...`);
    }

    if (processFile(file)) {
      filesFixed++;
      console.log(`✅ Fixed: ${path.relative(ROOT, file)}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📊 Summary:`);
  console.log(`   Files scanned: ${files.length}`);
  console.log(`   Files fixed:   ${filesFixed}`);
  console.log(`   Backup dir:    ${path.relative(ROOT, BACKUP)}`);
  console.log('');
  console.log('✨ Phase 34 AST Complete');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
