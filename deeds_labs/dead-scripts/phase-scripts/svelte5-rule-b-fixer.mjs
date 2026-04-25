#!/usr/bin/env node

/**
 * Svelte 5 Migration Fixer: Rule B - Runes Consistency
 *
 * Converts legacy reactive statements to Svelte 5 runes.
 * Pattern: $: reactiveStatement = expression
 * Fix: let reactiveStatement = $state(expression)
 *
 * Also handles:
 * - $: derivedValue = reactiveStatement * 2 → let derivedValue = $derived(reactiveStatement * 2)
 * - Reactive assignments in reactive blocks
 */

import glob from 'fast-glob';
import fs from 'fs';

async function fixRunesConsistency() {
  console.log('🔧 Starting Rule B: Runes Consistency Fixer');

  // Find all Svelte files
  const files = await glob([
    'src/**/*.svelte',
    '!node_modules/**',
    '!dist/**',
    '!build/**'
  ]);

  let fixedCount = 0;
  let totalFiles = files.length;

  console.log(`📁 Found ${totalFiles} Svelte files to check`);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      let modified = false;
      let newContent = content;

      // Pattern 1: Simple reactive statements
      // $: variable = expression → let variable = $state(expression)
      const simpleReactivePattern = /^\s*\$:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(.+?);?$/gm;

      newContent = newContent.replace(simpleReactivePattern, (match, varName, expression) => {
        // Skip if this is inside a function or complex logic
        if (expression.includes('function') || expression.includes('=>') || expression.includes('$:')) {
          return match;
        }
        console.log(`✅ Converted reactive statement in ${file}: $${varName} = ${expression.trim()}`);
        modified = true;
        return `let ${varName} = $state(${expression.trim()});`;
      });

      // Pattern 2: Reactive blocks with multiple statements
      // Handle $: { ... } blocks by converting to $effect
      const reactiveBlockPattern = /^\s*\$:\s*\{([\s\S]*?)\}$/gm;

      newContent = newContent.replace(reactiveBlockPattern, (match, blockContent) => {
        console.log(`✅ Converted reactive block in ${file}`);
        modified = true;
        return `$effect(() => {\n${blockContent}\n});`;
      });

      // Pattern 3: Derived values (reactive statements that depend on other reactive vars)
      // This is a heuristic - look for reactive statements that reference other variables
      const derivedPattern = /^\s*\$:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);?$/gm;

      // Re-run the replacement to catch derived values
      newContent = newContent.replace(derivedPattern, (match, varName, expression) => {
        // Check if expression references other variables (potential derived value)
        if (expression.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/) &&
            !expression.includes('function') &&
            !expression.includes('=>') &&
            !expression.includes('import') &&
            !expression.includes('export')) {
          console.log(`✅ Converted potential derived value in ${file}: $${varName} = ${expression.trim()}`);
          modified = true;
          return `let ${varName} = $derived(${expression.trim()});`;
        }
        return match;
      });

      if (modified) {
        fs.writeFileSync(file, newContent);
        fixedCount++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Rule B Complete!`);
  console.log(`📊 Fixed ${fixedCount} files out of ${totalFiles} total files`);
  console.log(`📈 Success rate: ${((fixedCount / totalFiles) * 100).toFixed(1)}%`);
}

// Run the fixer
fixRunesConsistency().catch(console.error);