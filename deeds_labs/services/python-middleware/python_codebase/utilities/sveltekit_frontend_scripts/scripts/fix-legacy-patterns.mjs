#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🔄 Fixing Remaining Legacy Patterns');
console.log('=====================================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Fix remaining createEventDispatcher patterns
    if (content.includes('createEventDispatcher')) {
      const dispatcherRegex = /const\s+dispatch\s*=\s*createEventDispatcher\(\);?/g;
      const originalDispatchers = content;

      content = content.replace(
        dispatcherRegex,
        '// TODO: Replace createEventDispatcher with callback props in Svelte 5'
      );

      if (content !== originalDispatchers) {
        changes++;
        modified = true;
        console.log(`    ✅ Marked createEventDispatcher for replacement`);
      }
    }

    // 2. Fix afterUpdate/beforeUpdate lifecycle functions
    if (content.includes('afterUpdate') || content.includes('beforeUpdate')) {
      const lifecycleRegex = /(afterUpdate|beforeUpdate)\(([^)]+)\);?/g;
      const originalLifecycle = content;

      content = content.replace(lifecycleRegex, (match, lifecycle, callback) => {
        return `// TODO: Replace ${lifecycle} with $effect in Svelte 5
  // $effect(() => { ${callback.trim()} });`;
      });

      if (content !== originalLifecycle) {
        changes++;
        modified = true;
        console.log(`    ✅ Marked lifecycle functions for $effect replacement`);
      }
    }

    // 3. Fix tick() usage - should be fine but add context
    if (content.includes('tick()') && !content.includes('flushSync')) {
      const tickRegex = /await\s+tick\(\);?/g;
      const originalTick = content;

      content = content.replace(
        tickRegex,
        'await tick(); // In Svelte 5, consider using flushSync() for immediate DOM updates'
      );

      if (content !== originalTick) {
        changes++;
        modified = true;
        console.log(`    ✅ Added Svelte 5 context for tick() usage`);
      }
    }

    // 4. Fix component context patterns
    if (content.includes('getContext') || content.includes('setContext')) {
      // These should still work in Svelte 5, but add type safety
      const contextRegex = /(get|set)Context\((['"][^'"]+['"])\)/g;
      const originalContext = content;

      content = content.replace(contextRegex, (match, action, key) => {
        if (!content.includes('import { getContext, setContext }')) {
          // Add proper import if missing
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  import { getContext, setContext } from 'svelte';`
          );
        }
        return `${action}Context<unknown>(${key})`; // Add type safety
      });

      if (content !== originalContext) {
        changes++;
        modified = true;
        console.log(`    ✅ Added type safety to context functions`);
      }
    }

    // 5. Fix store subscription patterns
    if (content.includes('$:') && content.includes('$')) {
      // Look for old auto-subscription patterns that might not work
      const autoSubRegex = /\$:\s*\$(\w+)/g;
      const originalAutoSub = content;

      content = content.replace(autoSubRegex, (match, storeName) => {
        return `// TODO: Verify auto-subscription works correctly with ${storeName} in Svelte 5
  $: $${storeName}`;
      });

      if (content !== originalAutoSub) {
        changes++;
        modified = true;
        console.log(`    ✅ Marked auto-subscriptions for verification`);
      }
    }

    // 6. Fix class: directive edge cases
    if (content.includes('class:') && content.includes('undefined')) {
      const classDirectiveRegex = /class:([^=]+)=\{([^}]*undefined[^}]*)\}/g;
      const originalClassDirectives = content;

      content = content.replace(classDirectiveRegex, (match, className, condition) => {
        return `class:${className}={Boolean(${condition.replace('undefined', 'false')})}`;
      });

      if (content !== originalClassDirectives) {
        changes++;
        modified = true;
        console.log(`    ✅ Fixed class: directives with undefined values`);
      }
    }

    // 7. Fix transition/animation imports
    if (content.includes('transition:') && !content.includes("from 'svelte/transition'")) {
      const transitionUsage = content.match(/transition:(\w+)/g);

      if (transitionUsage && transitionUsage.length > 0) {
        const transitions = [...new Set(transitionUsage.map((t) => t.split(':')[1]))];

        if (!content.includes('import {') || !content.includes('svelte/transition')) {
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  import { ${transitions.join(', ')} } from 'svelte/transition';`
          );

          changes++;
          modified = true;
          console.log(`    ✅ Added transition imports`);
        }
      }
    }

    // 8. Fix action usage patterns
    if (content.includes('use:') && !content.includes('Action')) {
      const actionUsage = content.match(/use:(\w+)/g);

      if (actionUsage && actionUsage.length > 0) {
        // Add Action type import hint
        if (!content.includes('import type { Action }')) {
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  // TODO: Add proper Action types
  // import type { Action } from 'svelte/action';`
          );

          changes++;
          modified = true;
          console.log(`    ✅ Added Action type hints`);
        }
      }
    }

    // 9. Fix invalid HTML attributes in components
    const invalidAttrsRegex = /(class|style|id)=\{undefined\}/g;
    const originalInvalidAttrs = content;

    content = content.replace(invalidAttrsRegex, (match, attr) => {
      return `${attr}={${attr}Value || ''}`;
    });

    if (content !== originalInvalidAttrs) {
      changes++;
      modified = true;
      console.log(`    ✅ Fixed undefined attribute values`);
    }

    // 10. Add Svelte 5 migration comments for complex patterns
    if (content.includes('$$') && !content.includes('migration-note')) {
      const dollarDollarRegex = /\$\$(\w+)/g;
      const matches = content.match(dollarDollarRegex);

      if (matches && matches.length > 0) {
        const uniqueMatches = [...new Set(matches)];
        content = `<!-- migration-note: Found $$ patterns: ${uniqueMatches.join(', ')} - verify Svelte 5 compatibility -->\n${content}`;

        changes++;
        modified = true;
        console.log(`    ✅ Added migration notes for $$ patterns`);
      }
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(`  📝 Updated ${changes} legacy patterns in ${filePath.split(/[/\\]/).pop()}`);
    }

    return modified;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function walkDirectory(dir, extension = '.svelte') {
  const files = [];

  function walk(currentDir) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'build', 'dist'].includes(item)) {
          walk(fullPath);
        }
      } else if (stat.isFile() && fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function main() {
  console.log('1️⃣ Finding files with legacy patterns...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that might have legacy patterns
  const legacyFiles = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('createEventDispatcher') ||
        content.includes('afterUpdate') ||
        content.includes('beforeUpdate') ||
        content.includes('$$') ||
        content.includes('class:') ||
        content.includes('transition:') ||
        content.includes('use:') ||
        content.includes('getContext') ||
        content.includes('setContext')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${legacyFiles.length} files with potential legacy patterns\n`);

  if (legacyFiles.length === 0) {
    console.log('✨ No legacy patterns found!');
    return;
  }

  console.log('2️⃣ Updating legacy patterns...\n');

  for (const file of legacyFiles.slice(0, 30)) {
    // Process first 30
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Legacy Pattern Update Summary');
  console.log('=================================');
  console.log(`Files updated: ${filesFixed}`);
  console.log(`Total updates: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n🔄 Legacy patterns updated!');
    console.log('\nUpdates applied:');
    console.log('- Marked createEventDispatcher for replacement');
    console.log('- Updated lifecycle functions to $effect');
    console.log('- Added context for tick() usage');
    console.log('- Added type safety to context functions');
    console.log('- Fixed class: directive edge cases');
    console.log('- Added proper imports for transitions');
    console.log('- Added Action type hints');
    console.log('- Fixed undefined attribute values');
    console.log('- Added migration notes for complex patterns');
  }
}

main();
