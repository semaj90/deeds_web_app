#!/usr/bin/env node
/**
 * Phase 88: Agentic Error Analysis Map Builder
 *
 * Pipeline:
 * 1. Parse TypeScript/Svelte files with ts-morph → extract imports/exports/symbols
 * 2. Build knowledge graph in PostgreSQL (kg_nodes, kg_edges, file_index)
 * 3. Link ts_errors table to graph nodes (ERROR_IN_FILE edges)
 * 4. Generate error embeddings → find similar patterns → create SIMILAR_TO edges
 * 5. Cache AST summaries in Redis (ast:<filehash> → {exports, imports, symbols})
 * 6. Export graph JSON for UI visualization → reports/phase88/error-map.json
 *
 * Usage:
 *   node scripts/phase88-build-error-map.mjs
 *   node scripts/phase88-build-error-map.mjs --rebuild     # Force rebuild from scratch
 *   node scripts/phase88-build-error-map.mjs --skip-errors # Only build file/symbol graph
 */

import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import Redis from 'ioredis';
import { dirname, join, relative } from 'path';
import postgres from 'postgres';
import { Project, ts } from 'ts-morph';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  // Source directories to index
  srcDirs: [
    join(ROOT, 'src/routes'),
    join(ROOT, 'src/lib'),
    join(ROOT, 'src/params'),
    join(ROOT, 'src/hooks.server.ts'),
    join(ROOT, 'src/hooks.client.ts'),
    join(ROOT, 'src/app.d.ts')
  ],

  // Database (Phase 87 portable stack: 5434/legal/user)
  db: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal',
    username: 'user',
    password: 'pass'
  },

  // Redis cache
  redis: {
    host: '127.0.0.1',
    port: 6379,
    keyPrefix: 'phase88:'
  },

  // Ollama (for embeddings)
  ollama: {
    url: 'http://127.0.0.1:11434',
    embedModel: 'embeddinggemma:latest'
  },

  // Output
  outputDir: join(ROOT, 'reports/phase88'),
  graphFile: 'error-map.json',

  // Thresholds
  similarityThreshold: 0.7,  // Min cosine similarity for SIMILAR_TO edges
  maxSimilarErrors: 10       // Max similar errors per error node
};

const args = process.argv.slice(2);
const REBUILD = args.includes('--rebuild');
const SKIP_ERRORS = args.includes('--skip-errors');

// ============================================================
// Database & Redis Clients
// ============================================================

const sql = postgres(CONFIG.db);
const redis = new Redis(CONFIG.redis);

// ============================================================
// Utilities
// ============================================================

function log(msg, level = 'info') {
  const prefix = {
    info: 'ℹ️ ',
    ok: '✅',
    warn: '⚠️ ',
    error: '❌',
    step: '🔧'
  }[level] || '';
  console.log(`${prefix} ${msg}`);
}

function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

function relativePath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

