/**
 * Test P2 Tool Contracts
 * Verify that ACP tool schemas are well-formed and can validate results
 */

import { ACP_TOOLS, toolContractsToOpenAI, validateToolResult } from '../../packages/atlas-core/src/tools/acp-tool-contracts.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║ P2 Tool Contracts Validation — Test Suite              ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Test 1: Tool registry completeness
console.log('Test 1: Tool registry has all required ACP tools');
const requiredTools = [
  'acp.packet.validate_truth',
  'acp.retrieval.hybrid_search',
  'acp.schema_match.prewrite',
  'acp.packet.write_trace_event',
];

const toolNames = Object.keys(ACP_TOOLS);
const missingTools = requiredTools.filter((t) => !toolNames.includes(t));

if (missingTools.length === 0) {
  console.log('✅ All required tools registered');
  results.push({ name: 'Tool registry completeness', passed: true, details: `${toolNames.length} tools found` });
} else {
  console.log(`❌ Missing tools: ${missingTools.join(', ')}`);
  results.push({ name: 'Tool registry completeness', passed: false, details: `Missing: ${missingTools.join(', ')}` });
}

// Test 2: OpenAI format conversion
console.log('\nTest 2: Convert tool contracts to OpenAI format');
try {
  const openAITools = toolContractsToOpenAI();
  if (openAITools.length === requiredTools.length) {
    console.log(`✅ Generated ${openAITools.length} OpenAI-compatible tool definitions`);
    results.push({ name: 'OpenAI format conversion', passed: true, details: `${openAITools.length} tools converted` });

    // Validate structure
    const validTools = openAITools.every(
      (t) => t.type === 'function' && t.function && t.function.name && t.function.description
    );
    if (validTools) {
      console.log('✅ All tools have required OpenAI structure');
    } else {
      console.log('❌ Some tools are missing OpenAI structure fields');
      results.push({ name: 'OpenAI structure validation', passed: false, details: 'Missing fields' });
    }
  } else {
    console.log(`❌ Expected ${requiredTools.length} tools, got ${openAITools.length}`);
    results.push({ name: 'OpenAI format conversion', passed: false, details: 'Tool count mismatch' });
  }
} catch (err: any) {
  console.log(`❌ OpenAI conversion failed: ${err.message}`);
  results.push({ name: 'OpenAI format conversion', passed: false, details: err.message });
}

// Test 3: Validate tool result schema — validate_truth
console.log('\nTest 3: Validate acp.packet.validate_truth result schema');
const validTruthResult = {
  trace_id: 'trace:123',
  valid: true,
  reason: 'Packet verified',
  confidence: 0.95,
  postgres_row_exists: true,
  identity_matches: true,
};

const truthValidation = validateToolResult('acp.packet.validate_truth', validTruthResult);
if (truthValidation.valid) {
  console.log('✅ Valid result passes schema');
  results.push({ name: 'validate_truth result schema', passed: true, details: 'Result is valid' });
} else {
  console.log(`❌ Valid result failed: ${truthValidation.errors.join('; ')}`);
  results.push({ name: 'validate_truth result schema', passed: false, details: truthValidation.errors.join('; ') });
}

// Test 4: Validate tool result schema — hybrid_search
console.log('\nTest 4: Validate acp.retrieval.hybrid_search result schema');
const validSearchResult = {
  trace_id: 'trace:123',
  candidates: [
    {
      packet_key: 'ace:packet:auth:001',
      source_ref: 'src/lib/server/auth.ts',
      feature_id: 'auth.sessions',
      score: 0.95,
      strategy: 'rag_qdrant' as const,
    },
  ],
  total_candidates: 100,
  cache_hit: false,
  execution_time_ms: 234,
};

const searchValidation = validateToolResult('acp.retrieval.hybrid_search', validSearchResult);
if (searchValidation.valid) {
  console.log('✅ Valid result passes schema');
  results.push({ name: 'hybrid_search result schema', passed: true, details: 'Result is valid' });
} else {
  console.log(`❌ Valid result failed: ${searchValidation.errors.join('; ')}`);
  results.push({ name: 'hybrid_search result schema', passed: false, details: searchValidation.errors.join('; ') });
}

// Test 5: Validate tool result schema — schema_match
console.log('\nTest 5: Validate acp.schema_match.prewrite result schema');
const validSchemaResult = {
  trace_id: 'trace:123',
  valid: true,
  blocked_terms: [],
  missing_identity: [],
  schema_violations: [],
  unsafe_operations: [],
  report: '✅ SCHEMA VALIDATION PASS',
};

const schemaValidation = validateToolResult('acp.schema_match.prewrite', validSchemaResult);
if (schemaValidation.valid) {
  console.log('✅ Valid result passes schema');
  results.push({ name: 'schema_match result schema', passed: true, details: 'Result is valid' });
} else {
  console.log(`❌ Valid result failed: ${schemaValidation.errors.join('; ')}`);
  results.push({ name: 'schema_match result schema', passed: false, details: schemaValidation.errors.join('; ') });
}

// Test 6: Validate tool result schema — write_trace_event
console.log('\nTest 6: Validate acp.packet.write_trace_event result schema');
const validWriteResult = {
  trace_id: 'trace:123',
  success: true,
  postgres_row_id: 'row:456',
  cache_keys_invalidated: ['ff1:packet:ace:packet:auth:001'],
  nats_subjects_published: ['atlas.trace.checkpoint'],
};

const writeValidation = validateToolResult('acp.packet.write_trace_event', validWriteResult);
if (writeValidation.valid) {
  console.log('✅ Valid result passes schema');
  results.push({ name: 'write_trace_event result schema', passed: true, details: 'Result is valid' });
} else {
  console.log(`❌ Valid result failed: ${writeValidation.errors.join('; ')}`);
  results.push({ name: 'write_trace_event result schema', passed: false, details: writeValidation.errors.join('; ') });
}

// Test 7: Invalid result rejection
console.log('\nTest 7: Invalid results are properly rejected');
const invalidResult = {
  trace_id: 'trace:123',
  valid: 'true', // Should be boolean, not string
  reason: 'Invalid type',
};

const invalidValidation = validateToolResult('acp.packet.validate_truth', invalidResult);
if (!invalidValidation.valid) {
  console.log('✅ Invalid result is correctly rejected');
  results.push({ name: 'Invalid result rejection', passed: true, details: 'Properly validated' });
} else {
  console.log('❌ Invalid result was not rejected');
  results.push({ name: 'Invalid result rejection', passed: false, details: 'Should have failed' });
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
await fs.writeFile('.tmp/p2-tool-contracts-test-results.json', JSON.stringify(report, null, 2));

console.log(`✓ Report written: .tmp/p2-tool-contracts-test-results.json\n`);

// Final gate
const gatePass = failed === 0;
console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║ ${gatePass ? '✅ P2 GATE PASS' : '❌ P2 GATE FAIL'} — Tool contracts validated${gatePass ? '        ' : '        '}║`);
console.log(`╚════════════════════════════════════════════════════════╝\n`);

process.exit(gatePass ? 0 : 1);
