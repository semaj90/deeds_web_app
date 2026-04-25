#!/usr/bin/env node

/**
 * Phase 80 Chunk 7: Fix Property-Level Object Corruption
 *
 * After Chunk 5 (object literal API calls) and Chunk 6 (backwards colon-comma),
 * we discovered MASSIVE property-level corruption in config objects:
 *
 * Pattern examples from production.ts:
 *
 * 1. PROPERTY-LEVEL CORRUPTION:
 *    BEFORE: port: 5432: name, getEnv: getEnv('DB_NAME', 'legal_ai_db')
 *    AFTER:  port: 5432, name: getEnv('DB_NAME', 'legal_ai_db')
 *
 * 2. GETENV DUPLICATION:
 *    BEFORE: password: getEnv: getEnv('POSTGRES_PASSWORD', '123456')
 *    AFTER:  password: getEnv('POSTGRES_PASSWORD', '123456')
 *
 * 3. BOOLEAN/NUMERIC DUPLICATION:
 *    BEFORE: search: true, json: true, true:
 *    AFTER:  search: true, json: true
 *
 * 4. NUMERIC TRAILING DUPLICATION:
 *    BEFORE: httpPort: 6333, grpcPort: 6334, 6334:
 *    AFTER:  httpPort: 6333, grpcPort: 6334
 *
 * Expected Impact:
 *   - BEFORE: 16,944 "Cannot find name 'password'" errors
 *   - BEFORE: 20,923 "',' expected" errors
 *   - AFTER: Clean object property declarations
 *   - Expected reduction: -20,000 to -30,000 errors
 */

import { glob } from 'glob';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

console.log('🔧 Phase 80 Chunk 7: Fix Property-Level Object Corruption\n');

const files = await glob('src/**/*.{ts,svelte}', {
  cwd: root,
  ignore: ['node_modules/**', '**/*.d.ts', '**/_archive/**', '**/dist/**']
});

console.log(`📋 Found ${files.length} TypeScript/Svelte files\n`);

let fixedCount = 0;
let totalFixes = 0;

for (const file of files) {
  const filePath = join(root, file);
  let content = readFileSync(filePath, 'utf-8');
  let fixed = content;
  let fileFixCount = 0;

  // Pattern 1: Property-level corruption (port: 5432: name, getEnv)
  // Matches: prop: value: nextProp, anything
  // Becomes: prop: value, nextProp: anything
  const propertyLevelPattern = /(\w+):\s*(\d+(?:\.\d+)?|'[^']*'|"[^"]*"|true|false|null):\s*(\w+),/g;
  const propertyMatches = fixed.match(propertyLevelPattern);
  if (propertyMatches) {
    fixed = fixed.replace(propertyLevelPattern, '$1: $2, $3:');
    fileFixCount += propertyMatches.length;
  }

  // Pattern 2: getEnv duplication (password: getEnv: getEnv(...))
  const getEnvPattern = /(\w+):\s*getEnv:\s*(getEnv\([^)]+\))/g;
  const getEnvMatches = fixed.match(getEnvPattern);
  if (getEnvMatches) {
    fixed = fixed.replace(getEnvPattern, '$1: $2');
    fileFixCount += getEnvMatches.length;
  }

  // Pattern 3: Boolean/numeric trailing duplication (search: true, json: true, true:)
  // This is tricky - need to match the pattern carefully
  const trailingBoolPattern = /(\w+):\s*(true|false),\s*(\w+):\s*\2,\s*\2:/g;
  const trailingBoolMatches = fixed.match(trailingBoolPattern);
  if (trailingBoolMatches) {
    fixed = fixed.replace(trailingBoolPattern, '$1: $2, $3: $2');
    fileFixCount += trailingBoolMatches.length;
  }

  // Pattern 4: Numeric trailing duplication (grpcPort: 6334, 6334:)
  const trailingNumPattern = /(\w+):\s*(\d+(?:\.\d+)?),\s*\2:/g;
  const trailingNumMatches = fixed.match(trailingNumPattern);
  if (trailingNumMatches) {
    fixed = fixed.replace(trailingNumPattern, '$1: $2');
    fileFixCount += trailingNumMatches.length;
  }

  // Pattern 5: Fix malformed property chains like "top_k: 40: 40,"
  const propertyChainPattern = /(\w+):\s*(\d+(?:\.\d+)?):\s*\2,/g;
  const propertyChainMatches = fixed.match(propertyChainPattern);
  if (propertyChainMatches) {
    fixed = fixed.replace(propertyChainPattern, '$1: $2,');
    fileFixCount += propertyChainMatches.length;
  }

  // Pattern 6: Fix triple-repetition with trailing colon (repeat_penalty: 1: 1.1,)
  const tripleRepeatPattern = /(\w+):\s*(\d+(?:\.\d+)?):\s*(\d+(?:\.\d+)?),/g;
  const tripleRepeatMatches = fixed.match(tripleRepeatPattern);
  if (tripleRepeatMatches) {
    fixed = fixed.replace(tripleRepeatPattern, (match, prop, val1, val2) => {
      // Use the more specific value (likely val2)
      return `${prop}: ${val2},`;
    });
    fileFixCount += tripleRepeatMatches.length;
  }

  // Pattern 7: Fix score_threshold corruption (scoreThreshold: 0: 0.7,)
  const scoreThresholdPattern = /(\w+):\s*0:\s*(\d+\.\d+),/g;
  const scoreThresholdMatches = fixed.match(scoreThresholdPattern);
  if (scoreThresholdMatches) {
    fixed = fixed.replace(scoreThresholdPattern, '$1: $2,');
    fileFixCount += scoreThresholdMatches.length;
  }

  if (fixed !== content) {
    writeFileSync(filePath, fixed, 'utf-8');
    console.log(`✅ ${file}: ${fileFixCount} fixes`);
    fixedCount++;
    totalFixes += fileFixCount;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${fixedCount}`);
console.log(`   Total fixes: ${totalFixes}`);
console.log(`\n✅ Property-level object corruption fixed!`);

console.log(`\n📊 Expected Impact:`);
console.log(`   - BEFORE: 16,944 "Cannot find name 'password'" errors`);
console.log(`   - BEFORE: 20,923 "',' expected" errors`);
console.log(`   - AFTER: Clean object property declarations`);
console.log(`   - Expected reduction: -20,000 to -30,000 errors`);
console.log(`\n🔍 Next: Run \`npx svelte-check\` to measure impact`);
