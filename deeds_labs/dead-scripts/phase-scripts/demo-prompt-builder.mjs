#!/usr/bin/env node
/**
 * 🎨 POLICY-FIRST PROMPT BUILDER DEMO
 *
 * Shows the actual prompt generated with policy-first retrieval
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const SECURITY_KEYWORDS = ['auth', 'session', 'cookie', 'csrf', 'upload', 'presign', 'rate limit', 'validation', 'token', 'password', 'login'];

async function generateEmbedding(text) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
  });
  const data = await response.json();
  return data.embedding || [];
}

async function buildPromptDemo(query, errors) {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`🎨 PROMPT BUILDER DEMO`);
  console.log(`Query: "${query}"`);
  console.log(`${'='.repeat(100)}\n`);

  const isSecuritySensitive = SECURITY_KEYWORDS.some(k => query.toLowerCase().includes(k));
  const embedding = await generateEmbedding(query);

  // Retrieve context
  const policyRes = await qdrant.search('knowledge_base', {
    vector: embedding,
    filter: { must: [{ key: "source", match: { value: "local" } }] },
    limit: isSecuritySensitive ? 5 : 3,
    with_payload: true,
    score_threshold: isSecuritySensitive ? 0.50 : 0.60
  });

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
      content: r.payload?.content || '',
      score: r.score
    }));
  } catch (e) {
    console.log('⚠️ Codebase routes not available');
  }

  // Build the prompt
  const errorContext = errors.map(e => `- [${e.code}] ${e.message}`).join('\n');

  const policySection = policyRes.length > 0
    ? `\n🚨 MANDATORY POLICIES & PATTERNS:\n${policyRes.map(p => {
        const file = p.payload?.file || 'unknown';
        const section = p.payload?.section || '';
        const content = p.payload?.content || p.payload?.patch || '';
        return `[${file}] ${section}\n${content.substring(0, 400)}...`;
      }).join('\n\n')}`
    : '';

  const codebaseSection = codebaseRoutes.length > 0
    ? `\n🎯 ACTUAL CODEBASE ROUTES (Real Implementation Examples):\n${codebaseRoutes.map(r =>
        `Route: ${r.path} (${(r.score * 100).toFixed(1)}% match)\nFeatures: ${JSON.stringify(r.features, null, 2)}\n${r.content.substring(0, 300)}...`
      ).join('\n\n')}`
    : '';

  const prompt = `You are a TypeScript Expert (Gemma3-Legal). Fix the errors in this file using best practices.

ERRORS:
${errorContext}
${policySection}
${codebaseSection}

FILE CONTEXT:
// Sample file with errors
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user; // Error: Cannot read property 'user' of undefined
  return { user };
};

INSTRUCTIONS:
1. Return ONLY the complete, valid TypeScript/Svelte code for the file.
2. DO NOT wrap in markdown blocks like \`\`\`typescript.
3. DO NOT include "Here is the fix" or any explanation.
4. If the file is truncated in preview, ensure your patch focuses on fixing the logic shown.
5. Follow the MANDATORY POLICIES exactly - they are non-negotiable security/validation requirements.
6. Use ACTUAL CODEBASE ROUTES as reference implementations when available.
`;

  console.log('📄 GENERATED PROMPT:\n');
  console.log(prompt);
  console.log(`\n${'='.repeat(100)}`);
  console.log(`📊 PROMPT STATISTICS:`);
  console.log(`   Total length: ${prompt.length} characters`);
  console.log(`   Policies included: ${policyRes.length}`);
  console.log(`   Codebase routes: ${codebaseRoutes.length}`);
  console.log(`   Security-sensitive: ${isSecuritySensitive ? 'YES' : 'NO'}`);
  console.log(`${'='.repeat(100)}\n`);
}

async function runDemo() {
  console.log('🎨 Policy-First Prompt Builder Demo\n');

  const testCase = {
    query: 'Fix cannot read user of undefined error in protected endpoint',
    errors: [
      { code: 'TS2339', message: "Property 'user' does not exist on type 'App.Locals'" },
      { code: 'TS2532', message: "Object is possibly 'undefined'" }
    ]
  };

  try {
    await buildPromptDemo(testCase.query, testCase.errors);
  } catch (e) {
    console.error('❌ Demo failed:', e.message);
    console.log('\n💡 Make sure Ollama and Qdrant are running:');
    console.log('   - Ollama: http://localhost:11434');
    console.log('   - Qdrant: http://localhost:6333');
  }
}

runDemo().catch(console.error);
