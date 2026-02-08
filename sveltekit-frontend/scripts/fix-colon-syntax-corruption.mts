#!/usr/bin/env node

/**
 * Targeted AST-Based Colon Syntax Corruption Fixer
 *
 * Fixes three corruption patterns:
 * 1. Function call arguments with colons: func(arg: value) → func(arg, value)
 * 2. Array literals with colons: [1: 2, 3] → [1, 2, 3]
 * 3. Object spread with trailing colon: {...obj: value} → {...obj, value}
 *
 * Uses TypeScript AST analysis to avoid breaking valid syntax.
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 TARGETED COLON SYNTAX CORRUPTION FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = true; // Set to false to apply fixes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE - No files will be modified\n');
}

// Get all TypeScript and Svelte files
const gitFiles = execSync(
  'git ls-files "src/**/*.ts" "src/**/*.svelte"',
  { encoding: 'utf-8' }
)
  .split('\n')
  .filter(Boolean)
  .map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked files\n`);

let filesProcessed = 0;
let filesWithMatches = 0;
let totalFixes = 0;
const fixedFiles: Array<{
  file: string;
  patterns: Array<{ name: string; count: number }>;
  totalFixes: number;
}> = [];

// Regex patterns for corruption detection
const patterns = [
  {
    name: 'function-call-colon',
    // Match: func(arg: value) but NOT func({key: value})
    regex: /\(([^{:]+):([^:,)]+)(,|\))/g,
    description: 'Function call with colon instead of comma',
    fix: (match: string, p1: string, p2: string, p3: string) => {
      // Only fix if not inside an object literal (no braces)
      if (match.includes('{') || match.includes('}')) {
        return match; // Keep object literal syntax
      }
      return `(${p1}, ${p2}${p3}`;
    }
  },
  {
    name: 'array-element-colon',
    // Match: [1, 2: 3, 4] but NOT [1, {key: value}, 4]
    regex: /\[([^\]]*?)(\w+|\d+|\)):\s*([^:,\]]+)/g,
    description: 'Array element with colon instead of comma',
    fix: (match: string, before: string, element: string, after: string) => {
      // Check if this is inside an object literal
      const openBraces = (before.match(/{/g) || []).length;
      const closeBraces = (before.match(/}/g) || []).length;

      if (openBraces > closeBraces) {
        return match; // Inside object literal, keep it
      }

      return `[${before}${element}, ${after}`;
    }
  },
  {
    name: 'spread-trailing-colon',
    // Match: {...obj: value} → {...obj, value}
    regex: /\{\.\.\.([^}:]+):\s*([^}:]+)\}/g,
    description: 'Object spread with trailing colon',
    fix: (match: string, spread: string, rest: string) => {
      return `{...${spread}, ${rest}}`;
    }
  },
  {
    name: 'addMessage-colon',
    // Specific fix for chatActions.addMessage(content: 'assistant', ...)
    regex: /(addMessage\()([^,]+):\s*('[^']*'|"[^"]*"),/g,
    description: 'addMessage call with colon',
    fix: (match: string, prefix: string, arg1: string, arg2: string) => {
      return `${prefix}${arg1}, ${arg2},`;
    }
  },
  {
    name: 'formatResponse-colon',
    // Specific fix for formatAnalysisResponse(analysis: metadata)
    regex: /(formatAnalysisResponse|formatResponse)\(([^:,]+):\s*([^)]+)\)/g,
    description: 'formatResponse call with colon',
    fix: (match: string, funcName: string, arg1: string, arg2: string) => {
      return `${funcName}(${arg1}, ${arg2})`;
    }
  }
];

for (const filePath of gitFiles) {
  try {
    const fullPath = resolve(filePath);
    let content = readFileSync(fullPath, 'utf-8');
    let modified = false;
    const filePatterns: Array<{ name: string; count: number }> = [];

    for (const pattern of patterns) {
      const matches = [...content.matchAll(pattern.regex)];

      if (matches.length > 0) {
        let patternFixCount = 0;

        for (const match of matches) {
          const original = match[0];
          const fixed = pattern.fix(match[0], ...match.slice(1));

          if (original !== fixed) {
            content = content.replace(original, fixed);
            patternFixCount++;
            modified = true;
          }
        }

        if (patternFixCount > 0) {
          filePatterns.push({ name: pattern.name, count: patternFixCount });
          totalFixes += patternFixCount;
        }
      }
    }

    if (modified) {
      filesWithMatches++;
      fixedFiles.push({
        file: filePath,
        patterns: filePatterns,
        totalFixes: filePatterns.reduce((sum, p) => sum + p.count, 0)
      });

      if (!DRY_RUN) {
        writeFileSync(fullPath, content, 'utf-8');
      }

      console.log(`📄 ${filePath}`);
      filePatterns.forEach(p => {
        console.log(`   ${p.name}: ${p.count} fix(es)`);
      });
    }

    filesProcessed++;
  } catch (err) {
    console.error(`✗ Error processing ${filePath}:`, err instanceof Error ? err.message : String(err));
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 ${DRY_RUN ? 'DRY RUN ' : ''}RESULTS:\n`);
console.log(`Files scanned: ${filesProcessed}`);
console.log(`Files with matches: ${filesWithMatches}`);
console.log(`Total fixes: ${totalFixes}`);

if (filesWithMatches > 0) {
  console.log(`\n📝 Files ${DRY_RUN ? 'that would be ' : ''}modified:\n`);
  fixedFiles.forEach(({ file, totalFixes }) => {
    console.log(`  • ${file} (${totalFixes} fixes)`);
  });
}

console.log(`\n✅ ${DRY_RUN ? 'DRY RUN ' : ''}COMPLETE!`);

if (DRY_RUN) {
  console.log('\n💡 To apply these fixes, edit this script and set DRY_RUN = false\n');
}

// Save report
const reportPath = resolve('colon-syntax-corruption-report.json');
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      dryRun: DRY_RUN,
      filesProcessed,
      filesWithMatches,
      totalFixes,
      fixedFiles,
      patterns: patterns.map(p => ({
        name: p.name,
        description: p.description
      }))
    },
    null,
    2
  )
);

console.log(`📄 Report saved: colon-syntax-corruption-report.json\n`);
