#!/usr/bin/env node

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const args = process.argv.filter(arg => !arg.startsWith('--') && !arg.includes('node') && !arg.endsWith('.mjs'));
const TARGET = args.length > 0 ? args[0] : 'src';

console.log(`\n🔧 Phase 2: Colon Syntax Fixer\n${'═'.repeat(60)}`);
console.log(`Mode: ${DRY_RUN || !APPLY ? 'DRY RUN' : 'APPLY FIXES'}`);
console.log(`Target: ${TARGET}\n`);

// Patterns to fix
const PATTERNS = [
  {
    name: 'Duplicate colon in object properties',
    regex: /(\w+):\s*(\w+\.\w+):\s*(\w+\.\w+)/g,
    fix: '$1: $2.$3',
    example: 'caseId: body.caseId: content.content → caseId: body.caseId.content'
  },
  {
    name: 'Colon instead of pipe in union types',
    regex: /(\w+\??):\s*(string|number|Date|boolean)\s*:\s*null/g,
    fix: '$1: $2 | null',
    example: 'incidentDate?: string: null → incidentDate?: string | null'
  },
  {
    name: 'Colon instead of pipe in multi-type union',
    regex: /:\s*(string|number|boolean)\s*\|\s*(string|number|boolean|Date)\s*:\s*null/g,
    fix: ': $1 | $2 | null',
    example: 'value: string | Date: null → value: string | Date | null'
  },
  {
    name: 'Triple colon corruption',
    regex: /(\w+):\s*(\w+):\s*(\w+):\s*(\w+)/g,
    fix: '$1: $2.$3.$4',
    example: 'data: obj: prop: val → data: obj.prop.val'
  }
];

let totalFiles = 0;
let totalFixes = 0;
const fixedFiles = [];

async function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let fileFixCount = 0;
  let madeChanges = true;
  let passCount = 0;

  // Run multiple passes until no more changes
  while (madeChanges && passCount < 10) {
    madeChanges = false;
    passCount++;

    for (const pattern of PATTERNS) {
      const before = newContent;
      newContent = newContent.replace(pattern.regex, pattern.fix);

      if (before !== newContent) {
        const matches = [...before.matchAll(pattern.regex)];
        if (passCount === 1) {
          console.log(`  [${pattern.name}] ${matches.length} matches in ${path.relative(process.cwd(), filePath)}`);
        }
        fileFixCount += matches.length;
        totalFixes += matches.length;
        madeChanges = true;
      }
    }
  }

  if (fileFixCount > 0) {
    fixedFiles.push({
      path: filePath,
      fixes: fileFixCount
    });

    if (APPLY && !DRY_RUN) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`  ✅ Applied ${fileFixCount} fixes to ${path.basename(filePath)} (${passCount} passes)`);
    } else {
      console.log(`  [DRY] Would apply ${fileFixCount} fixes to ${path.basename(filePath)} (${passCount} passes)`);
    }
  }

  return fileFixCount;
}

async function main() {
  const files = await glob(`${TARGET}/**/*.{ts,svelte,js}`, {
    ignore: ['**/node_modules/**', '**/build/**', '**/.svelte-kit/**']
  });

  console.log(`Found ${files.length} files to analyze\n`);

  for (const file of files) {
    const fixes = await fixFile(file);
    if (fixes > 0) {
      totalFiles++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`\n📊 Summary:\n`);
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with fixes: ${totalFiles}`);
  console.log(`  Total fixes applied: ${totalFixes}`);

  if (fixedFiles.length > 0) {
    console.log(`\n📁 Top 10 Fixed Files:\n`);
    fixedFiles
      .sort((a, b) => b.fixes - a.fixes)
      .slice(0, 10)
      .forEach((file, idx) => {
        console.log(`  ${idx + 1}. ${path.relative(process.cwd(), file.path)} (${file.fixes} fixes)`);
      });
  }

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN MODE - No files were modified`);
    console.log(`   Run without --dry-run to apply fixes\n`);
  } else {
    console.log(`\n✅ Fixes applied successfully!\n`);
  }
}

main().catch(console.error);
