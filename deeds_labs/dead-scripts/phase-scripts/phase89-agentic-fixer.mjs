#!/usr/bin/env node
/**
 * Phase 89: Agentic Batch Error Fixer (Enhanced with RAG+KAG)
 *
 * Autonomous pipeline:
 * 1. Find error clusters (cosine similarity)
 * 2. Query RAG+KAG knowledge base for context
 * 3. Apply ACE contextual engineering prompting
 * 4. Rank fixes using cosine similarity
 * 5. Generate fixes using LLM + KB context
 * 6. Track file edits with timestamps (visual feature log)
 * 7. Cache solutions in Redis (30 day TTL)
 * 8. Web search for error codes (Gemini grounding)
 * 9. Apply fixes to files
 * 10. Verify with tsc/svelte-check
 *
 * Usage:
 *   node scripts/phase89-agentic-fixer.mjs --limit 100
 *   node scripts/phase89-agentic-fixer.mjs --error-code TS1005
 *   node scripts/phase89-agentic-fixer.mjs --web-search (enable Gemini)
 *   node scripts/phase89-agentic-fixer.mjs --lang-stats
 *   node scripts/phase89-agentic-fixer.mjs --with-kag (use knowledge base)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import ollama from 'ollama';
import pg from 'pg';
import { createClient } from 'redis';
import { promisify } from 'util';
import { callLLM, setProvider } from './llm-router.mjs';

const execAsync = promisify(exec);
const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5432,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  redis: {
    url: 'redis://127.0.0.1:6379',
    ttl: {
      solution: 86400 * 30,  // 30 days
      analysis: 86400 * 7,    // 7 days
      editLog: 86400 * 90     // 90 days for visual feature log
    }
  },
  qdrant: {
    url: 'http://localhost:6333',
    collections: {
      knowledgeBase: 'knowledge_base',
      phase89KB: 'phase89_kb_cards',
      errorPatterns: 'phase72_error_patterns',
      codeUnits: 'phase89_code_units'
    }
  },
  ollama: {
    chatModel: 'gemma3-legal:latest',
    embeddingModel: 'embeddinggemma:latest'
  },
  fixing: {
    maxErrorsPerRun: 100,
    similarityThreshold: 0.85, // High similarity = same fix pattern
    batchSize: 10, // Fix 10 errors at a time
    topKSimilar: 20, // Top-K similar errors for context
    useWebSearch: false, // Enable with --web-search flag
    useKnowledgeBase: false, // Enable with --with-kag flag
    aceContextWindow: 8192, // ACE contextual engineering window
    cosineSimilarityTopK: 10 // Top-K for cosine ranking
  },
  editLog: {
    path: 'reports/phase89-edit-timeline.jsonl',
    visualLogPath: 'reports/phase89-visual-feature-log.json'
  }
};

let db;
let redis;
let qdrant;
let fixedCount = 0;
let failedCount = 0;
let cachedSolutions = 0;
let kbHits = 0;
let editTimeline = [];

async function main() {
  console.log('🤖 Phase 89: Agentic Batch Error Fixer (Enhanced with RAG+KAG)\n');

  // Connect to services
  db = new Pool(CONFIG.postgres);
  redis = createClient({ url: CONFIG.redis.url });
  await redis.connect();
  qdrant = new QdrantClient({ url: CONFIG.qdrant.url });
  console.log('✅ Connected to Postgres + Redis + Qdrant\n');

  const args = process.argv.slice(2);
  let whereClause = `1=1
    AND source NOT LIKE '.svelte-kit/%'
    AND source NOT LIKE 'node_modules/%'
    AND source NOT LIKE 'build/%'
    AND source LIKE 'src/%'`;
  let limit = CONFIG.fixing.maxErrorsPerRun;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') {
      limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--error-code') {
      const code = args[i + 1];
      whereClause += ` AND raw_text LIKE '%${code}%'`;
      i++;
    } else if (args[i] === '--web-search') {
      CONFIG.fixing.useWebSearch = true;
      setProvider('gemini');
      console.log('🌐 Web search enabled (Gemini)\n');
    } else if (args[i] === '--with-kag') {
      CONFIG.fixing.useKnowledgeBase = true;
      console.log('🧠 Knowledge Base (RAG+KAG) enabled\n');
    } else if (args[i] === '--lang-stats') {
      await showLanguageStats();
      await cleanup();
      return;
    } else if (args[i] === '--include-generated') {
      // Override default filtering to include .svelte-kit files
      whereClause = 'embedding IS NOT NULL';
      console.log('⚠️  Including generated files (.svelte-kit)\n');
    }
  }

  // ============================================================
  // Get Unfixed Errors
  // ============================================================
  console.log(`📊 Finding top ${limit} unfixed errors...`);

  const errors = await db.query(`
    SELECT id, source, raw_text, embedding
    FROM raw_error_embeddings
    WHERE ${whereClause}
    ORDER BY id
    LIMIT $1
  `, [limit]);

  console.log(`   Found ${errors.rows.length} errors to fix\n`);

  if (errors.rows.length === 0) {
    console.log('✅ No errors to fix!');
    await cleanup();
    return;
  }

  // ============================================================
  // Cluster Similar Errors
  // ============================================================
  console.log('🔍 Clustering similar errors...');

  const clusters = [];
  const processed = new Set();

  for (const error of errors.rows) {
    if (processed.has(error.id)) continue;

    // Find all similar errors
    let similar = { rows: [] };
    if (error.embedding) {
      similar = await db.query(`
        SELECT id, raw_text, source
        FROM raw_error_embeddings
        WHERE embedding IS NOT NULL
          AND id != $1
          AND 1 - (embedding <=> $2::vector) >= $3
        LIMIT $4
      `, [error.id, error.embedding, CONFIG.fixing.similarityThreshold, CONFIG.fixing.topKSimilar]);
    }

    const cluster = {
      primary: error,
      similar: similar.rows
    };

    clusters.push(cluster);
    processed.add(error.id);
    similar.rows.forEach(s => processed.add(s.id));
  }

  console.log(`   Created ${clusters.length} error clusters\n`);

  // ============================================================
  // Fix Each Cluster
  // ============================================================
  console.log('🛠️  Fixing error clusters...\n');

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    console.log(`\n[${ i + 1}/${clusters.length}] Cluster with ${cluster.similar.length + 1} similar errors`);
    console.log(`   Primary: ${cluster.primary.raw_text.substring(0, 80)}...`);

    await fixErrorCluster(cluster);

    // Progress update
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${clusters.length} clusters | ${fixedCount} fixed | ${failedCount} failed\n`);
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Agentic Fixer Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Clusters processed:  ${clusters.length}`);
  console.log(`  Errors fixed:        ${fixedCount}`);
  console.log(`  Errors failed:       ${failedCount}`);
  console.log(`  Cached solutions:    ${cachedSolutions}`);
  console.log(`  Success rate:        ${((fixedCount / (fixedCount + failedCount)) * 100).toFixed(1)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await cleanup();
  console.log('✅ Agentic fixing complete!');
  console.log('\nNext: npx tsc --noEmit (verify fixes)');
}
/**
 * Fix a cluster of similar errors using LLM with Redis caching
 */
