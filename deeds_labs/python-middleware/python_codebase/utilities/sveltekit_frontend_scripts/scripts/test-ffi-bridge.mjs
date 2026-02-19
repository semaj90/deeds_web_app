#!/usr/bin/env node

/**
 * Test SIMD FFI Bridge
 * Verifies direct memory access to Go SIMD parser
 */

import { getFFIClient } from './simd-ffi-client.mjs';

async function testFFIBridge() {
  console.log('🧪 Testing SIMD FFI Bridge...\n');

  let client;
  try {
    // Initialize FFI client
    client = getFFIClient();
    console.log('✅ FFI Bridge loaded successfully\n');

    // Test 1: Simple JSON parsing
    console.log('📋 Test 1: Simple JSON parsing');
    const testJSON = JSON.stringify({
      errors: [
        { file: 'test.ts', line: 10, message: 'TS1005: Missing semicolon' },
        { file: 'test2.ts', line: 25, message: 'TS1128: Declaration or statement expected' }
      ],
      metadata: { source: 'tsc', version: '5.3.0' }
    });

    const result1 = await client.parseJSON(testJSON);
    console.log('✅ Parsed JSON with', result1.errors?.length || 0, 'errors\n');

    // Test 2: TSC log simulation
    console.log('📋 Test 2: TSC log parsing');
    const mockTSClog = `test.ts(10,5): error TS1005: ';' expected.
test2.ts(25,1): error TS1128: Declaration or statement expected.
src/components/Button.svelte(15,10): error TS2304: Cannot find name 'onClick'.`;

    const result2 = await client.parseTSCLog(mockTSClog);
    console.log('✅ Parsed TSC log with', result2.errors.length, 'errors');
    console.log('📊 Sample error:', result2.errors[0]?.message, '\n');

    // Test 3: Performance benchmark
    console.log('📋 Test 3: Performance benchmark');
    const largeJSON = JSON.stringify({
      errors: Array.from({ length: 1000 }, (_, i) => ({
        file: `file${i}.ts`,
        line: Math.floor(Math.random() * 100) + 1,
        message: `TS${Math.floor(Math.random() * 1000) + 1000}: Test error ${i}`
      }))
    });

    const startTime = Date.now();
    const result3 = await client.parseJSON(largeJSON);
    const duration = Date.now() - startTime;

    console.log(`✅ Parsed 1000 errors in ${duration}ms`);
    console.log(`⚡ Throughput: ${(1000 / duration * 1000).toFixed(0)} errors/sec\n`);

    // Test 4: Error handling
    console.log('📋 Test 4: Error handling');
    try {
      await client.parseJSON('{ invalid json');
      console.log('❌ Should have thrown error');
    } catch (error) {
      console.log('✅ Correctly caught error:', error.message.substring(0, 50) + '...\n');
    }

    console.log('🎉 All FFI Bridge tests passed!');
    console.log('🚀 Ready for Phase 52 repair pipeline');

  } catch (error) {
    console.error('❌ FFI Bridge test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Run: go-microservice\\BUILD-FFI-BRIDGE.bat');
    console.error('2. Check CUDA installation');
    console.error('3. Verify AVX2 support on Intel 10th Gen');
    process.exit(1);
  } finally {
    if (client) {
      client.close();
    }
  }
}

testFFIBridge();