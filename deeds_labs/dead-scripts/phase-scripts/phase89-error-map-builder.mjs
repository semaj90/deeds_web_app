#!/usr/bin/env node
/**
 * Phase 89: Agentic Error Analysis Map Builder
 *
 * Creates a multi-layered knowledge graph:
 * - AST layer: files, symbols, imports (ts-morph)
 * - Error layer: TS errors, patterns, clusters
 * - Doc layer: Svelte 5 docs, operator guides
 * - Fix layer: successful diff patterns
 *
 * Storage:
 * - Postgres: nodes/edges tables (KAG)
 * - Qdrant: vector embeddings (RAG)
 * - Redis: cached prompts + AST summaries
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import ollama from 'ollama';
import { join, relative } from 'path';
import pg from 'pg';
import { createClient } from 'redis';
import { Project, ts } from 'ts-morph';

const { Pool } = pg;

// ---- Configuration ----
const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  qdrant: {
    url: 'http://127.0.0.1:6333',
    collection: 'phase89_error_map'
  },
  redis: {
    url: 'redis://127.0.0.1:6379'
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    embedModel: 'embeddinggemma:latest'
  },
  paths: {
    src: 'src',
    exclude: ['node_modules', '.svelte-kit', 'build', 'dist']
  }
};

// ---- Database clients ----
let db, qdrant, redis;

async function initClients() {
  console.log('🔌 Connecting to services...');

  // Postgres
  db = new Pool(CONFIG.postgres);
  await db.query('SELECT 1');
  console.log('  ✅ Postgres connected');

  // Qdrant
  qdrant = new QdrantClient({ url: CONFIG.qdrant.url });
  try {
    await qdrant.getCollection(CONFIG.qdrant.collection);
  } catch {
    console.log('  📦 Creating Qdrant collection...');
    await qdrant.createCollection(CONFIG.qdrant.collection, {
      vectors: { size: 768, distance: 'Cosine' }
    });
  }
  console.log('  ✅ Qdrant ready');

  // Redis
  redis = createClient({ url: CONFIG.redis.url });
  await redis.connect();
  console.log('  ✅ Redis connected');
}

async function closeClients() {
  await db?.end();
  await redis?.quit();
}

// ---- Schema setup ----
async function ensureSchema() {
  console.log('📋 Setting up schema...');

  // Knowledge graph nodes
  await db.query(`
    CREATE TABLE IF NOT EXISTS kg_nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      meta JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Knowledge graph edges
  await db.query(`
    CREATE TABLE IF NOT EXISTS kg_edges (
      id SERIAL PRIMARY KEY,
      from_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      edge_type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      evidence JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(from_id, to_id, edge_type)
    )
  `);

  // File index (for change detection)
  await db.query(`
    CREATE TABLE IF NOT EXISTS file_index (
      path TEXT PRIMARY KEY,
      module_kind TEXT,
      exports TEXT[],
      imports TEXT[],
      hash TEXT,
      last_analyzed TIMESTAMP DEFAULT NOW()
    )
  `);

  // Indexes
  try {
    await db.query('CREATE INDEX IF NOT EXISTS idx_nodes_kind ON kg_nodes(kind)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_edges_from ON kg_edges(from_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_edges_to ON kg_edges(to_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_edges_type ON kg_edges(edge_type)');
  } catch (err) {
    // Indexes might already exist, ignore error
    console.log(`  ⚠️  Index creation note: ${err.message} (safe to ignore if indexes exist)`);
  }

  console.log('  ✅ Schema ready');
}

// ---- AST Analysis (ts-morph) ----
async function analyzeCodebase() {
  console.log('🔍 Analyzing codebase with ts-morph...');

  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: false
  });

  const sourceFiles = project.getSourceFiles().filter(sf => {
    const path = sf.getFilePath();
    return !CONFIG.paths.exclude.some(ex => path.includes(ex));
  });

  console.log(`  Found ${sourceFiles.length} source files`);

  const nodes = [];
  const edges = [];

  for (const sourceFile of sourceFiles) {
    const filePath = relative(process.cwd(), sourceFile.getFilePath()).replace(/\\/g, '/');

    try {
      const fileId = `file:${filePath}`;
      const fileHash = hashContent(sourceFile.getFullText());

      // Check if file changed
      const cached = await db.query('SELECT hash FROM file_index WHERE path = $1', [filePath]);
      if (cached.rows[0]?.hash === fileHash) {
        console.log(`  ⏩ Skipping unchanged: ${filePath}`);
        continue;
      }

      console.log(`  📄 Analyzing: ${filePath}`);

    // File node
    nodes.push({
      id: fileId,
      kind: 'file',
      label: filePath,
      meta: {
        path: filePath,
        size: sourceFile.getFullText().length,
        module: sourceFile.getExtension()
      }
    });

    // Extract imports
    const imports = sourceFile.getImportDeclarations().map(imp => {
      try {
        // Skip dynamic imports or non-string module specifiers
        if (!imp.getModuleSpecifier()?.isKind(ts.SyntaxKind.StringLiteral)) {
          return null;
        }
        const moduleSpec = imp.getModuleSpecifierValue();
        const imported = imp.getNamedImports().map(n => n.getName());

        // Create import edge
        if (moduleSpec.startsWith('.')) {
          const targetPath = join(filePath, '..', moduleSpec).replace(/\\/g, '/');
          edges.push({
            from_id: fileId,
            to_id: `file:${targetPath}`,
            edge_type: 'IMPORTS_FILE',
            evidence: { imported }
          });
        }

        return moduleSpec;
      } catch (err) {
        // Skip dynamic imports or invalid specifiers
        return null;
      }
    }).filter(Boolean);

    // Extract exports
    const exports = [];
    sourceFile.getExportedDeclarations().forEach((decls, name) => {
      exports.push(name);

      // Symbol node
      const symbolId = `sym:${filePath}:${name}`;
      nodes.push({
        id: symbolId,
        kind: 'symbol',
        label: name,
        meta: {
          file: filePath,
          type: decls[0]?.getKindName() || 'unknown'
        }
      });

      // File defines symbol
      edges.push({
        from_id: fileId,
        to_id: symbolId,
        edge_type: 'DEFINES_SYMBOL'
      });
    });

    // Update file index
    await db.query(`
      INSERT INTO file_index (path, module_kind, exports, imports, hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (path) DO UPDATE SET
        module_kind = $2,
        exports = $3,
        imports = $4,
        hash = $5,
        last_analyzed = NOW()
    `, [
      filePath,
      sourceFile.getExtension(),
      exports,
      imports,
      fileHash
    ]);
    } catch (err) {
      console.log(`  ⚠️  Skipping ${filePath}: ${err.message}`);
      continue;
    }
  }

  // Bulk insert nodes
  console.log(`  💾 Inserting ${nodes.length} nodes...`);
  for (const node of nodes) {
    await db.query(`
      INSERT INTO kg_nodes (id, kind, label, meta)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        label = $2,
        meta = $4
    `, [node.id, node.kind, node.label, JSON.stringify(node.meta)]);
  }

  // Bulk insert edges (filter out edges to non-existent nodes)
  const nodeIds = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeIds.has(e.from_id) && nodeIds.has(e.to_id));
  console.log(`  🔗 Inserting ${validEdges.length} edges (${edges.length - validEdges.length} invalid refs skipped)...`);
  for (const edge of validEdges) {
    await db.query(`
      INSERT INTO kg_edges (from_id, to_id, edge_type, evidence)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (from_id, to_id, edge_type) DO UPDATE SET
        evidence = $4
    `, [edge.from_id, edge.to_id, edge.edge_type, JSON.stringify(edge.evidence || {})]);
  }

  console.log('  ✅ AST analysis complete');
}

// ---- Error Ingestion ----
async function ingestErrors() {
  console.log('🐛 Ingesting TypeScript errors...');

  try {
    // Assume ts_errors table from Phase 76
    const result = await db.query(`
      SELECT id, file, line, col, code, message
      FROM ts_errors
      ORDER BY file, line
    `);

    console.log(`  Found ${result.rows.length} errors`);

  const nodes = [];
  const edges = [];

  for (const err of result.rows) {
    const errorId = `err:${err.code}:${err.file}:${err.line}:${err.col}`;
    const fileId = `file:${err.file}`;

    // Error node
    nodes.push({
      id: errorId,
      kind: 'error',
      label: `${err.code}: ${err.message.substring(0, 50)}`,
      meta: {
        code: err.code,
        file: err.file,
        line: err.line,
        col: err.col,
        message: err.message
      }
    });

    // Error in file
    edges.push({
      from_id: errorId,
      to_id: fileId,
      edge_type: 'ERROR_IN_FILE',
      evidence: { line: err.line, col: err.col }
    });
  }

  // Insert nodes
  for (const node of nodes) {
    await db.query(`
      INSERT INTO kg_nodes (id, kind, label, meta)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        label = $2,
        meta = $4
    `, [node.id, node.kind, node.label, JSON.stringify(node.meta)]);
  }

  // Insert edges
  for (const edge of edges) {
    await db.query(`
      INSERT INTO kg_edges (from_id, to_id, edge_type, evidence)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (from_id, to_id, edge_type) DO NOTHING
    `, [edge.from_id, edge.to_id, edge.edge_type, JSON.stringify(edge.evidence)]);
  }

  console.log('  ✅ Error ingestion complete');
}

// ---- Vector Embeddings ----
async function generateEmbeddings() {
  console.log('🧮 Generating embeddings...');

  // Get error nodes
  const errors = await db.query(`
    SELECT id, label, meta
    FROM kg_nodes
    WHERE kind = 'error'
  `);

  console.log(`  Processing ${errors.rows.length} errors...`);

  const points = [];

  for (const err of errors.rows) {
    const meta = typeof err.meta === 'string' ? JSON.parse(err.meta) : err.meta;
    const text = `${meta.code}: ${meta.message} in ${meta.file}:${meta.line}`;

    // Check cache
    const cacheKey = `emb:${hashContent(text)}`;
    let vector = await redis.get(cacheKey);

    if (!vector) {
      const response = await ollama.embeddings({
        model: CONFIG.ollama.embedModel,
        prompt: text
      });
      vector = JSON.stringify(response.embedding);
      await redis.set(cacheKey, vector, { EX: 86400 }); // 24h cache
    }

    points.push({
      id: err.id,
      vector: JSON.parse(vector),
      payload: {
        id: err.id,
        kind: 'error',
        code: meta.code,
        file: meta.file,
        line: meta.line,
        message: meta.message,
        text
      }
    });
  }

  // Upsert to Qdrant
  if (points.length > 0) {
    await qdrant.upsert(CONFIG.qdrant.collection, {
      wait: true,
      points
    });
    console.log(`  ✅ Upserted ${points.length} error embeddings`);
  }
}

// ---- Stats ----
async function printStats() {
  const nodeStats = await db.query(`
    SELECT kind, COUNT(*) as count
    FROM kg_nodes
    GROUP BY kind
    ORDER BY count DESC
  `);

  const edgeStats = await db.query(`
    SELECT edge_type, COUNT(*) as count
    FROM kg_edges
    GROUP BY edge_type
    ORDER BY count DESC
  `);

  console.log('\n📊 Knowledge Graph Stats:');
  console.log('  Nodes:');
  for (const row of nodeStats.rows) {
    console.log(`    ${row.kind}: ${row.count}`);
  }
  console.log('  Edges:');
  for (const row of edgeStats.rows) {
    console.log(`    ${row.edge_type}: ${row.count}`);
  }

  const qStats = await qdrant.getCollection(CONFIG.qdrant.collection);
  console.log(`  Qdrant vectors: ${qStats.points_count}`);
}

// ---- Helpers ----
function hashContent(content) {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// ---- Main ----
async function main() {
  try {
    await initClients();
    await ensureSchema();
    await analyzeCodebase();
    await ingestErrors();
    await generateEmbeddings();
    await printStats();

    console.log('\n✅ Phase 89 Error Map build complete!');
    console.log('\nNext steps:');
    console.log('  1. Query graph: SELECT * FROM kg_nodes WHERE kind = \'error\' LIMIT 10;');
    console.log('  2. Test retrieval: node scripts/phase89-error-map-query.mjs "TS1005 brace errors"');
    console.log('  3. View visualization: http://localhost:5175/phase89/error-map');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await closeClients();
  }
}

main();
