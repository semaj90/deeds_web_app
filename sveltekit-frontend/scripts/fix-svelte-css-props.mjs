#!/usr/bin/env node

/**
 * Targeted Svelte Component Fixer
 *
 * Fixes common svelte-check errors:
 * 1. CSS missing semicolons: display: flex padding → display: flex; padding
 * 2. Props missing commas/semicolons: { prop1: Type prop2 → { prop1: Type; prop2
 * 3. CSS property syntax: border-top: → border-top;
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 SVELTE CSS & PROPS FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = true; // Set to false to apply fixes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE - No files will be modified\n');
}

// Get all Svelte files
const gitFiles = execSync(
  'git ls-files "src/**/*.svelte"',
  { encoding: 'utf-8' }
)
  .split('\n')
  .filter(Boolean)
  .map(f => f.trim());

console.log(`Found ${gitFiles.length} Svelte files\n`);

let filesProcessed = 0;
let filesWithMatches = 0;
let totalFixes = 0;
const fixedFiles = [];

// Pattern definitions
const patterns = [
  {
    name: 'css-missing-semicolon-before-property',
    // Match: display: flex padding: → display: flex; padding:
    regex: /([\w-]+):\s*([^;{}]+?)\s+([\w-]+):/g,
    description: 'CSS property missing semicolon before next property',
    context: 'style',
    fix: (match, prop1, value1, prop2) => {
      // Don't fix if this looks like a selector (e.g., "a:hover span:")
      if (value1.includes(':') || prop1 === 'hover' || prop1 === 'focus') {
        return match;
      }
      return `${prop1}: ${value1.trim()}; ${prop2}:`;
    }
  },
  {
    name: 'props-missing-semicolon',
    // Match: { prop1: Type prop2: → { prop1: Type; prop2:
    regex: /(\$props<\{[^}]*?)(\w+):\s*(\w+)\s+(\w+):/g,
    description: 'Props type definition missing semicolon',
    context: 'script',
    fix: (match, before, prop1, type1, prop2) => {
      return `${before}${prop1}: ${type1}; ${prop2}:`;
    }
  },
  {
    name: 'css-missing-closing-brace-semicolon',
    // Match: gap: 10px\n } → gap: 10px;\n }
    regex: /([\w-]+):\s*([^;{}]+?)\s*\n\s*}/g,
    description: 'CSS property missing semicolon before closing brace',
    context: 'style',
    fix: (match, prop, value) => {
      return `${prop}: ${value.trim()};\n}`;
    }
  }
];

function isInStyleBlock(content, matchIndex) {
  // Find the nearest <style> tag before this match
  const beforeContent = content.substring(0, matchIndex);
  const lastStyleOpen = beforeContent.lastIndexOf('<style');
  const lastStyleClose = beforeContent.lastIndexOf('</style>');

  return lastStyleOpen > lastStyleClose;
}

function isInScriptBlock(content, matchIndex) {
  // Find the nearest <script> tag before this match
  const beforeContent = content.substring(0, matchIndex);
  const lastScriptOpen = beforeContent.lastIndexOf('<script');
  const lastScriptClose = beforeContent.lastIndexOf('</script>');

  return lastScriptOpen > lastScriptClose;
}

for (const filePath of gitFiles) {
  try {
    const fullPath = resolve(filePath);
    let content = readFileSync(fullPath, 'utf-8');
    const originalContent = content;
    const fileFixes = [];

    for (const pattern of patterns) {
      // Skip if pattern requires specific context
      if (pattern.context === 'style' && !content.includes('<style')) continue;
      if (pattern.context === 'script' && !content.includes('<script')) continue;

      let newContent = content;
      const matches = [...content.matchAll(pattern.regex)];

      for (const match of matches) {
        const matchIndex = match.index;

        // Check context if specified
        if (pattern.context === 'style' && !isInStyleBlock(content, matchIndex)) continue;
        if (pattern.context === 'script' && !isInScriptBlock(content, matchIndex)) continue;

        const original = match[0];
        const fixed = pattern.fix(match[0], ...match.slice(1));

        if (original !== fixed) {
          // Use a unique marker to avoid replacing the same text multiple times
          const marker = `___FIXED_${totalFixes}___`;
          newContent = newContent.replace(original, marker);

          fileFixes.push({
            pattern: pattern.name,
            original: original.substring(0, 50),
            fixed: fixed.substring(0, 50)
          });
          totalFixes++;
        }
      }

      // Replace markers with actual fixed content
      let fixIndex = totalFixes - fileFixes.length;
      fileFixes.forEach(() => {
        const marker = `___FIXED_${fixIndex}___`;
        if (newContent.includes(marker)) {
          // Find the corresponding match and apply the fix
          const matchToFix = [...content.matchAll(pattern.regex)].find((m, i) => {
            const fixed = pattern.fix(m[0], ...m.slice(1));
            return m[0] !== fixed;
          });
          if (matchToFix) {
            const fixed = pattern.fix(matchToFix[0], ...matchToFix.slice(1));
            newContent = newContent.replace(marker, fixed);
          }
        }
        fixIndex++;
      });

      content = newContent;
    }

    if (content !== originalContent) {
      filesWithMatches++;
      fixedFiles.push({ file: filePath, fixes: fileFixes });

      if (!DRY_RUN) {
        writeFileSync(fullPath, content, 'utf-8');
      }

      console.log(`📄 ${filePath}`);
      fileFixes.slice(0, 5).forEach(fix => {
        console.log(`   ${fix.pattern}: ${fix.original}... → ${fix.fixed}...`);
      });
      if (fileFixes.length > 5) {
        console.log(`   ... and ${fileFixes.length - 5} more fixes`);
      }
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
  fixedFiles.slice(0, 20).forEach(({ file, fixes }) => {
    console.log(`  • ${file} (${fixes.length} fixes)`);
  });
  if (fixedFiles.length > 20) {
    console.log(`  ... and ${fixedFiles.length - 20} more files`);
  }
}

console.log(`\n${DRY_RUN ? '⚠️  DRY RUN - No files modified. Set DRY_RUN = false to apply.' : '✅ Fixes applied!'}\n`);

// Save report
const reportPath = resolve('svelte-css-props-fix-report.json');
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      dryRun: DRY_RUN,
      filesProcessed,
      filesWithMatches,
      totalFixes,
      fixedFiles: fixedFiles.slice(0, 100) // Limit report size
    },
    null,
    2
  )
);

console.log(`📄 Report saved: svelte-css-props-fix-report.json\n`);
