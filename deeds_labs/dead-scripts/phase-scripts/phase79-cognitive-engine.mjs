#!/usr/bin/env node
/**
 * 🧠 PHASE 79: COGNITIVE ENGINE (ULTIMATE)
 *
 * Generates high-quality code patches by:
 * 1. Reading source files & extracting structure.
 * 2. Fetching specific errors from DB.
 * 3. Building rich RAG context (Qdrant + Redis).
 * 4. Generating patches with Dual-Mode LLM (Gemini Cloud -> Gemma Local).
 * 5. Validating via Safety Gate (4-layer scoring).
 * 6. Ranking by Composite Score.
 * 7. Outputting to JSONL for Phase 72 execution.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';
import fs from 'fs/promises';
import Redis from 'ioredis';
import path, { dirname } from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const OUTPUT_FILE = path.join(__dirname, '../data/recommendations.jsonl');
const BATCH_SIZE = process.argv[2] ? parseInt(process.argv[2]) : 50;
const MIN_CONFIDENCE_THRESHOLD = 50;

// Clients
const sql = postgres(process.env.DATABASE_URL);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

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
    if (!response.ok) return [];
    const data = await response.json();
    return data.embedding || [];
  } catch (e) {
    console.warn('⚠️ Embedding generation failed:', e.message);
    return [];
  }
}

// 1. FILE ANALYSIS
async function analyzeFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    return {
      content,
      imports: lines.filter(l => l.trim().startsWith('import ')).join('\n'),
      exports: lines.filter(l => l.trim().startsWith('export ')).join('\n'),
      preview: lines.slice(0, 50).join('\n'),
      lineCount: lines.length
    };
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.warn(`⚠️ File not found (skipped): ${filePath}`);
      return null;
    }
    console.error(`❌ Failed to read file ${filePath}: ${e.message}`);
    return null;
  }
}

// 2. FETCH ERRORS
async function fetchFileErrors(filePath) {
  const relativePath = filePath.replace(/.*src[\/\\]/, '');
  const errors = await sql`
    SELECT error_code, message, count
    FROM error_cluster
    WHERE file_path LIKE ${'%' + relativePath + '%'}
    ORDER BY count DESC
    LIMIT 5
  `;
  return errors;
}

// Security-sensitive keywords that trigger enhanced retrieval
const SECURITY_KEYWORDS = ['auth', 'session', 'cookie', 'csrf', 'upload', 'presign', 'rate limit', 'validation', 'token', 'password', 'login'];

// 3. RAG: RETRIEVE POLICIES & SIMILAR FIXES (Policy-First with Minimum Coverage)
async function retrieveContext(embedding, query = '') {
  if (!embedding || embedding.length === 0) return { policies: [], similarFixes: [], codebaseRoutes: [] };

  const isSecuritySensitive = SECURITY_KEYWORDS.some(keyword =>
    query.toLowerCase().includes(keyword)
  );

  try {
    // 3a. Policy Search (Boosted for patterns/docs)
    const policyRes = await qdrant.search('knowledge_base', {
      vector: embedding,
      filter: {
        must: [
          { key: "source", match: { value: "local" } }
        ]
      },
      limit: isSecuritySensitive ? 5 : 3, // More policies for security queries
      with_payload: true,
      score_threshold: isSecuritySensitive ? 0.50 : 0.60 // Lower threshold for security
    });

    // 3b. Similar Fixes Search (General knowledge/past fixes)
    const fixRes = await qdrant.search('knowledge_base', {
      vector: embedding,
      limit: 5,
      with_payload: true,
      score_threshold: 0.5
    });

    // 3c. Codebase Routes Search (Actual route implementations)
    let codebaseRoutes = [];
    try {
      const routeRes = await qdrant.search('codebase_routes', {
        vector: embedding,
        limit: 3,
        with_payload: true,
        score_threshold: 0.45 // Slightly lower - prioritize real code examples
      });
      codebaseRoutes = routeRes.map(r => ({
        path: r.payload?.path || 'unknown',
        features: r.payload?.features || {},
        content: r.payload?.content || '',
        score: r.score
      }));
    } catch (e) {
      console.warn('⚠️ Codebase routes not available:', e.message);
    }

    const formatResult = (r) => ({
      content: r.payload?.patch || r.payload?.content || '',
      file: r.payload?.file || 'unknown',
      section: r.payload?.section || '',
      source: r.payload?.source || 'unknown',
      score: r.score
    });

    const rawPolicies = policyRes.map(formatResult);
    const rawFixes = fixRes.map(formatResult);

    // Deduplication helper
    const dedupe = (items) => {
      const seen = new Set();
      return items.filter(item => {
        // Create a unique key based on file and section (or content snippet if section is missing)
        const key = `${item.file}:${item.section || item.content.substring(0, 50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    let policies = dedupe(rawPolicies);
    let similarFixes = dedupe(rawFixes);

    // POLICY-FIRST ENFORCEMENT: Ensure minimum coverage for security-sensitive queries
    if (isSecuritySensitive) {
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

      if (!hasSecurityPolicy || !hasValidationPolicy || !hasOperationalPolicy) {
        console.warn('⚠️ Minimum coverage not met - fetching fallback policies...');
        // Fetch specific policies if missing
        const fallbacks = await Promise.all([
          !hasSecurityPolicy ? qdrant.scroll('knowledge_base', {
            filter: { should: [
              { key: 'file', match: { value: 'protected-endpoints.md' } },
              { key: 'file', match: { value: 'lucia-auth.md' } }
            ]},
            limit: 2
          }) : null,
          !hasValidationPolicy ? qdrant.scroll('knowledge_base', {
            filter: { key: 'file', match: { value: 'zod-validation.md' } },
            limit: 1
          }) : null
        ]);

        fallbacks.forEach((fb, idx) => {
          if (fb && fb.points) {
            const formatted = fb.points.map(formatResult);
            if (idx === 0 && !hasSecurityPolicy) policies.unshift(...formatted);
            if (idx === 1 && !hasValidationPolicy) policies.push(...formatted);
          }
        });
      }
    }

    return {
      policies,
      similarFixes,
      codebaseRoutes
    };
  } catch (e) {
    console.warn("⚠️ RAG Search skipped:", e.message);
    return { policies: [], similarFixes: [], codebaseRoutes: [] };
  }
}

// 4. GENERATE PROMPT
function buildPrompt(fileAnalysis, errors, context) {
  const { policies, similarFixes, codebaseRoutes } = context;
  const errorContext = errors.map(e => `- [${e.error_code}] ${e.message}`).join('\n');

  const policySection = policies.length > 0
    ? `\n🚨 MANDATORY POLICIES & PATTERNS:\n${policies.map(p => `[${p.file}] ${p.section || ''}\n${p.content.substring(0, 600)}...`).join('\n\n')}`
    : '';

  const knowledgeContext = similarFixes.length > 0
    ? `\nRELEVANT KNOWLEDGE & EXAMPLES:\n${similarFixes.map(f => {
        const source = f.source === 'local' ? `📚 ${f.file}${f.section ? ` → ${f.section}` : ''}` : '🔧 Past Fix';
        return `${source} (${(f.score * 100).toFixed(1)}%)\n${f.content.substring(0, 400)}`;
      }).join('\n\n')}`
    : '';

  const codebaseSection = codebaseRoutes.length > 0
    ? `\n🎯 ACTUAL CODEBASE ROUTES (Real Implementation Examples):\n${codebaseRoutes.map(r => `Route: ${r.path} (${(r.score * 100).toFixed(1)}% match)\nFeatures: ${JSON.stringify(r.features, null, 2)}\n${r.content.substring(0, 300)}...`).join('\n\n')}`
    : '';

  return `You are a TypeScript Expert (Gemma3-Legal). Fix the errors in this file using best practices.

ERRORS:
${errorContext}

${policySection}

${codebaseSection}

${knowledgeContext}

FILE CONTEXT:
// Imports
${fileAnalysis.imports}
// Exports
${fileAnalysis.exports}
// Content Preview
${fileAnalysis.preview}

INSTRUCTIONS:
1. Return ONLY the complete, valid TypeScript/Svelte code for the file (or the corrected section).
2. DO NOT wrap in markdown blocks like \`\`\`typescript.
3. DO NOT include "Here is the fix" or any explanation.
4. If the file is truncated in preview, ensure your patch focuses on fixing the logic shown or inferred.
5. Follow the MANDATORY POLICIES exactly - they are non-negotiable security/validation requirements.
6. Use ACTUAL CODEBASE ROUTES as reference implementations when available.
`;
}

// 5. LLM CALL (Dual-Mode: Cloud Gemini -> Local Gemma)
async function callLLM(prompt) {
  // Try Gemini first (Speed/Quality)
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
      }
    } catch (e) {
      console.warn("⚠️ Gemini failed, failing over to local Gemma3...");
    }
  }

  // Fallback to Ollama (Local Privacy/No Cost)
  try {
    // console.log("   🦙 Calling local gemma3-legal:latest...");
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal:latest', // User specified model
        prompt: prompt,
        stream: false,
        options: { temperature: 0.2, num_ctx: 4096 }
      })
    });
    const data = await res.json();
    return (data.response || '').replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
  } catch (e) {
    console.error("❌ All LLMs failed:", e.message);
    return "";
  }
}

// 6. SAFETY GATE SCORING
function validatePatch(patch, originalContent) {
  let score = 100;
  const issues = [];

  // Content Type Check (40%)
  const docPatterns = [/Here is/, /To fix this/, /I have updated/, /Please note/];
  if (docPatterns.some(p => p.test(patch.substring(0, 100)))) {
    score -= 40;
    issues.push("Detected documentation/explanation text");
  }

  // Syntax Balance (20%)
  const openBraces = (patch.match(/{/g) || []).length;
  const closeBraces = (patch.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    score -= 20;
    issues.push("Unbalanced braces");
  }

  // Valid Quotes (15%)
  const openParens = (patch.match(/\(/g) || []).length;
  const closeParens = (patch.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    score -= 15;
    issues.push("Unbalanced parentheses");
  }

  // Length Check (10%)
  if (patch.length < 10) {
    score -= 10;
    issues.push("Patch too short");
  }

  return { score, issues, isValid: score >= 50 };
}

// MAIN ENGINE
async function runEngine() {
  console.log("🚀 Starting Phase 79 Cognitive Engine (Ollama + Gemini + RAG)...");

  const problematicFiles = await sql`
    SELECT DISTINCT file_path
    FROM error_cluster
    WHERE file_path IS NOT NULL AND file_path != ''
    LIMIT ${BATCH_SIZE}
  `;

  console.log(`🎯 Targeting ${problematicFiles.length} files...`);

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  const stream = await fs.open(OUTPUT_FILE, 'w');

  for (const record of problematicFiles) {
    const fullPath = path.resolve(process.cwd(), record.file_path.startsWith('src') ? record.file_path : 'src/' + record.file_path);

    // 1. Analyze
    const analysis = await analyzeFile(fullPath);
    if (!analysis) continue;

    // 2. Fetch Errors
    const errors = await fetchFileErrors(fullPath);
    if (errors.length === 0) continue;

    // 3. RAG Lookup - Generate embedding from error context
    const errorQuery = errors.map(e => `${e.error_code}: ${e.message}`).join(' ');
    const embedding = await generateEmbedding(errorQuery);
    const context = await retrieveContext(embedding, errorQuery); // Pass query for security keyword detection

    // 4. Generate
    console.log(`🧠 Processing ${path.basename(fullPath)} (${errors.length} errors, ${context.policies.length} Policies, ${context.similarFixes.length} Fixes, ${context.codebaseRoutes.length} Routes)`);
    const prompt = buildPrompt(analysis, errors, context);
    const patch = await callLLM(prompt);

    // 5. Validate
    const validation = validatePatch(patch, analysis.content);

    // 6. Output
    const result = {
      file_path: record.file_path,
      error_count: errors.length,
      validation_score: validation.score,
      validation_issues: validation.issues,
      patch_preview: patch.substring(0, 100).replace(/\n/g, ' '),
      full_patch: patch,
      composite_score: validation.score,
      confidence_level: validation.score > 80 ? "HIGH" : (validation.score > 50 ? "MEDIUM" : "LOW")
    };

    if (result.validation_score >= MIN_CONFIDENCE_THRESHOLD) {
      await stream.write(JSON.stringify(result) + '\n');
      console.log(`   ✅ Valid Patch generated (Score: ${validation.score})`);
    } else {
      console.log(`   ❌ Blocked by Safety Gate (Score: ${validation.score}) - ${validation.issues.join(', ')}`);
    }
  }

  await stream.close();
  await sql.end();
  redis.disconnect();
  console.log(`\n🎉 Output saved to ${OUTPUT_FILE}`);
}

runEngine().catch(console.error);
