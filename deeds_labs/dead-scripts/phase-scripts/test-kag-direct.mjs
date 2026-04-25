#!/usr/bin/env node
import { kagFixStore } from './kag-fix-store.mjs';

console.log('Testing KAG storage directly...\n');

// Test signature computation
const sig = kagFixStore.computeSignature({
  message: 'Test error for KAG verification',
  file: 'test.ts',
  tool: 'manual-test',
  position: 42
});

console.log('✅ Signature computed:', sig.sig.substring(0, 16) + '...');

// Test fix storage
await kagFixStore.storeFix(sig, {
  patchId: 'manual-test-fix',
  patch: 'This is a test patch content',
  appliedAt: new Date().toISOString(),
  verified: true,
  tier: 2
});

console.log('✅ Fix stored to Redis');

// Verify stats
const stats = await kagFixStore.getStats();
console.log('\n📊 KAG Stats after manual test:');
console.log('   Total Fixes:', stats.totalFixes);
console.log('   Verified Fixes:', stats.verifiedFixes);
console.log('   Cache Hits:', stats.cacheHits);

// Try to retrieve the fix
const retrieved = await kagFixStore.queryBestFix(sig);
console.log('\n🔍 Retrieved fix:', retrieved ? '✅ FOUND' : '❌ NOT FOUND');
if (retrieved) {
  console.log('   Patch ID:', retrieved.patchId);
  console.log('   Confidence:', retrieved.confidence);
}

process.exit(0);
