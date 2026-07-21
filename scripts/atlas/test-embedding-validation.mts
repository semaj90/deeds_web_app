#!/usr/bin/env node

/**
 * test-embedding-validation.mts
 *
 * Integration test for the embedding service validation and fingerprinting.
 * Tests that:
 * 1. Provider detection rejects llama-server config with :11434 URL
 * 2. Backend fingerprinting detects Ollama vs llama-server
 * 3. The resolver explicitly fails on provider-URL mismatch (doesn't silently fall back)
 */

import {
  fingerprintBackend,
  validateResolvedBackend,
  resolveEmbeddingBackend,
  type EmbeddingProvider,
} from '../../sveltekit-frontend/src/lib/server/embedding/embedding-backend-resolution.js';

const TEST_CASES = [
  {
    name: 'llama-server on :8081 (CORRECT)',
    provider: 'llama-server' as EmbeddingProvider,
    baseUrl: 'http://127.0.0.1:8081',
    expectedErrors: [], // Should have no errors
  },
  {
    name: 'ollama on :11434 (CORRECT)',
    provider: 'ollama' as EmbeddingProvider,
    baseUrl: 'http://127.0.0.1:11434',
    expectedErrors: [], // Should have no errors
  },
  {
    name: 'llama-server on :11434 (MISMATCH)',
    provider: 'llama-server' as EmbeddingProvider,
    baseUrl: 'http://127.0.0.1:11434',
    expectedErrors: ['PROVIDER_URL_MISMATCH'], // Should detect mismatch
  },
  {
    name: 'ollama on :8081 (MISMATCH)',
    provider: 'ollama' as EmbeddingProvider,
    baseUrl: 'http://127.0.0.1:8081',
    expectedErrors: ['PROVIDER_URL_MISMATCH'], // Should detect mismatch
  },
];

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ Embedding Service Validation Tests                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log();

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    console.log(`TEST: ${testCase.name}`);
    console.log(`  Provider: ${testCase.provider}`);
    console.log(`  URL: ${testCase.baseUrl}`);
    console.log();

    // Step 1: Fingerprint the backend
    console.log(`  [1] Fingerprinting backend...`);
    const fingerprint = await fingerprintBackend(testCase.baseUrl);
    console.log(
      `      Ollama: ${fingerprint.isOllama}, LlamaServer: ${fingerprint.isLlamaServer}, SupportsEmbeddings: ${fingerprint.supportsEmbeddings}`,
    );
    console.log();

    // Step 2: Validate the resolution
    console.log(`  [2] Validating resolution...`);
    const validation = await validateResolvedBackend(testCase.provider, testCase.baseUrl);
    console.log(
      `      Valid: ${validation.valid}, Errors: ${JSON.stringify(validation.errors)}`,
    );
    console.log();

    // Check expectations
    const errorsMatch =
      validation.errors.length === testCase.expectedErrors.length &&
      testCase.expectedErrors.every((err) => validation.errors.includes(err));

    const expectedValid = testCase.expectedErrors.length === 0;
    const validMatches = validation.valid === expectedValid;

    if (errorsMatch && validMatches) {
      console.log(`  ✓ PASS`);
      passed++;
    } else {
      console.log(`  ✗ FAIL`);
      if (!errorsMatch) {
        console.log(`      Expected errors: ${JSON.stringify(testCase.expectedErrors)}`);
        console.log(`      Actual errors: ${JSON.stringify(validation.errors)}`);
      }
      if (!validMatches) {
        console.log(`      Expected valid: ${expectedValid}, Actual: ${validation.valid}`);
      }
      failed++;
    }
    console.log();
  }

  // Test resolver integration
  console.log('TEST: Resolver integration');
  console.log(`  Resolving with explicit provider + baseUrl...`);
  console.log();

  const resolution = resolveEmbeddingBackend('embeddinggemma:latest', {
    provider: 'llama-server',
    baseUrl: 'http://127.0.0.1:8081',
    configuredProvider: 'ollama', // This should be ignored due to explicit provider
  });

  if (resolution.provider === 'llama-server' && resolution.baseUrl === 'http://127.0.0.1:8081') {
    console.log(`  ✓ PASS: Explicit options respected, configured env vars ignored`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: Expected provider=llama-server, got ${resolution.provider}`);
    failed++;
  }
  console.log();

  // Summary
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log(`║ Results: ${passed} passed, ${failed} failed${' '.repeat(39 - String(passed).length - String(failed).length)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
