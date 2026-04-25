#!/usr/bin/env node
/**
 * Phase 96: Advanced Corruption Fixer
 * Handles the specific pattern: `property: value: nextProperty` → `property: value, nextProperty`
 * Found in CaseScoringService.ts lines 578, 583, 597, 752-753
 */

import fs from 'fs';

const COLORS = {
 cyan: '\x1b[36m',
 green: '\x1b[32m',
 yellow: '\x1b[33m',
 red: '\x1b[31m',
 reset: '\x1b[0m',
};

function log(color, ...args) {
 console.log(`${COLORS[color]}${args.join(' ')}${COLORS.reset}`);
}

/**
 * Advanced corruption pattern:
 * Detects: `propertyName: value: nextPropertyName`
 * Fixes to: `propertyName: value, nextPropertyName`
 *
 * Examples:
 * - `evidence_strength: 0.5: witness_reliability` → `evidence_strength: 0.5, witness_reliability`
 * - `caseId: result.caseId: score` → `caseId: result.caseId, score`
 */
function fixColonToCommaPattern(content) {
 let fixed = content;
 let totalFixes = 0;

 // Pattern 1: property: value: nextProperty (generic)
 // Matches: word: expression/value: word
 const pattern1 = /(\w+):\s*([^:]+?):\s*(\w+)/g;
 let matches = [...content.matchAll(pattern1)];

 for (const match of matches) {
 const [fullMatch, prop1, value, prop2] = match;

 // Skip if this looks like a ternary operator
 if (value.includes('?') || value.trim().endsWith('?')) {
 continue;
 }

 // Skip if value is a type annotation (contains | or &)
 if (value.includes('|') || value.includes('&')) {
 continue;
 }

 const replacement = `${prop1}: ${value.trim()}, ${prop2}`;
 fixed = fixed.replace(fullMatch, replacement);
 totalFixes++;
 log('green', ` ✓ Fixed: ${fullMatch.substring(0, 50)}... → ${replacement.substring(0, 50)}...`);
 }

 return { content: fixed, fixes: totalFixes };
}

/**
 * Fix semicolons between properties in interfaces
 * Pattern: `property: type; nextProperty: type;`
 * Should be: `property: type, nextProperty: type,`
 */
function fixInterfaceSemicolons(content) {
 let fixed = content;
 let totalFixes = 0;

 // Only fix semicolons within interface blocks
 const interfaceRegex = /export interface \w+\s*{([^}]+)}/gs;
 const matches = [...content.matchAll(interfaceRegex)];

 for (const match of matches) {
 const [fullInterface, body] = match;

 // Replace semicolons with commas in property definitions
 // Pattern: `: type;` → `: type,`
 const fixedBody = body.replace(/:\s*([^;]+);/g, (match, type) => {
 totalFixes++;
 return `: ${type.trim()},`;
 });

 fixed = fixed.replace(fullInterface, fullInterface.replace(body, fixedBody));
 }

 return { content: fixed, fixes: totalFixes };
}

async function processFile(filePath, options = {}) {
 const { dryRun = false, verbose = false } = options;

 log('cyan', '\n🔧 Phase 96: Advanced Corruption Fixer');
 log('cyan', '═'.repeat(80));
 log('yellow', dryRun ? 'Mode: DRY RUN' : 'Mode: APPLY FIXES');
 log('yellow', `Target: ${filePath}\n`);

 if (!fs.existsSync(filePath)) {
 log('red', `❌ File not found: ${filePath}`);
 process.exit(1);
 }

 const originalContent = fs.readFileSync(filePath, 'utf-8');
 let currentContent = originalContent;
 let totalFixes = 0;

 // Pass 1: Fix interface semicolons
 log('yellow', '📋 Pass 1: Interface semicolons → commas');
 const pass1 = fixInterfaceSemicolons(currentContent);
 currentContent = pass1.content;
 totalFixes += pass1.fixes;
 log('green', ` ✓ ${pass1.fixes} fixes applied\n`);

 // Pass 2: Fix colon-to-comma corruption
 log('yellow', '📋 Pass 2: Colon → comma in object properties');
 const pass2 = fixColonToCommaPattern(currentContent);
 currentContent = pass2.content;
 totalFixes += pass2.fixes;
 log('green', ` ✓ ${pass2.fixes} fixes applied\n`);

 // Pass 3: Multi-pass colon-to-comma until no more fixes
 let passNum = 3;
 let previousFixes = 0;

 do {
 previousFixes = totalFixes;
 log('yellow', `📋 Pass ${passNum}: Additional colon → comma fixes`);
 const passResult = fixColonToCommaPattern(currentContent);
 currentContent = passResult.content;
 totalFixes += passResult.fixes;
 log('green', ` ✓ ${passResult.fixes} fixes applied\n`);
 passNum++;
 } while (passResult.fixes > 0 && passNum < 10);

 log('cyan', `\n✅ Completed in ${passNum - 1} passes`);
 log('cyan', `📊 Total fixes applied: ${totalFixes}\n`);

 if (dryRun) {
 log('yellow', '⚠️  DRY RUN MODE - No files modified\n');

 if (verbose && totalFixes > 0) {
 log('cyan', '📄 Preview of changes:\n');
 const diff = require('diff');
 const changes = diff.diffLines(originalContent, currentContent);

 changes.slice(0, 20).forEach(part => {
 const color = part.added ? 'green' : part.removed ? 'red' : 'reset';
 const prefix = part.added ? '+' : part.removed ? '-' : ' ';
 part.value.split('\n').slice(0, 5).forEach(line => {
 if (line.trim()) log(color, `${prefix} ${line}`);
 });
 });
 }
 } else {
 fs.writeFileSync(filePath, currentContent, 'utf-8');
 log('green', `✅ File updated: ${filePath}\n`);
 }

 return totalFixes;
}

// CLI
const args = process.argv.slice(2);
const filePath = args.find(arg => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');

if (!filePath) {
 console.log('Usage: node phase96-advanced-corruption-fixer.mjs <file> [--dry-run] [--verbose]');
 console.log('\nExample:');
 console.log(' node phase96-advanced-corruption-fixer.mjs src/lib/server/services/CaseScoringService.ts --dry-run');
 process.exit(1);
}

processFile(filePath, { dryRun, verbose }).catch(err => {
 console.error('Error:', err);
 process.exit(1);
});