async function generateEmbedding(text) {
  try {
    const res = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.ollama.embedModel,
        prompt: text
      })
    });

    if (!res.ok) {
      throw new Error(`Ollama embedding failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return data.embedding;
  } catch (err) {
    log(`Embedding generation failed: ${err.message}`, 'warn');
    return null;
  }
}

// ============================================================
// Phase 1: Build File Index with ts-morph
// ============================================================

async function buildFileIndex() {
  log('Phase 1: Building file index with ts-morph...', 'step');

  const project = new Project({
    tsConfigFilePath: join(ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true
  });

  // Add source files
  const sourceFiles = [];
  for (const srcPath of CONFIG.srcDirs) {
    try {
      const files = project.addSourceFilesAtPaths(srcPath);
      sourceFiles.push(...files);
    } catch (err) {
      log(`Failed to add source path ${srcPath}: ${err.message}`, 'warn');
    }
  }

  log(`Found ${sourceFiles.length} source files to index`);

  let indexed = 0;
  const fileNodes = [];
  const symbolNodes = [];
  const importEdges = [];
  const exportEdges = [];

  for (const file of sourceFiles) {
    const filePath = relativePath(file.getFilePath());
    const content = file.getFullText();
    const fileHash = sha256(content);

    // Check Redis cache
    const cacheKey = `ast:${fileHash}`;
    const cached = await redis.get(cacheKey);
    if (cached && !REBUILD) {
      const data = JSON.parse(cached);
      fileNodes.push({
        id: `file:${filePath}`,
        kind: 'file',
        label: filePath,
        meta: { path: filePath, hash: fileHash, ...data }
      });
      indexed++;
      continue;
    }

    // Parse file
    const fileKind = inferFileKind(filePath);
    const exports = [];
    const imports = [];
    const symbols = [];

    // Extract exports
    for (const exp of file.getExportedDeclarations()) {
      const [name, declarations] = exp;
      const decl = declarations[0];
      if (!decl) continue;

      const line = decl.getStartLineNumber();
      const kind = ts.SyntaxKind[decl.getKind()];

      exports.push({ name, kind, line });

      symbolNodes.push({
        id: `sym:${filePath}:${name}`,
        kind: 'symbol',
        label: name,
        meta: { file: filePath, line, symbolKind: kind }
      });

      exportEdges.push({
        from_id: `file:${filePath}`,
        to_id: `sym:${filePath}:${name}`,
        type: 'FILE_EXPORTS_SYMBOL',
        weight: 1.0,
        evidence: { line }
      });
    }

    // Extract imports
    for (const imp of file.getImportDeclarations()) {
      const source = imp.getModuleSpecifierValue();
      const line = imp.getStartLineNumber();
      const specifiers = imp.getNamedImports().map(ni => ({
        name: ni.getName(),
        alias: ni.getAliasNode()?.getText()
      }));

      imports.push({ source, specifiers, line });

      // Create import edge (if source is a local file)
      if (source.startsWith('.') || source.startsWith('$lib') || source.startsWith('$app')) {
        let targetPath = source;
        if (source.startsWith('$lib')) targetPath = source.replace('$lib', 'src/lib');
        if (source.startsWith('$app')) targetPath = source.replace('$app', 'src/app');

        importEdges.push({
          from_id: `file:${filePath}`,
          to_id: `file:${targetPath}`,
          type: 'FILE_IMPORTS_FILE',
          weight: 1.0,
          evidence: { line, specifiers }
        });
      }
    }

    // Cache in Redis
    const astData = { exports, imports, symbols, kind: fileKind };
    await redis.setex(cacheKey, 3600 * 24, JSON.stringify(astData));

    // Store in fileNodes
    fileNodes.push({
      id: `file:${filePath}`,
      kind: 'file',
      label: filePath,
      meta: { path: filePath, hash: fileHash, ...astData }
    });

    indexed++;

    if (indexed % 100 === 0) {
      log(`Indexed ${indexed}/${sourceFiles.length} files...`);
    }
  }

  log(`Indexed ${indexed} files`, 'ok');
  log(`Created ${symbolNodes.length} symbol nodes, ${importEdges.length} import edges, ${exportEdges.length} export edges`);

  return { fileNodes, symbolNodes, importEdges, exportEdges };
}

function inferFileKind(filePath) {
  if (filePath.includes('/routes/')) return 'route';
  if (filePath.includes('/lib/')) return 'lib';
  if (filePath.includes('.spec.') || filePath.includes('.test.')) return 'test';
  if (filePath.includes('config')) return 'config';
  if (filePath.endsWith('.svelte')) return 'component';
  return 'util';
}

// ============================================================
// Phase 2: Build Knowledge Graph in PostgreSQL
// ============================================================

async function buildKnowledgeGraph(fileNodes, symbolNodes, importEdges, exportEdges) {
  log('Phase 2: Building knowledge graph in PostgreSQL...', 'step');

  if (REBUILD) {
    log('REBUILD mode: clearing existing graph data...');
    await sql`DELETE FROM kg_edges WHERE type IN ('FILE_IMPORTS_FILE', 'FILE_EXPORTS_SYMBOL')`;
    await sql`DELETE FROM kg_nodes WHERE kind IN ('file', 'symbol')`;
    await sql`DELETE FROM file_index`;
  }

  // Insert file nodes
  log(`Inserting ${fileNodes.length} file nodes...`);
  for (const node of fileNodes) {
    await sql`
      INSERT INTO kg_nodes (id, kind, label, meta)
      VALUES (${node.id}, ${node.kind}, ${node.label}, ${JSON.stringify(node.meta)})
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        meta = EXCLUDED.meta
    `;

    await sql`
      INSERT INTO file_index (file_path, file_hash, kind, exports, imports, symbols)
      VALUES (
        ${node.meta.path},
        ${node.meta.hash},
        ${node.meta.kind || 'util'},
        ${JSON.stringify(node.meta.exports || [])},
        ${JSON.stringify(node.meta.imports || [])},
        ${JSON.stringify(node.meta.symbols || [])}
      )
      ON CONFLICT (file_path) DO UPDATE SET
        file_hash = EXCLUDED.file_hash,
        kind = EXCLUDED.kind,
        exports = EXCLUDED.exports,
        imports = EXCLUDED.imports,
        symbols = EXCLUDED.symbols,
        indexed_at = NOW()
    `;
  }

  // Insert symbol nodes
  log(`Inserting ${symbolNodes.length} symbol nodes...`);
  for (const node of symbolNodes) {
    await sql`
      INSERT INTO kg_nodes (id, kind, label, meta)
      VALUES (${node.id}, ${node.kind}, ${node.label}, ${JSON.stringify(node.meta)})
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        meta = EXCLUDED.meta
    `;
  }

  // Insert import edges
  log(`Inserting ${importEdges.length} import edges...`);
  for (const edge of importEdges) {
    await sql`
      INSERT INTO kg_edges (from_id, to_id, type, weight, evidence)
      VALUES (${edge.from_id}, ${edge.to_id}, ${edge.type}, ${edge.weight}, ${JSON.stringify(edge.evidence)})
    `;
  }

  // Insert export edges
  log(`Inserting ${exportEdges.length} export edges...`);
  for (const edge of exportEdges) {
    await sql`
      INSERT INTO kg_edges (from_id, to_id, type, weight, evidence)
      VALUES (${edge.from_id}, ${edge.to_id}, ${edge.type}, ${edge.weight}, ${JSON.stringify(edge.evidence)})
    `;
  }

  log('Knowledge graph built successfully', 'ok');
}

// ============================================================
// Phase 3: Link Errors to Graph
// ============================================================

async function linkErrorsToGraph() {
  if (SKIP_ERRORS) {
    log('Skipping error linking (--skip-errors)', 'warn');
    return;
  }

  log('Phase 3: Linking errors to knowledge graph...', 'step');

  // Check if ts_errors table exists
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ts_errors'
  `;

  if (tables.length === 0) {
    log('ts_errors table not found. Run phase6 check first to populate errors.', 'warn');
    return;
  }

  // Get all errors
  const errors = await sql`
    SELECT id, file_path, line, code, message, severity
    FROM ts_errors
    ORDER BY file_path, line
  `;

  log(`Found ${errors.length} TypeScript errors`);

  // Create error nodes + ERROR_IN_FILE edges
  let linked = 0;
  for (const err of errors) {
    const errorId = `err:${err.id}`;
    const fileId = `file:${err.file_path}`;

    // Create error node
    await sql`
      INSERT INTO kg_nodes (id, kind, label, meta)
      VALUES (
        ${errorId},
        'error',
        ${err.message},
        ${JSON.stringify({
          file: err.file_path,
          line: err.line,
          code: err.code,
          severity: err.severity
        })}
      )
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        meta = EXCLUDED.meta
    `;

    // Create ERROR_IN_FILE edge
    await sql`
      INSERT INTO kg_edges (from_id, to_id, type, weight, evidence)
      VALUES (
        ${errorId},
        ${fileId},
        'ERROR_IN_FILE',
        1.0,
        ${JSON.stringify({ line: err.line, code: err.code })}
      )
      ON CONFLICT DO NOTHING
    `;

    linked++;
  }

  log(`Linked ${linked} errors to files`, 'ok');

  // Find symbols near errors (ERROR_NEAR_SYMBOL edges)
  await findSymbolsNearErrors();
}

async function findSymbolsNearErrors() {
  log('Finding symbols near errors...', 'step');

  const errors = await sql`
    SELECT n.id as error_id, n.meta->>'file' as file, (n.meta->>'line')::int as line
    FROM kg_nodes n
    WHERE n.kind = 'error'
  `;

  let proximityEdges = 0;

  for (const err of errors) {
    const symbols = await sql`
      SELECT n.id as symbol_id, (n.meta->>'line')::int as symbol_line
      FROM kg_nodes n
      WHERE n.kind = 'symbol'
        AND n.meta->>'file' = ${err.file}
    `;

    // Find closest symbol (within ±10 lines)
    for (const sym of symbols) {
      const distance = Math.abs(sym.symbol_line - err.line);
      if (distance <= 10) {
        await sql`
          INSERT INTO kg_edges (from_id, to_id, type, weight, evidence)
          VALUES (
            ${err.error_id},
            ${sym.symbol_id},
            'ERROR_NEAR_SYMBOL',
            ${1.0 / (distance + 1)},
            ${JSON.stringify({ line_distance: distance })}
          )
          ON CONFLICT DO NOTHING
        `;
        proximityEdges++;
      }
    }
  }

  log(`Created ${proximityEdges} ERROR_NEAR_SYMBOL edges`, 'ok');
}

// ============================================================
// Phase 4: Generate Error Embeddings & Find Similar Patterns
// ============================================================

async function findSimilarErrors() {
  if (SKIP_ERRORS) {
    log('Skipping error similarity (--skip-errors)', 'warn');
    return;
  }

  log('Phase 4: Generating embeddings and finding similar errors...', 'step');

  const errors = await sql`
    SELECT n.id, n.label as message, n.meta->>'code' as code
    FROM kg_nodes n
    WHERE n.kind = 'error'
  `;

  log(`Generating embeddings for ${errors.length} errors...`);

  let embedded = 0;
  let similarEdges = 0;

  for (const err of errors) {
    // Generate embedding (cache in Redis)
    const embeddingKey = `emb:${sha256(err.message)}`;
    let embedding = await redis.get(embeddingKey);

    if (!embedding) {
      const vec = await generateEmbedding(`${err.code}: ${err.message}`);
      if (vec) {
        embedding = JSON.stringify(vec);
        await redis.setex(embeddingKey, 3600 * 24 * 7, embedding);
        embedded++;
      } else {
        continue;
      }
    }

    const errorVec = JSON.parse(embedding);

    // Find similar errors (cosine similarity)
    const otherErrors = await sql`
      SELECT n.id, n.label as message, n.meta->>'code' as code
      FROM kg_nodes n
      WHERE n.kind = 'error' AND n.id != ${err.id}
      LIMIT 100
    `;

    for (const other of otherErrors) {
      const otherEmbKey = `emb:${sha256(other.message)}`;
      const otherEmbStr = await redis.get(otherEmbKey);
      if (!otherEmbStr) continue;

      const otherVec = JSON.parse(otherEmbStr);
      const similarity = cosineSimilarity(errorVec, otherVec);

      if (similarity >= CONFIG.similarityThreshold) {
        await sql`
          INSERT INTO kg_edges (from_id, to_id, type, weight, evidence)
          VALUES (
            ${err.id},
            ${other.id},
            'SIMILAR_TO',
            ${similarity},
            ${JSON.stringify({ method: 'cosine_embedding' })}
          )
          ON CONFLICT DO NOTHING
        `;
        similarEdges++;
      }
    }

    if (embedded % 50 === 0) {
      log(`Embedded ${embedded}/${errors.length} errors...`);
    }
  }

  log(`Generated ${embedded} embeddings, created ${similarEdges} SIMILAR_TO edges`, 'ok');
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ============================================================
// Phase 5: Export Graph for UI Visualization
// ============================================================

async function exportGraphForViz() {
  log('Phase 5: Exporting graph for visualization...', 'step');

  mkdirSync(CONFIG.outputDir, { recursive: true });

  const nodes = await sql`
    SELECT id, kind, label, meta
    FROM kg_nodes
  `;

  const edges = await sql`
    SELECT id, from_id, to_id, type, weight, evidence
    FROM kg_edges
  `;

  const graph = {
    nodes: nodes.map(n => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      meta: n.meta
    })),
    edges: edges.map(e => ({
      id: e.id,
      from: e.from_id,
      to: e.to_id,
      type: e.type,
      weight: e.weight,
      evidence: e.evidence
    })),
    metadata: {
      generated_at: new Date().toISOString(),
      node_count: nodes.length,
      edge_count: edges.length,
      error_count: nodes.filter(n => n.kind === 'error').length,
      file_count: nodes.filter(n => n.kind === 'file').length,
      symbol_count: nodes.filter(n => n.kind === 'symbol').length
    }
  };

  const outputPath = join(CONFIG.outputDir, CONFIG.graphFile);
  writeFileSync(outputPath, JSON.stringify(graph, null, 2));

  log(`Graph exported to ${relativePath(outputPath)}`, 'ok');
  log(`  ${graph.metadata.node_count} nodes, ${graph.metadata.edge_count} edges`);
  log(`  ${graph.metadata.error_count} errors, ${graph.metadata.file_count} files, ${graph.metadata.symbol_count} symbols`);
}

// ============================================================
// Main Pipeline
// ============================================================

async function main() {
  try {
    log('🚀 Phase 88: Agentic Error Analysis Map Builder', 'step');
    log(`Mode: ${REBUILD ? 'REBUILD' : 'INCREMENTAL'}${SKIP_ERRORS ? ' (SKIP_ERRORS)' : ''}`);

    // Phase 1: Build file index
    const { fileNodes, symbolNodes, importEdges, exportEdges } = await buildFileIndex();

    // Phase 2: Build knowledge graph
    await buildKnowledgeGraph(fileNodes, symbolNodes, importEdges, exportEdges);

    // Phase 3: Link errors
    await linkErrorsToGraph();

    // Phase 4: Find similar errors
    await findSimilarErrors();

    // Phase 5: Export graph
    await exportGraphForViz();

    log('✅ Phase 88 pipeline complete!', 'ok');
  } catch (err) {
    log(`Pipeline failed: ${err.message}`, 'error');
    console.error(err);
    process.exit(1);
  } finally {
    await sql.end();
    await redis.quit();
  }
}

main();
