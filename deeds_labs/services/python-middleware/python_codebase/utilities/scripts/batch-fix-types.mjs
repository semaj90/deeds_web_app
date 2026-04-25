#!/usr/bin/env node
/**
 * Batch fix stray commas in all priority type files
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const topFiles = [
  'sveltekit-frontend/src/lib/types/langchain-ollama-types.ts',
  'sveltekit-frontend/src/lib/types/yorha-interface.ts',
  'sveltekit-frontend/src/lib/types/xstate.ts',
  'sveltekit-frontend/src/lib/types/api.ts',
  'sveltekit-frontend/src/lib/types/nats-messaging.ts',
  'sveltekit-frontend/src/lib/types/global.ts',
  'sveltekit-frontend/src/lib/types/orchestration.ts',
  'sveltekit-frontend/src/lib/types/cluster.ts',
  'sveltekit-frontend/src/lib/types/llm.ts',
];

console.log('🔧 Batch fixing stray commas in top priority type files\n');
console.log('═'.repeat(80));

let totalFixed = 0;

for (const file of topFiles) {
  const fullPath = path.join(process.cwd(), file);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  SKIP: ${path.basename(file)} (not found)`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let original = content;
  let fixCount = 0;

  // Fix pattern 1: interface Name {, field:
  const before1 = content;
  content = content.replace(/(\{),\s+([a-zA-Z_$])/g, (match, brace, field) => {
    fixCount++;
    return brace + ' ' + field;
  });
  if (content !== before1) console.log(`  ✓ Pattern 1 (brace comma)`);

  // Fix pattern 2: ;, field:
  const before2 = content;
  content = content.replace(/;,\s+([a-zA-Z_$])/g, (match, field) => {
    fixCount++;
    return '; ' + field;
  });
  if (content !== before2) console.log(`  ✓ Pattern 2 (semicolon comma)`);

  // Fix pattern 3: leading comma
  const before3 = content;
  content = content.replace(/\n\s*,\s+([a-zA-Z_$])/g, (match, field) => {
    fixCount++;
    return '\n  ' + field;
  });
  if (content !== before3) console.log(`  ✓ Pattern 3 (leading comma)`);

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    totalFixed += fixCount;
    console.log(`✅ ${path.basename(file)}: ${fixCount} fixed\n`);
  } else {
    console.log(`✅ ${path.basename(file)}: already clean\n`);
  }
}

console.log('═'.repeat(80));
console.log(`\n🎉 Total fixes applied: ${totalFixed}\n`);
console.log('💡 Next: Run the error analysis again to see improvement\n');
console.log('   node scripts/prioritize-error-fixes.mjs\n');
