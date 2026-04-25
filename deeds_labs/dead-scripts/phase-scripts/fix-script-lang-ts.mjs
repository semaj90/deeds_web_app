#!/usr/bin/env node
/**
 * Fix script tags missing lang="ts" attribute
 * Phase 107 - Quick ~156 error reduction
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');
const srcDir = path.resolve(process.cwd(), 'src');

async function main() {
  console.log('🔧 Phase 107: Adding lang="ts" to script tags');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.log('');

  const files = await glob('**/*.svelte', { cwd: srcDir, absolute: true });
  let totalFixed = 0;
  let filesModified = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let modified = content;
    let fixCount = 0;

    // Pattern 1: <script> without lang attribute at all
    modified = modified.replace(/<script(\s*)>/g, (match, space) => {
      fixCount++;
      return `<script${space}lang="ts">`;
    });

    // Pattern 2: <script context="module"> without lang
    modified = modified.replace(/<script(\s+)context="module"(\s*)>/g, (match, s1, s2) => {
      fixCount++;
      return `<script${s1}lang="ts" context="module"${s2}>`;
    });

    // Pattern 3: <script context='module'> without lang (single quotes)
    modified = modified.replace(/<script(\s+)context='module'(\s*)>/g, (match, s1, s2) => {
      fixCount++;
      return `<script${s1}lang="ts" context="module"${s2}>`;
    });

    if (fixCount > 0 && modified !== content) {
      totalFixed += fixCount;
      filesModified++;

      if (!DRY_RUN) {
        fs.writeFileSync(file, modified, 'utf8');
      }

      const relPath = path.relative(srcDir, file);
      console.log(`  ✅ ${relPath} (${fixCount} fix${fixCount > 1 ? 'es' : ''})`);
    }
  }

  console.log('');
  console.log('━'.repeat(50));
  console.log(`📊 Summary:`);
  console.log(`   Files scanned: ${files.length}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Script tags fixed: ${totalFixed}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes written)' : 'APPLIED'}`);

  if (DRY_RUN && totalFixed > 0) {
    console.log('');
    console.log('💡 Run without --dry-run to apply fixes');
  }
}

main().catch(console.error);
