#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../sveltekit-frontend/src');

console.log('🔥 Final Aggressive TypeScript Cleanup - TS1005 Focus');
console.log('=======================================================\n');

// Walk directory recursively
async function* walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    const path_ = path.join(dir, file);
    if (fs.statSync(path_).isDirectory()) {
      yield* walk(path_);
    } else {
      yield path_;
    }
  }
}

const patterns = [
  // Single-line interface fix: on one line with bad tokens
  {
    name: 'Broken single-line function declaration - stray commas in params',
    // Matches like: declare function foo(param: Type, anotherParam: Type) => ReturnType
    regex: /function\s+\w+\s*\(\s*([^)]*),\s*\)/g,
    replace: 'function $1)'
  },
  {
    name: 'Single-line interface property declarations with stray commas before semicolon',
    regex: /([a-zA-Z_]\w*\s*\?\s*:\s*[^;,]+)\s*,\s*;/g,
    replace: '$1;'
  },
  {
    name: 'Remove trailing comma before closing brace in object literals',
    regex: /,\s*\}/g,
    replace: ' }'
  },
  {
    name: 'Remove stray comma in parameter list (,))',
    regex: /,\s*\)/g,
    replace: ')'
  },
  {
    name: 'Remove stray commas in array brackets',
    regex: /,\s*\]/g,
    replace: ']'
  },
  {
    name: 'Fix colon missing after property name in objects: prop, value',
    regex: /(\w+)\s*,\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    replace: '$1: $2:'
  },
  {
    name: 'Fix property with stray comma instead of colon',
    regex: /([a-zA-Z_]\w*)\s*,\s+([a-zA-Z_]\w*\s*\??\s*:\s*)/g,
    replace: '$1: $2'
  },
  {
    name: 'Remove stray commas after type annotations before closing bracket',
    regex: /:\s*([A-Za-z_<>\[\]\{\}|&\s]+)\s*,\s*\}/g,
    replace: ': $1 }'
  },
  {
    name: 'Fix interface method signatures with stray commas',
    regex: /(\w+)\s*\(\s*([^)]*),\s*\):/g,
    replace: '$1($2):'
  },
  {
    name: 'Fix constructor declarations with stray comma',
    regex: /constructor\s*\(\s*([^)]*),\s*\)\s*\{/g,
    replace: 'constructor($1) {'
  },
  {
    name: 'Fix arrow function params with stray comma before closing paren',
    regex: /=>\s*\(\s*([^)]*),\s*\)\s*=>/g,
    replace: '=> ($1) =>'
  },
  {
    name: 'Remove colon at end of line (TypeScript artifact)',
    regex: /:\s*$/gm,
    replace: ''
  },
  {
    name: 'Fix type union with dangling comma: | , Type',
    regex: /\|\s*,/g,
    replace: ' |'
  },
  {
    name: 'Fix generic type with stray comma: Type<T, , U>',
    regex: /,\s*,/g,
    replace: ','
  },
  {
    name: 'Normalize multiple spaces in line (compress)',
    regex: /\s{2,}/g,
    replace: ' '
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
      const relPath = path.relative(srcDir, filePath);
      if (fileFixed > 50) {
        console.log(`✅ ${relPath}: ${fileFixed} fixes (HEAVY)`);
      } else if (fileFixed > 10) {
        console.log(`✅ ${relPath}: ${fileFixed} fixes`);
      }
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

    console.log(`📁 Processing ${files.length} files...\n`);

    for (const file of files) {
      await processFile(file);
    }

    console.log('\n=======================================================');
    console.log(`📊 Results:`);
    console.log(`   Files processed: ${filesProcessed}`);
    console.log(`   Files fixed: ${filesFixed}`);
    console.log(`   Total token fixes applied: ${totalFixed}`);
    console.log('=======================================================\n');
    console.log('✅ Final aggressive cleanup complete!');
    console.log('\n📌 Next steps:');
    console.log('   1. npm run check:typescript 2>&1 | grep -c "error TS"');
    console.log('   2. Check remaining error types if still high');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
