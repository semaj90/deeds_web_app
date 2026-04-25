#!/usr/bin/env node
/**
 * Phase 79: Smart Dataset Generator
 *
 * Actually reads files, summarizes content, queries RAG/KAG, generates ranked JSONL
 *
 * Flow:
 * 1. Read actual file content
 * 2. Summarize: imports, exports, types, functions, patterns
 * 3. Query RAG/KAG with file summary + error context
 * 4. Generate patch with full context
 * 5. Validate patch (code vs documentation)
 * 6. Rank by cosine similarity + validation score
 * 7. Output JSONL with inverse ranking (1-10 scale)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { readFile } from 'fs/promises';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db');
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const GEMINI_KEY = process.env.GEMINI_API_KEY;

/**
 * STEP 1: Read and analyze actual file content
 */
async function analyzeFileContent(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');

    // Extract structure
    const imports = (content.match(/^import\s+.+$/gm) || []).slice(0, 10);
    const exports = (content.match(/^export\s+(const|function|class|interface|type)\s+(\w+)/gm) || []).slice(0, 10);
    const types = (content.match(/^(interface|type)\s+(\w+)/gm) || []).slice(0, 5);
    const functions = (content.match(/^(function|const)\s+(\w+)/gm) || []).slice(0, 10);

    // Keywords for context
    const keywords = [
      ...new Set([
        ...(content.match(/\b(async|await|Promise|fetch|request|response)\b/g) || []),
        ...(content.match(/\b(svelte|component|props|state|effect|derived)\b/gi) || []),
        ...(content.match(/\b(type|interface|class|extends|implements)\b/g) || [])
      ])
    ].slice(0, 15);

    // Summary
    const summary = {
      filePath,
      lineCount: content.split('\n').length,
      charCount: content.length,
      imports: imports.map(i => i.trim()),
      exports: exports.map(e => e.trim()),
      types: types.map(t => t.trim()),
      functions: functions.map(f => f.trim()),
      keywords,
      firstLines: content.split('\n').slice(0, 10).join('\n'),
      contentPreview: content.substring(0, 500),
    };

    return { success: true, summary, fullContent: content };
  } catch (err) {
    return { success: false, error: err.message, summary: null };
  }
}

/**
 * STEP 2: Generate embedding from file summary for RAG search
 */
async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text.substring(0, 8000)
      })
    });

    const data = await response.json();
    return data.embedding || [];
  } catch (err) {
    console.error(`⚠️  Embedding failed: ${err.message}`);
    return null;
  }
}

/**
 * STEP 3: Query RAG/KAG with file summary + error context
 */
async function queryRAGKAG(fileSummary, errorContext) {
  // Build rich query from file analysis
  const ragQuery = `
File: ${fileSummary.filePath}
Imports: ${fileSummary.imports.slice(0, 5).join(', ')}
Exports: ${fileSummary.exports.slice(0, 5).join(', ')}
Types: ${fileSummary.types.slice(0, 3).join(', ')}
Keywords: ${fileSummary.keywords.slice(0, 10).join(', ')}
Errors: ${errorContext.errorCodes.join(', ')}
Error Messages: ${errorContext.messages.slice(0, 2).join(' | ')}
  `.trim();

  console.log(`   🔍 RAG Query: ${ragQuery.substring(0, 150)}...`);

  // Generate embedding
  const queryEmbedding = await generateEmbedding(ragQuery);
  if (!queryEmbedding) {
    return { similarities: [], avgSimilarity: 0 };
  }

  // Search Qdrant
  try {
    const searchResults = await qdrant.search('phase79_knowledge_base', {
      vector: queryEmbedding,
      limit: 5,
      score_threshold: 0.7
    });

    const similarities = searchResults.map(r => ({
      content: r.payload?.content || '',
      similarity: r.score || 0,
      chunkType: r.payload?.chunk_type || 'unknown'
    }));

    const avgSimilarity = similarities.length > 0
      ? similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length
      : 0;

    return { similarities, avgSimilarity };
  } catch (err) {
    console.error(`   ⚠️  RAG search failed: ${err.message}`);
    return { similarities: [], avgSimilarity: 0 };
  }
}

/**
 * STEP 4: Generate patch with full file context + RAG results
 */