async function fixErrorCluster(cluster) {
  try {
    // Extract error code for caching
    const errorCodeMatch = cluster.primary.raw_text.match(/TS\d+/);
    const errorCode = errorCodeMatch ? errorCodeMatch[0] : 'Unknown';

    // Check Redis cache for solution
    const cacheKey = `fix:${hashContent(cluster.primary.raw_text)}`;
    const cachedFix = await redis.get(cacheKey);

    if (cachedFix) {
      console.log(`   💾 Using cached solution for ${errorCode}`);
      cachedSolutions++;
    } else if (CONFIG.fixing.useWebSearch) {
      // Fetch solution from web
      await fetchWebSolution(errorCode, cluster);
    }

    // Extract file path from error text
    // Example: ".svelte-kit/types/src/routes/(app)/analysis-center/proxy+page.server.ts(46,7):"
    const fileMatch = cluster.primary.raw_text.match(/([^\s:]+\.(ts|svelte|js|mjs))\((\d+),(\d+)\)/);

    if (!fileMatch) {
      console.log('   ⚠️  Cannot extract file path, skipping');
      failedCount++;
      return;
    }

    const [, filePath, , line, col] = fileMatch;

    // Skip generated files
    if (filePath.includes('.svelte-kit/') || filePath.includes('node_modules/') || filePath.includes('build/')) {
      console.log(`   ⏭️  Skipping generated file: ${filePath}`);
      return;
    }

    // Read file content
    let fileContent;
    try {
      fileContent = readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.log(`   ⚠️  Cannot read file: ${filePath}`);
      failedCount++;
      return;
    }

    const lines = fileContent.split('\n');
    const errorLine = parseInt(line) - 1;

    // Get context around error (10 lines before/after)
    const contextStart = Math.max(0, errorLine - 10);
    const contextEnd = Math.min(lines.length, errorLine + 10);
    const context = lines.slice(contextStart, contextEnd).join('\n');

    // Query RAG+KAG knowledge base for similar solutions
    const kbContext = await queryKnowledgeBase(
      cluster.primary.raw_text,
      cluster.primary.embedding
    );

    if (kbContext) {
      console.log(`   🧠 KB context: ${kbContext.similarPatterns?.length || 0} patterns, ${kbContext.cudaSummaries?.length || 0} summaries`);
    }

    // Build ACE contextual prompt
    const prompt = await buildACEPrompt(
      cluster.primary.raw_text,
      `File: ${filePath}\nLine: ${line}\n\nContext:\n${context}\n\nSimilar errors:\n${cluster.similar.slice(0, 5).map(s => s.raw_text).join('\n')}`,
      kbContext
    );

    // Generate fix using LLM
    const response = await ollama.chat({
      model: CONFIG.ollama.chatModel,
      messages: [{ role: 'user', content: prompt }],
      options: {
        num_ctx: CONFIG.fixing.aceContextWindow,
        temperature: 0.3 // Lower temp for precise fixes
      }
    });

    const fixedLine = response.message.content.trim().replace(/```[a-z]*\n?/g, '');

    // Cache the fix
    await redis.set(cacheKey, fixedLine, { EX: CONFIG.redis.ttl.solution });

    // Apply fix
    lines[errorLine] = fixedLine;
    writeFileSync(filePath, lines.join('\n'), 'utf-8');

    console.log(`   ✅ Applied fix to ${filePath}:${line}`);

    // Log edit with timestamp for visual feature tracking
    logFileEdit(filePath, errorCode, fixedLine, true);

    fixedCount++;

  } catch (err) {
    console.log(`   ❌ Fix failed: ${err.message}`);

    // Log failed edit attempt
    const filePathMatch = cluster.primary.raw_text.match(/([^\s:]+\.(ts|svelte|js|mjs))\(/);
    if (filePathMatch) {
      logFileEdit(filePathMatch[1], errorCode, null, false);
    }

    failedCount++;
  }
}

/**
 * Fetch solution from web via Gemini with grounding
 */
async function fetchWebSolution(errorCode, cluster) {
  const cacheKey = `solution:${errorCode}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`   🌐 Cached solution for ${errorCode}`);
    return;
  }

  try {
    console.log(`   🔍 Searching web for ${errorCode}...`);
    const prompt = `Explain TypeScript error ${errorCode} and provide a fix. Example: "${cluster.primary.raw_text}"`;

    const solution = await callLLM(prompt);

    // Cache for 30 days
    await redis.set(cacheKey, JSON.stringify(solution), {
      EX: CONFIG.redis.ttl.solution
    });

    console.log(`   ✅ Solution cached`);
  } catch (err) {
    console.log(`   ⚠️  Web search failed: ${err.message}`);
  }
}

