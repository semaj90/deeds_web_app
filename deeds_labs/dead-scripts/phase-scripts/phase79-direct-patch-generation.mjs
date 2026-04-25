#!/usr/bin/env node
/**
 * Phase 79: Direct Patch Generation with RAG/KAG Ranking
 *
 * Bypasses Phase 78 bad suggestions and generates fresh patches directly from errors
 * - Reads error clusters from database
 * - Generates patches using LLM + RAG/KAG context
 * - Creates JSONL dataset with cosine similarity ranking
 * - Validates all patches before storing
 *
 * Output: recommendations.jsonl with ranked suggestions
 */

import fs from 'fs/promises';
import path from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { validateFileContent } from './phase79-safety-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Database connection
const sql = postgres(process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db');

// Qdrant for similarity search
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const log = {
  header: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  progress: (msg) => console.log(`${colors.magenta}⚙ ${msg}${colors.reset}`)
};

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: FETCH ERROR CLUSTERS (Skip Phase 78)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchErrorClusters(limit = 50) {
  log.header('STEP 1: Fetch Error Clusters (Direct from Errors)');

  try {
    const clusters = await sql`
      SELECT
        error_code,
        COUNT(*) as count,
        ARRAY_AGG(DISTINCT file_path) as files,
        ARRAY_AGG(DISTINCT error_message LIMIT 3) as messages,
        ARRAY_AGG(code LIMIT 1)[1] as sample_code
      FROM compile_errors
      WHERE error_code IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM error_suggestions
          WHERE error_suggestions.error_code = compile_errors.error_code
            AND error_suggestions.status = 'applied'
        )
      GROUP BY error_code
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    log.success(`Found ${clusters.length} error clusters`);
    for (const cluster of clusters.slice(0, 5)) {
      log.info(`  • Error ${cluster.error_code}: ${cluster.count} occurrences (${cluster.files.length} files)`);
    }

    return clusters;
  } catch (error) {
    log.warn(`Error fetching clusters: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: QUERY RAG/KAG FOR SIMILAR SOLUTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function queryKnowledgeBase(errorCode, errorMessage, count = 5) {
  log.progress(`Querying knowledge base for error ${errorCode}...`);

  try {
    // Search in Qdrant
    const searchQuery = `${errorCode} ${errorMessage}`.substring(0, 100);

    const response = await fetch(`${QDRANT_URL}/collections/error_solutions/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: new Array(1536).fill(0), // Placeholder - would use real embedding
        limit: count,
        with_payload: true
      })
    }).catch(() => null);

    if (!response || !response.ok) {
      // Fallback to database similarity search
      const results = await sql`
        SELECT
          chunk_id,
          chunk_type,
          content,
          metadata,
          similarity_score
        FROM knowledge_base
        WHERE chunk_type IN ('successful_patch', 'error_pattern', 'solution')
          AND metadata->>'error_category' = ${errorCode}
        ORDER BY similarity_score DESC
        LIMIT ${count}
      `;

      log.info(`  Found ${results.length} similar solutions in KB`);
      return results;
    }

    const results = await response.json();
    return results.result?.map(r => ({
      chunk_id: r.id,
      content: r.payload?.content,
      metadata: r.payload?.metadata,
      similarity_score: r.score
    })) || [];
  } catch (error) {
    log.warn(`  KB query failed: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: GENERATE PATCH WITH LLM + RAG/KAG CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

async function generatePatchWithContext(errorCode, errorMessage, files, kbResults, llmProvider = 'ollama') {
  log.progress(`Generating patch for ${errorCode}...`);

  // Build context from knowledge base
  const kbContext = kbResults
    .slice(0, 3)
    .map((r, i) => `Solution ${i + 1} (similarity: ${(r.similarity_score * 100).toFixed(0)}%):\n${r.content}`)
    .join('\n\n');

  const prompt = `
Fix this TypeScript/JavaScript error:

Error Code: ${errorCode}
Message: ${errorMessage}
Affected Files: ${files.slice(0, 3).join(', ')}

Context from Knowledge Base (similar solutions):
${kbContext || '(No similar solutions found)'}

Requirements:
1. Generate ONLY valid code fix (no explanations)
2. Match the error pattern exactly
3. Be concise and production-ready
4. Include proper error handling
5. Return only the code diff or complete fixed code

Generate the fix now:
`;

  try {
    // Route to appropriate LLM
    if (llmProvider === 'ollama') {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt: prompt,
          stream: false
        })
      });

      if (!response.ok) throw new Error('Ollama request failed');
      const result = await response.json();
      return result.response;
    } else {
      // Default: return template
      return `// Generated fix for ${errorCode}\n// TODO: Implement fix based on LLM output`;
    }
  } catch (error) {
    log.warn(`  LLM generation failed: ${error.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: VALIDATE PATCH WITH SAFETY GATE
// ═══════════════════════════════════════════════════════════════════════════

async function validateAndStorePatch(errorCode, generatedPatch, kbResults) {
  // Create a temporary file path for validation
  const tempFile = `test-${errorCode}.ts`;

  const validation = validateFileContent(generatedPatch, tempFile);

  if (!validation.canWrite) {
    log.warn(`  Patch validation failed: ${validation.issues.join(', ')}`);
    return null;
  }

  log.success(`  Patch validated successfully`);

  // Calculate confidence based on KB similarity
  const avgSimilarity = kbResults.length > 0
    ? kbResults.reduce((sum, r) => sum + r.similarity_score, 0) / kbResults.length
    : 0.5;

  const confidence = Math.min(
    (validation.contentType.confidence * 0.5 + avgSimilarity * 0.5) * 100,
    100
  );

  return {
    error_code: errorCode,
    patch: generatedPatch,
    validation_score: confidence,
    kb_references: kbResults.map(r => r.chunk_id),
    similarity_score: avgSimilarity
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: CREATE JSONL DATASET WITH RANKING
// ═══════════════════════════════════════════════════════════════════════════

async function createRecommendationsDataset(recommendations) {
  log.header('STEP 5: Create JSONL Dataset with Rankings');

  // Sort by composite score (validation + similarity)
  const ranked = recommendations
    .map((rec, idx) => ({
      rank: idx + 1,
      composite_score: (rec.validation_score * 0.6 + rec.similarity_score * 100 * 0.4),
      ...rec
    }))
    .sort((a, b) => b.composite_score - a.composite_score);

  // Convert to JSONL
  const jsonlLines = ranked.map(rec => {
    // Create cosine similarity ranking (1-10)
    const scoreRank = Math.floor((rec.similarity_score || 0) * 10) + 1;
    const inverseRank = 11 - scoreRank; // Inverse for ranking (1 = best, 10 = worst)

    return JSON.stringify({
      error_code: rec.error_code,
      rank: rec.rank,
      cosine_similarity: rec.similarity_score,
      similarity_rank_1_to_10: scoreRank,
      inverse_rank_1_to_10: inverseRank,
      validation_score: rec.validation_score,
      composite_score: rec.composite_score,
      confidence_level: rec.validation_score > 80 ? 'HIGH' : rec.validation_score > 50 ? 'MEDIUM' : 'LOW',
      patch_summary: rec.patch.substring(0, 100),
      kb_references: rec.kb_references.length,
      is_valid: true,
      generated_at: new Date().toISOString()
    });
  });

  // Write JSONL file
  const outputPath = path.join(projectRoot, 'recommendations.jsonl');
  const jsonlContent = jsonlLines.join('\n');

  await fs.writeFile(outputPath, jsonlContent, 'utf-8');

  log.success(`Created recommendations.jsonl with ${jsonlLines.length} entries`);
  log.info(`  Output: ${outputPath}`);

  // Print summary
  console.log(`\n${colors.cyan}Dataset Summary:${colors.reset}`);
  console.log(`  Total recommendations: ${jsonlLines.length}`);
  console.log(`  High confidence (>80%): ${ranked.filter(r => r.validation_score > 80).length}`);
  console.log(`  Medium confidence (50-80%): ${ranked.filter(r => r.validation_score >= 50 && r.validation_score <= 80).length}`);
  console.log(`  Low confidence (<50%): ${ranked.filter(r => r.validation_score < 50).length}`);

  // Show top 5
  console.log(`\n${colors.cyan}Top 5 Recommendations:${colors.reset}`);
  for (const rec of ranked.slice(0, 5)) {
    console.log(`  ${colors.green}[${rec.rank}]${colors.reset} Error ${rec.error_code} - Score: ${rec.composite_score.toFixed(1)} (Similarity: ${(rec.similarity_score * 100).toFixed(0)}%)`);
  }

  return jsonlContent;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: STORE IN DATABASE (Optional)
// ═══════════════════════════════════════════════════════════════════════════

async function storeRecommendations(recommendations) {
  log.header('STEP 6: Store Recommendations in Database');

  try {
    let stored = 0;
    for (const rec of recommendations) {
      try {
        await sql`
          INSERT INTO error_suggestions (
            error_code,
            suggestion_text,
            suggestion_type,
            confidence_score,
            validation_score,
            status,
            risk_level,
            metadata
          ) VALUES (
            ${rec.error_code},
            ${rec.patch.substring(0, 500)},
            'direct_generation',
            ${rec.similarity_score},
            ${rec.validation_score},
            'pending',
            ${rec.validation_score > 80 ? 'low' : 'medium'},
            ${JSON.stringify({
              kb_references: rec.kb_references.length,
              composite_score: rec.composite_score,
              generated_by: 'phase79_direct'
            })}
          )
          ON CONFLICT (error_code) DO UPDATE SET
            suggestion_text = EXCLUDED.suggestion_text,
            confidence_score = EXCLUDED.confidence_score
        `;
        stored++;
      } catch (err) {
        log.warn(`  Failed to store ${rec.error_code}: ${err.message}`);
      }
    }

    log.success(`Stored ${stored} recommendations in database`);
  } catch (error) {
    log.warn(`Database storage failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  log.header('Phase 79: Direct Patch Generation with RAG/KAG Ranking');

  try {
    // Step 1: Get error clusters
    const clusters = await fetchErrorClusters(20);

    if (clusters.length === 0) {
      log.warn('No error clusters found');
      process.exit(1);
    }

    // Step 2-4: For each cluster, generate and validate patch
    log.header('STEP 2-4: Generate Patches with RAG/KAG Context');

    const recommendations = [];
    for (const cluster of clusters.slice(0, 10)) {
      log.progress(`Processing error ${cluster.error_code} (${cluster.count} occurrences)...`);

      // Query knowledge base
      const kbResults = await queryKnowledgeBase(cluster.error_code, cluster.messages[0]);

      // Generate patch
      const patch = await generatePatchWithContext(
        cluster.error_code,
        cluster.messages[0],
        cluster.files,
        kbResults
      );

      if (!patch) {
        log.warn(`  Skipped - patch generation failed`);
        continue;
      }

      // Validate and store
      const validated = await validateAndStorePatch(cluster.error_code, patch, kbResults);

      if (validated) {
        recommendations.push(validated);
      }
    }

    log.success(`Generated ${recommendations.length} valid patches`);

    // Step 5: Create JSONL dataset
    if (recommendations.length > 0) {
      await createRecommendationsDataset(recommendations);
    }

    // Step 6: Store in database
    if (recommendations.length > 0) {
      await storeRecommendations(recommendations);
    }

    log.header('COMPLETE');
    log.success(`Pipeline executed successfully!`);
    log.info(`Generated ${recommendations.length} recommendations with RAG/KAG ranking`);

  } catch (error) {
    log.warn(`Pipeline failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createRecommendationsDataset, fetchErrorClusters, generatePatchWithContext, queryKnowledgeBase };

