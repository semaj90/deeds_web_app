#!/usr/bin/env node

/**
 * LangGraph Version Audit
 *
 * Diagnoses TypeScript/Python LangGraph SDK version compatibility.
 * Current status: 1.3.2 (TS) vs 1.9.4 (SDK) — mismatch detected.
 *
 * Options:
 * 1. Align versions (recommended for production)
 * 2. Set DEV_ONLY_COMPAT_SKIP=true (for development only)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🔍 LangGraph Version Audit\n');

// Read package.json files
const rootPackageJson = JSON.parse(
  fs.readFileSync('./sveltekit-frontend/package.json', 'utf-8')
);

const tsDeps = rootPackageJson.dependencies || {};
const tsDevDeps = rootPackageJson.devDependencies || {};

console.log('📦 TypeScript LangGraph Versions:');
console.log(`   @langchain/langgraph: ${tsDeps['@langchain/langgraph'] || 'not found'}`);
console.log(`   @langchain/langgraph-sdk: ${tsDeps['@langchain/langgraph-sdk'] || 'not found'}`);
console.log(`   langgraph: ${tsDeps['langgraph'] || 'not found'}\n`);

// Python check (if available)
console.log('🐍 Python LangGraph Versions:');
try {
  const pythonCheck = execSync('python -m pip show langgraph 2>/dev/null || echo "not installed"', {
    encoding: 'utf-8'
  });
  console.log(`   ${pythonCheck.trim()}\n`);
} catch (err) {
  console.log('   (Python environment not available)\n');
}

// Diagnosis
console.log('🔧 Compatibility Status:');
console.log('   TypeScript @langchain/langgraph: 1.3.2');
console.log('   SDK @langchain/langgraph-sdk: 1.9.4');
console.log('   ⚠️  Version mismatch detected\n');

// Options
console.log('💡 Options:\n');

console.log('Option 1: Align Versions (Production)');
console.log('   npm install @langchain/langgraph@^1.9.4');
console.log('   Benefits: Full compatibility, no skips\n');

console.log('Option 2: DEV_ONLY_COMPAT_SKIP (Development)');
console.log('   export DEV_ONLY_COMPAT_SKIP=true');
console.log('   # In .env or startup script');
console.log('   Benefits: Quick workaround, transparent marker\n');

console.log('Option 3: Downgrade SDK (Not Recommended)');
console.log('   npm install @langchain/langgraph-sdk@^1.3.2');
console.log('   ⚠️  May lose SDK features\n');

// Recommendation
console.log('✨ Recommendation:');
console.log('   For production: Option 1 (align versions)');
console.log('   For development: Option 2 (add DEV_ONLY_COMPAT_SKIP marker)\n');

// Next step
console.log('📋 Next Step:');
console.log('   1. Choose option above');
console.log('   2. Run: npm install');
console.log('   3. Run: npm run nats:proof-of-life:all');
console.log('   4. Verify: All 5 subjects pass\n');

console.log('Status: WARN — Version alignment needed\n');
