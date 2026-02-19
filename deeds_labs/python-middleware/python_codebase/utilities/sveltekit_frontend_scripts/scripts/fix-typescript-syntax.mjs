#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

async function fixFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;
    const originalContent = content;

    // Fix common syntax patterns
    const fixes = [
      // Fix double closing parens
      { pattern: /\)\)\);/g, replacement: '));', name: 'double closing parens' },

      // Fix mismatched generic brackets
      { pattern: /<<([^>]+)>>/g, replacement: '<$1>', name: 'double angle brackets' },

      // Fix trailing commas in generics
      { pattern: /<([^>,]+),>/g, replacement: '<$1>', name: 'trailing comma in generic' },

      // Fix async arrow functions with missing parens
      {
        pattern: /async\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+=>/g,
        replacement: 'async ($1) =>',
        name: 'async arrow function',
      },

      // Fix stray semicolons in interfaces
      {
        pattern: /interface\s+\w+\s*{\s*([^}]+);\s*}/g,
        replacement: (match, props) => {
          const cleaned = props.replace(/;\s*(?=[a-zA-Z_])/g, ';\n  ');
          return match.replace(props, cleaned);
        },
        name: 'interface semicolons',
      },

      // Fix misplaced type annotations
      {
        pattern: /:\s*:\s*([a-zA-Z_$][a-zA-Z0-9_$<>\[\]]*)/g,
        replacement: ': $1',
        name: 'double colon',
      },

      // Fix missing semicolons after type declarations
      {
        pattern: /^(\s*(?:export\s+)?type\s+\w+\s*=\s*[^;]+)$/gm,
        replacement: '$1;',
        name: 'missing type semicolon',
      },

      // Fix unclosed template literals (basic)
      { pattern: /\$\{([^}]*)\$\{/g, replacement: '${$1}${', name: 'nested template literal' },
    ];

    for (const fix of fixes) {
      const before = content;
      content = content.replace(fix.pattern, fix.replacement);
      if (before !== content) {
        modified = true;
        console.log(`  ✓ Fixed ${fix.name}`);
      }
    }

    // Special case: Fix unbalanced braces/parens (more complex)
    const checkBalance = (str) => {
      const stack = [];
      const pairs = { '(': ')', '[': ']', '{': '}' };
      const closing = new Set([')', ']', '}']);

      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (pairs[char]) {
          stack.push(char);
        } else if (closing.has(char)) {
          const last = stack.pop();
          if (!last || pairs[last] !== char) {
            return { balanced: false, position: i, char };
          }
        }
      }

      return { balanced: stack.length === 0, remaining: stack };
    };

    // Line-by-line balance checking for specific constructs
    const lines = content.split('\n');
    const fixedLines = lines.map((line, idx) => {
      // Fix lines ending with ))); to ));
      if (line.trim().endsWith(')));') && !line.includes('catch')) {
        console.log(`  ✓ Fixed triple closing paren on line ${idx + 1}`);
        return line.replace(/\)\)\);(\s*)$/, '));$1');
      }

      // Fix async functions missing parens
      if (line.includes('async ') && line.includes('=>') && !line.includes('(')) {
        const fixed = line.replace(/async\s+(\w+)\s+=>/g, 'async ($1) =>');
        if (fixed !== line) {
          console.log(`  ✓ Fixed async arrow function on line ${idx + 1}`);
          return fixed;
        }
      }

      return line;
    });

    if (lines.some((line, idx) => line !== fixedLines[idx])) {
      content = fixedLines.join('\n');
      modified = true;
    }

    if (modified) {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`✅ Fixed: ${path.relative(process.cwd(), filePath)}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Fixing TypeScript syntax errors...\n');

  // Find all TypeScript files
  const tsFiles = await glob('src/**/*.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**'],
  });

  console.log(`Found ${tsFiles.length} TypeScript files to check.\n`);

  let fixedCount = 0;
  let errorCount = 0;

  for (const file of tsFiles) {
    const fullPath = path.join(process.cwd(), file);
    const result = await fixFile(fullPath);
    if (result === true) fixedCount++;
    else if (result === false) continue;
    else errorCount++;
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Fixed: ${fixedCount} files`);
  console.log(`   ⏭️  Unchanged: ${tsFiles.length - fixedCount - errorCount} files`);
  console.log(`   ❌ Errors: ${errorCount} files`);
}

main().catch(console.error);
