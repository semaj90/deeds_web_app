#!/usr/bin/env node
/**
 * Phase 88 KB Demo - Simple demonstration of KB-grounded code generation
 *
 * This script:
 * 1. Queries your 810-point Svelte 5/SvelteKit 2 knowledge base
 * 2. Uses retrieved context to generate modern code with runes
 * 3. Shows how the KB prevents legacy pattern generation
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';
import { Ollama } from 'ollama';

// CONFIG
const QDRANT_URL = 'http://127.0.0.1:6333';
const OLLAMA_URL = 'http://127.0.0.1:11434';
const FASTMCP_URL = 'http://127.0.0.1:3002';
const COLLECTION = 'phase76_knowledge_base';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const LLM_MODEL = 'gemma3-legal:latest';

// CLIENTS
const qdrant = new QdrantClient({ url: QDRANT_URL });
const ollama = new Ollama({ host: OLLAMA_URL });

/**
 * Query KB via FastMCP knowledge_retrieve tool
 */
async function queryKbViaMcp(query, topK = 5) {
  try {
    const response = await fetch(`${FASTMCP_URL}/function-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'knowledge_retrieve',
        arguments: {
          query,
          collection: COLLECTION,
          top_k: topK
        }
      })
    });

    if (!response.ok) {
      throw new Error(`MCP error: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.log(`⚠️  FastMCP not available, falling back to direct Qdrant: ${error.message}`);
    return null;
  }
}

/**
 * Query KB directly via Qdrant (fallback)
 */
async function queryKbDirect(query, topK = 5) {
  // Get embedding for query
  const embeddingRes = await ollama.embeddings({
    model: EMBEDDING_MODEL,
    prompt: query
  });

  // Search Qdrant
  const searchResults = await qdrant.search(COLLECTION, {
    vector: embeddingRes.embedding,
    limit: topK,
    with_payload: true
  });

  return searchResults.map(r => ({
    score: r.score,
    content: r.payload?.content || r.payload?.text || '',
    metadata: r.payload?.metadata || {}
  }));
}

/**
 * Generate code using KB context
 */
async function generateWithKbContext(task, kbResults) {
  // Build context from KB results
  const context = kbResults
    .map((r, i) => `[KB Reference ${i + 1}] (Score: ${r.score?.toFixed(3)})\n${r.content}`)
    .join('\n\n---\n\n');

  const prompt = `You are a Svelte 5 expert. Use the following official documentation context to complete the task.

DOCUMENTATION CONTEXT:
${context}

TASK: ${task}

REQUIREMENTS:
- Use ONLY Svelte 5 runes syntax ($props(), $state(), $derived(), $effect())
- DO NOT use legacy patterns (export let, $:, onMount from svelte)
- Follow the documentation examples exactly
- Generate clean, type-safe TypeScript code

Generate the complete component code:`;

  console.log('\n🤖 Generating with LLM...');
  const response = await ollama.generate({
    model: LLM_MODEL,
    prompt,
    stream: false
  });

  return response.response;
}

/**
 * Main demo
 */
async function main() {
  console.log('🧠 Phase 88 KB-Grounded Code Generation Demo\n');
  console.log('━'.repeat(60));

  // Test task
  const task = 'Create a Svelte 5 counter component with increment/decrement buttons';
  console.log(`📝 Task: ${task}\n`);

  // Step 1: Query KB
  console.log('🔍 Step 1: Querying KB for Svelte 5 patterns...');
  const query = 'Svelte 5 component with state and event handlers using runes';

  let kbResults;
  const mcpResult = await queryKbViaMcp(query, 3);

  if (mcpResult && mcpResult.content) {
    console.log('✅ Retrieved via FastMCP');
    // Parse MCP response
    kbResults = mcpResult.content.results || [];
  } else {
    console.log('✅ Retrieved via direct Qdrant');
    kbResults = await queryKbDirect(query, 3);
  }

  console.log(`📊 Found ${kbResults.length} relevant KB chunks:\n`);
  kbResults.forEach((r, i) => {
    const preview = (r.content || '').substring(0, 100).replace(/\n/g, ' ');
    console.log(`   ${i + 1}. [Score: ${r.score?.toFixed(3) || 'N/A'}] ${preview}...`);
  });

  // Step 2: Generate code with KB context
  console.log('\n🎯 Step 2: Generating code with KB context...');
  const generatedCode = await generateWithKbContext(task, kbResults);

  // Step 3: Show results
  console.log('\n━'.repeat(60));
  console.log('✨ GENERATED CODE (KB-Grounded):\n');
  console.log(generatedCode);
  console.log('\n━'.repeat(60));

  // Step 4: Verify modern patterns
  console.log('\n🔍 Pattern Analysis:');
  const hasProps = generatedCode.includes('$props()');
  const hasState = generatedCode.includes('$state(');
  const hasDerived = generatedCode.includes('$derived(');
  const hasEffect = generatedCode.includes('$effect(');
  const hasExportLet = generatedCode.includes('export let');
  const hasReactive = generatedCode.includes('$:');
  const hasOnMount = generatedCode.includes('onMount');

  console.log(`   ${hasState ? '✅' : '⚠️ '} Uses $state() for reactive variables`);
  console.log(`   ${hasProps ? '✅' : '⚠️ '} Uses $props() for component props`);
  console.log(`   ${hasDerived ? '✅' : '⚠️ '} Uses $derived() for computed values`);
  console.log(`   ${hasEffect ? '✅' : '⚠️ '} Uses $effect() for side effects`);
  console.log(`   ${!hasExportLet ? '✅' : '❌'} Avoids legacy "export let" syntax`);
  console.log(`   ${!hasReactive ? '✅' : '❌'} Avoids legacy "$:" reactive statements`);
  console.log(`   ${!hasOnMount ? '✅' : '❌'} Avoids legacy "onMount" lifecycle`);

  console.log('\n🎉 Demo Complete!');
  console.log(`📚 KB Size: 810 points (294 Svelte 5 + 338 SvelteKit 2 + 178 other)`);
  console.log('💡 The KB ensures generated code follows Svelte 5 best practices!\n');
}

// Run
main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
