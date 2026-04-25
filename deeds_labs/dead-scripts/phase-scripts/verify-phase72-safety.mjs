#!/usr/bin/env node

/**
 * PHASE 72 SAFETY VERIFICATION SCRIPT
 *
 * Runs comprehensive checks before Phase 72 Tier 2 batch:
 * 1. PowerShell UTF-8 hardening
 * 2. Patch safety gate validation
 * 3. CLI parsing tests
 * 4. Mojibake scan
 * 5. Factory fixer readiness
 *
 * Usage:
 *   node scripts/verify-phase72-safety.mjs
 *   node scripts/verify-phase72-safety.mjs --verbose
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    createSafeProgress,
    parseArgs,
    scanForMojibake,
    validatePatch
} from './patch-safety-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERBOSE = process.argv.includes('--verbose');

let passed = 0;
let failed = 0;

function test(name, fn) {
  process.stderr.write(`🧪 ${name}... `);
  try {
    fn();
    console.error('✅');
    passed++;
  } catch (e) {
    console.error(`❌\n   ${e.message}`);
    failed++;
  }
}

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     PHASE 72 SAFETY VERIFICATION SUITE              ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// ============================================================
// SECTION 1: PATCH SAFETY GATE
// ============================================================

console.log('📋 PATCH SAFETY GATE TESTS\n');

test('Accepts valid TypeScript', () => {
  const valid = `
    export interface User {
      id: string;
      name: string;
    }

    export const createUser = (name: string): User => ({
      id: Math.random().toString(),
      name
    });
  `;
  validatePatch(valid, 'test.ts');
});

test('Rejects box-drawing characters', () => {
  const invalid = `const msg = "Progress: 50% ─────────────────────";`;
  try {
    validatePatch(invalid, 'test.ts');
    throw new Error('Should have rejected box-drawing chars');
  } catch (e) {
    if (!e.message.includes('Forbidden character')) throw e;
  }
});

test('Rejects Progress: string', () => {
  const invalid = `console.log("Progress: 50%");`;
  try {
    validatePatch(invalid, 'test.ts');
    throw new Error('Should have rejected Progress: string');
  } catch (e) {
    if (!e.message.includes('Forbidden character')) throw e;
  }
});

test('Rejects Current: Step: string', () => {
  const invalid = `// Current: Step: Analyzing files...`;
  try {
    validatePatch(invalid, 'test.ts');
    throw new Error('Should have rejected Current: Step: string');
  } catch (e) {
    if (!e.message.includes('Forbidden character')) throw e;
  }
});

test('Rejects dingbats/emojis', () => {
  const invalid = `const icons = ["✓", "✗", "⚠️", "🎉"];`;
  try {
    validatePatch(invalid, 'test.ts');
    throw new Error('Should have rejected dingbats');
  } catch (e) {
    if (!e.message.includes('Forbidden character')) throw e;
  }
});

// ============================================================
// SECTION 2: CLI PARSING
// ============================================================

console.log('\n📝 CLI ARGUMENT PARSING TESTS\n');

test('Parses --flag correctly', () => {
  const args = parseArgs(['--stats', '--verbose', '--input', 'file.json']);
  if (!args.flags.has('--stats')) throw new Error('--stats not detected');
  if (!args.flags.has('--verbose')) throw new Error('--verbose not detected');
  if (args.values.input !== 'file.json') throw new Error('input value incorrect');
});

test('Handles --key=value syntax', () => {
  const args = parseArgs(['--input=reports/errors.json', '--batch=50']);
  if (args.values.input !== 'reports/errors.json') throw new Error('--input=value not parsed');
  if (args.values.batch !== '50') throw new Error('--batch=value not parsed');
});

test('Does not treat --flag as value', () => {
  const args = parseArgs(['--input', '--stats']);
  if (args.values.input === '--stats') throw new Error('--stats treated as input value');
  if (!args.flags.has('--stats')) throw new Error('--stats not recognized as flag');
});

test('Handles mixed flags and values', () => {
  const args = parseArgs(['--tier', '2', '--path', 'src/**', '--limit', '100', '--verify', 'npm run check:ultra-fast']);
  if (args.values.tier !== '2') throw new Error('tier value incorrect');
  if (args.values.path !== 'src/**') throw new Error('path value incorrect');
  if (args.values.limit !== '100') throw new Error('limit value incorrect');
  if (args.values.verify !== 'npm run check:ultra-fast') throw new Error('verify value incorrect');
});

// ============================================================
// SECTION 3: SAFE PROGRESS
// ============================================================

console.log('\n📊 SAFE PROGRESS REPORTING TEST\n');

test('Creates progress bar without crashing', () => {
  const progress = createSafeProgress();
  progress.tick(0, 100, 'Starting');
  progress.tick(50, 100, 'Processing');
  progress.tick(100, 100, 'Finishing');
  // Done message goes to stderr, so no error
});

// ============================================================
// SECTION 4: MOJIBAKE SCAN
// ============================================================

console.log('\n🔍 MOJIBAKE SCANNING TEST\n');

test('Detects box-drawing characters in files', () => {
  // Create temporary test file
  const tmpDir = path.join(__dirname, '..', '.tmp-phase72-test');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const testFile = path.join(tmpDir, 'test-mojibake.ts');
  fs.writeFileSync(testFile, `const msg = "Progress: 50% ─────────";`, 'utf-8');

  const violations = scanForMojibake(tmpDir);
  fs.rmSync(tmpDir, { recursive: true });

  if (violations.length === 0) throw new Error('Failed to detect box-drawing chars');
  if (violations[0].file !== testFile) throw new Error('Wrong file detected');
  // Check that we detected U+2500 (EN DASH) or similar box-drawing
  if (!violations[0].code.startsWith('U+')) throw new Error('Invalid character code format');
});

test('Returns empty for clean files', () => {
  const tmpDir = path.join(__dirname, '..', '.tmp-phase72-clean');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const testFile = path.join(tmpDir, 'test-clean.ts');
  fs.writeFileSync(testFile, `const msg = "All ASCII characters OK";`, 'utf-8');

  const violations = scanForMojibake(tmpDir);
  fs.rmSync(tmpDir, { recursive: true });

  if (violations.length !== 0) throw new Error('False positive: detected mojibake in clean file');
});

// ============================================================
// SECTION 5: FACTORY FIXER READINESS
// ============================================================

console.log('\n🏭 FACTORY FIXER READINESS TEST\n');

test('factory-fixer-v2.mjs imports patch safety gate', () => {
  const fixer = fs.readFileSync(path.join(__dirname, 'factory-fixer-v2.mjs'), 'utf-8');
  if (!fixer.includes("import { validatePatch, writePatchedFile")) {
    throw new Error('factory-fixer-v2.mjs missing patch safety gate import');
  }
});

test('persist-errors.mjs has fixed CLI parsing', () => {
  const persist = fs.readFileSync(path.join(__dirname, 'persist-errors.mjs'), 'utf-8');
  if (!persist.includes('const FLAGS = new Set(args.filter')) {
    throw new Error('persist-errors.mjs missing safe argument parsing');
  }
  if (!persist.includes('const SHOW_STATS = FLAGS.has')) {
    throw new Error('persist-errors.mjs missing --stats flag handling');
  }
});

test('patch-safety-gate.mjs exists and exports functions', () => {
  if (!fs.existsSync(path.join(__dirname, 'patch-safety-gate.mjs'))) {
    throw new Error('patch-safety-gate.mjs not found');
  }
  const gate = fs.readFileSync(path.join(__dirname, 'patch-safety-gate.mjs'), 'utf-8');
  if (!gate.includes('export function validatePatch')) throw new Error('validatePatch not exported');
  if (!gate.includes('export function createSafeProgress')) throw new Error('createSafeProgress not exported');
  if (!gate.includes('export function scanForMojibake')) throw new Error('scanForMojibake not exported');
});

test('hardening-utf8.ps1 exists', () => {
  if (!fs.existsSync(path.join(__dirname, 'hardening-utf8.ps1'))) {
    throw new Error('hardening-utf8.ps1 not found');
  }
});

// ============================================================
// SECTION 6: DOCUMENTATION
// ============================================================

console.log('\n📚 DOCUMENTATION CHECK\n');

test('Safety hardening guide exists', () => {
  const guide = path.join(__dirname, '..', 'PHASE72_SAFETY_HARDENING.md');
  if (!fs.existsSync(guide)) throw new Error('PHASE72_SAFETY_HARDENING.md not found');
});

test('Error buckets guide exists', () => {
  const guide = path.join(__dirname, '..', 'PHASE72_ERROR_BUCKETS.md');
  if (!fs.existsSync(guide)) throw new Error('PHASE72_ERROR_BUCKETS.md not found');
});

// ============================================================
// RESULTS
// ============================================================

console.log('\n' + '═'.repeat(52));
console.log(`✅ PASSED: ${passed}`);
console.log(`❌ FAILED: ${failed}`);
console.log('═'.repeat(52));

if (failed === 0) {
  console.log('\n🎉 ALL SAFETY CHECKS PASSED!\n');
  console.log('Ready for Phase 72 Tier 2 batch:\n');
  console.log('  1. Run PowerShell hardening:');
  console.log('     . .\\scripts\\hardening-utf8.ps1\n');
  console.log('  2. Run factory fixer:');
  console.log('     node scripts/factory-fixer-v2.mjs --plan --tier 2\n');
  console.log('  3. Apply with safety gate:');
  console.log('     node scripts/factory-fixer-v2.mjs --apply --tier 2 --limit 100 --verify "npm run check:ultra-fast"\n');
  process.exit(0);
} else {
  console.log('\n⚠️  SOME CHECKS FAILED\n');
  console.log('Review errors above and re-run verification.\n');
  process.exit(1);
}
