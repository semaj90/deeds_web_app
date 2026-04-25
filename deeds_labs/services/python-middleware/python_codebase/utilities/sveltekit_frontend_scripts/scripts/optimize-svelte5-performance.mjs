#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('⚡ Svelte 5 Performance Optimization');
console.log('===================================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Add $derived optimizations for computed values
    const computedRegex = /let\s+(\w+)\s*=\s*\$derived\(([^)]+)\);/g;
    const originalComputed = content;

    // Look for expensive computations that could be memoized
    content = content.replace(computedRegex, (match, varName, computation) => {
      if (
        computation.includes('.map(') ||
        computation.includes('.filter(') ||
        computation.includes('.reduce(')
      ) {
        // Add untrack for expensive operations
        if (!computation.includes('untrack(')) {
          return `let ${varName} = $derived(${computation}); // TODO: Consider untrack() for expensive operations`;
        }
      }
      return match;
    });

    if (content !== originalComputed) {
      changes++;
      modified = true;
      console.log(`    ✅ Marked expensive derived computations for optimization`);
    }

    // 2. Optimize effect dependencies
    const effectRegex = /\$effect\(\(\) => \{([^}]+)\}\);/g;
    const originalEffects = content;

    content = content.replace(effectRegex, (match, effectBody) => {
      // Check if effect reads many reactive values
      const reactiveReads = (effectBody.match(/\w+\.\w+/g) || []).length;

      if (reactiveReads > 5 && !effectBody.includes('untrack(')) {
        return `$effect(() => {
    // Consider using untrack() for expensive operations
${effectBody}
  });`;
      }
      return match;
    });

    if (content !== originalEffects) {
      changes++;
      modified = true;
      console.log(`    ✅ Added performance hints for effects`);
    }

    // 3. Add lazy loading for heavy components
    if (
      content.includes('import') &&
      !content.includes('lazy(') &&
      (content.includes('Chart') || content.includes('Canvas') || content.includes('Editor'))
    ) {
      const heavyImports = content.match(
        /import\s+(\w+)\s+from\s+['"]([^'"]*(?:Chart|Canvas|Editor)[^'"]*)['"];?/g
      );

      if (heavyImports && heavyImports.length > 0) {
        // Add lazy loading utilities if not present
        if (!content.includes('import { lazy }')) {
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  import { lazy } from '$lib/utils/lazy';`
          );
        }

        heavyImports.forEach((importLine) => {
          const match = importLine.match(/import\s+(\w+)\s+from\s+['"]([^'"]*)['"];?/);
          if (match) {
            const componentName = match[1];
            const importPath = match[2];
            content = content.replace(
              importLine,
              `const ${componentName} = lazy(() => import('${importPath}'));`
            );
          }
        });

        changes++;
        modified = true;
        console.log(`    ✅ Added lazy loading for heavy components`);
      }
    }

    // 4. Optimize large lists with virtual scrolling hints
    if (content.includes('{#each') && content.includes('items') && !content.includes('virtual')) {
      const eachBlocks = content.match(/\{#each\s+(\w+)/g);

      if (eachBlocks && eachBlocks.length > 0) {
        const listVar = eachBlocks[0].split(' ')[1];

        // Add virtual scrolling hint if list might be large
        if (content.includes(`${listVar}.length`) || content.includes(`${listVar}.map`)) {
          const eachBlockRegex = new RegExp(`(\\{#each\\s+${listVar}[^}]+\\})`, 'g');
          content = content.replace(
            eachBlockRegex,
            `$1
<!-- TODO: Consider virtual scrolling for large lists (${listVar}) -->`
          );

          changes++;
          modified = true;
          console.log(`    ✅ Added virtual scrolling hint for large lists`);
        }
      }
    }

    // 5. Add proper debouncing for input handlers
    if (content.includes('oninput=') && !content.includes('debounce')) {
      const inputHandlers = content.match(/oninput=\{([^}]+)\}/g);

      if (inputHandlers && inputHandlers.length > 0) {
        // Add debounce utility if not present
        if (!content.includes('import { debounce }')) {
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  import { debounce } from '$lib/utils/debounce';`
          );
        }

        inputHandlers.forEach((handler, index) => {
          const handlerFunction = handler.match(/oninput=\{([^}]+)\}/)[1];
          if (!handlerFunction.includes('debounce')) {
            content = content.replace(handler, `oninput={debounce(${handlerFunction}, 300)}`);
          }
        });

        changes++;
        modified = true;
        console.log(`    ✅ Added debouncing for input handlers`);
      }
    }

    // 6. Optimize DOM updates with key attributes
    if (content.includes('{#each') && !content.includes('(') && content.includes('}')) {
      const eachWithoutKey = content.match(/\{#each\s+\w+\s+as\s+\w+\}[^{]*\{\/each\}/g);

      if (eachWithoutKey && eachWithoutKey.length > 0) {
        eachWithoutKey.forEach((block) => {
          if (!block.includes('(')) {
            const match = block.match(/\{#each\s+(\w+)\s+as\s+(\w+)\}/);
            if (match) {
              const arrayName = match[1];
              const itemName = match[2];

              content = content.replace(
                block,
                block.replace(
                  /\{#each\s+(\w+)\s+as\s+(\w+)\}/,
                  `{#each $1 as $2 (${itemName}.id || ${itemName})}`
                )
              );
            }
          }
        });

        changes++;
        modified = true;
        console.log(`    ✅ Added key attributes for list optimization`);
      }
    }

    // 7. Add performance monitoring for heavy operations
    if (content.includes('WebGL') || content.includes('Canvas') || content.includes('GPU')) {
      if (!content.includes('performance.mark')) {
        // Add performance markers
        const functionRegex =
          /(function\s+\w+\([^)]*\)\s*\{|const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{)/g;
        content = content.replace(functionRegex, (match) => {
          return `${match}
    performance.mark('function-start');`;
        });

        changes++;
        modified = true;
        console.log(`    ✅ Added performance monitoring hints`);
      }
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(`  📝 Optimized ${changes} patterns in ${filePath.split(/[/\\]/).pop()}`);
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
  console.log('1️⃣ Finding components that need performance optimization...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that might benefit from optimization
  const candidateFiles = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('$derived(') ||
        content.includes('{#each') ||
        content.includes('Canvas') ||
        content.includes('Chart') ||
        content.includes('oninput=') ||
        content.includes('WebGL') ||
        content.includes('GPU')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${candidateFiles.length} components for optimization\n`);

  if (candidateFiles.length === 0) {
    console.log('✨ No components need performance optimization!');
    return;
  }

  console.log('2️⃣ Applying performance optimizations...\n');

  for (const file of candidateFiles.slice(0, 25)) {
    // Process first 25
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Performance Optimization Summary');
  console.log('====================================');
  console.log(`Files optimized: ${filesFixed}`);
  console.log(`Total optimizations: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n⚡ Performance optimizations applied!');
    console.log('\nOptimizations added:');
    console.log('- Marked expensive derived computations');
    console.log('- Added performance hints for effects');
    console.log('- Lazy loading for heavy components');
    console.log('- Virtual scrolling hints for large lists');
    console.log('- Debouncing for input handlers');
    console.log('- Key attributes for list optimization');
    console.log('- Performance monitoring for heavy operations');
  }
}

main();
