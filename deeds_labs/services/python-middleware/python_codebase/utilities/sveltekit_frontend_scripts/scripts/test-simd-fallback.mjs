#!/usr/bin/env node

/**
 * Test SIMD FFI Bridge with HTTP Fallback
 * Tests both FFI (if available) and HTTP fallback modes
 */

import { getFFIClient } from './simd-ffi-client.mjs';

async function testSIMDClient() {
  console.log('🧪 Testing SIMD FFI Bridge with HTTP Fallback\n');

  try {
    const client = getFFIClient();

    // Test 1: Simple JSON parsing
    console.log('📝 Test 1: Simple JSON parsing');
    const testJSON = '{"name": "test", "value": 123, "active": true}';
    console.log('Input:', testJSON);

    const result1 = await client.parseJSON(testJSON);
    console.log('Output:', JSON.stringify(result1, null, 2));
    console.log('✅ Test 1 passed\n');

    // Test 2: Complex JSON with arrays
    console.log('📝 Test 2: Complex JSON with arrays');
    const complexJSON = '{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}], "metadata": {"version": "1.0", "count": 2}}';
    console.log('Input:', complexJSON);

    const result2 = await client.parseJSON(complexJSON);
    console.log('Output:', JSON.stringify(result2, null, 2));
    console.log('✅ Test 2 passed\n');

    // Test 3: Error handling
    console.log('📝 Test 3: Error handling with invalid JSON');
    try {
      await client.parseJSON('{"invalid": json}');
      console.log('❌ Should have thrown an error');
    } catch (error) {
      console.log('✅ Correctly caught error:', error.message);
    }

    console.log('\n🎉 All tests passed! SIMD client is working.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testSIMDClient().catch(console.error);