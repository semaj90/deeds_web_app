#!/usr/bin/env node
/**
 * Phase 80 Chunk 2: Systematic Corruption Fixer
 *
 * Targets top corrupted files identified in stratification:
 * 1. advanced_cache_manager.ts (998 errors)
 * 2. loki-redis-integration-fixed.ts (762 errors)
 * 3. loki-redis-integration.ts (745 errors)
 * 4. headless-ui-cache.ts (563 errors)
 * 5. gpu-leftover-cache.ts (558 errors)
 * 6. chr-rom-pattern-cache.ts (523 errors)
 *
 * Fixes patterns:
 * - "," expected (20,956 errors) - colon-comma corruption
 * - type-only import misuse (3,854 CommandCenterRoute + 2,064 browser)
 * - 'scale' shorthand property (3,167 errors)
 */

import fs from 'fs/promises';
import path from 'path';

const TARGET_FILES = [
 'src/lib/services/advanced_cache_manager.ts',
 'src/lib/cache/loki-redis-integration-fixed.ts',
 'src/lib/cache/loki-redis-integration.ts',
 'src/lib/cache/headless-ui-cache.ts',
 'src/lib/cache/gpu-leftover-cache.ts',
 'src/lib/cache/chr-rom-pattern-cache.ts',
 'src/lib/services/cached-rag-service.ts',
 'src/lib/stores/chat-store.svelte.ts',
 'src/lib/workers/recursive-evidence-chain-worker.ts',
];

// Corruption patterns with safe regex fixes
const PATTERNS = [
 {
 name: 'param-type-colon-corruption',
 description: 'Fix param: type): returnType: → param: type): returnType',
 regex: /(\w+):\s*(\w+)\):\s*(\w+):\s*Promise/g,
 replacement: '$1: $2): Promise',
 risk: 'safe',
 },
 {
 name: 'setex-signature',
 description: 'Fix setex(key, seconds, value): string: Promise',
 regex: /setex\(([^)]+)\):\s*string:\s*Promise/g,
 replacement: 'setex($1): Promise',
 risk: 'safe',
 },
 {
 name: 'expire-signature',
 description: 'Fix expire(key, seconds): number: Promise',
 regex: /expire\(([^)]+)\):\s*number:\s*Promise/g,
 replacement: 'expire($1): Promise',
 risk: 'safe',
 },
 {
 name: 'publish-signature',
 description: 'Fix publish(channel, message): string: Promise',
 regex: /publish\(([^)]+)\):\s*string:\s*Promise/g,
 replacement: 'publish($1): Promise',
 risk: 'safe',
 },
 {
 name: 'import-type-browser',
 description: 'Fix: import type { browser } → import { browser }',
 regex: /import\s+type\s*{\s*browser\s*}\s*from\s*['"]\$app\/environment['"]/g,
 replacement: "import { browser } from '$app/environment'",
 risk: 'safe',
 },
 {
 name: 'import-type-CommandCenterRoute',
 description: 'Fix: import type { CommandCenterRoute } when used as value',
 regex: /import\s+type\s*{\s*CommandCenterRoute\s*}/g,
 replacement: 'import { CommandCenterRoute }',
 risk: 'safe',
 },
 {
 name: 'drizzle-scale-shorthand',
 description: 'Fix: { precision: 5: scale, 2 } → { precision: 5, scale: 2 }',
 regex: /{\s*precision:\s*(\d+):\s*scale,\s*(\d+)/g,
 replacement: '{ precision: $1, scale: $2',
 risk: 'safe',
 },
];

async function fixFile(filePath) {
 try {
 const fullPath = path.resolve(filePath);
 const content = await fs.readFile(fullPath, 'utf-8');
 let modified = content;
 let totalFixes = 0;
 const appliedPatterns = [];

 for (const pattern of PATTERNS) {
 const matches = content.match(pattern.regex);
 if (matches && matches.length > 0) {
 modified = modified.replace(pattern.regex, pattern.replacement);
 const fixCount = matches.length;
 totalFixes += fixCount;
 appliedPatterns.push({ name: pattern.name, count: fixCount });
 }
 }

 if (totalFixes > 0) {
 await fs.writeFile(fullPath, modified, 'utf-8');
 console.log(`✅ ${path.basename(filePath)}: ${totalFixes} fixes applied`);
 appliedPatterns.forEach(({ name, count }) => {
 console.log(`   - ${name}: ${count} fixes`);
 });
 return { file: filePath, fixes: totalFixes, patterns: appliedPatterns };
 } else {
 console.log(`⏭️  ${path.basename(filePath)}: No patterns matched`);
 return { file: filePath, fixes: 0, patterns: [] };
 }
 } catch (error) {
 console.error(`❌ Error processing ${filePath}:`, error.message);
 return { file: filePath, error: error.message };
 }
}

async function main() {
 console.log('🔧 Phase 80 Chunk 2: Systematic Corruption Fixer\n');
 console.log(`📁 Target files: ${TARGET_FILES.length}`);
 console.log(`🛠️  Patterns: ${PATTERNS.length}\n`);

 const results = [];
 for (const file of TARGET_FILES) {
 const result = await fixFile(file);
 results.push(result);
 }

 console.log('\n📊 Summary:');
 const totalFixes = results.reduce((sum, r) => sum + (r.fixes || 0), 0);
 const fixedFiles = results.filter((r) => r.fixes > 0).length;
 console.log(`   ✅ Total fixes applied: ${totalFixes}`);
 console.log(`   📁 Files modified: ${fixedFiles}/${TARGET_FILES.length}`);

 // Pattern breakdown
 const patternCounts = {};
 results.forEach((r) => {
 if (r.patterns) {
 r.patterns.forEach(({ name, count }) => {
 patternCounts[name] = (patternCounts[name] || 0) + count;
 });
 }
 });

 if (Object.keys(patternCounts).length > 0) {
 console.log('\n🔥 Pattern breakdown:');
 Object.entries(patternCounts)
 .sort(([, a], [, b]) => b - a)
 .forEach(([name, count]) => {
 console.log(`   - ${name}: ${count} fixes`);
 });
 }

 console.log('\n✅ Chunk 2 systematic fix complete!');
 console.log('Next: Run svelte-check to measure impact');
}

main().catch(console.error);
