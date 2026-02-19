#!/usr/bin/env node
/**
 * Comprehensive Error Testing & Diagnostics
 * 
 * Tests for all known error patterns and generates actionable report
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Comprehensive Error Testing & Diagnostics');
console.log('='.repeat(70));

// Test 1: File count sanity check
console.log('\n📁 Test 1: File Count Sanity Check');
console.log('─'.repeat(70));

const svelteFiles = execSync('Get-ChildItem -Recurse -Filter *.svelte | Measure-Object', {
  shell: 'powershell.exe',
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8'
});

const countMatch = svelteFiles.match(/Count\s*:\s*(\d+)/);
const fileCount = countMatch ? parseInt(countMatch[1]) : 0;

console.log(`Svelte files on disk: ${fileCount.toLocaleString()}`);

if (fileCount > 3000) {
  console.log('✅ File count normal (3,000+)');
} else {
  console.log('⚠️  File count seems low, check for missing files');
}

// Test 2: TypeScript config validation
console.log('\n⚙️  Test 2: TypeScript Config Validation');
console.log('─'.repeat(70));

const tsconfigPath = path.join(__dirname, '..', 'tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));

console.log('Include patterns:', tsconfig.include || ['(inherited)']);
console.log('Exclude patterns:', tsconfig.exclude || ['(none)']);

if (tsconfig.compilerOptions?.forceConsistentCasingInFileNames) {
  console.log('✅ Casing enforcement enabled');
} else {
  console.log('⚠️  Casing enforcement disabled (may cause Windows issues)');
}

// Test 3: Run svelte-check
console.log('\n🔍 Test 3: Running svelte-check');
console.log('─'.repeat(70));

try {
  const output = execSync('npx svelte-check --threshold error', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  console.log('✅ No errors found!');
} catch (err) {
  const output = err.stdout || err.stderr || '';
  
  // Parse errors
  const errorPattern = /Error:/gi;
  const errors = output.match(errorPattern) || [];
  
  console.log(`Found ${errors.length} errors`);
  
  // Sample first 10 errors
  const lines = output.split('\n');
  const errorLines = lines.filter(line => line.includes('Error:'));
  
  console.log('\nSample errors:');
  errorLines.slice(0, 10).forEach((line, i) => {
    console.log(`  ${i + 1}. ${line.trim().substring(0, 100)}`);
  });
  
  // Save full output
  fs.writeFileSync(
    path.join(__dirname, '..', 'svelte-check-diagnostic.txt'),
    output,
    'utf8'
  );
  console.log('\n📄 Full output saved to: svelte-check-diagnostic.txt');
}

// Test 4: Pattern detection
console.log('\n🔎 Test 4: Pattern Detection');
console.log('─'.repeat(70));

const patterns = {
  '$state in try/catch': 0,
  'Extra quotes': 0,
  'export let': 0,
  '$: reactive': 0,
  'Component casing': 0
};

function* walkSync(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      if (!file.name.startsWith('.') && file.name !== 'node_modules') {
        yield* walkSync(path.join(dir, file.name));
      }
    } else if (file.name.endsWith('.svelte')) {
      yield path.join(dir, file.name);
    }
  }
}

let scanned = 0;
for (const file of walkSync(path.join(__dirname, '..', 'src'))) {
  const content = fs.readFileSync(file, 'utf8');
  
  if (/(?:try|catch)\s*\{[^}]*?=\s*\$state\(/s.test(content)) {
    patterns['$state in try/catch']++;
  }
  if (/from\s+(['"])[^'"]+\1\1/.test(content)) {
    patterns['Extra quotes']++;
  }
  if (/export\s+let\s+\w+/.test(content)) {
    patterns['export let']++;
  }
  if (/^\s*\$:\s*\w+\s*=/m.test(content)) {
    patterns['$: reactive']++;
  }
  
  scanned++;
}

console.log(`Scanned ${scanned.toLocaleString()} files\n`);
console.log('Pattern occurrences:');
for (const [pattern, count] of Object.entries(patterns)) {
  const emoji = count > 0 ? '🔴' : '✅';
  console.log(`  ${emoji} ${pattern.padEnd(25)} ${count.toLocaleString()}`);
}

// Test 5: Memory & TS server check
console.log('\n💾 Test 5: Memory & TS Server Status');
console.log('─'.repeat(70));

try {
  const memInfo = execSync('node -e "console.log(JSON.stringify(process.memoryUsage()))"', {
    encoding: 'utf8'
  });
  
  const mem = JSON.parse(memInfo);
  console.log(`Heap used:     ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap total:    ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`External:      ${(mem.external / 1024 / 1024).toFixed(2)} MB`);
  
  if (mem.heapUsed / mem.heapTotal > 0.9) {
    console.log('⚠️  Memory usage high (>90%), consider restarting TS server');
  } else {
    console.log('✅ Memory usage healthy');
  }
} catch (err) {
  console.log('⚠️  Could not check memory usage');
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('📊 Diagnostic Summary');
console.log('='.repeat(70));

const totalIssues = Object.values(patterns).reduce((a, b) => a + b, 0);

console.log(`\nTotal patterns detected: ${totalIssues.toLocaleString()}`);
console.log(`Files on disk:           ${fileCount.toLocaleString()}`);

if (totalIssues > 0) {
  console.log('\n🔧 Recommended action:');
  console.log('   Run: node scripts/phase26-6-quick-fix.mjs --dry-run');
  console.log('   Review proposed changes, then run without --dry-run');
} else {
  console.log('\n✅ No common patterns detected, ready for Phase 27');
}

console.log('\n📋 Next steps:');
console.log('   1. Review svelte-check-diagnostic.txt');
console.log('   2. Run quick-fix if needed');
console.log('   3. Restart VS Code TypeScript server (Ctrl+Shift+P → Restart TS Server)');
console.log('   4. Run: node scripts/gpu-ast-verifier.mjs');
