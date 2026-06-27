/**
 * Test P7 GAN Adversarial Validation
 * Verify that 6 adversarial probes are correctly rejected
 */

import { createGanValidator, ADVERSARIAL_PROBES } from '../../packages/atlas-core/src/validation/gan-adversarial-validator.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║ P7 GAN Adversarial Validation — Test Suite            ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Test 1: Probe inventory
console.log('Test 1: Adversarial probe inventory');
try {
  const expectedProbes = 6;
  if (ADVERSARIAL_PROBES.length === expectedProbes) {
    console.log(`✅ All ${expectedProbes} adversarial probes defined`);
    console.log('   ADV001: missing_packet_key');
    console.log('   ADV002: wrong_source_ref');
    console.log('   ADV003: fake_table');
    console.log('   ADV004: placeholder_terms');
    console.log('   ADV005: redis_only');
    console.log('   ADV006: nats_before_postgres');
    results.push({ name: 'Probe inventory', passed: true, details: `${expectedProbes} probes` });
  } else {
    console.log(`❌ Expected ${expectedProbes} probes, got ${ADVERSARIAL_PROBES.length}`);
    results.push({ name: 'Probe inventory', passed: false, details: `Count mismatch` });
  }
} catch (err: any) {
  console.log(`❌ Inventory check failed: ${err.message}`);
  results.push({ name: 'Probe inventory', passed: false, details: err.message });
}

// Test 2: Run all probes
console.log('\nTest 2: Run all adversarial probes');
try {
  const validator = createGanValidator();
  const probeResults = await validator.runAllProbes();

  console.log(`   Running ${probeResults.length} probes...`);
  probeResults.forEach((r) => {
    const status = r.passed ? '✅' : '❌';
    console.log(`   ${status} ${r.probe_id}: ${r.details}`);
  });

  const allPassed = probeResults.every((r) => r.passed);
  if (allPassed) {
    console.log(`✅ All ${probeResults.length} probes passed`);
    results.push({ name: 'Probe execution', passed: true, details: `${probeResults.length}/6 passed` });
  } else {
    const failedCount = probeResults.filter((r) => !r.passed).length;
    console.log(`❌ ${failedCount} probe(s) failed`);
    results.push({ name: 'Probe execution', passed: false, details: `${failedCount} failed` });
  }
} catch (err: any) {
  console.log(`❌ Probe execution failed: ${err.message}`);
  results.push({ name: 'Probe execution', passed: false, details: err.message });
}

// Test 3: Missing packet_key probe (ADV001)
console.log('\nTest 3: ADV001 — Missing packet_key');
try {
  const validator = createGanValidator();
  const probe = ADVERSARIAL_PROBES.find((p) => p.probe_id === 'ADV001')!;
  const result = await validator['runProbe'](probe);

  if (result.passed && result.expected_failure) {
    console.log('✅ Missing packet_key correctly rejected');
    results.push({ name: 'ADV001 probe', passed: true, details: 'Correctly failed' });
  } else {
    console.log('❌ ADV001 probe did not fail as expected');
    results.push({ name: 'ADV001 probe', passed: false, details: 'Should have failed' });
  }
} catch (err: any) {
  console.log(`❌ ADV001 test failed: ${err.message}`);
  results.push({ name: 'ADV001 probe', passed: false, details: err.message });
}

// Test 4: Invalid source_ref probe (ADV002)
console.log('\nTest 4: ADV002 — Invalid source_ref');
try {
  const validator = createGanValidator();
  const probe = ADVERSARIAL_PROBES.find((p) => p.probe_id === 'ADV002')!;
  const result = await validator['runProbe'](probe);

  if (result.passed && result.expected_failure) {
    console.log('✅ Invalid source_ref correctly rejected');
    results.push({ name: 'ADV002 probe', passed: true, details: 'Correctly failed' });
  } else {
    console.log('❌ ADV002 probe did not fail as expected');
    results.push({ name: 'ADV002 probe', passed: false, details: 'Should have failed' });
  }
} catch (err: any) {
  console.log(`❌ ADV002 test failed: ${err.message}`);
  results.push({ name: 'ADV002 probe', passed: false, details: err.message });
}

