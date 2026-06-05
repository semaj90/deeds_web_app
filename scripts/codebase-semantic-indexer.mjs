#!/usr/bin/env node

/**
 * codebase-semantic-indexer.mjs
 * 
 * Scans Drizzle-ORM schema files, maps their tables to feature domains
 * from CODEBASE_MAP.md and llms.md, generates 768-dimensional embeddings
 * using Ollama, stores them in PostgreSQL (metadata_envelopes, codebase_files,
 * and codebase_embeddings), and updates Redis hot cache.
 * 
 * Usage:
 *   node scripts/codebase-semantic-indexer.mjs [--limit=N] [--verbose]
 *   node scripts/codebase-semantic-indexer.mjs --write
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const SVELTEKIT_URL = process.env.SVELTEKIT_URL || 'http://localhost:5173';
const EMBED_MODEL = 'embeddinggemma:latest';

// Zero Hidden Thoughts / Chain of Thoughts sanitization function
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const forbidden = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];
  
  if (Array.isArray(payload)) {
    return payload.map(item => sanitizePayload(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!forbidden.includes(key)) {
      sanitized[key] = sanitizePayload(value);
    }
  }
  return sanitized;
}

// Scans directories for Drizzle-ORM schemas
function getFilesToScan() {
  const schemaDirs = [
    'sveltekit-frontend/src/lib/server/db/schema',
    'sveltekit-frontend/src/lib/server/db'
  ];
  
  const files = [];
  for (const dir of schemaDirs) {
    const absDir = path.resolve(REPO_ROOT, dir);
    if (!fs.existsSync(absDir)) continue;
    
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
      
      const fullPath = path.join(absDir, entry.name);
      if (dir.endsWith('schema')) {
        files.push(fullPath);
      } else {
        // In the parent directory, scan only specific schemas to avoid noise
        if (entry.name.startsWith('schema-') || entry.name === 'warden-schema.ts' || entry.name === 'cases.ts') {
          files.push(fullPath);
        }
      }
    }
  }
  return files;
}

// Parses schema file to extract variable name, table name, columns, and code definition
function parseSchemaFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const tables = [];
  
  // Match exported pgTable declarations
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  
  while ((match = tableRegex.exec(content)) !== null) {
    const varName = match[1];
    const tableName = match[2];
    const matchIndex = match.index;
    
    // Find opening brace of column definition block
    const startBraceIndex = content.indexOf('{', matchIndex + match[0].length);
    if (startBraceIndex === -1) continue;
    
    // Find matching closing brace
    let braceCount = 1;
    let endBraceIndex = -1;
    for (let i = startBraceIndex + 1; i < content.length; i++) {
      if (content[i] === '{') braceCount++;
      else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endBraceIndex = i;
          break;
        }
      }
    }
    
    if (endBraceIndex === -1) continue;
    
    const blockContent = content.slice(startBraceIndex + 1, endBraceIndex);
    const columns = [];
    
    // Extract column definitions inside pgTable
    // e.g. id: uuid('id').primaryKey(),
    const colRegex = /(\w+)\s*:\s*(\w+)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let colMatch;
    while ((colMatch = colRegex.exec(blockContent)) !== null) {
      columns.push({
        variable: colMatch[1],
        type: colMatch[2],
        name: colMatch[3]
      });
    }
    
    tables.push({
      varName,
      tableName,
      columns,
      blockContent: content.slice(matchIndex, endBraceIndex + 2)
    });
  }
  
  return tables;
}

// Classifies tables into distinct feature domains
function classifyDomain(filePath, tableName) {
  const fileName = path.basename(filePath);
  
  if (fileName.includes('evidence') || tableName.includes('evidence')) {
    return {
      domain: 'evidence-pipeline',
      tags: ['evidence', 'multi-modal', 'ingestion', 'document-processing']
    };
  }
  if (fileName.startsWith('admin-') || tableName.startsWith('admin_') || tableName.includes('raptor') || tableName.includes('skill')) {
    return {
      domain: 'admin-ops',
      tags: ['admin', 'ai-skills', 'raptor-summaries', 'model-weights']
    };
  }
  if (fileName.includes('error_') || fileName.includes('errorBrain') || tableName.includes('error_') || tableName.includes('error_brain')) {
    return {
      domain: 'error-brain',
      tags: ['error-tracking', 'diagnostics', 'timeline', 'feedback', 'repair']
    };
  }
  if (fileName.includes('citations') || fileName.includes('legal-') || tableName.includes('legal_') || tableName.includes('citation') || tableName.includes('definition') || tableName.includes('jurisdiction')) {
    return {
      domain: 'legal-corpus',
      tags: ['legal-corpus', 'jurisdiction', 'citation', 'definitions', 'law-references']
    };
  }
  if (fileName.includes('metadata-spine') || tableName.includes('metadata_envelope') || tableName.includes('code_relation') || tableName.includes('audit_event')) {
    return {
      domain: 'metadata-spine',
      tags: ['metadata', 'envelope', 'audit-trail', 'code-relations']
    };
  }
  if (fileName.includes('features') || tableName.includes('feature_') || tableName.includes('grpo_')) {
    return {
      domain: 'features-mapping',
      tags: ['feature-map', 'bit-glyph', 'grpo-memory', 'hypergraph']
    };
  }
  if (fileName.includes('chat') || tableName.includes('chat') || tableName.includes('message')) {
    return {
      domain: 'chat-messaging',
      tags: ['chat', 'interactive-agent', 'session', 'traces']
    };
  }
  if (fileName.includes('search') || tableName.includes('search_') || tableName.includes('analytics') || tableName.includes('variance') || tableName.includes('hit_log')) {
    return {
      domain: 'search-analytics',
      tags: ['search-analytics', 'reranking', 'variance-pairs', 'feedback', 'retrieval-hits']
    };
  }
  if (fileName.includes('couchdb') || tableName.includes('couchdb') || tableName.includes('docstore')) {
    return {
      domain: 'couchdb-features',
      tags: ['couchdb', 'document-mirror', 'offline-docstore', 'wiki-enrichment', 'neo4j-graph-references']
    };
  }
  if (fileName.includes('autoencoder') || fileName.includes('ae_') || tableName.includes('autoencoder') || tableName.includes('ae_') || tableName.includes('gpu_cluster_centroids')) {
    return {
      domain: 'redis-clustering-ae-train',
      tags: ['autoencoder', 'ae-train', 'redis-clustering', 'centroids', 'pytorch-gpu', 'rtx-3060-ti']
    };
  }
  if (fileName.includes('topology') || fileName.includes('directory-clusters') || tableName.includes('centroid') || tableName.includes('cluster')) {
    return {
      domain: 'graph-topology',
      tags: ['neo4j', 'som', 'k-means', 'centroids', 'clusters']
    };
  }
  
  return {
    domain: 'general-database',
    tags: ['database', 'schema', 'drizzle-table']
  };
}

// Generate embeddings via SvelteKit API (with Redis L1/L2 caches) or directly via Ollama
async function fetchEmbedding(text) {
  // SvelteKit embed endpoint
  try {
    const res = await fetch(`${SVELTEKIT_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: EMBED_MODEL }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const vector = data.embedding ?? data.embeddings?.[0];
      if (vector && Array.isArray(vector)) return vector;
    }
  } catch {
    // Silently proceed to Ollama fallback
  }

  // Ollama direct endpoint
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      const vector = data.embedding;
      if (vector && Array.isArray(vector)) return vector;
    }
  } catch (err) {
    console.error(`  [embedding-error] Failed to generate vector via Ollama: ${err.message}`);
  }
  return null;
}

// Primary runner
async function main() {
  const args = new Set(process.argv.slice(2));
  const WRITE = args.has('--write');
  const VERBOSE = args.has('--verbose');
  const limitArg = [...args].find(arg => arg.startsWith('--limit='));
  const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
  
  console.log(`🚀 Codebase Semantic Indexer starting... [WRITE=${WRITE}] [LIMIT=${LIMIT}]`);
  
  const files = getFilesToScan();
  console.log(`Found ${files.length} schema files to scan.`);
  
  let tablesIndexed = 0;
  let filesProcessed = 0;
  
  const allDomainTables = {};
  const fileSummaries = {};
  
  let pool = null;
  if (WRITE) {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    console.log(`Connected to Postgres database: ${DATABASE_URL}`);
  }
  
  for (const filePath of files) {
    if (LIMIT > 0 && filesProcessed >= LIMIT) break;
    
    filesProcessed++;
    const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    console.log(`\n📄 Processing [${filesProcessed}/${files.length}]: ${relativePath}`);
    
    const parsedTables = parseSchemaFile(filePath);
    if (!parsedTables.length) {
      console.log(`  No pgTable declarations found in ${relativePath}`);
      continue;
    }
    
    const fileSummaryList = [];
    
    for (const table of parsedTables) {
      const { varName, tableName, columns, blockContent } = table;
      const { domain, tags } = classifyDomain(filePath, tableName);
      
      console.log(`  Table: "${tableName}" (variable: ${varName}) -> Domain: ${domain}`);
      
      const columnsList = columns.map(c => `${c.name} (${c.type})`).join(', ');
      const contentHash = crypto.createHash('sha256').update(blockContent).digest('hex');
      
      // Construct synthesis description
      const synthesisText = `Database table "${tableName}" (defined as Drizzle schema variable "${varName}" in "${relativePath}") belongs to the "${domain}" feature domain. ` +
        `Columns: ${columnsList}. ` +
        `This table acts as a structured model for persisting data under the YoRHa Legal-AI stack. ` +
        `It supports features related to ${tags.join(', ')}.`;
        
      fileSummaryList.push(`Table "${tableName}" (${domain}): Mapped to support ${tags.join(', ')}.`);
      
      if (!allDomainTables[domain]) {
        allDomainTables[domain] = [];
      }
      allDomainTables[domain].push({
        tableName,
        varName,
        filePath: relativePath,
        columns,
        summary: synthesisText
      });
      
      let embedding = null;
      if (WRITE) {
        embedding = await fetchEmbedding(synthesisText);
        if (!embedding) {
          console.warn(`  [warning] Could not generate embedding for table "${tableName}". Skipping vector insert.`);
        }
      }
      
      if (WRITE && pool) {
        // 1. Upsert metadata_envelopes
        const stableKey = `schema:${tableName}`;
        const metadataPayload = sanitizePayload({
          tableName,
          varName,
          columns
        });
        const featuresPayload = sanitizePayload({
          domain,
          tags,
          trustTier: 'local_code'
        });
        
        await pool.query(
          `INSERT INTO metadata_envelopes (
            source_type, stable_key, repo_root, file_path, directory_path, name, language, content_hash, schema_version, metadata, features, relations, embedding_model, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (stable_key) DO UPDATE SET
            file_path = EXCLUDED.file_path,
            directory_path = EXCLUDED.directory_path,
            name = EXCLUDED.name,
            content_hash = EXCLUDED.content_hash,
            metadata = EXCLUDED.metadata,
            features = EXCLUDED.features,
            updated_at = NOW()`,
          [
            'schema',
            stableKey,
            'deeds-web-app',
            relativePath,
            path.dirname(relativePath).replace(/\\/g, '/'),
            tableName,
            'typescript',
            contentHash,
            1,
            JSON.stringify(metadataPayload),
            JSON.stringify(featuresPayload),
            JSON.stringify([]),
            'embeddinggemma:latest'
          ]
        );
        
        // 2. Upsert codebase_files
        const fileSize = fs.statSync(filePath).size;
        const fileLines = fs.readFileSync(filePath, 'utf8').split('\n').length;
        const fileRefKey = `schema:${tableName}`;
        
        const fileResult = await pool.query(
          `INSERT INTO codebase_files (
            file_path, file_hash, language, lines_of_code, size_bytes, domain, metadata, indexed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (file_path) DO UPDATE SET
            file_hash = EXCLUDED.file_hash,
            lines_of_code = EXCLUDED.lines_of_code,
            size_bytes = EXCLUDED.size_bytes,
            domain = EXCLUDED.domain,
            metadata = EXCLUDED.metadata,
            indexed_at = NOW()
          RETURNING id`,
          [
            fileRefKey,
            contentHash,
            'typescript',
            fileLines,
            fileSize,
            domain,
            JSON.stringify(sanitizePayload({ type: 'schema', name: tableName, variable: varName }))
          ]
        );
        
        const fileId = fileResult.rows[0].id;
        
        // 3. Upsert codebase_embeddings
        if (embedding) {
          await pool.query(
            `INSERT INTO codebase_embeddings (
              file_id, chunk_index, chunk_text, embedding, embedding_model, created_at
            ) VALUES ($1, $2, $3, $4::vector(768), $5, NOW())
            ON CONFLICT (file_id, chunk_index) DO UPDATE SET
              chunk_text = EXCLUDED.chunk_text,
              embedding = EXCLUDED.embedding,
              embedding_model = EXCLUDED.embedding_model,
              created_at = NOW()`,
            [
              fileId,
              0,
              synthesisText,
              `[${embedding.join(',')}]`,
              'embeddinggemma:latest'
            ]
          );
        }
        
        console.log(`  [db-insert] Successfully upserted table "${tableName}" to Postgres.`);
      } else {
        console.log(`  [dry-run] Would upsert table "${tableName}" to Postgres.`);
        if (VERBOSE) {
          console.log(`    Description: "${synthesisText}"`);
        }
      }
      
      tablesIndexed++;
    }
    
    fileSummaries[relativePath] = {
      summary: fileSummaryList.join(' '),
      domain: parsedTables.length > 0 ? classifyDomain(filePath, parsedTables[0].tableName).domain : 'general-database',
      tags: parsedTables.length > 0 ? classifyDomain(filePath, parsedTables[0].tableName).tags : ['database']
    };
  }
  
  if (WRITE) {
    const redisPw = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined;
    const u = new URL(REDIS_URL);
    const redis = new Redis({
      host: u.hostname || '127.0.0.1',
      port: Number(u.port) || 6379,
      password: redisPw,
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      await redis.ping();
    } catch (err) {
      console.warn(`  [warning] Redis connection failed: ${err.message}`);
    }
    console.log(`\nConnecting to Redis for cache hot-warmup: ${REDIS_URL}`);
    
    try {
      const runId = `run_${Date.now()}`;
      const pipeline = redis.pipeline();
      
      // 1. Write directory notes (wiki:note:dir:*)
      const schemaDir = 'sveltekit-frontend/src/lib/server/db/schema';
      const allSchemasSummary = `Directory contains Drizzle-ORM schema files definitions. Features are mapped across domains: ` +
        `${Object.keys(allDomainTables).join(', ')}. Scanned tables: ` +
        `${Object.values(allDomainTables).flatMap(list => list.map(t => t.tableName)).join(', ')}.`;
      
      pipeline.hset(
        `wiki:note:dir:${schemaDir}`,
        sanitizePayload({
          count: files.length,
          summary: allSchemasSummary,
          tags: JSON.stringify(['database', 'schemas', 'drizzle']),
          runId,
          updatedAt: new Date().toISOString()
        })
      );
      
      // 2. Write path summaries (code:llm_output:path:*)
      for (const [filePath, info] of Object.entries(fileSummaries)) {
        pipeline.hset(
          `code:llm_output:path:${filePath}`,
          sanitizePayload({
            count: 1,
            summary: info.summary,
            domain: info.domain,
            tags: JSON.stringify(info.tags),
            runId,
            updatedAt: new Date().toISOString()
          })
        );
      }
      
      // 3. Write feature cards (ace:feature:*) and contexts (ace:ctx:*)
      for (const [domain, list] of Object.entries(allDomainTables)) {
        const featureKey = domain;
        const tableNames = list.map(t => t.tableName);
        const fileRefs = [...new Set(list.map(t => t.filePath))];
        const snippets = list.map(t => `Table "${t.tableName}": ${t.summary}`);
        
        // ace:feature
        pipeline.hset(
          `ace:feature:${featureKey}`,
          sanitizePayload({
            feature_key: featureKey,
            tags: JSON.stringify(['schema', 'drizzle', featureKey]),
            source_type: 'schema',
            chunk_ids: JSON.stringify(tableNames.map(name => `schema:${name}`)),
            file_refs: JSON.stringify(fileRefs),
            rg_paths: JSON.stringify([]),
            top_snippets: JSON.stringify(snippets.slice(0, 5)),
            indexed_at: new Date().toISOString()
          })
        );
        
        // ace:ctx
        const domainSummary = `Domain "${domain}" schema surface contains Drizzle-ORM database models: ${tableNames.join(', ')}. ` +
          `These schemas define constraints and relations for data persistence, ensuring relational alignment with the legal AI feature plane.`;
        pipeline.hset(
          `ace:ctx:${featureKey}`,
          sanitizePayload({
            feature_key: featureKey,
            synthesis: domainSummary,
            chunk_ids: JSON.stringify(tableNames.map(name => `schema:${name}`)),
            tags: JSON.stringify(['schema', 'drizzle', featureKey]),
            indexed_at: new Date().toISOString()
          })
        );
      }
      
      console.log(`Executing Redis cache updates...`);
      await pipeline.exec();
      console.log(`✅ Redis cache updates executed successfully.`);
    } catch (err) {
      console.error(`❌ Redis operations failed:`, err.message);
    } finally {
      redis.disconnect();
    }
  } else {
    console.log(`\n[dry-run] Would write ${files.length} path cards and ${Object.keys(allDomainTables).length} feature cards to Redis.`);
  }
  
  if (pool) {
    await pool.end();
  }
  
  console.log(`\n🎉 Codebase semantic indexing complete! Processed ${filesProcessed} schema files, indexed ${tablesIndexed} tables.`);
}

main().catch(err => {
  console.error(`💥 Execution failed:`, err);
  process.exit(1);
});
