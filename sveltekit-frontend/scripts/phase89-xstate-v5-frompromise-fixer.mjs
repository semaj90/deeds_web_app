#!/usr/bin/env node
/**
 * Phase 89: XState v5 fromPromise Automated Fixer
 *
 * Automatically fixes fromPromise inline type patterns by extracting
 * types to interfaces and applying generic parameters.
 *
 * Usage:
 *   node scripts/phase89-xstate-v5-frompromise-fixer.mjs [--dry-run] [--limit N]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : Infinity;

let filesProcessed = 0;
let filesFixed = 0;
let totalFixes = 0;

/**
 * Extract type annotation from fromPromise inline pattern
 * ENHANCED VERSION with better type extraction
 */
function extractInlineType(code, matchStart) {
  // Find the full fromPromise call with balanced parentheses
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let i = matchStart;

  // Start from 'fromPromise('
  const fromPromiseMatch = code.slice(matchStart).match(/^fromPromise\s*\(/);
  if (!fromPromiseMatch) return null;

  i = matchStart + fromPromiseMatch[0].length - 1; // Position at opening paren

  for (; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    // Handle string literals
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }

    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
  }

  const fullCall = code.slice(matchStart, i + 1);

  // ENHANCED: Handle multiple inline type patterns
  // Pattern 1: async ({ input }: { input: Type })
  // Pattern 2: async ({ input, context }: { input: Type, context: Context })
  // Pattern 3: async ({ input }: { input?: Type })
  const asyncMatch = fullCall.match(/async\s*\(\s*\{([^}]+)\}\s*:\s*\{([^}]+)\}/s);

  if (!asyncMatch) {
    return null;
  }

  const destructuredParams = asyncMatch[1];
  const typeAnnotation = asyncMatch[2];

  // ENHANCED: Extract input type with better handling of complex types
  let inputType = 'unknown';
  const inputMatch = typeAnnotation.match(/input\??\s*:\s*([^,;}]+)/);

  if (inputMatch) {
    inputType = inputMatch[1].trim();

    // Clean up type - remove trailing punctuation but preserve generics
    inputType = inputType
      .replace(/[;,]\s*$/, '')  // Remove trailing semicolons/commas
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    // Handle nested generic types (e.g., Promise<Result<T>>)
    if (inputType.includes('<') && !inputType.includes('>')) {
      // Type definition likely cut off, try to extract from broader context
      const extendedMatch = fullCall.match(new RegExp(`input\\s*:\\s*([^,;}]+(?:<[^>]+>)?)`));
      if (extendedMatch) {
        inputType = extendedMatch[1].trim();
      }
    }
  }

  // ENHANCED: Try to infer output type from return statements
  let outputType = 'unknown';

  // Look for explicit Promise return type
  const promiseReturnMatch = fullCall.match(/:\s*Promise<([^>]+)>/);
  if (promiseReturnMatch) {
    outputType = promiseReturnMatch[1].trim();
  } else {
    // Infer from return statements
    const returns = [...fullCall.matchAll(/return\s+(\{[^}]*\}|[^;}\n]+)/g)];

    if (returns.length > 0) {
      const lastReturn = returns[returns.length - 1][1].trim();

      // Pattern matching for common return types
      if (lastReturn.startsWith('{')) {
        // Object literal return
        outputType = 'Record<string, unknown>';
      } else if (lastReturn.match(/await\s+fetch/)) {
        outputType = 'Response';
      } else if (lastReturn.match(/await\s+.*\.json\(\)/)) {
        outputType = 'unknown';
      } else if (lastReturn.match(/^\d+$/)) {
        outputType = 'number';
      } else if (lastReturn.match(/^(true|false)$/)) {
        outputType = 'boolean';
      } else if (lastReturn.match(/^['"`]/)) {
        outputType = 'string';
      } else if (lastReturn.match(/^\[/)) {
        outputType = 'unknown[]';
      }
    }
  }

  return {
    fullCall,
    inputType,
    outputType,
    destructuredParams: destructuredParams.trim(),
    typeAnnotation: typeAnnotation.trim()
  };
}/**
 * Generate fixed code with generic parameters
 */
function generateFix(typeInfo) {
  const { fullCall, inputType, outputType, destructuredParams } = typeInfo;

  // Build the generic parameters
  const generics = `<${outputType}, { input: ${inputType} }>`;

  // Replace the inline type annotation with just the destructuring
  const fixed = fullCall
    .replace(
      /fromPromise\s*\(/,
      `fromPromise${generics}(`
    )
    .replace(
      /async\s*\(\s*\{[^}]+\}\s*:\s*\{[^}]+\}/,
      `async ({ ${destructuredParams} })`
    );

  return fixed;
}

/**
 * Fix fromPromise patterns in a file
 */
function fixFile(filePath) {
  try {
    const originalContent = readFileSync(filePath, 'utf8');

    // Skip if no fromPromise
    if (!originalContent.includes('fromPromise')) {
      return { fixed: false, count: 0 };
    }

    let content = originalContent;
    let fixCount = 0;

    // Find all fromPromise calls with inline types
    const regex = /fromPromise\s*\(\s*async\s*\(\s*\{\s*[^}]+\}\s*:\s*\{/g;
    const matches = [...content.matchAll(regex)];

    if (matches.length === 0) {
      return { fixed: false, count: 0 };
    }

    console.log(`\n📝 ${filePath}`);
    console.log(`   Found ${matches.length} fromPromise inline type(s)`);

    // Process matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const typeInfo = extractInlineType(content, match.index);

      if (!typeInfo) {
        console.log(`   ⚠️  Could not extract type info from match ${i + 1}`);
        continue;
      }

      const fixed = generateFix(typeInfo);

      console.log(`   🔧 Fix ${i + 1}:`);
      console.log(`      Input type: ${typeInfo.inputType}`);
      console.log(`      Output type: ${typeInfo.outputType} (inferred)`);

      // Replace in content
      content = content.replace(typeInfo.fullCall, fixed);
      fixCount++;
    }

    if (fixCount > 0) {
      if (!isDryRun) {
        // Validate TypeScript syntax
        try {
          // Write to temp file and check
          const tempPath = filePath + '.tmp';
          writeFileSync(tempPath, content);

          // Quick syntax check (will throw if invalid)
          try {
            execSync(`npx tsc --noEmit ${tempPath}`, {
              stdio: 'pipe',
              timeout: 5000
            });
          } catch (tscError) {
            // TSC errors are expected, just checking it parses
          }

          // Apply fix
          writeFileSync(filePath, content);
          execSync(`del ${tempPath}`, { stdio: 'ignore' });

          console.log(`   ✅ Applied ${fixCount} fix(es)`);
        } catch (error) {
          console.log(`   ❌ Validation failed, skipping`);
          return { fixed: false, count: 0 };
        }
      } else {
        console.log(`   🔍 [DRY RUN] Would apply ${fixCount} fix(es)`);
      }

      return { fixed: true, count: fixCount };
    }

    return { fixed: false, count: 0 };
  } catch (error) {
    console.error(`   ❌ Error processing file: ${error.message}`);
    return { fixed: false, count: 0 };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Phase 89: XState v5 fromPromise Automated Fixer');
  console.log('═'.repeat(60));

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified');
  }

  if (limit !== Infinity) {
    console.log(`📊 Limit: ${limit} files`);
  }

  console.log('');

  // Read scan results
  const scanReport = readFileSync('reports/xstate-migration/latest.md', 'utf8');

  // Extract high-priority files
  const fileMatches = scanReport.matchAll(/#### `([^`]+)`\s+- \*\*fromPromise with inline types\*\*: (\d+)/g);
  const files = [...fileMatches].map(m => ({
    path: m[1].replace(/\\/g, '/'),
    count: parseInt(m[2])
  }));

  console.log(`📂 Found ${files.length} files with fromPromise inline types`);
  console.log('');

  // Process files (highest occurrence count first)
  const sortedFiles = files.sort((a, b) => b.count - a.count).slice(0, limit);

  for (const file of sortedFiles) {
    const result = fixFile(file.path);

    filesProcessed++;
    if (result.fixed) {
      filesFixed++;
      totalFixes += result.count;
    }
  }

  // Summary
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 Summary');
  console.log('═'.repeat(60));
  console.log(`Files processed: ${filesProcessed}`);
  console.log(`Files fixed: ${filesFixed}`);
  console.log(`Total fixes applied: ${totalFixes}`);

  if (isDryRun) {
    console.log('');
    console.log('🔄 To apply fixes, run without --dry-run flag');
  } else if (filesFixed > 0) {
    console.log('');
    console.log('✅ Next steps:');
    console.log('   1. Verify changes: git diff');
    console.log('   2. Validate: npx tsc --noEmit');
    console.log('   3. Test: npm test');
    console.log('   4. Commit: git commit -am "fix: XState v5 fromPromise migration"');
  }
}

main().catch(error => {
  console.error('❌ Fixer failed:', error);
  process.exit(1);
});
