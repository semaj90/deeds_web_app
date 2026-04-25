#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const TARGET_FILES = [
  'src/lib/components/three/yorha-ui/NESYoRHaHybrid3D.ts',
  'src/lib/components/three/yorha-ui/components/YoRHaButtonAA3D.ts',
  'src/lib/server/adapters/service-integrations.ts',
  'src/lib/cache/parallel-cache-orchestrator.ts',
  'src/lib/server/storage/minio-service.ts'
];

// Common syntax error patterns to fix
const FIXES = [
  // Interface/type property fixes
  { pattern: /(\s+)(\w+)\?,\s*([\w\[\]<>|]+);/g, replacement: '$1$2?: $3;', desc: 'Fix optional property syntax' },
  { pattern: /(\s+)(\w+),\s*([\w\[\]<>|.]+);/g, replacement: '$1$2: $3;', desc: 'Fix property type separator' },

  // Array/object literal fixes
  { pattern: /\[\s*key,\s*string\s*\],\s*unknown/g, replacement: '[key: string]: unknown', desc: 'Fix index signature' },

  // Function parameter fixes
  { pattern: /\(([^)]+)\);([^)]+)\):/g, replacement: '($1, $2):', desc: 'Fix function parameter list' },

  // Variable declaration fixes
  { pattern: /const\s+(\w+),\s*(\w+)/g, replacement: 'const $1: $2', desc: 'Fix variable type annotation' },
  { pattern: /let\s+(\w+),\s*(\w+)/g, replacement: 'let $1: $2', desc: 'Fix let type annotation' },

  // Missing semicolons after closing braces
  { pattern: /}\s*,\s*}/g, replacement: '}\n}', desc: 'Fix nested brace closing' },

  // Malformed console.log
  { pattern: /console\.(log|warn|error)\([^)]+,\s*}/g, replacement: (match) => match.replace(', }', ');}'), desc: 'Fix console statement closing' },

  // Protected/private property type fixes
  { pattern: /(protected|private)\s+(\w+)\s*\|\s*undefined;/g, replacement: '$1 $2: any | undefined;', desc: 'Fix optional property type' },
];

let totalFixed = 0;
let totalFiles = 0;

for (const filePath of TARGET_FILES) {
  try {
    console.log(`\n📝 Processing: ${filePath}`);

    let content = readFileSync(filePath, 'utf-8');
    let fixCount = 0;

    for (const fix of FIXES) {
      const before = content;
      content = content.replace(fix.pattern, fix.replacement);
      const changes = content.length !== before.length;
      if (changes) {
        fixCount++;
        console.log(`  ✓ ${fix.desc}`);
      }
    }

    if (fixCount > 0) {
      writeFileSync(filePath, content, 'utf-8');
      console.log(`  ✅ Applied ${fixCount} fixes`);
      totalFixed += fixCount;
      totalFiles++;

      // Check errors after fix
      try {
        const errors = execSync(`npx tsc --noEmit ${filePath} 2>&1 | Select-String "error" | Measure-Object -Line`, {
          encoding: 'utf-8',
          shell: 'powershell.exe'
        });
        console.log(`  📊 ${errors.trim()}`);
      } catch (e) {
        // tsc returns non-zero on errors, that's ok
      }
    } else {
      console.log(`  ⏭️  No pattern matches found`);
    }
  } catch (error) {
    console.error(`  ❌ Error processing ${filePath}:`, error.message);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ Batch processing complete`);
console.log(`   Files processed: ${totalFiles}`);
console.log(`   Total fixes: ${totalFixed}`);