async function generatePatchWithContext(fileSummary, errorContext, ragResults) {
  const prompt = `You are a TypeScript/Svelte expert. Fix errors in this file using the provided context.

═══════════════════════════════════════════════════
FILE ANALYSIS
═══════════════════════════════════════════════════
Path: ${fileSummary.filePath}
Lines: ${fileSummary.lineCount}
Type: ${fileSummary.filePath.endsWith('.svelte') ? 'Svelte Component' : 'TypeScript Module'}

Imports (${fileSummary.imports.length}):
${fileSummary.imports.slice(0, 5).join('\n')}

Exports (${fileSummary.exports.length}):
${fileSummary.exports.slice(0, 5).join('\n')}

Types:
${fileSummary.types.slice(0, 3).join('\n')}

Functions:
${fileSummary.functions.slice(0, 5).join('\n')}

First Lines:
\`\`\`typescript
${fileSummary.firstLines}
\`\`\`

═══════════════════════════════════════════════════
ERRORS TO FIX (${errorContext.errorCount} total)
═══════════════════════════════════════════════════
${errorContext.messages.slice(0, 5).map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

═══════════════════════════════════════════════════
SIMILAR SOLUTIONS FROM KNOWLEDGE BASE
═══════════════════════════════════════════════════
${ragResults.similarities.slice(0, 3).map((s, i) => `
${i + 1}. [Similarity: ${(s.similarity * 100).toFixed(1)}%] ${s.chunkType}
   ${s.content.substring(0, 200)}...
`).join('\n')}

Average RAG Similarity: ${(ragResults.avgSimilarity * 100).toFixed(1)}%

═══════════════════════════════════════════════════
REQUIREMENTS - CRITICAL
═══════════════════════════════════════════════════
1. Output ONLY executable code (no explanations)
2. NO markdown except code block
3. NO "The error is...", NO "This fix..."
4. Match file structure (preserve imports/exports)
5. Use TypeScript strict mode
6. For Svelte: Use \$state(), \$derived(), \$effect()

If unfixable, return: UNFIXABLE: [reason]

═══════════════════════════════════════════════════
OUTPUT (CODE ONLY)
═══════════════════════════════════════════════════
\`\`\`typescript
// Your fixed code here
\`\`\``;

  // Query LLM (Gemini for high complexity, Ollama for simple)
  const useGemini = errorContext.errorCount > 5 || ragResults.avgSimilarity < 0.75;

  try {
    if (useGemini && GEMINI_KEY) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await response.json();
      const patchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { patch: patchText, llmUsed: 'gemini-2.0-flash-exp' };
    } else {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt,
          stream: false
        })
      });

      const data = await response.json();
      return { patch: data.response || '', llmUsed: 'gemma3-legal' };
    }
  } catch (err) {
    console.error(`   ⚠️  LLM generation failed: ${err.message}`);
    return { patch: null, llmUsed: 'none', error: err.message };
  }
}

/**
 * STEP 5: Validate patch (code vs documentation detector)
 */
