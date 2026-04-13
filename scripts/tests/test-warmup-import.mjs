/**
 * Test warm-up module imports and execution
 *
 * Directly imports warmUpDomain() to see if it works
 */

async function testWarmUpImport() {
  console.log('🧪 Testing warm-up module import...\n');

  try {
    // Try to import the warm-up module
    console.log('1. Importing warm-up module...');
    const warmUpModule = await import('../../sveltekit-frontend/src/lib/server/cache/warm-up.js');
    console.log('   ✅ Import successful');
    console.log('   Exports:', Object.keys(warmUpModule));

    // Check if warmUpDomain exists
    if (!warmUpModule.warmUpDomain) {
      throw new Error('warmUpDomain function not found in exports');
    }
    console.log('   ✅ warmUpDomain function exists\n');

    // Try to call it with dry-run
    console.log('2. Calling warmUpDomain (dry-run)...');
    const result = await warmUpModule.warmUpDomain('evidence', {
      batchSize: 2,
      delayMs: 500,
      model: 'gemma3:270m',
      dryRun: true, // Don't actually call LLM
    });

    console.log('   ✅ Function executed');
    console.log('   Result:', {
      totalQueries: result.totalQueries,
      successful: result.successful,
      failed: result.failed,
      skipped: result.skipped,
    });

    if (result.skipped !== 20) {
      throw new Error(`Expected 20 skipped queries, got ${result.skipped}`);
    }

    console.log('\n✅ All tests passed!');
    console.log('\n💡 The warm-up module works correctly.');
    console.log('   Issue must be in API endpoint or fire-and-forget pattern.');

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error('   Stack:', err.stack);
    process.exit(1);
  }
}

testWarmUpImport();
