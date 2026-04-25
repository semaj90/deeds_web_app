#!/usr/bin/env node
/**
 * 🎯 POLICY-FIRST RETRIEVAL DEMO
 *
 * Demonstrates the enhanced Phase 79 retrieval with:
 * - Security keyword detection
 * - Minimum coverage enforcement
 * - Codebase route integration
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Security-sensitive keywords that trigger enhanced retrieval
const SECURITY_KEYWORDS = ['auth', 'session', 'cookie', 'csrf', 'upload', 'presign', 'rate limit', 'validation', 'token', 'password', 'login'];

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
    return null;
  }
}

async function demonstrateRetrievalComparison(query) {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`🎯 Query: "${query}"`);
  console.log(`${'='.repeat(100)}\n`);

  const isSecuritySensitive = SECURITY_KEYWORDS.some(keyword =>
    query.toLowerCase().includes(keyword)
  );

  console.log(`🔍 Security-sensitive: ${isSecuritySensitive ? '✅ YES' : '❌ NO'}`);

  const detectedKeywords = SECURITY_KEYWORDS.filter(keyword =>
    query.toLowerCase().includes(keyword)
  );
  if (detectedKeywords.length > 0) {
    console.log(`   Keywords detected: ${detectedKeywords.join(', ')}`);
  }

  const embedding = await generateEmbedding(query);
  if (!embedding) {
    console.error('❌ Failed to generate embedding - is Ollama running?');
    return;
  }

  console.log(`\n📊 RETRIEVAL COMPARISON:`);
  console.log(`   Policy Limit: ${isSecuritySensitive ? '5 (enhanced)' : '3 (normal)'}`);
  console.log(`   Score Threshold: ${isSecuritySensitive ? '0.50 (more inclusive)' : '0.60 (standard)'}`);

  // Retrieve with current settings
  try {
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

    console.log(`\n✅ Retrieved ${policyRes.length} policies from knowledge base:`);
    policyRes.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.payload?.file || 'unknown'} ${r.payload?.section ? `→ ${r.payload?.section}` : ''} (${(r.score * 100).toFixed(1)}%)`);
    });

    // Check coverage
    const hasSecurityPolicy = policyRes.some(r =>
      r.payload?.file?.includes('protected-endpoints') ||
      r.payload?.file?.includes('lucia-auth')
    );
    const hasValidationPolicy = policyRes.some(r =>
      r.payload?.file?.includes('zod-validation')
    );
    const hasOperationalPolicy = policyRes.some(r =>
      r.payload?.file?.includes('rate-limiting') ||
      r.payload?.file?.includes('caching')
    );

    console.log(`\n🎯 COVERAGE ANALYSIS:`);
    console.log(`   Security Policy: ${hasSecurityPolicy ? '✅' : '❌'}`);
    console.log(`   Validation Policy: ${hasValidationPolicy ? '✅' : '❌'}`);
    console.log(`   Operational Policy: ${hasOperationalPolicy ? '✅' : '❌'}`);

    if (isSecuritySensitive && (!hasSecurityPolicy || !hasValidationPolicy)) {
      console.log(`\n⚠️ Minimum coverage NOT met - fallback policy fetch would be triggered`);
    } else {
      console.log(`\n✅ Coverage requirements satisfied`);
    }

    // Try to retrieve codebase routes
    try {
      const routeRes = await qdrant.search('codebase_routes', {
        vector: embedding,
        limit: 3,
        with_payload: true,
        score_threshold: 0.45
      });

      if (routeRes.length > 0) {
        console.log(`\n🎯 Retrieved ${routeRes.length} codebase routes:`);
        routeRes.forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.payload?.path || 'unknown'} (${(r.score * 100).toFixed(1)}%)`);
          if (r.payload?.features) {
            console.log(`      Features: ${JSON.stringify(r.payload.features)}`);
          }
        });
      } else {
        console.log(`\n⚠️ No codebase routes found (collection may need indexing)`);
      }
    } catch (e) {
      console.log(`\n⚠️ Codebase routes collection not available: ${e.message}`);
    }

  } catch (e) {
    console.error(`❌ Retrieval failed: ${e.message}`);
  }
}

async function runDemo() {
  console.log('🚀 Phase 79 Policy-First Retrieval Demo\n');
  console.log('This demonstrates how security keywords trigger enhanced retrieval:');
  console.log('- More policies (5 vs 3)');
  console.log('- Lower threshold (0.50 vs 0.60)');
  console.log('- Minimum coverage enforcement');
  console.log('- Codebase route integration\n');

  const demos = [
    'Create protected POST endpoint for reports with auth and validation',
    'Fix cannot read user of undefined error in cases endpoint',
    'Add file upload endpoint with presigned S3 URLs',
    'Optimize database query performance for listings page'
  ];

  for (const query of demos) {
    await demonstrateRetrievalComparison(query);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between demos
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log('✅ Demo complete!\n');
  console.log('Notice how security-sensitive queries (1-3) get:');
  console.log('  - 5 policies instead of 3');
  console.log('  - Lower score threshold (0.50 vs 0.60)');
  console.log('  - Coverage enforcement checks');
  console.log('\nWhile normal queries (4) use standard retrieval settings.');
}

runDemo().catch(console.error);
