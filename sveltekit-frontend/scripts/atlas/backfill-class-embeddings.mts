#!/usr/bin/env -S npx tsx
/**
 * Populate atlas_class_search_index_v1.embedding for real, via the
 * canonical embeddinggemma:latest (768-dim) Ollama lane
 * (embedQueryForLane(..., 'dense_768') from embedding-service.ts — reused,
 * not reimplemented, per this repo's duplication-prevention rule).
 *
 * NE-CLASS-01 (openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md)
 * deliberately left `embedding` NULL for all 3,675 rows — no class-level
 * embedding pipeline existed at the time. This script is that pipeline.
 *
 * Embeds `qualified_symbol — relative_path\n<normalized_signature>` per
 * class — the same three columns the generated `search_vector` full-text
 * column already indexes, so the semantic and lexical lanes describe the
 * same evidence.
 *
 * Must be run from `sveltekit-frontend/` so `$lib` aliases resolve (see
 * root CLAUDE.md "NPX Execution Context & Module Alias Resolution").
 *
 * Usage:
 *   npx tsx scripts/atlas/backfill-class-embeddings.mts                # dry run, first 20
 *   npx tsx scripts/atlas/backfill-class-embeddings.mts --apply --limit 20
 *   npx tsx scripts/atlas/backfill-class-embeddings.mts --apply         # full remaining backlog
 */
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { pool } from '../../src/lib/server/db/client.js';
import { embedQueryForLane } from '../../src/lib/server/retrieval/embedding-service.js';

const APPLY = process.argv.includes('--apply');
const limitArgIndex = process.argv.indexOf('--limit');
const LIMIT = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : (APPLY ? null : 20);

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function toPgVectorLiteral(vec: Float32Array): string {
  return `[${Array.from(vec).join(',')}]`;
}

async function main() {
  const rows = (
    await pool.query<{
      tree_node_id: string;
      qualified_symbol: string;
      relative_path: string;
      normalized_signature: string | null;
    }>(
      `
        SELECT tree_node_id, qualified_symbol, relative_path, normalized_signature
        FROM atlas_class_search_index_v1
        WHERE embedding IS NULL
        ORDER BY candidate_ordinal
        ${LIMIT ? 'LIMIT $1' : ''}
      `,
      LIMIT ? [LIMIT] : [],
    )
  ).rows;

  console.log(`[backfill-class-embeddings] rows needing embedding: ${rows.length}${LIMIT ? ` (limit=${LIMIT})` : ' (no limit — full backlog)'}`);
  console.log(`[backfill-class-embeddings] mode: ${APPLY ? 'APPLY (real writes + real Ollama calls)' : 'DRY_RUN (no writes, no Ollama calls)'}`);

  if (!APPLY) {
    for (const row of rows.slice(0, 5)) {
      console.log(`  - ${row.qualified_symbol} @ ${row.relative_path}`);
    }
    console.log('[backfill-class-embeddings] DRY_RUN complete. Re-run with --apply to embed + write.');
    return;
  }

  let embedded = 0;
  const errors: Array<{ treeNodeId: string; message: string }> = [];
  const startedAt = Date.now();

  for (const [index, row] of rows.entries()) {
    const inputText = `${row.qualified_symbol} — ${row.relative_path}${row.normalized_signature ? `\n${row.normalized_signature}` : ''}`;
    try {
      const result = await embedQueryForLane(inputText, 'dense_768');
      await pool.query(
        `
          UPDATE atlas_class_search_index_v1
          SET embedding = $1::vector, embedding_digest = $2, embedding_dimension = $3, updated_at = now()
          WHERE tree_node_id = $4
        `,
        [toPgVectorLiteral(result.vector), sha256Hex(inputText), result.dimension, row.tree_node_id],
      );
      embedded += 1;
      if ((index + 1) % 100 === 0 || index === rows.length - 1) {
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`[backfill-class-embeddings] progress: ${index + 1}/${rows.length} (${embedded} embedded, ${errors.length} errors, ${elapsedSec}s elapsed)`);
      }
    } catch (error) {
      errors.push({ treeNodeId: row.tree_node_id, message: (error as Error).message });
    }
  }

  console.log(`[backfill-class-embeddings] DONE: attempted=${rows.length} embedded=${embedded} errors=${errors.length}`);
  if (errors.length > 0) {
    console.log('[backfill-class-embeddings] first 5 errors:', errors.slice(0, 5));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .catch((error) => {
      console.error('[backfill-class-embeddings] fatal:', error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
