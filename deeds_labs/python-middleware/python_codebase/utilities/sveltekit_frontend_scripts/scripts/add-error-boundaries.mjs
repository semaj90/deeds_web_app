#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🛡️ Adding Error Boundaries and Type Guards');
console.log('==========================================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Add error boundaries to complex components
    if (content.includes('$effect(') && !content.includes('try {')) {
      const effectRegex = /\$effect\(\(\) => \{([^}]+)\}\);/g;
      const originalEffects = content;
      content = content.replace(effectRegex, (match, effectBody) => {
        if (!effectBody.includes('try')) {
          return `$effect(() => {
    try {
${effectBody
  .split('\n')
  .map((line) => '      ' + line)
  .join('\n')}
    } catch (error) {
      console.error('Effect error:', error);
    }
  });`;
        }
        return match;
      });

      if (content !== originalEffects) {
        changes++;
        modified = true;
        console.log(`    ✅ Added error boundaries to effects`);
      }
    }

    // 2. Add type guards for API responses
    if (content.includes('fetch(') && !content.includes('isValidResponse')) {
      const apiCallRegex = /const\s+(\w+)\s*=\s*await\s+fetch\([^)]+\)\.json\(\);/g;
      const originalApiCalls = content;

      content = content.replace(apiCallRegex, (match, varName) => {
        return `${match}
    if (!isValidResponse(${varName})) {
      throw new Error('Invalid API response');
    }`;
      });

      if (content !== originalApiCalls) {
        // Add type guard function if not present
        if (!content.includes('function isValidResponse')) {
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  function isValidResponse(data: unknown): data is Record<string, unknown> {
    return data !== null && typeof data === 'object';
  }`
          );
        }
        changes++;
        modified = true;
        console.log(`    ✅ Added type guards for API responses`);
      }
    }

    // 3. Add proper loading states
    if (
      content.includes('$state(') &&
      !content.includes('isLoading') &&
      content.includes('fetch(')
    ) {
      const stateRegex = /let\s+(\w+)\s*=\s*\$state\([^)]+\);/;
      const match = content.match(stateRegex);

      if (match && !content.includes('let isLoading')) {
        const insertPoint = content.indexOf(match[0]) + match[0].length;
        content =
          content.slice(0, insertPoint) +
          '\n  let isLoading = $state(false);' +
          content.slice(insertPoint);
        changes++;
        modified = true;
        console.log(`    ✅ Added loading state`);
      }
    }

    // 4. Add proper error states
    if (content.includes('catch (error') && !content.includes('errorMessage')) {
      const errorHandlingRegex = /catch\s*\(\s*error[^)]*\)\s*\{([^}]+)\}/g;
      const originalErrorHandling = content;

      // Add error state if not present
      if (!content.includes('let errorMessage')) {
        content = content.replace(
          /let\s+\w+\s*=\s*\$state\([^)]+\);/,
          `$&\n  let errorMessage = $state('');`
        );
      }

      content = content.replace(errorHandlingRegex, (match, errorBody) => {
        if (!errorBody.includes('errorMessage')) {
          return match.replace(
            errorBody,
            `${errorBody}
    errorMessage = error instanceof Error ? error.message : 'An error occurred';`
          );
        }
        return match;
      });

      if (content !== originalErrorHandling) {
        changes++;
        modified = true;
        console.log(`    ✅ Added error state management`);
      }
    }

    // 5. Add proper cleanup in effects
    if (content.includes('$effect(') && content.includes('addEventListener')) {
      const effectRegex = /\$effect\(\(\) => \{([^}]+addEventListener[^}]+)\}\);/g;
      const originalCleanup = content;

      content = content.replace(effectRegex, (match, effectBody) => {
        if (!effectBody.includes('return')) {
          const lines = effectBody.split('\n');
          const addEventListenerLines = lines.filter((line) => line.includes('addEventListener'));

          if (addEventListenerLines.length > 0) {
            const cleanup = addEventListenerLines
              .map((line) => {
                const eventMatch = line.match(/addEventListener\(['"]([^'"]+)['"],\s*([^)]+)\)/);
                if (eventMatch) {
                  const eventType = eventMatch[1];
                  const handler = eventMatch[2];
                  return `    element.removeEventListener('${eventType}', ${handler});`;
                }
                return '';
              })
              .filter(Boolean)
              .join('\n');

            return `$effect(() => {
${effectBody}

    return () => {
${cleanup}
    };
  });`;
          }
        }
        return match;
      });

      if (content !== originalCleanup) {
        changes++;
        modified = true;
        console.log(`    ✅ Added cleanup for event listeners`);
      }
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(`  📝 Enhanced ${changes} patterns in ${filePath.split(/[/\\]/).pop()}`);
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
  console.log('1️⃣ Finding components that need error boundaries...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that might benefit from error boundaries
  const complexComponents = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('$effect(') ||
        content.includes('fetch(') ||
        content.includes('addEventListener') ||
        content.includes('WebSocket') ||
        content.includes('canvas')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${complexComponents.length} complex components\n`);

  if (complexComponents.length === 0) {
    console.log('✨ No components need error boundaries!');
    return;
  }

  console.log('2️⃣ Adding error boundaries and type guards...\n');

  for (const file of complexComponents.slice(0, 20)) {
    // Process first 20 to avoid overwhelming
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Summary');
  console.log('==========');
  console.log(`Files enhanced: ${filesFixed}`);
  console.log(`Total improvements: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n✅ Error boundaries and type guards added!');
    console.log('\nBenefits:');
    console.log('- Better error handling in effects');
    console.log('- Type-safe API responses');
    console.log('- Proper loading and error states');
    console.log('- Memory leak prevention');
  }
}

main();
