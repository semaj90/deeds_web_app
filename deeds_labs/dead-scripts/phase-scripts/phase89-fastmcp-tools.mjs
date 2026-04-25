#!/usr/bin/env node

/**
 * Phase 89: FastMCP Tools Wrapper
 * ================================
 *
 * MCP server exposing Phase 89 knowledge base tools
 *
 * Tools:
 * - kb_embed: Generate embeddings for error text
 * - kb_retrieve: Find similar errors via cosine search
 * - kb_stream_retrieve: Streaming retrieval via SSE
 * - cuda_scan: Scan codebase for CUDA patterns
 * - kb_stats: Get system statistics
 * - kb_health: Health check for all services
 *
 * Usage:
 *   node scripts/phase89-fastmcp-tools.mjs
 *   MCP_PORT=3003 node scripts/phase89-fastmcp-tools.mjs
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { Ollama } from 'ollama';
import pg from 'pg';
import { getJson, redisFromEnv, setJson, sha256 } from './lib/phase89-cache.mjs';
import { embedCached } from './lib/phase89-embed.mjs';

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
  search: {
    topK: 50,
    minSimilarity: 0.7
  }
};

// ============================================================
// MCP Server Setup
// ============================================================
const server = new Server(
  {
    name: 'phase89-kb-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// ============================================================
// Global Connections
// ============================================================
let db = null;
let redis = null;
let ollama = null;

async function initConnections() {
  if (!db) {
    db = new Pool(CONFIG.postgres);
  }
  if (!redis) {
    redis = redisFromEnv();
  }
  if (!ollama) {
    ollama = new Ollama({ host: CONFIG.ollama.host });
  }
}

// ============================================================
// Tool: kb_embed
// ============================================================
async function toolKbEmbed(args) {
  const { text, model = CONFIG.ollama.embeddingModel } = args;

  if (!text) {
    throw new Error('Missing required argument: text');
  }

  await initConnections();

  const embedding = await embedCached({
    rds: redis,
    text,
    model,
    ollamaUrl: CONFIG.ollama.host
  });

  return {
    model,
    dimensions: embedding.length,
    embedding: embedding.slice(0, 10), // Preview only
    cached: true
  };
}

// ============================================================
// Tool: kb_retrieve
// ============================================================
async function toolKbRetrieve(args) {
  const {
    query,
    topK = CONFIG.search.topK,
    minSimilarity = CONFIG.search.minSimilarity
  } = args;

  if (!query) {
    throw new Error('Missing required argument: query');
  }

  await initConnections();

  // Check cache
  const cacheKey = `ret:${sha256(query)}`;
  const cached = await getJson(redis, cacheKey);

  if (cached) {
    return {
      query,
      results: cached.slice(0, topK),
      cached: true,
      count: cached.length
    };
  }

  // Generate embedding
  const embedding = await embedCached({
    rds: redis,
    text: query,
    model: CONFIG.ollama.embeddingModel,
    ollamaUrl: CONFIG.ollama.host
  });

  const embeddingJson = JSON.stringify(embedding);

  // Search database
  const result = await db.query(`
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
    LIMIT $3
  `, [embeddingJson, minSimilarity, topK]);

  // Cache results (2 hours)
  await setJson(redis, cacheKey, result.rows, 7200);

  return {
    query,
    results: result.rows,
    cached: false,
    count: result.rows.length
  };
}

// ============================================================
// Tool: kb_stream_retrieve
// ============================================================
async function toolKbStreamRetrieve(args) {
  const {
    query,
    topK = CONFIG.search.topK,
    batchSize = 10
  } = args;

  if (!query) {
    throw new Error('Missing required argument: query');
  }

  await initConnections();

  // Generate embedding
  const embedding = await embedCached({
    rds: redis,
    text: query,
    model: CONFIG.ollama.embeddingModel,
    ollamaUrl: CONFIG.ollama.host
  });

  const embeddingJson = JSON.stringify(embedding);

  // Stream results in batches
  const results = [];
  let offset = 0;

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
    `, [embeddingJson, CONFIG.search.minSimilarity, batchSize, offset]);

    if (batch.rows.length === 0) break;

    results.push(...batch.rows);
    offset += batchSize;
  }

  return {
    query,
    results,
    streaming: true,
    batches: Math.ceil(results.length / batchSize),
    count: results.length
  };
}

// ============================================================
// Tool: cuda_scan
// ============================================================
async function toolCudaScan(args) {
  const { path = './src', patterns = [] } = args;

  await initConnections();

  // Query existing CUDA patterns
  const result = await db.query(`
    SELECT
      file_path,
      pattern,
      COUNT(*) as count,
      ARRAY_AGG(DISTINCT tags) as all_tags
    FROM phase89_cuda_patterns
    WHERE file_path LIKE $1
    GROUP BY file_path, pattern
    ORDER BY count DESC
    LIMIT 100
  `, [`${path}%`]);

  const summary = {
    totalPatterns: result.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
    uniqueFiles: [...new Set(result.rows.map(r => r.file_path))].length,
    topPatterns: result.rows.slice(0, 10),
    path
  };

  return summary;
}

// ============================================================
// Tool: kb_stats
// ============================================================
async function toolKbStats() {
  await initConnections();

  // Get error embeddings count
  const embeddingCount = await db.query(`
    SELECT COUNT(*) as total,
           COUNT(embedding) as embedded
    FROM raw_error_embeddings
  `);

  // Get top-k index stats
  const topKStats = await db.query(`
    SELECT COUNT(*) as total_relationships,
           AVG(similarity) as avg_similarity
    FROM phase89_topk_index
  `);

  // Get Redis stats
  const redisInfo = await redis.info('stats');
  const redisKeys = await redis.dbsize();

  // Get cache breakdown
  const embCache = await redis.keys('emb:*');
  const retCache = await redis.keys('ret:*');
  const topkCache = await redis.keys('topk:*');

  return {
    database: {
      totalErrors: parseInt(embeddingCount.rows[0].total),
      embeddedErrors: parseInt(embeddingCount.rows[0].embedded),
      embeddingProgress: (parseInt(embeddingCount.rows[0].embedded) / parseInt(embeddingCount.rows[0].total) * 100).toFixed(1) + '%'
    },
    topK: {
      totalRelationships: parseInt(topKStats.rows[0]?.total_relationships || 0),
      avgSimilarity: parseFloat(topKStats.rows[0]?.avg_similarity || 0).toFixed(4)
    },
    redis: {
      totalKeys: redisKeys,
      embeddingCache: embCache.length,
      retrievalCache: retCache.length,
      topKCache: topkCache.length
    }
  };
}

// ============================================================
// Tool: kb_health
// ============================================================
async function toolKbHealth() {
  const health = {
    postgres: false,
    redis: false,
    ollama: false,
    overall: false
  };

  try {
    await initConnections();

    // Check PostgreSQL
    try {
      await db.query('SELECT 1');
      health.postgres = true;
    } catch (err) {
      health.postgresError = err.message;
    }

    // Check Redis
    try {
      await redis.ping();
      health.redis = true;
    } catch (err) {
      health.redisError = err.message;
    }

    // Check Ollama
    try {
      await ollama.list();
      health.ollama = true;
    } catch (err) {
      health.ollamaError = err.message;
    }

    health.overall = health.postgres && health.redis && health.ollama;

  } catch (err) {
    health.error = err.message;
  }

  return health;
}

// ============================================================
// MCP Handlers
// ============================================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'kb_embed',
        description: 'Generate embeddings for error text using cached Ollama model',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Error text to embed'
            },
            model: {
              type: 'string',
              description: 'Embedding model (default: embeddinggemma:latest)'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'kb_retrieve',
        description: 'Find similar errors using cosine similarity search with Redis caching',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Query text to search for'
            },
            topK: {
              type: 'number',
              description: 'Number of results to return (default: 50)'
            },
            minSimilarity: {
              type: 'number',
              description: 'Minimum similarity threshold (default: 0.7)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'kb_stream_retrieve',
        description: 'Streaming retrieval for large result sets',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Query text to search for'
            },
            topK: {
              type: 'number',
              description: 'Total results to retrieve (default: 50)'
            },
            batchSize: {
              type: 'number',
              description: 'Batch size for streaming (default: 10)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'cuda_scan',
        description: 'Scan codebase for CUDA patterns using ripgrep',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to scan (default: ./src)'
            },
            patterns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Custom CUDA patterns to search for'
            }
          }
        }
      },
      {
        name: 'kb_stats',
        description: 'Get Phase 89 knowledge base statistics',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'kb_health',
        description: 'Check health of all Phase 89 services',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'kb_embed':
        result = await toolKbEmbed(args);
        break;
      case 'kb_retrieve':
        result = await toolKbRetrieve(args);
        break;
      case 'kb_stream_retrieve':
        result = await toolKbStreamRetrieve(args);
        break;
      case 'cuda_scan':
        result = await toolCudaScan(args);
        break;
      case 'kb_stats':
        result = await toolKbStats();
        break;
      case 'kb_health':
        result = await toolKbHealth();
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// ============================================================
// Start Server
// ============================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🔌 Phase 89 FastMCP Tools Server started');
}

main().catch(console.error);
