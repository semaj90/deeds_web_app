/**
 * Phase 89: SSE Streaming Retrieval Module
 * =========================================
 *
 * Server-Sent Events (SSE) endpoint for streaming similarity search results
 *
 * Features:
 * - Chunked streaming of retrieval results
 * - Real-time progress updates
 * - Redis caching with cache-hit notifications
 * - Graceful error handling
 *
 * Usage (SvelteKit endpoint):
 *
 *   // src/routes/api/kb/stream-retrieve/+server.js
 *   import { streamRetrieve } from '$lib/server/phase89-sse-stream.mjs';
 *
 *   export async function GET({ url }) {
 *     const query = url.searchParams.get('query');
 *     const topK = parseInt(url.searchParams.get('topK') || '50');
 *     return streamRetrieve(query, topK);
 *   }
 */

import pg from 'pg';
import { Readable } from 'stream';
import { getJson, redisFromEnv, setJson, sha256 } from './phase89-cache.mjs';
import { embedCached } from './phase89-embed.mjs';

const { Pool } = pg;

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  postgres: {
    host: 'localhost',
    port: 5434,
    database: 'legal',
    user: 'user',
    password: 'pass'
  },
  ollama: {
    host: 'http://localhost:11434',
    embeddingModel: 'embeddinggemma:latest'
  },
  streaming: {
    batchSize: 10,
    minSimilarity: 0.7,
    maxResults: 500
  }
};

// ============================================================
// SSE Formatter
// ============================================================
function formatSSE(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ============================================================
// Streaming Retrieval
// ============================================================
export async function streamRetrieve(query, topK = 50, batchSize = CONFIG.streaming.batchSize) {
  const db = new Pool(CONFIG.postgres);
  const redis = redisFromEnv();

  // Create readable stream
  const stream = new Readable({
    async read() {
      try {
        // Send start event
        this.push(formatSSE('start', {
          query,
          topK,
          batchSize,
          timestamp: new Date().toISOString()
        }));

        // Check cache
        const cacheKey = `ret:${sha256(query)}`;
        const cached = await getJson(redis, cacheKey);

        if (cached) {
          // Send cache hit notification
          this.push(formatSSE('cache', {
            hit: true,
            count: cached.length
          }));

          // Stream cached results in batches
          for (let i = 0; i < Math.min(cached.length, topK); i += batchSize) {
            const batch = cached.slice(i, i + batchSize);
            this.push(formatSSE('batch', {
              results: batch,
              offset: i,
              batchSize: batch.length,
              total: cached.length
            }));
          }

          this.push(formatSSE('complete', {
            totalResults: Math.min(cached.length, topK),
            cached: true
          }));

          this.push(null); // End stream
          await db.end();
          await redis.quit();
          return;
        }

        // Send cache miss notification
        this.push(formatSSE('cache', {
          hit: false
        }));

        // Generate embedding
        this.push(formatSSE('embedding', {
          status: 'generating'
        }));

        const embedding = await embedCached({
          rds: redis,
          text: query,
          model: CONFIG.ollama.embeddingModel,
          ollamaUrl: CONFIG.ollama.host
        });

        this.push(formatSSE('embedding', {
          status: 'complete',
          dimensions: embedding.length
        }));

        const embeddingJson = JSON.stringify(embedding);

        // Stream results from database
        let offset = 0;
        const allResults = [];

        while (offset < topK) {
          const batch = await db.query(`
            SELECT
              id,
              source,
              raw_text,
              tags,
              1 - (embedding <=> $1::vector) AS similarity
            FROM raw_error_embeddings
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> $1::vector) >= $2
            ORDER BY embedding <=> $1::vector
            LIMIT $3 OFFSET $4
          `, [embeddingJson, CONFIG.streaming.minSimilarity, batchSize, offset]);

          if (batch.rows.length === 0) break;

          // Send batch
          this.push(formatSSE('batch', {
            results: batch.rows,
            offset,
            batchSize: batch.rows.length,
            avgSimilarity: (batch.rows.reduce((sum, r) => sum + r.similarity, 0) / batch.rows.length).toFixed(4)
          }));

          allResults.push(...batch.rows);
          offset += batchSize;

          // Progress update
          this.push(formatSSE('progress', {
            retrieved: allResults.length,
            target: topK,
            percentage: Math.min(100, (allResults.length / topK * 100).toFixed(1))
          }));
        }

        // Cache results (2 hours)
        await setJson(redis, cacheKey, allResults, 7200);

        // Send completion
        this.push(formatSSE('complete', {
          totalResults: allResults.length,
          cached: false,
          avgSimilarity: allResults.length > 0
            ? (allResults.reduce((sum, r) => sum + r.similarity, 0) / allResults.length).toFixed(4)
            : 0
        }));

        this.push(null); // End stream

      } catch (error) {
        this.push(formatSSE('error', {
          message: error.message,
          stack: error.stack
        }));
        this.push(null);
      } finally {
        await db.end();
        await redis.quit();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// ============================================================
// SvelteKit Endpoint Helper
// ============================================================
export function createStreamEndpoint() {
  return async ({ url }) => {
    const query = url.searchParams.get('query');
    const topK = parseInt(url.searchParams.get('topK') || '50');
    const batchSize = parseInt(url.searchParams.get('batchSize') || CONFIG.streaming.batchSize.toString());

    if (!query) {
      return new Response(
        formatSSE('error', { message: 'Missing query parameter' }),
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream' }
        }
      );
    }

    return streamRetrieve(query, topK, batchSize);
  };
}

// ============================================================
// Client-side EventSource Helper
// ============================================================
export const clientStreamExample = `
// Frontend usage (Svelte component)
<script>
  import { onMount, onDestroy } from 'svelte';

  let results = [];
  let progress = 0;
  let eventSource;

  function streamSearch(query) {
    const url = \`/api/kb/stream-retrieve?query=\${encodeURIComponent(query)}&topK=50\`;
    eventSource = new EventSource(url);

    eventSource.addEventListener('start', (e) => {
      const data = JSON.parse(e.data);
      console.log('🚀 Stream started:', data);
      results = [];
    });

    eventSource.addEventListener('cache', (e) => {
      const data = JSON.parse(e.data);
      console.log(data.hit ? '💾 Cache hit!' : '🔍 Cache miss, searching...');
    });

    eventSource.addEventListener('embedding', (e) => {
      const data = JSON.parse(e.data);
      console.log('🧠 Embedding:', data.status);
    });

    eventSource.addEventListener('batch', (e) => {
      const data = JSON.parse(e.data);
      results = [...results, ...data.results];
      console.log(\`📦 Batch received: \${data.batchSize} results\`);
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      progress = parseFloat(data.percentage);
      console.log(\`⏳ Progress: \${progress}%\`);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      console.log(\`✅ Complete: \${data.totalResults} results\`);
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      const data = JSON.parse(e.data);
      console.error('❌ Error:', data.message);
      eventSource.close();
    });
  }

  onMount(() => {
    streamSearch('TypeScript error TS2345');
  });

  onDestroy(() => {
    if (eventSource) eventSource.close();
  });
</script>

<div>
  <h2>Streaming Results ({results.length})</h2>
  <progress value={progress} max="100"></progress>

  {#each results as result}
    <div class="result">
      <strong>{result.source}</strong>
      <p>{result.raw_text}</p>
      <span>Similarity: {(result.similarity * 100).toFixed(1)}%</span>
    </div>
  {/each}
</div>
`;
