import { pool } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contextBuffers } from '$lib/server/db/schema-postgres';
import { createHash } from 'node:crypto';

/**
 * Context Buffer Service
 * 
 * Manages pre-assembled context blocks for IDE retrieval.
 */

export interface BufferResult {
  content: string;
  tokenCount: number;
  updatedAt: string;
  hash: string;
}

/**
 * Get a context buffer by key.
 */
export async function getBuffer(key: string): Promise<BufferResult | null> {
  try {
    const result = await pool.query<{
      content: string;
      token_count: number;
      updated_at: string;
      metadata: any;
    }>(
      `SELECT content, token_count, updated_at, metadata
       FROM context_buffers 
       WHERE buffer_key = $1`,
      [key]
    );

    if (result.rows[0]) {
      const row = result.rows[0];
      const content = row.content;
      // Use stored hash or calculate on the fly
      const hash = row.metadata?.hash || createHash('sha256').update(content).digest('hex');
      
      return {
        content,
        tokenCount: row.token_count,
        updatedAt: row.updated_at,
        hash,
      };
    }
    return null;
  } catch (err) {
    console.error(`[context-buffer] Failed to fetch buffer ${key}:`, err);
    return null;
  }
}

/**
 * Persist a content buffer to PostgreSQL.
 */
export async function setBuffer(key: string, content: string, metadata: any = {}): Promise<void> {
  try {
    // 1. Calculate static properties
    const tokenCount = Math.ceil(content.length / 4);
    const hash = createHash('sha256').update(content).digest('hex');
    const enrichedMetadata = { ...metadata, hash };

    // 2. Persist to Postgres
    await pool.query(
      `INSERT INTO context_buffers (buffer_key, content, token_count, metadata, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (buffer_key) DO UPDATE
       SET content = EXCLUDED.content,
           token_count = EXCLUDED.token_count,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
      [key, content, tokenCount, JSON.stringify(enrichedMetadata)]
    );
    console.log(`[context-buffer] Cached buffer: ${key} (${tokenCount} tokens, hash: ${hash.slice(0, 8)})`);
  } catch (err) {
    console.error(`[context-buffer] Failed to set buffer ${key}:`, err);
  }
}

/**
 * Bake the "Architecture Overview" buffer.
 * Aggregates all 20 cluster summaries into a structured XML block.
 */
export async function bakeArchitectureBuffer(): Promise<string> {
  console.log('[context-buffer] Baking full architecture buffer...');
  
  // 1. Fetch all cluster summaries
  const result = await pool.query<{
    gpu_cluster: number;
    purpose: string;
    summary: string;
    patterns: string[];
    key_files: string[];
    warnings: string[];
  }>(
    `SELECT gpu_cluster, purpose, summary, patterns, warnings, representative_chunk_ids as key_files
     FROM cluster_summaries
     WHERE repo_id = 'default'
     ORDER BY gpu_cluster ASC`
  );

  if (result.rows.length === 0) {
    return 'No cluster summaries found. Run graph indexing first.';
  }

  // 2. Aggregate into highly structured XML for Claude/Copilot
  let md = `<codebase_architecture repo="deeds-web-app">\n`;
  md += `<description>DEEDS: Decentralized Evidence & Evidence Discovery System. Multi-modal legal analysis pipeline.</description>\n\n`;

  for (const row of result.rows) {
    md += `<cluster id="${row.gpu_cluster}" name="${row.purpose}">\n`;
    md += `  <summary>${row.summary}</summary>\n`;
    if (row.patterns?.length) md += `  <patterns>${row.patterns.join(', ')}</patterns>\n`;
    if (row.warnings?.length) md += `  <warnings>${row.warnings.join(', ')}</warnings>\n`;
    md += `</cluster>\n`;
  }

  md += `\n</codebase_architecture>`;

  // 3. Persist
  await setBuffer('architecture-overview', md, { clusterCount: result.rows.length });
  
  return md;
}

/**
 * Invalidate buffers (e.g. after a graph-sync).
 */
export async function invalidateBuffers(): Promise<void> {
  try {
    await pool.query(`DELETE FROM context_buffers WHERE buffer_key LIKE 'architecture-%'`);
    console.log('[context-buffer] Architectural buffers invalidated.');
  } catch (err) {
    console.error('[context-buffer] Invalidation failed:', err);
  }
}
