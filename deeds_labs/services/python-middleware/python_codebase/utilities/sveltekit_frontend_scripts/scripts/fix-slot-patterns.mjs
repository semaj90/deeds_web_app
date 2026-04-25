#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🔄 Converting slot patterns to snippets');
console.log('======================================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // Skip files that already have proper snippet syntax
    if (content.includes('@migration-task') && content.includes('slot_snippet_conflict')) {
      console.log(`  ⚠️ Skipping ${filePath.split(/[/\\]/).pop()} - has migration conflicts`);
      return false;
    }

    // 1. Replace $$slots.* checks with prop checks
    const slotsCheckRegex = /\$\$slots\.(\w+)/g;
    const originalSlotChecks = content;
    content = content.replace(slotsCheckRegex, '$1');
    if (content !== originalSlotChecks) {
      const matches = (originalSlotChecks.match(slotsCheckRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ $$slots checks → prop checks: ${matches} fixes`);
    }

    // 2. Replace <slot /> with {@render children?.()}
    const slotSelfClosingRegex = /<slot\s*\/>/g;
    const originalSlotSelfClosing = content;
    content = content.replace(slotSelfClosingRegex, '{@render children?.()}');
    if (content !== originalSlotSelfClosing) {
      const matches = (originalSlotSelfClosing.match(slotSelfClosingRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ <slot /> → {@render children?.()}: ${matches} fixes`);
    }

    // 3. Replace <slot></slot> with {@render children?.()}
    const slotPairRegex = /<slot\s*><\/slot>/g;
    const originalSlotPair = content;
    content = content.replace(slotPairRegex, '{@render children?.()}');
    if (content !== originalSlotPair) {
      const matches = (originalSlotPair.match(slotPairRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ <slot></slot> → {@render children?.()}: ${matches} fixes`);
    }

    // 4. Replace named slots <slot name="foo" /> with {@render foo?.()}
    const namedSlotRegex = /<slot\s+name=["'](\w+)["']\s*\/?>/g;
    const originalNamedSlots = content;
    content = content.replace(namedSlotRegex, '{@render $1?.()}');
    if (content !== originalNamedSlots) {
      const matches = (originalNamedSlots.match(namedSlotRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ named slots → {@render}: ${matches} fixes`);
    }

    // 5. Replace svelte:fragment with snippets
    const fragmentRegex = /<svelte:fragment\s+slot=["'](\w+)["']([^>]*)>(.*?)<\/svelte:fragment>/gs;
    const originalFragments = content;
    content = content.replace(fragmentRegex, '{#snippet $1$2}$3{/snippet}');
    if (content !== originalFragments) {
      const matches = (originalFragments.match(fragmentRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ svelte:fragment → snippets: ${matches} fixes`);
    }

    // 6. Add Snippet import if we have snippet syntax but no import
    if (content.includes('{@render') && !content.includes('import type { Snippet }')) {
      // Check if there are already imports from 'svelte'
      if (content.includes("from 'svelte'") || content.includes('from "svelte"')) {
        // Add Snippet to existing import
        content = content.replace(
          /(import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]svelte['"])/,
          (match, fullImport, imports) => {
            if (!imports.includes('Snippet')) {
              return fullImport.replace(imports, `${imports}, Snippet`);
            }
            return match;
          }
        );
      } else {
        // Add new import at the top of the script
        content = content.replace(
          /<script[^>]*>/,
          `<script lang="ts">\n  import type { Snippet } from 'svelte';`
        );
      }
      changes++;
      modified = true;
      console.log(`    ✅ Added Snippet import`);
    }

    // 7. Ensure proper props destructuring includes snippet props
    if (content.includes('{@render') && content.includes('$props()')) {
      // Look for snippet names being rendered
      const snippetNames = [];
      const renderMatches = content.matchAll(/\{@render\s+(\w+)\??\(\)/g);
      for (const match of renderMatches) {
        const snippetName = match[1];
        if (snippetName !== 'children' && !snippetNames.includes(snippetName)) {
          snippetNames.push(snippetName);
        }
      }

      if (snippetNames.length > 0) {
        // Add snippet types to interface if it exists
        const interfaceRegex = /interface\s+Props\s*\{([^}]+)\}/s;
        const interfaceMatch = content.match(interfaceRegex);
        if (interfaceMatch) {
          let interfaceContent = interfaceMatch[1];
          for (const snippetName of snippetNames) {
            if (!interfaceContent.includes(`${snippetName}?:`)) {
              interfaceContent += `\n    ${snippetName}?: Snippet;`;
            }
          }
          if (!interfaceContent.includes('children?:')) {
            interfaceContent += `\n    children?: Snippet;`;
          }
          content = content.replace(interfaceMatch[1], interfaceContent);
          changes++;
          modified = true;
          console.log(`    ✅ Added snippet props to interface`);
        }
      }
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
  console.log('1️⃣ Finding files with slot patterns...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that contain slot patterns
  const filesWithSlots = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('<slot') ||
        content.includes('$$slots') ||
        content.includes('<svelte:fragment')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${filesWithSlots.length} files with slot patterns\n`);

  if (filesWithSlots.length === 0) {
    console.log('✨ No slot patterns found to fix!');
    return;
  }

  console.log('2️⃣ Processing files...\n');

  for (const file of filesWithSlots) {
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Summary');
  console.log('==========');
  console.log(`Files modified: ${filesFixed}`);
  console.log(`Total changes: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n✅ Slot to snippet migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Review the changes');
    console.log('2. Test your components');
    console.log('3. Run `npm run check` to verify types');
  } else {
    console.log('\n✨ All slot patterns already converted!');
  }
}

main();
