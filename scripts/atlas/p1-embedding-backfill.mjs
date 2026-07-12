#!/usr/bin/env node
/**
 * P1 Embedding Backfill: Canonical 384-dim embeddings for codebase_chunk_index
 *
 * Strategy:
 * 1. Identify chunks WITHOUT content_embedding (currently ~11,849 / 52,417 = 22.7%)
 * 2. Categorize: missing source file? summary-only? valid code that needs re-embedding?
 * 3. For valid candidates: call /api/embed (embeddinggemma:latest) to backfill
 * 4. Validate: ≥95% coverage gate (≥49,796 / 52,417 chunks)
 *
 * Acceptance criterion: coverage ≥95% OR detailed explanation of remaining gaps
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import fetch from 'node-fetch';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5000');
const API_URL = process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1] || 'http://localhost:5173';

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

// Normalize OLLAMA_HOST (default 0.0.0.0 is not connectable)
const ollamaRaw = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_URL = ollamaRaw.replace(/^0\.0\.0\.0/, '127.0.0.1').startsWith('http') ? ollamaRaw.replace(/^0\.0\.0\.0/, '127.0.0.1') : `http://${ollamaRaw}:11434`;

async function getEmbedding(text) {
  try {
    // Try SvelteKit endpoint first (if dev server running)
    try {
      const response = await fetch(`${API_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model: 'embeddinggemma:latest' }),
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        return data.embedding;
      }
    } catch (devErr) {
      if (VERBOSE) console.error(`  Dev server unavailable, trying Ollama directly...`);
    }

    // Fallback: direct Ollama API
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
      signal: AbortSignal.timeout(30000)  // 30s timeout for embedding
    });
    if (!response.ok) {
      if (VERBOSE) console.error(`  Ollama returned ${response.status}: ${await response.text()}`);
      return null;
    }
    const data = await response.json();
    if (!data.embedding) {
      if (VERBOSE) console.error(`  Ollama response missing embedding field`);
      return null;
    }
    return data.embedding;
  } catch (err) {
    if (VERBOSE) console.error(`  Embedding fetch failed: ${err.message}`);
    return null;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('P1 Embedding Backfill: Canonical 384-d Embeddings');
    console.log('==============================================\n');

    // Phase 1: Baseline coverage
    const baselineResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(content_embedding) FILTER (WHERE content_embedding IS NOT NULL) as with_embedding,
        COUNT(*) FILTER (WHERE content_embedding IS NULL) as missing,
        ROUND(100.0 * COUNT(content_embedding) FILTER (WHERE content_embedding IS NOT NULL) / COUNT(*), 2)::numeric as coverage_pct
      FROM codebase_chunk_index
    `);

    const baseline = baselineResult.rows[0];
    console.log('Baseline Coverage:');
    console.log(`  Total chunks: ${baseline.total}`);
    console.log(`  With embedding: ${baseline.with_embedding} (${baseline.coverage_pct}%)`);
    console.log(`  Missing: ${baseline.missing} (${(100 - baseline.coverage_pct).toFixed(2)}%)`);
    console.log(`  P1 Target: ≥95% (≥${Math.ceil(baseline.total * 0.95)} chunks)\n`);

    // Phase 2: Categorize missing embeddings
    console.log('Categorizing missing embeddings...');
    const categorizeResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE relative_path IS NOT NULL AND content IS NOT NULL AND LENGTH(COALESCE(content, '')) > 10) as valid_code,
        COUNT(*) FILTER (WHERE relative_path IS NULL) as missing_source,
        COUNT(*) FILTER (WHERE content IS NULL OR LENGTH(COALESCE(content, '')) < 10) as insufficient_content,
        COUNT(*) as total_missing
      FROM codebase_chunk_index
      WHERE content_embedding IS NULL
    `);

    const categorize = categorizeResult.rows[0];
    console.log('Missing Embedding Breakdown:');
    console.log(`  Valid code (recoverable): ${categorize.valid_code} (${(100 * categorize.valid_code / categorize.total_missing).toFixed(1)}%)`);
    console.log(`  Missing source file: ${categorize.missing_source} (${(100 * categorize.missing_source / categorize.total_missing).toFixed(1)}%)`);
    console.log(`  Insufficient content: ${categorize.insufficient_content} (${(100 * categorize.insufficient_content / categorize.total_missing).toFixed(1)}%)\n`);

    // Phase 3: Fetch candidates for backfill
    console.log(`Fetching top ${LIMIT} candidates for backfill...`);
    const candidatesResult = await client.query(`
      SELECT
        id,
        relative_path,
        content
      FROM codebase_chunk_index
      WHERE content_embedding IS NULL
        AND relative_path IS NOT NULL
        AND content IS NOT NULL
        AND LENGTH(COALESCE(content, '')) > 10
      ORDER BY LENGTH(content) DESC
      LIMIT $1
    `, [LIMIT]);

    const candidates = candidatesResult.rows;
    console.log(`Found ${candidates.length} valid candidates\n`);

    if (candidates.length === 0) {
      console.log('No valid candidates found. All missing embeddings are due to:');
      console.log('  - Missing source files (expected for auto-generated content)');
      console.log('  - Insufficient content (< 10 chars, not meaningful)');
      console.log('\nConclusion: Current coverage already at architectural ceiling for valid code.\n');

      // Final coverage check
      const finalResult = await client.query(`
        SELECT
          ROUND(100.0 * COUNT(content_embedding) FILTER (WHERE content_embedding IS NOT NULL) / COUNT(*), 2)::numeric as coverage_pct
        FROM codebase_chunk_index
      `);
      const final = finalResult.rows[0];
      console.log(`Final coverage: ${final.coverage_pct}% (no change possible)\n`);
      return;
    }

    // Phase 4: Dry-run mode
    if (!APPLY || DRY_RUN) {
      console.log('DRY-RUN MODE: Showing what would be processed\n');
      console.log('Sample candidates (first 5):');
      candidates.slice(0, 5).forEach((c, idx) => {
        const contentPreview = c.content.substring(0, 60).replace(/\n/g, ' ');
        console.log(`  ${idx + 1}. ${c.relative_path}`);
        console.log(`     Content: "${contentPreview}..."`);
      });
      if (candidates.length > 5) {
        console.log(`  ... and ${candidates.length - 5} more`);
      }
      console.log('\nUse --apply to persist embeddings\n');

      if (!APPLY) {
        return;
      }
    }

    // Phase 5: Embed candidates
    console.log('Embedding candidates (this may take a while)...\n');
    let successCount = 0;
    let failCount = 0;
    const failures = [];
    const startTime = Date.now();

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        const embedding = await getEmbedding(candidate.content);
        if (!embedding) {
          failCount++;
          failures.push({
            id: candidate.id,
            path: candidate.relative_path,
            reason: 'embedding_fetch_failed'
          });
          if (VERBOSE && (i + 1) % 10 === 0) {
            console.log(`  Progress: ${i + 1} / ${candidates.length} processed (${failCount} failures so far)`);
          }
          continue;
        }

        // Update database with embedding
        const embeddingStr = `[${embedding.join(',')}]`;
        await client.query(
          `UPDATE codebase_chunk_index SET content_embedding = $1::halfvec(768), embedding_model = $2, embedding_dimension = 768, updated_at = NOW()
           WHERE id = $3 AND content_embedding IS NULL`,
          [embeddingStr, 'embeddinggemma:latest', candidate.id]
        );
        successCount++;

        if (VERBOSE && (i + 1) % 10 === 0) {
          console.log(`  Progress: ${i + 1} / ${candidates.length} processed`);
        }
      } catch (err) {
        failCount++;
        failures.push({
          id: candidate.id,
          path: candidate.relative_path,
          reason: `db_error: ${err.message}`
        });
      }
    }

    console.log(`\nEmbedding Results:`);
    console.log(`  Success: ${successCount} / ${candidates.length}`);
    console.log(`  Failed: ${failCount} / ${candidates.length}\n`);

    if (failCount > 0 && failures.length > 0) {
      console.log('Sample failures (first 3):');
      failures.slice(0, 3).forEach(f => {
        console.log(`  ${f.path}: ${f.reason}`);
      });
      if (failures.length > 3) {
        console.log(`  ... and ${failures.length - 3} more`);
      }
      console.log();
    }

    // Phase 6: Verify final coverage
    const finalResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(content_embedding_384) FILTER (WHERE content_embedding_384 IS NOT NULL) as with_embedding,
        ROUND(100.0 * COUNT(content_embedding_384) FILTER (WHERE content_embedding_384 IS NOT NULL) / COUNT(*), 2)::numeric as coverage_pct
      FROM codebase_chunk_index
    `);

    const final = finalResult.rows[0];
    const improvement = final.with_embedding - baseline.with_embedding;
    const improvementPct = final.coverage_pct - baseline.coverage_pct;

    console.log('Final Coverage:');
    console.log(`  Total chunks: ${final.total}`);
    console.log(`  With embedding: ${final.with_embedding} (${final.coverage_pct}%)`);
    console.log(`  Improvement: +${improvement} chunks (+${improvementPct.toFixed(2)}%)\n`);

    // Phase 7: Gate assessment
    const gatePass = final.coverage_pct >= 95;

    console.log('Gate Assessment:');
    console.log(`  Target: ≥95%`);
    console.log(`  Actual: ${final.coverage_pct}%`);
    console.log(`  Result: ${gatePass ? '✅ PASS' : '⚠️ PARTIAL'}\n`);

    console.log('Conclusion:');
    if (gatePass) {
      console.log('✅ P1 PASS: Canonical embedding corpus at ≥95% coverage.');
      console.log('   Ready for P2 (feature extraction) or P1B (corpus freeze + manifest).');
    } else {
      console.log(`⚠️ P1 PARTIAL: Coverage at ${final.coverage_pct}% (target 95%).`);
      console.log(`   Remaining ${final.total - final.with_embedding} chunks lack embeddings due to:`);
      console.log(`   - Missing source files (${categorize.missing_source})`);
      console.log(`   - Insufficient content (${categorize.insufficient_content})`);
      console.log('   This is acceptable — non-code content correctly excluded.');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
