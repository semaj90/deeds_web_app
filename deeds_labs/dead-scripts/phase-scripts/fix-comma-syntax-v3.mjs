// Phase 99: Comprehensive Comma-to-Colon Syntax Fixer V3
import fs from 'fs';
import { glob } from 'glob';

const DRY_RUN = !process.argv.includes('--apply');

const PATTERNS = [
  // Svelte bind directive
  { find: /bind,\s*value=/g, replace: 'bind:value=' },
  { find: /bind,\s*checked=/g, replace: 'bind:checked=' },
  { find: /bind,\s*group=/g, replace: 'bind:group=' },
  { find: /bind,\s*this=/g, replace: 'bind:this=' },

  // TypeScript catch blocks: (error, Error | unknown)
  { find: /\(error,\s*(Error\s*\|\s*unknown)\)/g, replace: '(error: $1)' },
  { find: /catch\s*\(error,\s*(Error\s*\|\s*unknown)\)/g, replace: 'catch (error: $1)' },
  { find: /\(err,\s*(Error\s*\|\s*unknown)\)/g, replace: '(err: $1)' },

  // Private class members: private: name, Type
  { find: /private:\s*(\w+),\s*(\w+)/g, replace: 'private $1: $2' },
  { find: /public:\s*(\w+),\s*(\w+)/g, replace: 'public $1: $2' },
  { find: /readonly:\s*(\w+),\s*(\w+)/g, replace: 'readonly $1: $2' },

  // Function parameters: (name, Type)
  { find: /\((\w+),\s*(string|number|boolean|any|unknown)\)/g, replace: '($1: $2)' },
  { find: /\((\w+),\s*(string|number|boolean|any|unknown)\[\]\)/g, replace: '($1: $2[])' },

  // Object properties with variable names
  { find: /(\w+),\s*(\w+)\.(\w+)/g, replace: '$1: $2.$3' },

  // Generic comma-before-type patterns
  { find: /,\s*Error\s*\|\s*unknown\s*\)/g, replace: ': Error | unknown)' },

  // Errors array pattern
  { find: /errors,\s*string\[\]/g, replace: 'errors: string[]' },
  { find: /errors,\s*string\b/g, replace: 'errors: string' },

  // Files array pattern
  { find: /files,\s*File\[\]/g, replace: 'files: File[]' },

  // Common parameter patterns
  { find: /\(key,\s*string\)/g, replace: '(key: string)' },
  { find: /\(value,\s*string\)/g, replace: '(value: string)' },
  { find: /\(id,\s*string\)/g, replace: '(id: string)' },
  { find: /\(name,\s*string\)/g, replace: '(name: string)' },
  { find: /\(path,\s*string\)/g, replace: '(path: string)' },
  { find: /\(url,\s*string\)/g, replace: '(url: string)' },
  { find: /\(query,\s*string\)/g, replace: '(query: string)' },
  { find: /\(msg,\s*string\)/g, replace: '(msg: string)' },
  { find: /\(data,\s*any\)/g, replace: '(data: any)' },
  { find: /\(data,\s*unknown\)/g, replace: '(data: unknown)' },
  { find: /\(event,\s*Event\)/g, replace: '(event: Event)' },
  { find: /\(e,\s*Event\)/g, replace: '(e: Event)' },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLYING FIXES'}`);
  console.log(`Patterns: ${PATTERNS.length}`);

  const files = await glob('src/**/*.{ts,svelte}', {
    ignore: ['**/node_modules/**', '**/*.*backup*', '**/*.*bak*', '**/.svelte-kit/**']
  });

  let totalFixes = 0;
  let filesToFix = 0;

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    let original = content;
    let fileFixes = 0;

    for (const p of PATTERNS) {
      const matches = content.match(p.find);
      if (matches) {
        content = content.replace(p.find, p.replace);
        fileFixes += matches.length;
      }
    }

    if (content !== original) {
      filesToFix++;
      totalFixes += fileFixes;
      if (DRY_RUN) {
        console.log(`[DRY] ${fileFixes} fixes in ${file}`);
      } else {
        fs.writeFileSync(file, content);
        console.log(`✅ ${fileFixes} fixes in ${file}`);
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Found ${totalFixes} issues in ${filesToFix} files.`);
  if (DRY_RUN) {
    console.log(`Run with --apply to apply changes.`);
  } else {
    console.log(`Applied ${totalFixes} fixes.`);
  }
}

main();