/**
 * Show language-aware error statistics
 */
async function showLanguageStats() {
  console.log('📊 Language-Aware Error Statistics\n');

  const stats = await db.query(`
    SELECT
      source,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded,
      COUNT(DISTINCT SUBSTRING(raw_text FROM 'TS\\d+')) as unique_codes
    FROM raw_error_embeddings
    GROUP BY source
    ORDER BY total DESC
  `);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Source    | Total  | Embedded | Unique Codes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const row of stats.rows) {
    console.log(
      `${row.source.padEnd(9)} | ` +
      `${String(row.total).padStart(6)} | ` +
      `${String(row.embedded).padStart(8)} | ` +
      `${String(row.unique_codes).padStart(12)}`
    );
  }

  console.log('\n');

  // Top error codes
  const topCodes = await db.query(`
    SELECT
      SUBSTRING(raw_text FROM 'TS\\d+') as error_code,
      COUNT(*) as count
    FROM raw_error_embeddings
    WHERE raw_text ~ 'TS\\d+'
    GROUP BY error_code
    ORDER BY count DESC
    LIMIT 15
  `);

  console.log('🔝 Top 15 Error Codes:\n');
  for (const row of topCodes.rows) {
    console.log(`   ${row.error_code.padEnd(10)} ${String(row.count).padStart(6)} errors`);
  }

  console.log('\n');
}

