#!/usr/bin/env node
/**
 * Phase 79: Test Knowledge Base Pipeline
 *
 * Tests: upload → embed → store → search → generate
 */

import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5175';

async function test() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🧪 KNOWLEDGE BASE PIPELINE TEST                         ║');
  console.log('║   Upload → Embed → Store → Search → Generate             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Create sample document
    console.log('1️⃣  Creating sample document...');
    const sampleDoc = `
# TypeScript Best Practices

## Type Inference
TypeScript can automatically infer types from values. Use const assertions for literals:
const x = 'hello' as const; // Type: "hello"

## Generics
Generics allow you to create reusable components with type safety:
function identity<T>(arg: T): T { return arg; }

## Union Types
Union types let values be multiple types:
type ID = string | number;
const id: ID = 123; // OK

## Discriminated Unions
Use a common property (discriminant) to narrow types:
type Result =
  | { success: true; data: string }
  | { success: false; error: Error };
`;

    const testFile = '/tmp/typescript-guide.md';
    fs.writeFileSync(testFile, sampleDoc);
    console.log('   ✅ Created typescript-guide.md\n');

    // Test 2: Upload document
    console.log('2️⃣  Uploading document...');
    const formData = new FormData();
    formData.append('files', fs.createReadStream(testFile));
    formData.append('source', 'test-pipeline');

    const uploadRes = await fetch(`${BASE_URL}/api/knowledge`, {
      method: 'POST',
      body: formData
    });

    const uploadData = await uploadRes.json();
    if (uploadData.success) {
      console.log(`   ✅ Uploaded: ${uploadData.results[0].chunks} chunks, ${uploadData.results[0].points} vectors\n`);
    } else {
      console.error(`   ❌ Upload failed: ${uploadData.error}\n`);
      return;
    }

    // Test 3: Search knowledge base
    console.log('3️⃣  Searching knowledge base...');
    const searchRes = await fetch(
      `${BASE_URL}/api/knowledge?q=TypeScript%20generics&limit=3`
    );

    const searchData = await searchRes.json();
    if (searchData.success) {
      console.log(`   ✅ Found ${searchData.matches.length} matches:`);
      searchData.matches.forEach((m, i) => {
        console.log(`      ${i + 1}. [${(m.score * 100).toFixed(1)}%] ${m.document}`);
      });
      console.log();
    } else {
      console.error(`   ❌ Search failed: ${searchData.error}\n`);
      return;
    }

    // Test 4: Generate with RAG
    console.log('4️⃣  Generating response with RAG...');
    const generateRes = await fetch(`${BASE_URL}/api/knowledge`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'What are TypeScript generics and why are they useful?',
        max_context_chunks: 3,
        use_gemini: false
      })
    });

    const generateData = await generateRes.json();
    if (generateData.success) {
      console.log(`   ✅ Generated (${generateData.llm}):`);
      console.log(`      RAG: ${generateData.rag_context.matches} matches, avg ${generateData.rag_context.avg_similarity}% similarity\n`);
      console.log('   Response (first 300 chars):');
      console.log(`      "${generateData.response.substring(0, 300)}..."\n`);
    } else {
      console.error(`   ❌ Generation failed: ${generateData.error}\n`);
      return;
    }

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   ✅ PIPELINE TEST COMPLETE                              ║');
    console.log('║   All steps working: Upload → Search → Generate          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

  } catch (err) {
    console.error('❌ Test error:', err);
    process.exit(1);
  }
}

test();
