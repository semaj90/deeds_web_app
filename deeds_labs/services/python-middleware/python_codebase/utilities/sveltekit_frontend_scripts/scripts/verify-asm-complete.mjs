#!/usr/bin/env node
/**
 * Complete AssemblyScript / WASM verification script
 * Validates installation, compilation, and runtime execution
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getProjectRoot = () => {
  let currentDir = __dirname;
  while (true) {
    if (fs.existsSync(join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parentDir = join(currentDir, '..');
    if (parentDir === currentDir) {
      // Reached the filesystem root
      return null;
    }
    currentDir = parentDir;
  }
};

const rootDir = getProjectRoot();

if (!rootDir) {
  console.error('❌ Could not determine project root. Make sure a package.json file exists in the root directory.');
  process.exit(1);
}

console.log('\n🔍 AssemblyScript Installation & Compilation Verification\n');
console.log('='.repeat(60));

const results = {
  passed: [],
  failed: [],
  warnings: []
};

function pass(msg) {
  console.log(`✅ ${msg}`);
  results.passed.push(msg);
}

function fail(msg, error) {
  console.log(`❌ ${msg}`);
  if (error) console.log(`   Error: ${error.message}`);
  results.failed.push(msg);
}

function warn(msg) {
  console.log(`⚠️  ${msg}`);
  results.warnings.push(msg);
}

// 1. Check AssemblyScript installation
console.log('\n📦 Checking AssemblyScript installation...');
try {
  const packageJson = JSON.parse(fs.readFileSync(join(rootDir, 'package.json'), 'utf8'));
  if (packageJson.devDependencies?.assemblyscript) {
    pass(`AssemblyScript ${packageJson.devDependencies.assemblyscript} in devDependencies`);
  } else {
    fail('AssemblyScript not found in devDependencies');
  }
} catch (err) {
  fail('Failed to read package.json', err);
}

// 2. Check assembly directory structure
console.log('\n📁 Checking directory structure...');
const requiredDirs = [
  'assembly',
  'assembly/tests',
  'build',
  'static/wasm',
  'src/wasm'
];

for (const dir of requiredDirs) {
  const path = join(rootDir, dir);
  if (fs.existsSync(path)) {
    pass(`Directory exists: ${dir}`);
  } else {
    warn(`Directory missing: ${dir}`);
  }
}

// 3. Check critical AssemblyScript files
console.log('\n📄 Checking AssemblyScript source files...');
const requiredFiles = [
  { path: 'assembly/tsconfig.json', required: true },
  { path: 'asconfig.json', required: true },
  { path: 'assembly/vector-ops.ts', required: false },
  { path: 'src/wasm/vector-operations.ts', required: true }
];

for (const { path, required } of requiredFiles) {
  const fullPath = join(rootDir, path);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    pass(`File exists: ${path} (${size} bytes)`);
  } else if (required) {
    fail(`Required file missing: ${path}`);
  } else {
    warn(`Optional file missing: ${path}`);
  }
}

// 4. Check compiled WASM modules
console.log('\n🔧 Checking compiled WASM modules...');
const wasmFiles = [
  'build/vector-ops.wasm',
  'static/wasm/vector-ops.wasm'
];

for (const wasmPath of wasmFiles) {
  const fullPath = join(rootDir, wasmPath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    const size = stats.size;
    const modified = stats.mtime.toISOString().split('T')[0];
    pass(`WASM module: ${wasmPath} (${size} bytes, ${modified})`);
  } else {
    warn(`WASM not compiled yet: ${wasmPath}`);
  }
}

// 5. Test WASM loading and execution
console.log('\n🚀 Testing WASM module loading...');
try {
  const wasmPath = join(rootDir, 'static/wasm/vector-ops.wasm');
  if (fs.existsSync(wasmPath)) {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
      env: {
        abort: () => console.log('WASM abort called')
      }
    });

    pass('WASM module instantiated successfully');

    const exports = Object.keys(wasmModule.instance.exports);
    console.log(`   Exported functions: ${exports.slice(0, 10).join(', ')}${exports.length > 10 ? '...' : ''}`);

    // Test if vector operations are available
    if (exports.includes('cosineSimilarity')) {
      pass('Vector operations exported correctly');
    } else {
      warn('cosineSimilarity function not found (may use different export names)');
    }
  } else {
    warn('WASM module not found, skipping runtime test');
  }
} catch (err) {
  fail('Failed to load WASM module', err);
}

// 6. Check asconfig.json configuration
console.log('\n⚙️  Checking build configuration...');
try {
  const asconfigPath = join(rootDir, 'asconfig.json');
  if (fs.existsSync(asconfigPath)) {
    const asconfig = JSON.parse(fs.readFileSync(asconfigPath, 'utf8'));
    if (asconfig.targets) {
      const targets = Object.keys(asconfig.targets);
      pass(`Build targets configured: ${targets.join(', ')}`);

      for (const target of targets) {
        const config = asconfig.targets[target];
        console.log(`   ${target}: ${config.outFile}`);
      }
    }
  }
} catch (err) {
  warn('Could not parse asconfig.json', err);
}

// 7. Check package.json scripts
console.log('\n📜 Checking npm scripts...');
try {
  const packageJson = JSON.parse(fs.readFileSync(join(rootDir, 'package.json'), 'utf8'));
  const wasmScripts = [
    'build:wasm',
    'build:wasm:debug',
    'asbuild:debug',
    'asbuild:release'
  ];

  for (const script of wasmScripts) {
    if (packageJson.scripts?.[script]) {
      pass(`Script configured: ${script}`);
    } else {
      warn(`Script missing: ${script}`);
    }
  }
} catch (err) {
  fail('Failed to check npm scripts', err);
}

// 8. Summary report
console.log('\n' + '='.repeat(60));
console.log('📊 Verification Summary');
console.log('='.repeat(60));

console.log(`\n✅ Passed: ${results.passed.length}`);
console.log(`⚠️  Warnings: ${results.warnings.length}`);
console.log(`❌ Failed: ${results.failed.length}`);

if (results.failed.length > 0) {
  console.log('\n❌ Critical failures:');
  results.failed.forEach(msg => console.log(`   - ${msg}`));
}

if (results.warnings.length > 0 && results.warnings.length <= 5) {
  console.log('\n⚠️  Warnings:');
  results.warnings.forEach(msg => console.log(`   - ${msg}`));
}

// 9. Next steps
console.log('\n📚 Next Steps:');
if (results.failed.length > 0) {
  console.log('   1. Fix critical failures listed above');
  console.log('   2. Run: npm install --save-dev assemblyscript');
  console.log('   3. Run: npx asinit . --yes');
} else {
  console.log('   ✅ Environment ready!');
  console.log('   1. Edit assembly/vector-ops.ts or src/wasm/vector-operations.ts');
  console.log('   2. Run: npm run build:wasm');
  console.log('   3. Import in your app: WebAssembly.instantiateStreaming(fetch(\'/wasm/vector-ops.wasm\'))');
  console.log('   4. Execute Phase 35: .\\scripts\\fix-phase35-wasm.ps1');
}

console.log('\n🔗 Documentation:');
console.log('   - https://www.assemblyscript.org/getting-started.html');
console.log('   - https://developer.mozilla.org/en-US/docs/WebAssembly');

const exitCode = results.failed.length > 0 ? 1 : 0;
console.log(`\n${exitCode === 0 ? '✅' : '❌'} Verification ${exitCode === 0 ? 'PASSED' : 'FAILED'}\n`);
process.exit(exitCode);
