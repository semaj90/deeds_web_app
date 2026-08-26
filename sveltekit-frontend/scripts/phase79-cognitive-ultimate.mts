#!/usr/bin/env npx tsx

/**
 * 🧠 Phase 79: COGNITIVE ULTIMATE AGENT
 *
 * Features:
 * - Safety Gate (Blocks Explanatory Text)
 * - Redis Caching & Recall
 * - Qdrant RAG (Semantic Search)
 * - File Summarization
 * - Smart Model Routing
 * - Self-Healing Loop
 */

import 'dotenv/config';
import postgres from 'postgres';
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import { fileURLToPath } from 'url';
import { validateContent } from './phase79-safety-gate.mjs';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const execAsync = promisify(exec);
const LOGS_DIR = path.join(__dirname, '../logs/phase79');
const MAX_ITERATIONS = parseInt(process.argv[2] || '5');

// DB Clients
const sql = postgres(process.env.DATABASE_URL!);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 🧠 Generate Embedding
async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = `embedding:${Buffer.from(text.substring(0, 200)).toString('base64').substring(0, 64)}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
    });
    const data = await res.json() as { embedding?: number[] };
    const embedding = data.embedding || [];
    if (embedding.length > 0) {
      await redis.setex(cacheKey, 86400, JSON.stringify(embedding)); // 24h cache
    }
    return embedding;
  } catch (e) {
    console.error('Embedding failed:', e);
    return [];
  }
}

// 🧠 Qdrant Search
async function findSimilarFixes(embedding: number[]) {
  if (embedding.length === 0) return [];
  try {
    const { points: res } = await qdrant.query('phase79_knowledge_base', {
      query: embedding,
      limit: 3,
      with_payload: true
    });
    return res.map(r => ({
      patch: r.payload?.patch as string,
      score: r.score
    }));
  } catch (e) { return []; }
}

// 🧠 LLM Call (Gemini)
async function callGemini(prompt: string) {
  if (!GEMINI_API_KEY) throw new Error('No Gemini API Key');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// 🧠 Code Summarizer
async function summarizeFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const imports = lines.filter(l => l.includes('import ')).slice(0, 5).join('\n');
    const exports = lines.filter(l => l.includes('export ')).slice(0, 5).join('\n');
    return `// FILE: ${path.basename(filePath)}\n// IMPORTS:\n${imports}\n// EXPORTS:\n${exports}\n\n// CONTENT:\n${lines.slice(0, 50).join('\n')}`;
  } catch { return '// Could not read file'; }
}

// 🔄 Main Loop
async function runCycle(iteration: number) {
  console.log(`\n🔄 Iteration ${iteration}/${MAX_ITERATIONS}`);

  // 1. Fetch Task with JOIN
  const [task] = await sql`
    SELECT
      es.id,
      es.summary,
      es.patch,
      ec.error_code,
      ec.file_path,
      ec.message as error_message,
      COALESCE(es.risk_level, 'medium') as risk_level
    FROM error_suggestions es
    JOIN error_cluster ec ON es.cluster_id::text = ec.cluster_id::text
    WHERE es.applied = false
    ORDER BY CASE WHEN es.risk_level = 'high' THEN 1 ELSE 2 END
    LIMIT 1
  `;

  if (!task) {
    console.log('✅ No pending tasks!');
    process.exit(0);
  }

  // Handle path correctly (avoid double src)
  let relativePath = task.file_path || '';
  if (relativePath.startsWith('src/') || relativePath.startsWith('src\\')) {
    relativePath = relativePath; // Already has src prefix
  } else {
    relativePath = path.join('src', relativePath);
  }

  const filePath = path.join(process.cwd(), relativePath);
  console.log(`🎯 Targeting: ${task.error_code} in ${path.basename(filePath)}`);

  // 2. Cognitive Context
  const embedding = await generateEmbedding(`${task.error_code || ''} ${task.summary || ''}`);
  const similarFixes = await findSimilarFixes(embedding);
  const fileContext = await summarizeFile(filePath);

  // 3. Construct Prompt
  const prompt = `You are a TypeScript Expert. Fix this bug.

  ERROR:
  ${task.error_code}: ${task.summary || task.error_message}

  FILE CONTEXT:
  ${fileContext}

  SIMILAR FIXES:
  ${similarFixes.map(f => (f.patch || '').substring(0, 200)).join('\n---\n')}

  ORIGNAL SUGGESTION:
  ${(task.patch || '').substring(0, 500)}

  INSTRUCTIONS:
  1. Output ONLY valid TypeScript/Svelte code.
  2. No markdown, no explanations.
  3. Code must run immediately.
  `;

  // 4. Generate Fix
  console.log('   🧠 Generating fix with Gemini...');
  const rawOutput = await callGemini(prompt);

  // 5. SAFETY GATE 🔒
  console.log('   🔒 Checking Safety Gate...');
  const validation = await validateContent(rawOutput, filePath);

  if (!validation.isValid) {
    console.log(`   ❌ Safety Gate Blocked: ${validation.issues.join(', ')}`);
    // Log failure but don't crash
    await sql`
      INSERT INTO fix_attempts (
        suggestion_id,
        fix_type,
        fix_diff,
        success,
        metadata
      )
      VALUES (
        ${task.id},
        'cognitive_agent',
        ${rawOutput},
        false,
        ${JSON.stringify({
          file_path: task.file_path,
          error_message: 'Safety Gate: ' + validation.issues.join(', ')
        })}
      );
    `;
    await sql`UPDATE error_suggestions SET applied = true WHERE id = ${task.id}`;
    return;
  }

  // 6. Apply Fix
  console.log('   📝 Applying validated patch...');
  const originalContent = await fs.readFile(filePath, 'utf-8').catch(() => '');
  await fs.writeFile(filePath, validation.sanitizedCode || rawOutput);

  // 7. Verify
  console.log('   ✅ Verifying...');
  try {
    await execAsync(`npx svelte-check --threshold error --input "${filePath}"`);
    console.log('   ✅ Verification Passed!');

    // Log Success
    await sql`
      INSERT INTO fix_attempts (
        suggestion_id,
        fix_type,
        fix_diff,
        success,
        metadata
      )
      VALUES (
        ${task.id},
        'cognitive_agent',
        ${validation.sanitizedCode},
        true,
        ${JSON.stringify({ file_path: task.file_path })}
      );
    `;

    // Update Knowledge Base
    if (embedding.length > 0) {
      // Logic to upsert to Qdrant would go here
    }

  } catch (e: any) {
    console.log('   ⚠️ Verification Failed. Reverting...');
    await fs.writeFile(filePath, originalContent);
     await sql`
      INSERT INTO fix_attempts (
        suggestion_id,
        fix_type,
        fix_diff,
        success,
        metadata
      )
      VALUES (
        ${task.id},
        'cognitive_agent',
        ${validation.sanitizedCode},
        false,
        ${JSON.stringify({
          file_path: task.file_path,
          error_message: 'Verification Failed'
        })}
      );
    `;
  }

  // Mark as processed
  await sql`UPDATE error_suggestions SET applied = true WHERE id = ${task.id}`;
}

// Run
(async () => {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  console.log('🚀 Phase 79 Cognitive Ultimate Started');

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    await runCycle(i);
  }

  console.log('🏁 Batch Complete');
  process.exit(0);
})().catch(console.error);
