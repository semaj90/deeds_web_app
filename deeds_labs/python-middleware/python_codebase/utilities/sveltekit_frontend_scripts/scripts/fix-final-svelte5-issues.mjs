#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🔧 Final Svelte 5 fixes');
console.log('========================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Fix remaining Button imports that aren't bits-ui
    const buttonImportRegex =
      /import\s*\{\s*Button\s*\}\s*from\s*['"]([^'"]*\/Button\.svelte)['"];?/g;
    const originalButtonImports = content;
    content = content.replace(buttonImportRegex, "import Button from '$1';");
    if (content !== originalButtonImports) {
      const matches = (originalButtonImports.match(buttonImportRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Button named imports → default: ${matches} fixes`);
    }

    // 2. Fix export let patterns that might have been missed
    if (content.includes('export let') && !content.includes('$props()')) {
      const exportLets = [];
      const exportLetRegex = /export let\s+(\w+)(?:\s*=\s*([^;]+))?;?\s*$/gm;
      let match;

      while ((match = exportLetRegex.exec(content)) !== null) {
        exportLets.push({
          name: match[1],
          defaultValue: match[2]?.trim(),
        });
      }

      if (exportLets.length > 0) {
        // Remove all export let statements
        content = content.replace(/export let\s+\w+(?:\s*=\s*[^;]+)?;?\s*\n?/g, '');

        // Create $props destructuring
        const propsPattern = exportLets
          .map((prop) => {
            if (prop.defaultValue) {
              return `${prop.name} = ${prop.defaultValue}`;
            } else {
              return prop.name;
            }
          })
          .join(', ');

        // Insert after script tag
        content = content.replace(
          /(<script[^>]*>\s*)/,
          `$1\n\tlet { ${propsPattern} } = $props();\n`
        );

        changes += exportLets.length;
        modified = true;
        console.log(`    ✅ Converted ${exportLets.length} export let to $props`);
      }
    }

    // 3. Fix bind:value patterns for consistency
    const bindValueRegex = /bind:value=\{([^}]+)\}/g;
    const originalBindValues = content;
    content = content.replace(bindValueRegex, 'bind:value={$1}');
    // Note: This is just for consistency, the pattern should already work

    // 4. Fix on: event handlers that might have been missed
    const onEventRegex = /\bon:(\w+)=/g;
    const originalOnEvents = content;
    content = content.replace(onEventRegex, 'on$1=');
    if (content !== originalOnEvents) {
      const matches = (originalOnEvents.match(onEventRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ on:event → onevent: ${matches} fixes`);
    }

    // 5. Fix class: directives
    const classDirectiveRegex = /class:(\w+)=\{([^}]+)\}/g;
    const originalClassDirectives = content;
    content = content.replace(classDirectiveRegex, 'class:$1={$2}');
    // Note: This pattern should already work in Svelte 5

    // 6. Add proper TypeScript types for common patterns
    if (
      !content.includes('import type') &&
      (content.includes('interface') || content.includes('type '))
    ) {
      // Check if we need to add type imports
      if (content.includes('Snippet') && !content.includes('import type { Snippet }')) {
        content = content.replace(
          /(<script[^>]*>)/,
          "$1\n\timport type { Snippet } from 'svelte';"
        );
        changes++;
        modified = true;
        console.log(`    ✅ Added Snippet type import`);
      }
    }

    // 7. Fix common TypeScript errors
    const anyTypeRegex = /:\s*any(?![a-zA-Z])/g;
    const originalAnyTypes = content;
    content = content.replace(anyTypeRegex, ': unknown');
    if (content !== originalAnyTypes) {
      const matches = (originalAnyTypes.match(anyTypeRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ any → unknown: ${matches} fixes`);
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(`  📝 Fixed ${changes} patterns in ${filePath.split(/[/\\]/).pop()}`);
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
  console.log('1️⃣ Finding files that might need final fixes...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that might need fixes
  const problematicFiles = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('export let') ||
        content.includes('on:') ||
        /import\s*\{\s*Button\s*\}/.test(content) ||
        content.includes(': any')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${problematicFiles.length} files that might need fixes\n`);

  if (problematicFiles.length === 0) {
    console.log('✨ No issues found to fix!');
    return;
  }

  console.log('2️⃣ Processing files...\n');

  for (const file of problematicFiles) {
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Summary');
  console.log('==========');
  console.log(`Files modified: ${filesFixed}`);
  console.log(`Total changes: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n✅ Final Svelte 5 fixes completed!');
    console.log('\nNext steps:');
    console.log('1. Run `npm run check` to verify all issues are resolved');
    console.log('2. Test your application');
    console.log('3. Commit the changes');
  } else {
    console.log('\n✨ All final issues already resolved!');
  }
}

main();
