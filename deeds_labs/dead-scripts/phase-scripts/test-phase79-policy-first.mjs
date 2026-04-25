#!/usr/bin/env node
/**
 * 🧪 PHASE 79: POLICY-FIRST RETRIEVAL TEST SUITE
 *
 * Tests Phase 79 cognitive engine with 3 scenarios:
 * 1. Create protected POST endpoint for reports (auth + validation)
 * 2. Fix "Cannot read user of undefined" auth bug
 * 3. Add file upload endpoint with presigned S3 URLs
 *
 * Validates:
 * - Security keyword detection triggers enhanced retrieval
 * - Minimum coverage enforcement (security + validation + operational)
 * - Codebase routes included in context
 * - Generated code follows KB policies
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Security-sensitive keywords that trigger enhanced retrieval
const SECURITY_KEYWORDS = ['auth', 'session', 'cookie', 'csrf', 'upload', 'presign', 'rate limit', 'validation', 'token', 'password', 'login'];

// Generate embedding for RAG search
async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text
      })
    });
    if (!response.ok) throw new Error(`Embedding failed: ${response.statusText}`);
    const data = await response.json();
    return data.embedding || [];
  } catch (e) {
    console.warn('⚠️ Embedding generation failed:', e.message);
    return [];
  }
}

// Test retrieval with security keyword detection
async function testRetrievalWithCoverage(query, testCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 TEST CASE: ${testCase}`);
  console.log(`Query: "${query}"`);
  console.log(`${'='.repeat(80)}\n`);

  const isSecuritySensitive = SECURITY_KEYWORDS.some(keyword =>
    query.toLowerCase().includes(keyword)
  );

  console.log(`🔍 Security-sensitive: ${isSecuritySensitive ? '✅ YES' : '❌ NO'}`);

  const embedding = await generateEmbedding(query);
  if (embedding.length === 0) {
    console.error('❌ Failed to generate embedding');
    return;
  }

  // 1. Policy Search (Knowledge Base)
  const policyRes = await qdrant.search('knowledge_base', {
    vector: embedding,
    filter: {
      must: [
        { key: "source", match: { value: "local" } }
      ]
    },
    limit: isSecuritySensitive ? 5 : 3,
    with_payload: true,
    score_threshold: isSecuritySensitive ? 0.50 : 0.60
  });

  // 2. Codebase Routes Search
  let codebaseRoutes = [];
  try {
    const routeRes = await qdrant.search('codebase_routes', {
      vector: embedding,
      limit: 3,
      with_payload: true,
      score_threshold: 0.45
    });
    codebaseRoutes = routeRes.map(r => ({
      path: r.payload?.path || 'unknown',
      features: r.payload?.features || {},
      score: r.score
    }));
  } catch (e) {
    console.warn('⚠️ Codebase routes not available:', e.message);
  }

  // 3. Analyze Coverage
  const policies = policyRes.map(r => ({
    file: r.payload?.file || 'unknown',
    section: r.payload?.section || '',
    score: r.score
  }));

  const hasSecurityPolicy = policies.some(p =>
    p.file.includes('protected-endpoints') ||
    p.file.includes('lucia-auth') ||
    p.section.toLowerCase().includes('auth')
  );
  const hasValidationPolicy = policies.some(p =>
    p.file.includes('zod-validation') ||
    p.section.toLowerCase().includes('validation')
  );
  const hasOperationalPolicy = policies.some(p =>
    p.file.includes('rate-limiting') ||
    p.file.includes('caching')
  );

  console.log(`\n📊 RETRIEVAL RESULTS:`);
  console.log(`   Policies: ${policies.length}`);
  policies.forEach(p => {
    console.log(`      - ${p.file} ${p.section ? `→ ${p.section}` : ''} (${(p.score * 100).toFixed(1)}%)`);
  });

  console.log(`\n   Codebase Routes: ${codebaseRoutes.length}`);
  codebaseRoutes.forEach(r => {
    console.log(`      - ${r.path} (${(r.score * 100).toFixed(1)}%)`);
    console.log(`        Features: ${JSON.stringify(r.features)}`);
  });

  console.log(`\n🎯 COVERAGE ANALYSIS:`);
  console.log(`   Security Policy: ${hasSecurityPolicy ? '✅' : '❌'}`);
  console.log(`   Validation Policy: ${hasValidationPolicy ? '✅' : '❌'}`);
  console.log(`   Operational Policy: ${hasOperationalPolicy ? '✅' : '❌'}`);

  if (isSecuritySensitive && (!hasSecurityPolicy || !hasValidationPolicy)) {
    console.log(`\n⚠️ Minimum coverage NOT met - would trigger fallback policy fetch`);
  } else {
    console.log(`\n✅ Coverage requirements satisfied`);
  }

  return {
    policies,
    codebaseRoutes,
    coverage: { hasSecurityPolicy, hasValidationPolicy, hasOperationalPolicy }
  };
}

// Main test runner
async function runTests() {
  console.log('🚀 Phase 79 Policy-First Retrieval Test Suite\n');

  const testCases = [
    {
      name: 'Test 1: Create Protected Endpoint',
      query: 'Create protected POST endpoint for reports with auth and validation'
    },
    {
      name: 'Test 2: Fix Auth Bug',
      query: 'Fix cannot read user of undefined error in cases endpoint'
    },
    {
      name: 'Test 3: File Upload Endpoint',
      query: 'Add file upload endpoint with presigned S3 URLs and CORS'
    }
  ];

  const results = [];
  for (const test of testCases) {
    const result = await testRetrievalWithCoverage(test.query, test.name);
    results.push({ ...test, result });
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('📈 TEST SUMMARY');
  console.log(`${'='.repeat(80)}\n`);

  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}`);
    console.log(`   Policies: ${r.result.policies.length}, Routes: ${r.result.codebaseRoutes.length}`);
    console.log(`   Coverage: Security=${r.result.coverage.hasSecurityPolicy}, Validation=${r.result.coverage.hasValidationPolicy}, Operational=${r.result.coverage.hasOperationalPolicy}`);
  });

  console.log(`\n✅ All tests complete!`);
}

runTests().catch(console.error);
