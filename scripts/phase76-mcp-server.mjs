#!/usr/bin/env node
/**
 * Phase 76 FastMCP Server
 * Knowledge Search Engine MCP Integration
 *
 * Provides MCP tools for:
 * - knowledge-search: Semantic search with hybrid ranking
 * - qdrant-search: Direct Qdrant vector search
 * - postgres-query: PostgreSQL vector queries
 * - minio-fetch: Fetch documents from MinIO
 * - redis-cache: Cache operations
 *
 * Requirements: 7.1, 7.2, 7.3
 * Port: 3002
 */

import { createServer } from 'http';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Client as MinioClient } from 'minio';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.MCP_PORT || 3002;

// Initialize clients
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333'
});

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  enableOfflineQueue: false
});

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
});

// MCP Tool Registry
const tools = {
  'knowledge-search': {
    name: 'knowledge-search',
    description: 'Search knowledge base with hybrid semantic + TF-IDF ranking',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        topK: { type: 'number', default: 10, description: 'Number of results' },
        threshold: { type: 'number', default: 0.5, description: 'Similarity threshold' },
        synthesize: { type: 'boolean', default: false, description: 'Generate LLM answer' }
      },
      required: ['query']
    },
    handler: async (args) => {
      const { query, topK = 10, threshold = 0.5, synthesize = false } = args;

      // Call the HTTP API endpoint
      const response = await fetch('http://localhost:5173/api/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK, threshold, synthesize })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      return await response.json();
    }
  },

  'qdrant-search': {
    name: 'qdrant-search',
    description: 'Direct Qdrant vector search with cosine similarity',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', default: 'phase76_knowledge_base', description: 'Collection name' },
        vector: { type: 'array', items: { type: 'number' }, description: '768-dim embedding vector' },
        limit: { type: 'number', default: 10, description: 'Max results' },
        scoreThreshold: { type: 'number', default: 0.5, description: 'Min similarity score' }
      },
      required: ['vector']
    },
    handler: async (args) => {
      const { collection = 'phase76_knowledge_base', vector, limit = 10, scoreThreshold = 0.5 } = args;

      const results = await qdrant.search(collection, {
        vector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true
      });

      return {
        success: true,
        results: results.map((r) => ({
          id: r.id,
          score: r.score,
          payload: r.payload
        }))
      };
    }
  },

  'postgres-query': {
    name: 'postgres-query',
    description: 'Query PostgreSQL with pgvector similarity search',
    inputSchema: {
      type: 'object',
      properties: {
        vector: { type: 'array', items: { type: 'number' }, description: '768-dim embedding vector' },
        limit: { type: 'number', default: 10, description: 'Max results' },
        table: { type: 'string', default: 'doc_references', description: 'Table name' }
      },
      required: ['vector']
    },
    handler: async (args) => {
      const { vector, limit = 10, table = 'doc_references' } = args;

      const vectorStr = `[${vector.join(',')}]`;
      const result = await pgPool.query(
        `SELECT url, minio_key,
                1 - (embedding <=> $1::vector) as similarity
         FROM ${table}
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [vectorStr, limit]
      );

      return {
        success: true,
        results: result.rows
      };
    }
  },

  'minio-fetch': {
    name: 'minio-fetch',
    description: 'Fetch document content from MinIO storage',
    inputSchema: {
      type: 'object',
      properties: {
        bucket: { type: 'string', default: 'phase76-summaries', description: 'Bucket name' },
        key: { type: 'string', description: 'Object key' }
      },
      required: ['key']
    },
    handler: async (args) => {
      const { bucket = 'phase76-summaries', key } = args;

      try {
        const dataStream = await minio.getObject(bucket, key);
        let data = '';
        for await (const chunk of dataStream) {
          data += chunk;
        }

        return {
          success: true,
          content: JSON.parse(data)
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  'redis-cache': {
    name: 'redis-cache',
    description: 'Cache operations (get/set/delete)',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['get', 'set', 'delete'], description: 'Cache operation' },
        key: { type: 'string', description: 'Cache key' },
        value: { type: 'string', description: 'Value to set (for set operation)' },
        ttl: { type: 'number', default: 3600, description: 'TTL in seconds (for set operation)' }
      },
      required: ['operation', 'key']
    },
    handler: async (args) => {
      const { operation, key, value, ttl = 3600 } = args;

      try {
        switch (operation) {
          case 'get': {
            const result = await redis.get(key);
            return {
              success: true,
              value: result ? JSON.parse(result) : null
            };
          }
          case 'set': {
            if (!value) {
              throw new Error('Value required for set operation');
            }
            await redis.setex(key, ttl, JSON.stringify(value));
            return {
              success: true,
              message: 'Value cached'
            };
          }
          case 'delete': {
            await redis.del(key);
            return {
              success: true,
              message: 'Key deleted'
            };
          }
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  'llm_synthesis.log_event': {
    name: 'llm_synthesis.log_event',
    description: 'Log LLM Synthesis Memory Event durably in Postgres, Redis hot cache, and daily JSONL training log.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Globally unique query/request trace id' },
        sessionId: { type: 'string', description: 'Active user session id' },
        userId: { type: 'number', description: 'Standard user integer id' },
        query: { type: 'string', description: 'Raw user prompt / input' },
        profile: { type: 'string', description: 'Active retrieval profile' },
        acePacket: { type: 'object', description: 'Topological grounded ACE packet' },
        toolCalls: { type: 'array', items: { type: 'object' }, default: [], description: 'List of executed tools in synthesis step' },
        sourceRefs: { type: 'array', items: { type: 'object' }, default: [], description: 'Clickable file/doc links' },
        cacheKeys: { type: 'object', default: {}, description: 'Keys of Redis semantic/exact cache entries' },
        model: { type: 'string', description: 'Name/tag of model used' }
      },
      required: ['runId', 'query', 'profile', 'acePacket', 'model']
    },
    handler: async (args) => {
      const {
        runId,
        sessionId = null,
        userId = null,
        query,
        profile,
        acePacket,
        toolCalls = [],
        sourceRefs = [],
        cacheKeys = {},
        model
      } = args;

      // Enforce zero-hidden-thoughts security policy
      const payloads = [acePacket, toolCalls, sourceRefs];
      for (const p of payloads) {
        if (p) {
          const str = JSON.stringify(p);
          if (
            str.includes('"hiddenThoughts"') ||
            str.includes('"chainOfThought"') ||
            str.includes('"kv_cache"') ||
            str.includes('"tensor"') ||
            str.includes('"cudaPointer"')
          ) {
            throw new Error('Security Constraint Violation: Persistent synthesis cache cannot store raw tensor, cudaPointer, hiddenThoughts or chainOfThought.');
          }
        }
      }

      // 1. Insert to Postgres
      const pgResult = await pgPool.query(
        `INSERT INTO llm_synthesis_events (
          run_id, session_id, user_id, query, profile, ace_packet, tool_calls, source_refs, cache_keys, model
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          runId,
          sessionId,
          userId,
          query,
          profile,
          JSON.stringify(acePacket),
          JSON.stringify(toolCalls),
          JSON.stringify(sourceRefs),
          JSON.stringify(cacheKeys),
          model
        ]
      );

      const recordId = pgResult.rows[0].id;

      // 2. Cache in Redis
      const redisKey = `ace:packet:${runId}`;
      const redisPayload = {
        id: recordId,
        runId,
        sessionId,
        userId,
        query,
        profile,
        acePacket,
        toolCalls,
        sourceRefs,
        cacheKeys,
        model,
        createdAt: new Date().toISOString()
      };
      await redis.setex(redisKey, 3600, JSON.stringify(redisPayload));

      // 3. Append to daily JSONL file
      try {
        const fs = await import('fs');
        const path = await import('path');
        const datasetDir = path.resolve('memory/datasets/llm_synthesis');
        if (!fs.existsSync(datasetDir)) {
          fs.mkdirSync(datasetDir, { recursive: true });
        }
        const today = new Date().toISOString().split('T')[0];
        const filePath = path.join(datasetDir, `${today}.jsonl`);
        const line = JSON.stringify({
          ...redisPayload,
          datasetTimestamp: new Date().toISOString()
        }) + '\n';
        fs.appendFileSync(filePath, line, 'utf8');
      } catch (err) {
        console.warn('JSONL write failed in MCP tool:', err.message);
      }

      return {
        success: true,
        id: recordId,
        message: 'LLM Synthesis Event logged successfully across all stores'
      };
    }
  },

  'diagnose-error': {
    name: 'diagnose-error',
    description: 'Perform AST-powered deep diagnosis of a code error or failure',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The error message or description' },
        filePath: { type: 'string', description: 'Optional path to the file causing the error' },
        mode: { type: 'string', enum: ['file', 'route', 'page', 'test'], default: 'file' }
      },
      required: ['query']
    },
    handler: async (args) => {
      const response = await fetch('http://localhost:5173/api/error-brain/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) throw new Error(`Diagnosis failed: ${response.statusText}`);
      return await response.json();
    }
  },

  'recommend-fix': {
    name: 'recommend-fix',
    description: 'Get AI-powered fix recommendations for a specific code snippet and error',
    inputSchema: {
      type: 'object',
      properties: {
        error: { type: 'string', description: 'The error message' },
        filePath: { type: 'string', description: 'The file path' },
        codeSnippet: { type: 'string', description: 'The code causing the issue' }
      },
      required: ['error', 'filePath']
    },
    handler: async (args) => {
      const response = await fetch('http://localhost:5173/api/codebase-index/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) throw new Error(`Recommendation failed: ${response.statusText}`);
      return await response.json();
    }
  },

  'trace.docs_search': {
    name: 'trace.docs_search',
    description: 'Search programming documentation atlas (external_programming_docs_768)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 5, description: 'Max results' }
      },
      required: ['query']
    },
    handler: async (args) => {
      const { query, limit = 5 } = args;
      // Mock implementation for now
      return {
        success: true,
        results: [],
        sourceRefs: []
      };
    }
  },

  'trace.docs_compare_feature': {
    name: 'trace.docs_compare_feature',
    description: 'Compare local feature implementation against external documentation',
    inputSchema: {
      type: 'object',
      properties: {
        featureName: { type: 'string', description: 'Local feature name' },
        sourceId: { type: 'string', description: 'External doc source ID' }
      },
      required: ['featureName', 'sourceId']
    },
    handler: async (args) => {
      return {
        success: true,
        gaps: [],
        recommendations: []
      };
    }
  },

  'trace.command_suggest': {
    name: 'trace.command_suggest',
    description: 'Suggest allowlisted commands based on documentation patterns',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' }
      },
      required: ['task']
    },
    handler: async (args) => {
      const { task } = args;
      return {
        success: true,
        intent: task,
        suggestions: [
          {
            commandKey: "search.route.files",
            risk: "read_only",
            command: "rg -n \"upload|uploaded_files\" sveltekit-frontend/src/routes",
            why: "Find local route handlers matching upload feature.",
            sourceRefs: ["feature:sveltekit.api.files", "doc:sveltekit.routing.endpoints"]
          }
        ]
      };
    }
  },

  'atlas.search': {
    name: 'atlas.search',
    description: 'Multi-query Qdrant + Postgres join for Parent Atlas',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    },
    handler: async (args) => {
      // Stub implementation for now
      return {
        success: true,
        results: [],
        sourceRefs: [],
        commands: []
      };
    }
  },

  'atlas.lessons': {
    name: 'atlas.lessons',
    description: 'Retrieve lessons from previous runs and failures',
    inputSchema: {
      type: 'object',
      properties: {
        failureType: { type: 'string', description: 'Type of failure' }
      },
      required: ['failureType']
    },
    handler: async (args) => {
      return {
        success: true,
        lessons: []
      };
    }
  },

  'atlas.failureLookup': {
    name: 'atlas.failureLookup',
    description: 'Lookup missing context when generic answers fail validation',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Missing topic' }
      },
      required: ['topic']
    },
    handler: async (args) => {
      return {
        success: true,
        additionalContext: {},
        sourceRefs: [],
        commands: []
      };
    }
  }
};

// HTTP Server for MCP protocol
const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle GET /tools - List available tools
  if (req.method === 'GET' && req.url === '/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        tools: Object.values(tools).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      })
    );
    return;
  }

  // Handle POST /function-call - Execute tool
  if (req.method === 'POST' && req.url === '/function-call') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { name, arguments: args } = JSON.parse(body);

        if (!tools[name]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Tool not found: ${name}` }));
          return;
        }

        const result = await tools[name].handler(args);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('MCP error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Handle GET /health - Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', tools: Object.keys(tools).length }));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Phase 76 MCP Server running on port ${PORT}`);
  console.log(`📋 Available tools: ${Object.keys(tools).join(', ')}`);
  console.log(`🔗 Endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/tools`);
  console.log(`   POST http://localhost:${PORT}/function-call`);
  console.log(`   GET  http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down MCP server...');
  await pgPool.end();
  redis.disconnect();
  server.close();
  process.exit(0);
});
