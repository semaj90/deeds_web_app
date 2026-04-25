#!/usr/bin/env node
// Force fresh import - test Redis with new connection settings
console.log('Testing Redis with fresh module import...\n');

// Clear module cache
const modulePath = './kag-fix-store.mjs';
if (import.meta.url) {
  console.log('Starting fresh import test...');
}

const { kagFixStore } = await import('./kag-fix-store.mjs?t=' + Date.now());

console.log('✅ Module imported\n');

// Test signature
const sig = kagFixStore.computeSignature({
  message: 'Fresh test error',
  file: 'test-fresh.ts',
  tool: 'fresh-test',
  position: 99
});

console.log('✅ Signature:', sig.sig.substring(0, 16) + '...\n');

// Test storage
console.log('Attempting to store fix...');
await kagFixStore.storeFix(sig, {
  patchId: 'fresh-test-fix',
  patch: 'Fresh test patch',
  appliedAt: new Date().toISOString(),
  verified: true,
  tier: 2
});

console.log('\n📊 Checking stats...');
const stats = await kagFixStore.getStats();
console.log('Total Fixes:', stats.totalFixes);

// Try to retrieve
const retrieved = await kagFixStore.queryBestFix(sig);
console.log('\n🔍 Retrieved:', retrieved ? '✅ SUCCESS' : '❌ NOT FOUND');

process.exit(retrieved ? 0 : 1);
