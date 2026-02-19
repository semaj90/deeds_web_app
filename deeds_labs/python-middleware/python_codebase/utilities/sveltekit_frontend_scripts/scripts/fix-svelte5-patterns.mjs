#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

console.log('🚀 Svelte 5 Migration Script');
console.log('=============================\n');

let filesFixed = 0;
let totalChanges = 0;

// Patterns to fix
const PATTERNS = [
  // 1. Convert export let to $props destructuring
  {
    name: 'export let → $props destructuring',
    regex: /export let\s+(\w+)(?:\s*=\s*([^;]+))?;?/g,
    replacement: (match, varName, defaultValue) => {
      if (defaultValue) {
        return `let { ${varName} = ${defaultValue} } = $props();`;
      } else {
        return `let { ${varName} } = $props();`;
      }
    },
  },

  // 2. Convert let x = y; $: doubled = x * 2 to let x = $state(y); let doubled = $derived(x * 2)
  {
    name: '$: reactive declarations → $derived',
    regex: /\$:\s*(\w+)\s*=\s*([^;]+);?/g,
    replacement: 'let $1 = $derived($2);',
  },

  // 3. Convert $: { ... } to $effect(() => { ... })
  {
    name: '$: statements → $effect',
    regex: /\$:\s*\{([^}]+)\}/g,
    replacement: '$effect(() => {$1});',
  },

  // 4. Convert $: console.log(...) to $effect(() => { console.log(...) })
  {
    name: '$: single statements → $effect',
    regex: /\$:\s*([^;{]+);?/g,
    replacement: '$effect(() => { $1; });',
  },

  // 5. Convert let x to let x = $state() for reactive variables
  {
    name: 'reactive let → $state',
    regex: /(?<!export\s)let\s+(\w+)\s*=\s*([^;]+)(?=.*\$:.*\1|.*bind:\w+.*\1)/g,
    replacement: 'let $1 = $state($2)',
  },

  // 6. Fix slot patterns to snippet syntax
  {
    name: '<slot> → {#snippet children}',
    regex: /<slot\s*(?:name="(\w+)")?\s*(?:\/>|><\/slot>)/g,
    replacement: (match, name) => {
      if (name) {
        return `{@render ${name}?.()}`;
      } else {
        return `{@render children?.()}`;
      }
    },
  },

  // 7. Fix slot usage with svelte:fragment
  {
    name: 'svelte:fragment slot → snippet',
    regex: /<svelte:fragment\s+slot="(\w+)"([^>]*)>(.*?)<\/svelte:fragment>/gs,
    replacement: '{#snippet $1$2}$3{/snippet}',
  },

  // 8. Fix Button imports to default import
  {
    name: 'named Button import → default import',
    regex: /import\s*\{\s*Button\s*\}\s*from\s*([^;]+);?/g,
    replacement: 'import Button from $1;',
  },

  // 9. Fix on:click → onclick
  {
    name: 'on:click → onclick',
    regex: /on:(\w+)=/g,
    replacement: 'on$1=',
  },

  // 10. Fix bind:value patterns for Svelte 5
  {
    name: 'bind:value cleanup',
    regex: /bind:value=\{([^}]+)\}/g,
    replacement: 'bind:value={$1}',
  },
];

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // Apply each pattern
    for (const pattern of PATTERNS) {
      const originalContent = content;

      if (typeof pattern.replacement === 'function') {
        content = content.replace(pattern.regex, pattern.replacement);
      } else {
        content = content.replace(pattern.regex, pattern.replacement);
      }

      if (content !== originalContent) {
        const matches = (originalContent.match(pattern.regex) || []).length;
        changes += matches;
        modified = true;
        console.log(`    ✅ ${pattern.name}: ${matches} fixes`);
      }
    }

    // Special handling for complex $props patterns
    if (content.includes('export let') && !content.includes('$props()')) {
      // Collect all export let statements
      const exportLets = [];
      const exportLetRegex = /export let\s+(\w+)(?:\s*=\s*([^;]+))?;?/g;
      let match;

      while ((match = exportLetRegex.exec(content)) !== null) {
        exportLets.push({
          name: match[1],
          defaultValue: match[2],
        });
      }

      if (exportLets.length > 0) {
        // Remove all individual export let statements
        content = content.replace(/export let\s+\w+(?:\s*=\s*[^;]+)?;?\n?/g, '');

        // Create a single $props destructuring
        const propsPattern = exportLets
          .map((prop) => {
            if (prop.defaultValue) {
              return `${prop.name} = ${prop.defaultValue}`;
            } else {
              return prop.name;
            }
          })
          .join(', ');

        // Insert the $props destructuring after the script tag
        content = content.replace(
          /<script[^>]*>\s*/,
          `<script$&\n\tlet { ${propsPattern} } = $props();\n`
        );

        changes += exportLets.length;
        modified = true;
        console.log(
          `    ✅ Combined ${exportLets.length} export let → single $props destructuring`
        );
      }
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(`  📝 Fixed ${changes} patterns in ${filePath.split('/').pop()}`);
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
        // Skip node_modules and other build directories
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
  console.log('1️⃣ Finding Svelte files...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  console.log(`Found ${svelteFiles.length} .svelte files\n`);

  console.log('2️⃣ Processing Svelte files...\n');

  for (const file of svelteFiles) {
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('3️⃣ Processing TypeScript files...\n');

  // Also process .ts and .js files that might need rune fixes
  const tsFiles = walkDirectory(srcDir, '.ts').concat(walkDirectory(srcDir, '.js'));

  for (const file of tsFiles) {
    if (!file.includes('.d.ts') && !file.includes('node_modules')) {
      console.log(`Processing: ${file}`);
      processFile(file);
      console.log('');
    }
  }

  console.log('📊 Summary');
  console.log('==========');
  console.log(`Files modified: ${filesFixed}`);
  console.log(`Total changes: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n✅ Svelte 5 migration patterns applied successfully!');
    console.log('\nNext steps:');
    console.log('1. Run `npm run check` to verify TypeScript types');
    console.log('2. Run `npm run lint` to check code style');
    console.log('3. Test your application for any remaining issues');
    console.log('4. Review the changes and commit them');
  } else {
    console.log('\n✨ No Svelte 5 patterns found to fix!');
  }
}

main();
