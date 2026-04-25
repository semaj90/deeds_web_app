#!/usr/bin/env node
/**
 * Fix Import Type Script
 * Converts `import type { x }` used as value to `import { x }`
 *
 * Usage:
 *   node scripts/fix-import-type.mjs src            # Dry-run (default)
 *   node scripts/fix-import-type.mjs src --apply    # Actually apply changes
 *   node scripts/fix-import-type.mjs src --verbose  # Show detailed output
 */

import fs from 'fs/promises';
import path from 'path';

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const TARGET_DIR = process.argv[2] || 'src';

// Common patterns where `import type` is incorrectly used for values
const PATTERNS = [
  // Pattern: import type { z } from 'zod' → import { z } from 'zod'
  // When z is used as a value (z.string(), z.object(), etc.)
  {
    name: 'zod',
    importRegex: /import\s+type\s*\{\s*z\s*\}\s*from\s*['"]zod['"]/g,
    usageCheck: /\bz\.(string|number|object|array|boolean|enum|union|literal|infer)/,
    replacement: `import { z } from 'zod'`
  },
  // Pattern: import type { sql } from 'drizzle-orm'
  {
    name: 'drizzle-sql',
    importRegex: /import\s+type\s*\{\s*sql\s*\}\s*from\s*['"]drizzle-orm['"]/g,
    usageCheck: /\bsql\s*`/,
    replacement: `import { sql } from 'drizzle-orm'`
  },
  // Pattern: import type { eq, and, or } from 'drizzle-orm'
  {
    name: 'drizzle-operators',
    importRegex: /import\s+type\s*\{\s*(eq|and|or|desc|asc|like|ilike|inArray|notInArray|isNull|isNotNull|between|gt|gte|lt|lte|ne)([^}]*)\}\s*from\s*['"]drizzle-orm['"]/g,
    usageCheck: /\b(eq|and|or|desc|asc|like|ilike|inArray|notInArray|isNull|isNotNull|between|gt|gte|lt|lte|ne)\s*\(/,
    replacementFn: (match) => match.replace('import type', 'import')
  },
  // Pattern: import type { Client } from 'pg'
  {
    name: 'pg-client',
    importRegex: /import\s+type\s*\{\s*Client\s*\}\s*from\s*['"]pg['"]/g,
    usageCheck: /new\s+Client\s*\(/,
    replacement: `import { Client } from 'pg'`
  },
  // Pattern: import type { clsx } from 'clsx'
  {
    name: 'clsx',
    importRegex: /import\s+type\s*\{\s*clsx\s*\}\s*from\s*['"]clsx['"]/g,
    usageCheck: /\bclsx\s*\(/,
    replacement: `import { clsx } from 'clsx'`
  },
  // Pattern: import type { PromptTemplate, RunnableSequence, StringOutputParser } from '@langchain/core'
  {
    name: 'langchain',
    importRegex: /import\s+type\s*\{\s*(PromptTemplate|RunnableSequence|StringOutputParser)([^}]*)\}\s*from\s*['"]@langchain\/[^'"]+['"]/g,
    usageCheck: /(PromptTemplate|RunnableSequence|StringOutputParser)\.(from|pipe)/,
    replacementFn: (match) => match.replace('import type', 'import')
  },
  // Pattern: import type { MicroserviceError } from '...'
  {
    name: 'custom-errors',
    importRegex: /import\s+type\s*\{\s*MicroserviceError\s*\}\s*from/g,
    usageCheck: /new\s+MicroserviceError\s*\(/,
    replacementFn: (match) => match.replace('import type', 'import')
  },
  // Pattern: import type { getLegalGatewayUrl } from '...'
  {
    name: 'function-imports',
    importRegex: /import\s+type\s*\{\s*(getLegalGatewayUrl|getOllamaEndpoint)([^}]*)\}\s*from/g,
    usageCheck: /(getLegalGatewayUrl|getOllamaEndpoint)\s*\(/,
    replacementFn: (match) => match.replace('import type', 'import')
  }
];

// Stats
let stats = {
  filesScanned: 0,
  filesWithIssues: 0,
  totalFixes: 0,
  fixesByPattern: {},
  dryRun: DRY_RUN
};

async function findTsFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      // Skip node_modules, .svelte-kit, etc.
      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'dist', '.git', 'build'].includes(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte'))) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

async function analyzeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const fixes = [];

  for (const pattern of PATTERNS) {
    // Check if this file has the problematic import
    const importMatches = content.match(pattern.importRegex);
    if (!importMatches) continue;

    // Check if the imported item is used as a value
    if (!pattern.usageCheck.test(content)) continue;

    // This file has the issue
    for (const match of importMatches) {
      const replacement = pattern.replacementFn
        ? pattern.replacementFn(match)
        : pattern.replacement;

      fixes.push({
        pattern: pattern.name,
        original: match,
        replacement,
        line: getLineNumber(content, match)
      });

      stats.fixesByPattern[pattern.name] = (stats.fixesByPattern[pattern.name] || 0) + 1;
    }
  }

  return { content, fixes };
}

function getLineNumber(content, searchStr) {
  const index = content.indexOf(searchStr);
  if (index === -1) return -1;
  return content.substring(0, index).split('\n').length;
}

async function processFile(filePath) {
  stats.filesScanned++;

  try {
    const { content, fixes } = await analyzeFile(filePath);

    if (fixes.length === 0) return;

    stats.filesWithIssues++;
    stats.totalFixes += fixes.length;

    const relativePath = path.relative(process.cwd(), filePath);

    if (VERBOSE || DRY_RUN) {
      console.log(`\n📄 ${relativePath}`);
      for (const fix of fixes) {
        console.log(`   Line ${fix.line}: [${fix.pattern}]`);
        console.log(`   - ${fix.original.substring(0, 60)}...`);
        console.log(`   + ${fix.replacement.substring(0, 60)}...`);
      }
    }

    if (!DRY_RUN) {
      let newContent = content;
      for (const fix of fixes) {
        newContent = newContent.replace(fix.original, fix.replacement);
      }
      await fs.writeFile(filePath, newContent, 'utf-8');
      console.log(`✅ Fixed: ${relativePath} (${fixes.length} fixes)`);
    }

  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔍 Import Type Fixer');
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN (use --apply to fix)' : 'APPLYING FIXES'}`);
  console.log(`   Target: ${TARGET_DIR}`);
  console.log('');

  const targetPath = path.resolve(process.cwd(), TARGET_DIR);
  const files = await findTsFiles(targetPath);

  console.log(`📁 Found ${files.length} TypeScript/Svelte files\n`);

  for (const file of files) {
    await processFile(file);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`   Files scanned:     ${stats.filesScanned}`);
  console.log(`   Files with issues: ${stats.filesWithIssues}`);
  console.log(`   Total fixes:       ${stats.totalFixes}`);
  console.log('');
  console.log('   Fixes by pattern:');
  for (const [pattern, count] of Object.entries(stats.fixesByPattern)) {
    console.log(`     ${pattern}: ${count}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('💡 This was a DRY-RUN. To apply fixes, run:');
    console.log(`   node scripts/fix-import-type.mjs ${TARGET_DIR} --apply`);
  } else {
    console.log('✅ All fixes applied!');
  }

  // Write report for knowledge graph
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'applied',
    stats,
    patterns: PATTERNS.map(p => ({ name: p.name }))
  };

  await fs.writeFile(
    'logs/import-type-fixes-report.json',
    JSON.stringify(report, null, 2)
  );
  console.log('\n📝 Report saved to: logs/import-type-fixes-report.json');
}

main().catch(console.error);
