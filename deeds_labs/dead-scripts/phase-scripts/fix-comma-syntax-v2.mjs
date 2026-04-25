// Phase 99: Comma Syntax Fixer V2
import fs from 'fs';
import { glob } from 'glob';

const DRY_RUN = !process.argv.includes('--apply');

const PATTERNS = [
  // Fix: errors, string[] -> errors: string[]
  { find: /errors,\s*string\[\]/g, replace: 'errors: string[]' },
  // Fix: errors, string -> errors: string
  { find: /errors,\s*string\b/g, replace: 'errors: string' },
  // Fix: ( error: -> ( error,
  { find: /\(\s*error:\s*/g, replace: '(error, ' },
  // Fix: files, File[] -> files: File[]
  { find: /files,\s*File\[\]/g, replace: 'files: File[]' },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (No changes)' : 'APPLYING FIXES'}`);

  const files = await glob('src/**/*.{ts,svelte}', {
    ignore: ['**/node_modules/**', '**/*.*backup*', '**/*.*bak*']
  });

  let totalFixes = 0;
  let filesToFix = 0;

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    let original = content;
    let fileFixes = 0;

    for (const p of PATTERNS) {
      if (content.match(p.find)) {
        const count = (content.match(p.find) || []).length;
        content = content.replace(p.find, p.replace);
        fileFixes += count;
      }
    }

    if (content !== original) {
      filesToFix++;
      totalFixes += fileFixes;
      if (DRY_RUN) {
        console.log(`[DRY] Would fix ${fileFixes} issues in ${file}`);
      } else {
        fs.writeFileSync(file, content);
        console.log(`✅ Fixed ${fileFixes} issues in ${file}`);
      }
    }
  }

  if (DRY_RUN) {
    console.log(`\nFound ${totalFixes} issues in ${filesToFix} files.`);
    console.log(`Run with --apply to apply changes.`);
  } else {
    console.log(`\nFixed ${totalFixes} issues in ${filesToFix} files.`);
  }
}

main();
