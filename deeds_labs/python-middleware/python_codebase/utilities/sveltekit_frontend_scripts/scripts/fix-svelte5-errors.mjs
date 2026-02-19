#!/usr/bin/env node
/**
 * Svelte 5 Migration Fix Script
 * Automatically fixes common Svelte 5 migration issues across all route files
 */
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const routesDir = path.join(cwd, 'src', 'routes');

console.log('🔧 Fixing Svelte 5 Migration Issues...');

// Common fixes to apply
const fixes = [
  // Fix invalid $ import statements
  {
    pattern: /import\s*{\s*\$state\s*}\s*from\s*['"]svelte['"];?/g,
    replacement: '// Svelte 5 runes are built-in, no import needed',
    description: 'Remove invalid $state imports',
  },
  {
    pattern: /import\s*{\s*\$derived\s*}\s*from\s*['"]svelte['"];?/g,
    replacement: '// Svelte 5 runes are built-in, no import needed',
    description: 'Remove invalid $derived imports',
  },
  {
    pattern: /import\s*{\s*\$effect\s*}\s*from\s*['"]svelte['"];?/g,
    replacement: '// Svelte 5 runes are built-in, no import needed',
    description: 'Remove invalid $effect imports',
  },

  // Fix syntax errors
  {
    pattern: /\)\s*>\s*\(\s*>/g,
    replacement: ') => {',
    description: 'Fix malformed arrow functions',
  },
  {
    pattern: /\)\)\s*;\s*$/gm,
    replacement: ');',
    description: 'Fix double closing parentheses',
  },

  // Fix legacy reactive statements
  {
    pattern: /\$:\s*([^=\n]+=[^;]+);/g,
    replacement: (match, assignment) => {
      const varName = assignment.split('=')[0].trim();
      return `let ${varName} = $derived(${assignment.split('=')[1].trim().replace(/;$/, '')});`;
    },
    description: 'Convert $: reactive statements to $derived',
  },

  // Fix <svelte:component> deprecation warnings
  {
    pattern: /<svelte:component\s+this={([^}]+)}\s*([^>]*?)>/g,
    replacement: '<{$1} $2>',
    description: 'Fix deprecated svelte:component usage',
  },

  // Fix duplicate attributes (simple cases)
  {
    pattern: /class="([^"]*?)"\s+class="([^"]*?)"/g,
    replacement: 'class="$1 $2"',
    description: 'Merge duplicate class attributes',
  },

  // Fix reserved word usage
  {
    pattern: /\bcase\s*=/g,
    replacement: 'caseData=',
    description: 'Replace reserved word "case" with "caseData"',
  },

  // Fix mixing event handler syntaxes
  {
    pattern: /on:([a-z]+)=(['"][^'"]*['"])\s+on([a-z]+)=/g,
    replacement: 'on$3= on:$1=$2',
    description: 'Fix mixed event handler syntaxes',
  },

  // Fix store/rune conflicts
  {
    pattern: /(\w+)\s*=\s*\$state\([^)]*\);\s*\/\/.*\$state.*conflict/g,
    replacement: (match, varName) => `${varName}State = $state(); // Fixed rune conflict`,
    description: 'Fix store/rune naming conflicts',
  },

  // Fix unclosed elements
  {
    pattern: /<script[^>]*>\s*$/gm,
    replacement: '<script lang="ts">',
    description: 'Ensure script tags are properly formatted',
  },

  // Fix element invalid closing tags
  {
    pattern: /<\/Card\.Root>/g,
    replacement: '</Card>',
    description: 'Fix invalid Card.Root closing tags',
  },
  {
    pattern: /<\/Card\.Content>/g,
    replacement: '</CardContent>',
    description: 'Fix invalid Card.Content closing tags',
  },
];

// Additional specific fixes for common patterns
const specificFixes = [
  // Fix non-reactive updates
  {
    filePattern: /\+page\.svelte$/,
    pattern: /(\w+)\s*=\s*([^;]+);\s*\/\/.*non_reactive_update/g,
    replacement: 'let $1 = $state($2);',
    description: 'Fix non-reactive state updates',
  },
];

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    let appliedFixes = [];

    // Apply general fixes
    for (const fix of fixes) {
      const before = content;
      if (typeof fix.replacement === 'function') {
        content = content.replace(fix.pattern, fix.replacement);
      } else {
        content = content.replace(fix.pattern, fix.replacement);
      }

      if (content !== before) {
        hasChanges = true;
        appliedFixes.push(fix.description);
      }
    }

    // Apply specific fixes based on file type
    for (const fix of specificFixes) {
      if (fix.filePattern.test(path.basename(filePath))) {
        const before = content;
        if (typeof fix.replacement === 'function') {
          content = content.replace(fix.pattern, fix.replacement);
        } else {
          content = content.replace(fix.pattern, fix.replacement);
        }

        if (content !== before) {
          hasChanges = true;
          appliedFixes.push(fix.description);
        }
      }
    }

    // Write changes if any were made
    if (hasChanges) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed ${path.relative(routesDir, filePath)}: ${appliedFixes.join(', ')}`);
      return appliedFixes.length;
    }

    return 0;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return 0;
  }
}

function scanDirectory(dir) {
  const files = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        files.push(...scanDirectory(fullPath));
      } else if (entry.name.endsWith('.svelte')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
  }

  return files;
}

// Main execution
async function main() {
  const svelteFiles = scanDirectory(routesDir);
  console.log(`📊 Found ${svelteFiles.length} Svelte files to process`);

  let totalFixes = 0;
  let fixedFiles = 0;

  for (const file of svelteFiles) {
    const fixCount = fixFile(file);
    if (fixCount > 0) {
      fixedFiles++;
      totalFixes += fixCount;
    }
  }

  console.log(`\n🎉 Migration fix complete!`);
  console.log(`📈 Fixed ${fixedFiles} files with ${totalFixes} total fixes`);
  console.log(`💡 Remaining issues may need manual intervention`);
  console.log(`🔄 Restart dev server to see improvements`);
}

main().catch(console.error);