function validatePatch(patchText, filePath) {
  if (!patchText || patchText.trim().length < 10) {
    return { isValid: false, score: 0, reason: 'Empty or too short' };
  }

  let score = 0;
  const text = patchText.trim();

  // Check 1: Detect documentation patterns (BAD)
  const docPatterns = [
    /^#\s+No code fix needed/i,
    /^The error (summary|indicates)/i,
    /suggests a corruption/i,
    /trigger a full rebuild/i,
    /npm run dev/i,
    /Without more context/i
  ];

  for (const pattern of docPatterns) {
    if (pattern.test(text)) {
      return { isValid: false, score: 0, reason: 'Documentation detected' };
    }
  }
  score += 40; // Passed doc check

  // Check 2: Code markers (GOOD)
  const codePatterns = [
    /^import\s+/m,
    /^export\s+/m,
    /^(const|let|var|function|class|interface|type)\s+/m,
    /:\s*\w+\s*[=;{]/m,
    /\$state\(|\$derived\(|\$effect\(/
  ];

  const matches = codePatterns.filter(p => p.test(text)).length;
  score += Math.min(matches * 10, 30); // Up to +30

  // Check 3: Balanced syntax
  const braces = (text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length;
  const brackets = (text.match(/\[/g) || []).length === (text.match(/\]/g) || []).length;
  const parens = (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length;

  if (braces) score += 10;
  if (brackets) score += 10;
  if (parens) score += 10;

  const isValid = score >= 50;
  return { isValid, score, reason: isValid ? 'Valid code' : 'Low code confidence' };
}

/**
 * STEP 6: Calculate composite score and inverse ranking
 */
function calculateScores(validationResult, ragResults) {
  const validationScore = validationResult.score; // 0-100
  const avgSimilarity = ragResults.avgSimilarity; // 0-1

  // Composite: 60% validation + 40% RAG similarity
  const composite = (validationScore * 0.6) + (avgSimilarity * 100 * 0.4);

  // Inverse ranking (1-10, 10 = best)
  const cosineSimilarityRank = Math.ceil(avgSimilarity * 10);
  const inverseRank = 11 - cosineSimilarityRank; // Flip scale

  return {
    validationScore,
    cosineSimilarity: avgSimilarity,
    cosineSimilarityRank,
    inverseSearchRank: inverseRank,
    compositeScore: composite,
    confidenceLevel: composite >= 80 ? 'HIGH' : composite >= 60 ? 'MEDIUM' : 'LOW'
  };
}

/**
 * MAIN: Process files and generate dataset
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   📊 PHASE 79 SMART DATASET GENERATOR                     ║');
  console.log('║   File Analysis + RAG/KAG + Ranked JSONL                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Fetch files with errors
  const errorFiles = await sql`
    SELECT
      file_path,
      error_code,
      message,
      COUNT(*) as error_count
    FROM error_cluster
    WHERE file_path IS NOT NULL
      AND file_path NOT LIKE '%/__non_route__%'
      AND file_path NOT LIKE '%/node_modules/%'
    GROUP BY file_path, error_code, message
    ORDER BY error_count DESC
    LIMIT 20
  `;  console.log(`📋 Found ${errorFiles.length} files with errors\n`);

  const recommendations = [];

  for (const [index, fileGroup] of errorFiles.entries()) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📝 [${index + 1}/${errorFiles.length}] ${fileGroup.file_path}`);
    console.log(`   Errors: ${fileGroup.error_count} | Code: ${fileGroup.error_code}`);

    // STEP 1: Analyze file
    const analysis = await analyzeFileContent(fileGroup.file_path);
    if (!analysis.success) {
      console.log(`   ❌ Failed to read file: ${analysis.error}\n`);
      continue;
    }

    console.log(`   ✅ File analyzed (${analysis.summary.lineCount} lines)`);

    // STEP 2-3: Query RAG/KAG
    const errorContext = {
      errorCodes: [fileGroup.error_code],
      messages: [fileGroup.message],
      errorCount: fileGroup.error_count
    };

    const ragResults = await queryRAGKAG(analysis.summary, errorContext);
    console.log(`   🔍 RAG: ${ragResults.similarities.length} matches (avg ${(ragResults.avgSimilarity * 100).toFixed(1)}%)`);

    // STEP 4: Generate patch
    const generation = await generatePatchWithContext(analysis.summary, errorContext, ragResults);
    if (!generation.patch) {
      console.log(`   ❌ Patch generation failed\n`);
      continue;
    }

    console.log(`   🤖 LLM: ${generation.llmUsed}`);

    // STEP 5: Validate
    const validation = validatePatch(generation.patch, fileGroup.file_path);
    console.log(`   ✅ Validation: ${validation.score}% - ${validation.reason}`);

    // STEP 6: Score and rank
    const scores = calculateScores(validation, ragResults);
    console.log(`   📊 Composite: ${scores.compositeScore.toFixed(1)} | Confidence: ${scores.confidenceLevel}`);
    console.log(`   📈 Rankings - Cosine: ${scores.cosineSimilarityRank}/10 | Inverse: ${scores.inverseSearchRank}/10\n`);

    // Add to dataset
    recommendations.push({
      file_path: fileGroup.file_path,
      error_code: fileGroup.error_code,
      error_count: fileGroup.error_count,
      patch: generation.patch.substring(0, 1000), // Limit for JSONL
      llm_used: generation.llmUsed,
      validation_score: scores.validationScore,
      cosine_similarity: scores.cosineSimilarity,
      cosine_rank_1_10: scores.cosineSimilarityRank,
      inverse_search_rank: scores.inverseSearchRank,
      composite_score: scores.compositeScore,
      confidence_level: scores.confidenceLevel,
      rag_matches: ragResults.similarities.length,
      file_analysis: {
        line_count: analysis.summary.lineCount,
        imports: analysis.summary.imports.length,
        exports: analysis.summary.exports.length
      },
      timestamp: new Date().toISOString()
    });
  }

  // Output JSONL
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ Generated ${recommendations.length} recommendations\n`);

  for (const rec of recommendations) {
    console.log(JSON.stringify(rec));
  }

  await sql.end();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
