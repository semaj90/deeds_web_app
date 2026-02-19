#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { walk } from './walk-directories.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../sveltekit-frontend/src');

console.log('🧼 Aggressive TypeScript Cleanup Fixer');
console.log('=====================================\n');

const patterns = [
  // Critical ambient.d.ts patterns
  {
    name: 'Index bracket comma [key, string] → [key: string]',
    regex: /\[\s*key\s*,\s*string\s*\]/g,
    replace: '[key: string]'
  },
  {
    name: 'declare const: VARIABLE → declare const VARIABLE',
    regex: /declare\s+const\s*:\s+([A-Z_][A-Z0-9_]*)\s*:/g,
    replace: 'declare const $1:'
  },
  {
    name: 'declare module, → declare module',
    regex: /declare\s+module\s*,\s+/g,
    replace: 'declare module '
  },
  {
    name: 'interface { [key, string] } → [key: string]',
    regex: /\{\s*\[\s*key\s*,\s*string\s*\]\s*,\s*any\s*\}/g,
    replace: '{ [key: string]: any }'
  },
  {
    name: 'Missing closing bracket on interface',
    regex: /interface\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{\s*\[\s*key\s*,\s*string\s*\]\s*,\s*any\s*\};/g,
    replace: 'interface $1 { [key: string]: any; }'
  },
  {
    name: 'declare const, VARIABLE: TYPE',
    regex: /declare\s+const\s*,\s+([A-Z_][A-Z0-9_]*)\s*:\s+/g,
    replace: 'declare const $1: '
  },
  {
    name: 'interface NAME, TYPE → interface NAME: TYPE',
    regex: /interface\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*\{/g,
    replace: 'interface $1 {'
  },
  {
    name: 'Remove trailing }declare',
    regex: /\}\s*declare\s+/g,
    replace: '}\ndeclare '
  },
  {
    name: 'Fix double declare module',
    regex: /declare\s+module\s+(["\'][\w/$-]+["\'])\s+\{\s*declare\s+module/g,
    replace: 'declare module $1 { declare module'
  },
  {
    name: 'Colon before closing brace }: → }',
    regex: /\}\s*:\s*(;|\n)/g,
    replace: '}$1'
  },
  {
    name: 'export const, NAME → export const NAME',
    regex: /export\s+const\s*,\s+/g,
    replace: 'export const '
  },
  {
    name: 'Type annotation missing colon: Type, other → Type: other',
    regex: /:\s*([A-Za-z_][A-Za-z0-9_<>[\]]*)\s*,\s*(})\/g,
    replace: ': $1$2'
  },
  {
    name: 'Remove stray commas in type unions: Type | , Type',
    regex: /\|\s*,/g,
    replace: ' |'
  },
  {
    name: 'Fix declare const: VARIABLE without colon',
    regex: /declare\s+const\s*:\s+([A-Za-z_][A-Za-z0-9_]*)\s*([^:])/g,
    replace: 'declare const $1$2'
  }
];

let totalFixed = 0;
let filesFixed = 0;
let filesProcessed = 0;

async function processFile(filePath) {
  filesProcessed++;

  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let fileFixed = 0;

    for (const pattern of patterns) {
      const matches = content.match(pattern.regex);
      if (matches) {
        const count = matches.length;
        fileFixed += count;
        totalFixed += count;
        content = content.replace(pattern.regex, pattern.replace);
      }
    }

    if (fileFixed > 0) {
      fs.writeFileSync(filePath, content, 'utf-8');
      filesFixed++;
      console.log(`✅ ${path.relative(srcDir, filePath)}: ${fileFixed} fixes`);
    }
  } catch (error) {
    // Ignore unreadable files
  }
}

async function main() {
  try {
    // First pass: walk and fix
    const files = [];
    for await (const file of walk(srcDir)) {
      if (file.endsWith('.ts') || file.endsWith('.d.ts') || file.endsWith('.js')) {
        files.push(file);
      }
    }

    for (const file of files) {
      await processFile(file);
    }

    console.log('\n=====================================');
    console.log(`📊 Results:`);
    console.log(`   Files processed: ${filesProcessed}`);
    console.log(`   Files fixed: ${filesFixed}`);
    console.log(`   Total fixes applied: ${totalFixed}`);
    console.log('=====================================\n');
    console.log('✅ Aggressive cleanup complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