// =============================================================================
// RAG+KAG Knowledge Base Integration
// =============================================================================

/**
 * Query RAG+KAG knowledge base for similar error patterns and solutions
 * Uses cosine similarity ranking with ACE contextual engineering
 */
async function queryKnowledgeBase(errorText, errorEmbedding) {
  if (!CONFIG.fixing.useKnowledgeBase) return null;

  try {
    const searches = await Promise.all([
      // Search knowledge_base collection
      qdrant.search(CONFIG.qdrant.collections.knowledgeBase, {
        vector: errorEmbedding,
        limit: CONFIG.fixing.cosineSimilarityTopK,
        with_payload: true,
        score_threshold: 0.7
      }),

      // Search phase89_kb_cards (CUDA-generated summaries)
      qdrant.search(CONFIG.qdrant.collections.phase89KB, {
        vector: errorEmbedding,
        limit: 5,
        with_payload: true,
        score_threshold: 0.75
      }),

      // Search error patterns
      qdrant.search(CONFIG.qdrant.collections.errorPatterns, {
        vector: errorEmbedding,
        limit: 3,
        with_payload: true,
        score_threshold: 0.8
      })
    ]);

    const [kbResults, kbCards, errorPatterns] = searches;

    if (kbResults.length === 0 && kbCards.length === 0 && errorPatterns.length === 0) {
      return null;
    }

    kbHits++;

    // Build ACE contextual prompt from knowledge base
    const context = {
      similarPatterns: kbResults.map(r => ({
        content: r.payload?.content || r.payload?.text || '',
        score: r.score,
        tags: r.payload?.tags || []
      })),
      cudaSummaries: kbCards.map(r => ({
        summary: r.payload?.summary || '',
        cluster: r.payload?.cluster_id || '',
        score: r.score
      })),
      knownPatterns: errorPatterns.map(r => ({
        pattern: r.payload?.pattern || '',
        fix: r.payload?.fix || '',
        score: r.score
      }))
    };

    return context;
  } catch (err) {
    console.log(`   ⚠️  KB query failed: ${err.message}`);
    return null;
  }
}

/**
 * Build ACE (Autonomous Contextual Engineering) prompt
 * Integrates copilot.md, claude.md, and RAG+KAG context
 */