// Test 5: Fake table probe (ADV003)
console.log('\nTest 5: ADV003 — Fake table in SQL');
try {
  const validator = createGanValidator();
  const probe = ADVERSARIAL_PROBES.find((p) => p.probe_id === 'ADV003')!;
  const result = await validator['runProbe'](probe);

  if (result.passed && result.expected_failure) {
    console.log('✅ Fake table correctly rejected');
    results.push({ name: 'ADV003 probe', passed: true, details: 'Correctly failed' });
  } else {
    console.log('❌ ADV003 probe did not fail as expected');
    results.push({ name: 'ADV003 probe', passed: false, details: 'Should have failed' });
  }
} catch (err: any) {
  console.log(`❌ ADV003 test failed: ${err.message}`);
  results.push({ name: 'ADV003 probe', passed: false, details: err.message });
}

// Test 6: Placeholder terms probe (ADV004)
console.log('\nTest 6: ADV004 — Placeholder terms');
try {
  const validator = createGanValidator();
  const probe = ADVERSARIAL_PROBES.find((p) => p.probe_id === 'ADV004')!;
  const result = await validator['runProbe'](probe);

  if (result.passed && result.expected_failure) {
    console.log('✅ Placeholder terms correctly rejected');
    results.push({ name: 'ADV004 probe', passed: true, details: 'Correctly failed' });
  } else {
    console.log('❌ ADV004 probe did not fail as expected');
    results.push({ name: 'ADV004 probe', passed: false, details: 'Should have failed' });
  }
} catch (err: any) {
  console.log(`❌ ADV004 test failed: ${err.message}`);
  results.push({ name: 'ADV004 probe', passed: false, details: err.message });
}

// Test 7: Write order violation probe (ADV005)
console.log('\nTest 7: ADV005 — Redis before Postgres');
try {
  const validator = createGanValidator();
  const probe = ADVERSARIAL_PROBES.find((p) => p.probe_id === 'ADV005')!;
  const result = await validator['runProbe'](probe);

  if (result.passed && result.expected_failure) {
    console.log('✅ Write order violation correctly rejected');
    results.push({ name: 'ADV005 probe', passed: true, details: 'Correctly failed' });
  } else {
    console.log('❌ ADV005 probe did not fail as expected');
    results.push({ name: 'ADV005 probe', passed: false, details: 'Should have failed' });
  }
} catch (err: any) {
  console.log(`❌ ADV005 test failed: ${err.message}`);
  results.push({ name: 'ADV005 probe', passed: false, details: err.message });
}

// Test 8: Event order violation probe (ADV006)
console.log('\nTest 8: ADV006 — NATS before Postgres');
try {
  const validator = createGanValidator();
  const probe = ADVERSARIAL_PROBES.find((p) => p.probe_id === 'ADV006')!;
  const result = await validator['runProbe'](probe);

  if (result.passed && result.expected_failure) {
    console.log('✅ Event order violation correctly rejected');
    results.push({ name: 'ADV006 probe', passed: true, details: 'Correctly failed' });
  } else {
    console.log('❌ ADV006 probe did not fail as expected');
    results.push({ name: 'ADV006 probe', passed: false, details: 'Should have failed' });
  }
} catch (err: any) {
  console.log(`❌ ADV006 test failed: ${err.message}`);
  results.push({ name: 'ADV006 probe', passed: false, details: err.message });
}

// Summary
console.log(`\n${'='.repeat(60)}`);
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`Tests: ${passed} passed, ${failed} failed out of ${results.length}`);
console.log(`${'='.repeat(60)}\n`);

// Write report
const report = {
  timestamp: new Date().toISOString(),
  total_tests: results.length,
  passed,
  failed,
  pass_rate: `${((passed / results.length) * 100).toFixed(1)}%`,
  results,
};

const fs = await import('node:fs/promises');
await fs.mkdir('.tmp', { recursive: true });
await fs.writeFile('.tmp/p7-gan-adversarial-test-results.json', JSON.stringify(report, null, 2));

console.log(`✓ Report written: .tmp/p7-gan-adversarial-test-results.json\n`);

// Final gate
const gatePass = failed === 0;
console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║ ${gatePass ? '✅ P7 GATE PASS' : '❌ P7 GATE FAIL'} — Adversarial validation${gatePass ? '     ' : '     '}║`);
console.log(`╚════════════════════════════════════════════════════════╝\n`);

process.exit(gatePass ? 0 : 1);
