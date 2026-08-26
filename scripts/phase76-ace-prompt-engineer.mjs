// scripts/phase76-ace-prompt-engineer.mjs
// Phase 76 Level 2: ACE Prompt Engineer with Agentic Detection
// Detects legacy code patterns and injects relevant context from deep storage
// Now with MCP tool integration and HTTP API fallback

import { QdrantClient } from '@qdrant/js-client-rest';
import { fetchDeepContext, getCachedResult, cacheResult } from './phase76-storage-layer.mjs';
import dotenv from 'dotenv';

dotenv.config();

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333'
});

const COLLECTION_NAME = 'phase76_knowledge_base';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002';

/**
 * Call MCP tool with fallback to direct implementation
 * @param {string} toolName - MCP tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<any>} Tool result
 */
async function callMCPTool(toolName, args) {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/function-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: toolName, arguments: args }),
      signal: AbortSignal.timeout(5000) // 5s timeout
    });

    if (!response.ok) {
      throw new Error(`MCP call failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.warn(`⚠️  MCP tool '${toolName}' unavailable, using fallback:`, error.message);
    return null;
  }
}

/**
 * Build contextual prompt with agentic detection
 * @param {string} userTask - User's task description
 * @param {string} previousContext - Previous conversation context
 * @returns {string} Enhanced prompt with injected context
 */
async function buildContextualPrompt(userTask, previousContext = '') {
  console.log(`🤔 [Agent] Analyzing task: "${userTask.slice(0, 100)}..."`);

  // 1. Agentic Detection Logic
  const svelte4Patterns = [/on:[a-z]+=/g, /export let \w+/g, /\$\s*:/g];
  const isLegacySvelte = svelte4Patterns.some(
    (p) => p.test(userTask) || p.test(previousContext)
  );

  let additionalContext = '';
  if (isLegacySvelte) {
    console.log('🚨 [Agent] Detected Legacy Svelte 4 Syntax. Activating Migration Protocols...');
    additionalContext += `\n\nCRITICAL INSTRUCTION: The user is using Svelte 4 syntax (on:event, export let). You MUST refactor this to Svelte 5 Runes ($state, $props, onchange).`;
  }

  // 2. Try Redis cache first (via MCP or direct)
  const cacheKey = `ace:prompt:${Buffer.from(userTask).toString('base64').slice(0, 32)}`;

  // Try MCP redis-cache tool first
  const cachedViaMCP = await callMCPTool('redis-cache', {
    operation: 'get',
    key: cacheKey
  });

  if (cachedViaMCP?.success && cachedViaMCP.value) {
    console.log('⚡ [Agent] Using cached context (via MCP)');
    return cachedViaMCP.value;
  }

  // Fallback to direct Redis
  const cached = await getCachedResult(cacheKey);
  if (cached) {
    console.log('⚡ [Agent] Using cached context (direct)');
    return cached;
  }

  // 3. Generate embedding for semantic search
  console.log('🧠 [Agent] Generating query embedding...');
  const embeddingResponse = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: userTask
    })
  });

  if (!embeddingResponse.ok) {
    console.error('❌ [Agent] Failed to generate embedding');
    return userTask;
  }

  const { embedding } = await embeddingResponse.json();

  // 4. Search Qdrant for relevant documentation
  console.log('🔍 [Agent] Searching knowledge base...');
  const { points: searchResults } = await qdrant.query(COLLECTION_NAME, {
    query: embedding,
    limit: 3,
    score_threshold: 0.5
  });

  // 5. Build context from search results
  let context = `TASK: ${userTask}\n\n`;
  context += `RELEVANT DOCUMENTATION:\n`;

  for (const hit of searchResults) {
    const { url, summary, minio_key } = hit.payload;

    // Hydrate deep context from MinIO if available
    if (minio_key) {
      console.log(`📦 [Agent] Hydrating deep context from MinIO: ${minio_key}`);
      const deepDoc = await fetchDeepContext(minio_key);
      if (deepDoc) {
        // Use FULL text from MinIO instead of just summary
        context += `\n\n--- DOCUMENTATION (${deepDoc.url}) ---\n${deepDoc.full_text.slice(0, 2000)}\n`;
        continue;
      }
    }

    // Fallback to summary if MinIO fetch fails
    context += `\n\n--- ${url} ---\n${summary}\n`;
  }

  // 6. Add agentic instructions
  context += additionalContext;

  // 7. Cache the result
  await cacheResult(cacheKey, context, 3600); // 1 hour TTL

  return context;
}

/**
 * Generate LLM response with contextual prompt
 * @param {string} enhancedPrompt - Prompt with injected context
 * @returns {string} LLM response
 */
async function generateResponse(enhancedPrompt) {
  console.log('🤖 [Agent] Generating LLM response...');

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      prompt: enhancedPrompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`LLM failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Main function
 */
async function main() {
  const taskArg = process.argv.find((arg) => arg.startsWith('--task='));

  if (!taskArg) {
    console.log(`
🤖 Phase 76 ACE Prompt Engineer

Usage:
  node scripts/phase76-ace-prompt-engineer.mjs --task="<your task>"

Example:
  node scripts/phase76-ace-prompt-engineer.mjs --task="Fix the on:change event handler in my input component"
    `);
    process.exit(1);
  }

  const userTask = taskArg.split('=')[1].replace(/^["']|["']$/g, '');

  console.log(`\n🚀 Phase 76 ACE Prompt Engineer`);
  console.log(`📝 Task: ${userTask}\n`);

  // Build contextual prompt
  const enhancedPrompt = await buildContextualPrompt(userTask);

  console.log(`\n📊 Enhanced Prompt (${enhancedPrompt.length} chars):`);
  console.log(`${enhancedPrompt.slice(0, 500)}...\n`);

  // Generate response
  const response = await generateResponse(enhancedPrompt);

  console.log(`\n✅ LLM Response:\n`);
  console.log(response);
  console.log(`\n✅ Task complete!`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