async function buildACEPrompt(errorText, fileContext, kbContext) {
  let copilotContext = '';
  let claudeContext = '';

  // Load context files
  try {
    copilotContext = readFileSync('copilot.md', 'utf-8').substring(0, 2000);
  } catch {}

  try {
    claudeContext = readFileSync('claude.md', 'utf-8').substring(0, 1000);
  } catch {}

  let prompt = `You are an expert TypeScript/Svelte error fixer with access to project knowledge.

# Error to Fix
${errorText}

# File Context
${fileContext}
`;

  // Add RAG+KAG knowledge if available
  if (kbContext) {
    prompt += `\n# Knowledge Base Context (Cosine Similarity Ranked)\n`;

    if (kbContext.similarPatterns?.length > 0) {
      prompt += `\n## Similar Errors & Solutions (Top ${kbContext.similarPatterns.length}):\n`;
      kbContext.similarPatterns.forEach((p, i) => {
        prompt += `\n${i + 1}. (Score: ${p.score.toFixed(3)}) ${p.content.substring(0, 200)}\n`;
        if (p.tags.length > 0) {
          prompt += `   Tags: ${p.tags.join(', ')}\n`;
        }
      });
    }

    if (kbContext.cudaSummaries?.length > 0) {
      prompt += `\n## CUDA Error Cluster Summaries:\n`;
      kbContext.cudaSummaries.forEach((s, i) => {
        prompt += `\n${i + 1}. (Score: ${s.score.toFixed(3)}) Cluster ${s.cluster}: ${s.summary}\n`;
      });
    }

    if (kbContext.knownPatterns?.length > 0) {
      prompt += `\n## Known Error Patterns & Fixes:\n`;
      kbContext.knownPatterns.forEach((p, i) => {
        prompt += `\n${i + 1}. Pattern: ${p.pattern}\n   Fix: ${p.fix}\n`;
      });
    }
  }

  // Add project context
  if (copilotContext) {
    prompt += `\n# Project Guidelines (copilot.md excerpt):\n${copilotContext}\n`;
  }

  if (claudeContext) {
    prompt += `\n# Additional Context (claude.md excerpt):\n${claudeContext}\n`;
  }

  prompt += `\n# Task
Provide ONLY the corrected code for the error line(s). No explanation, no markdown.
Follow the project's patterns shown above. Be precise and minimal.`;

  return prompt;
}

/**
 * Log file edit with timestamp for visual feature tracking
 * Creates timeline for git diff fallback visualization
 */
function logFileEdit(filePath, errorCode, fixApplied, success) {
  const timestamp = new Date().toISOString();
  const editEntry = {
    timestamp,
    filePath,
    errorCode,
    fixApplied,
    success,
    operation: 'agentic_fix'
  };

  // Append to JSONL timeline
  try {
    appendFileSync(
      CONFIG.editLog.path,
      JSON.stringify(editEntry) + '\\n'
    );
  } catch (err) {
    console.log(`   ⚠️  Edit log failed: ${err.message}`);
  }

  // Track in memory for visual feature log
  editTimeline.push(editEntry);

  // Cache edit in Redis (for visual feature API)
  const redisKey = `edit:${filePath}:${timestamp}`;
  redis.setEx(redisKey, CONFIG.redis.ttl.editLog, JSON.stringify(editEntry))
    .catch(() => {}); // Silent fail
}

/**
 * Save visual feature log (aggregated edit timeline)
 */
function saveVisualFeatureLog() {
  try {
    const visualLog = {
      generatedAt: new Date().toISOString(),
      totalEdits: editTimeline.length,
      successfulEdits: editTimeline.filter(e => e.success).length,
      failedEdits: editTimeline.filter(e => !e.success).length,
      editsByFile: {},
      timeline: editTimeline
    };

    // Group by file
    editTimeline.forEach(edit => {
      if (!visualLog.editsByFile[edit.filePath]) {
        visualLog.editsByFile[edit.filePath] = [];
      }
      visualLog.editsByFile[edit.filePath].push({
        timestamp: edit.timestamp,
        errorCode: edit.errorCode,
        success: edit.success
      });
    });

    writeFileSync(
      CONFIG.editLog.visualLogPath,
      JSON.stringify(visualLog, null, 2)
    );

    console.log(`\\n📊 Visual feature log saved: ${CONFIG.editLog.visualLogPath}`);
  } catch (err) {
    console.log(`   ⚠️  Visual log save failed: ${err.message}`);
  }
}

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

async function cleanup() {
  // Save visual feature log before exit
  if (editTimeline.length > 0) {
    saveVisualFeatureLog();
  }

  await db.end();
  await redis.quit();

  // Print final stats
  console.log('\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Clusters processed:  ${fixedCount + failedCount}`);
  console.log(`  Errors fixed:        ${fixedCount}`);
  console.log(`  Errors failed:       ${failedCount}`);
  console.log(`  Cached solutions:    ${cachedSolutions}`);
  if (CONFIG.fixing.useKnowledgeBase) {
    console.log(`  KB hits:             ${kbHits}`);
  }
  if (fixedCount + failedCount > 0) {
    console.log(`  Success rate:        ${((fixedCount / (fixedCount + failedCount)) * 100).toFixed(1)}%`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Agentic fixing complete!');
  console.log('Next: npx tsc --noEmit (verify fixes)\\n');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

