#!/usr/bin/env node
/**
 * Phase 89: Agentic Error Analysis Map
 *
 * Pipeline:
 * 1. AST parsing (ts-morph) → file imports/exports/symbols
 * 2. Knowledge graph building → Postgres KG tables
 * 3. Vector embeddings → Qdrant + pgvector
 * 4. Redis caching → AST summaries + embeddings
 *
 * Graph model:
 * - Nodes: files, errors, symbols, docs
 * - Edges: FILE_IMPORTS_FILE, ERROR_IN_FILE, DOC_MENTIONS_SYMBOL, FIXES_ERROR
 * - Vectors: error ↔ similar errors, error ↔ doc chunks, error ↔ fix diffs
 *
 * Usage:
 *   node scripts/phase89-error-graph-builder.mjs [--build-graph] [--analyze-errors] [--visualize]
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import Redis from 'ioredis';
import path from 'path';
import postgres from 'postgres';
import { Project } from 'ts-morph';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---- Configuration ----
const CONFIG = {
  postgres: {
    connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@127.0.0.1:5434/legal',
  },
  couchdb: {
    url: 'http://admin:password@localhost:5984',
    database: 'error_graph',
  },
  redis: {
    host: '127.0.0.1',
    port: 6379,
    keyPrefix: 'phase89:',
  },
  qdrant: {
    url: 'http://127.0.0.1:6333',
    collection: 'phase76_knowledge_base', // Use existing 810-point KB
    vectorSize: 768,
  },
  ollama: {
    url: 'http://127.0.0.1:11434',
    embedModel: 'embeddinggemma:latest',
  },
  srcDirs: ['src/lib', 'src/routes'],
};

// ---- Database schema ----
const SCHEMA_SQL = `
-- Knowledge Graph nodes
CREATE TABLE IF NOT EXISTS kg_nodes (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL, -- 'file' | 'error' | 'symbol' | 'doc'
  label TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kg_nodes_kind_idx ON kg_nodes(kind);
CREATE INDEX IF NOT EXISTS kg_nodes_label_idx ON kg_nodes(label);
CREATE INDEX IF NOT EXISTS kg_nodes_embedding_idx ON kg_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Knowledge Graph edges
CREATE TABLE IF NOT EXISTS kg_edges (
  id SERIAL PRIMARY KEY,
  from_id INTEGER REFERENCES kg_nodes(id) ON DELETE CASCADE,
  to_id INTEGER REFERENCES kg_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'FILE_IMPORTS_FILE' | 'ERROR_IN_FILE' | 'DOC_MENTIONS_SYMBOL' | 'FIXES_ERROR'
  weight FLOAT DEFAULT 1.0,
  evidence JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kg_edges_from_idx ON kg_edges(from_id);
CREATE INDEX IF NOT EXISTS kg_edges_to_idx ON kg_edges(to_id);
CREATE INDEX IF NOT EXISTS kg_edges_type_idx ON kg_edges(type);

-- File index (AST metadata)
CREATE TABLE IF NOT EXISTS file_index (
  id SERIAL PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  module_kind TEXT, -- 'route' | 'lib' | 'component' | 'server'
  exports JSONB DEFAULT '[]',
  imports JSONB DEFAULT '[]',
  hash TEXT NOT NULL,
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS file_index_path_idx ON file_index(path);
CREATE INDEX IF NOT EXISTS file_index_module_kind_idx ON file_index(module_kind);

-- Error clusters (for pattern detection)
CREATE TABLE IF NOT EXISTS error_clusters (
  id SERIAL PRIMARY KEY,
  pattern TEXT NOT NULL, -- 'missing_void' | 'brace_drift' | 'missing_import'
  description TEXT,
  error_ids INTEGER[] DEFAULT '{}',
  fix_strategy JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

// ---- Utilities ----
function log(level, ...args) {
  const colors = { info: '\x1b[36m', ok: '\x1b[32m', warn: '\x1b[33m', err: '\x1b[31m' };
  const reset = '\x1b[0m';
  const prefix = { info: 'ℹ️', ok: '✅', warn: '⚠️', err: '❌' };
  console.log(`${colors[level]}${prefix[level]} ${args.join(' ')}${reset}`);
}

function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function generateEmbedding(text) {
  const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.ollama.embedModel,
      prompt: text,
    }),
  });
  const data = await response.json();
  return data.embedding;
}

// ---- Phase 1: AST parsing with ts-morph ----
async function buildFileIndex(sql, redis, dryRun = false) {
  log('info', 'Phase 1: Building file index with ts-morph...');

  const project = new Project({
    tsConfigFilePath: path.join(ROOT, 'tsconfig.json'),
  });

  const files = project.getSourceFiles().filter(sf => {
    const filePath = sf.getFilePath();
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    return CONFIG.srcDirs.some(dir => relativePath.startsWith(dir));
  });

  log('info', `Found ${files.length} source files to index`);

  for (const sourceFile of files) {
    const filePath = sourceFile.getFilePath().replace(ROOT, '').replace(/\\/g, '/');
    const content = sourceFile.getFullText();
    const fileHash = hash(content);

    // Check cache
    const cached = await redis.get(`ast:${fileHash}`);
    if (cached && !dryRun) {
      log('info', `Cached: ${filePath}`);
      continue;
    }

    // Extract imports (skip dynamic imports)
    const imports = sourceFile.getImportDeclarations()
      .map(imp => {
        try {
          return {
            module: imp.getModuleSpecifierValue(),
            named: imp.getNamedImports().map(n => n.getName()),
          };
        } catch (error) {
          // Skip dynamic imports like import(variable)
          return null;
        }
      })
      .filter(Boolean);

    // Extract exports (with circular ref protection)
    const exports = [];
    try {
      const exported = sourceFile.getExportedDeclarations();
      const MAX_EXPORTS = 200; // Prevent infinite loops
      let count = 0;

      for (const [name, decls] of exported) {
        if (count++ > MAX_EXPORTS) break;
        try {
          exports.push({ name, kind: decls[0]?.getKindName() });
        } catch (error) {
          // Skip problematic exports (circular refs, etc.)
          continue;
        }
      }
    } catch (error) {
      // Skip files with circular export chains
      log('warn', `Skipping exports for ${filePath}: ${error.message}`);
    }

    // Determine module kind
    let moduleKind = 'lib';
    if (filePath.includes('/routes/')) {
      if (filePath.endsWith('+page.svelte')) moduleKind = 'route';
      else if (filePath.endsWith('+page.server.ts')) moduleKind = 'server';
      else if (filePath.endsWith('+layout.svelte')) moduleKind = 'layout';
    } else if (filePath.includes('/lib/components/')) {
      moduleKind = 'component';
    }

    const metadata = { filePath, moduleKind, exports, imports, hash: fileHash };

    if (!dryRun) {
      // Store in Postgres
      await sql`
        INSERT INTO file_index (path, module_kind, exports, imports, hash)
        VALUES (${filePath}, ${moduleKind}, ${JSON.stringify(exports)}, ${JSON.stringify(imports)}, ${fileHash})
        ON CONFLICT (path) DO UPDATE SET
          module_kind = EXCLUDED.module_kind,
          exports = EXCLUDED.exports,
          imports = EXCLUDED.imports,
          hash = EXCLUDED.hash,
          parsed_at = NOW()
      `;

      // Cache in Redis
      await redis.setex(`ast:${fileHash}`, 86400, JSON.stringify(metadata));
    }

    log('ok', `Indexed: ${filePath} (${moduleKind}, ${exports.length} exports, ${imports.length} imports)`);
  }

  log('ok', `File index complete (${files.length} files)`);
}

// ---- Phase 2: Build knowledge graph ----
async function buildKnowledgeGraph(sql, redis, dryRun = false) {
  log('info', 'Phase 2: Building knowledge graph (nodes + edges)...');

  // Get all files from index
  const files = await sql`SELECT * FROM file_index`;

  for (const file of files) {
    // Create file node
    const [fileNode] = await sql`
      INSERT INTO kg_nodes (kind, label, meta)
      VALUES ('file', ${file.path}, ${JSON.stringify({ moduleKind: file.module_kind, hash: file.hash })})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    if (!fileNode) continue;

    // Create import edges
    for (const imp of file.imports) {
      const importPath = resolveImportPath(file.path, imp.module);
      if (!importPath) continue;

      const [targetNode] = await sql`
        SELECT id FROM kg_nodes WHERE kind = 'file' AND label = ${importPath}
      `;

      if (targetNode) {
        await sql`
          INSERT INTO kg_edges (from_id, to_id, type, evidence)
          VALUES (${fileNode.id}, ${targetNode.id}, 'FILE_IMPORTS_FILE', ${JSON.stringify({ named: imp.named })})
          ON CONFLICT DO NOTHING
        `;
        log('info', `Edge: ${file.path} → ${importPath}`);
      }
    }

    // Create symbol nodes
    for (const exp of file.exports) {
      const symbolLabel = `${file.path}:${exp.name}`;
      const [symbolNode] = await sql`
        INSERT INTO kg_nodes (kind, label, meta)
        VALUES ('symbol', ${symbolLabel}, ${JSON.stringify({ exportKind: exp.kind })})
        ON CONFLICT DO NOTHING
        RETURNING id
      `;

      if (symbolNode) {
        await sql`
          INSERT INTO kg_edges (from_id, to_id, type)
          VALUES (${fileNode.id}, ${symbolNode.id}, 'FILE_DEFINES_SYMBOL')
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  log('ok', 'Knowledge graph built');
}

// ---- Phase 3: Link errors to graph ----
async function linkErrorsToGraph(sql, dryRun = false) {
  log('info', 'Phase 3: Linking TypeScript errors to graph...');

  const errors = await sql`
    SELECT id, file_path as file, line, code, message FROM ts_errors WHERE resolved = false
  `;

  for (const error of errors) {
    // Find file node
    const [fileNode] = await sql`
      SELECT id FROM kg_nodes WHERE kind = 'file' AND label = ${error.file}
    `;

    if (!fileNode) {
      log('warn', `File node not found for error: ${error.file}`);
      continue;
    }

    // Create error node
    const errorLabel = `${error.code}:${error.file}:${error.line}`;
    const [errorNode] = await sql`
      INSERT INTO kg_nodes (kind, label, meta)
      VALUES ('error', ${errorLabel}, ${JSON.stringify({ code: error.code, message: error.message, line: error.line })})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    if (!errorNode) continue;

    // Generate embedding for error context
    const embedding = await generateEmbedding(`${error.code}: ${error.message}`);
    await sql`
      UPDATE kg_nodes SET embedding = ${JSON.stringify(embedding)} WHERE id = ${errorNode.id}
    `;

    // Create edge: error → file
    await sql`
      INSERT INTO kg_edges (from_id, to_id, type, evidence)
      VALUES (${errorNode.id}, ${fileNode.id}, 'ERROR_IN_FILE', ${JSON.stringify({ line: error.line })})
      ON CONFLICT DO NOTHING
    `;

    log('ok', `Linked error: ${errorLabel}`);
  }

  log('ok', `Linked ${errors.length} errors to graph`);
}

// ---- Phase 4: Find similar errors (vector search) ----
async function findSimilarErrors(sql, errorId, topK = 5) {
  const [error] = await sql`
    SELECT id, label, embedding FROM kg_nodes WHERE id = ${errorId} AND kind = 'error'
  `;

  if (!error || !error.embedding) {
    log('warn', `Error ${errorId} has no embedding`);
    return [];
  }

  const similar = await sql`
    SELECT id, label, meta, 1 - (embedding <=> ${error.embedding}) AS similarity
    FROM kg_nodes
    WHERE kind = 'error' AND id != ${errorId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${error.embedding}
    LIMIT ${topK}
  `;

  return similar;
}

// ---- Phase 5: Export graph for visualization ----
async function exportGraphForViz(sql) {
  log('info', 'Phase 5: Exporting graph for visualization...');

  const nodes = await sql`SELECT id, kind, label, meta FROM kg_nodes`;
  const edges = await sql`SELECT from_id, to_id, type, weight, evidence FROM kg_edges`;

  const graphData = {
    nodes: nodes.map(n => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      meta: n.meta,
    })),
    edges: edges.map(e => ({
      from: e.from_id,
      to: e.to_id,
      type: e.type,
      weight: e.weight,
      evidence: e.evidence,
    })),
  };

  const outputPath = path.join(ROOT, 'reports/phase89-error-graph.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(graphData, null, 2));

  log('ok', `Graph exported: ${outputPath} (${nodes.length} nodes, ${edges.length} edges)`);
  return graphData;
}

// ---- Helpers ----
function resolveImportPath(fromFile, importSpec) {
  // Guard against null/undefined
  if (!importSpec || typeof importSpec !== 'string') {
    return null;
  }

  // Simple resolver (extend for $lib aliases)
  if (importSpec.startsWith('.')) {
    const dir = path.dirname(fromFile);
    return path.join(dir, importSpec).replace(/\\/g, '/');
  }
  if (importSpec.startsWith('$lib/')) {
    return importSpec.replace('$lib/', 'src/lib/');
  }
  return null; // External module
}

// ---- Main ----
async function main() {
  const args = process.argv.slice(2);
  const buildGraph = args.includes('--build-graph');
  const analyzeErrors = args.includes('--analyze-errors');
  const visualize = args.includes('--visualize');
  const dryRun = args.includes('--dry-run');

  log('info', '🧠 Phase 89: Agentic Error Analysis Map');
  log('info', `Options: buildGraph=${buildGraph}, analyzeErrors=${analyzeErrors}, visualize=${visualize}, dryRun=${dryRun}`);

  const sql = postgres(CONFIG.postgres.connectionString);
  const redis = new Redis(CONFIG.redis);

  try {
    // Initialize schema
    await sql.unsafe(SCHEMA_SQL);
    log('ok', 'Database schema ready');

    if (buildGraph) {
      await buildFileIndex(sql, redis, dryRun);
      await buildKnowledgeGraph(sql, redis, dryRun);
    }

    if (analyzeErrors) {
      await linkErrorsToGraph(sql, dryRun);

      // Example: Find similar errors for first error
      const [firstError] = await sql`SELECT id FROM kg_nodes WHERE kind = 'error' LIMIT 1`;
      if (firstError) {
        const similar = await findSimilarErrors(sql, firstError.id);
        log('ok', `Similar errors for ${firstError.id}:`);
        similar.forEach(s => log('info', `  ${s.label} (similarity: ${s.similarity.toFixed(3)})`));
      }
    }

    if (visualize) {
      const graphData = await exportGraphForViz(sql);
      log('ok', `Graph ready for visualization: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);
    }

    log('ok', 'Phase 89 complete! 🎉');
  } catch (err) {
    log('err', `Error: ${err.message}`);
    console.error(err);
  } finally {
    await sql.end();
    redis.disconnect();
  }
}

main();
