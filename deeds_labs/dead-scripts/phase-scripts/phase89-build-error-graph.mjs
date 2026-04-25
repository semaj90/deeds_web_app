#!/usr/bin/env node
/**
 * Phase 89: Agentic Error Analysis Pipeline
 *
 * Builds knowledge graph from codebase AST using ts-morph:
 * - Parse TypeScript/Svelte files
 * - Extract imports, exports, symbols
 * - Link errors to code structure
 * - Create vector embeddings for errors + patterns
 * - Populate PostgreSQL knowledge graph
 */

import { createHash } from 'crypto';
import fs from 'fs/promises';
import { glob } from 'glob';
import { Ollama } from 'ollama';
import path from 'path';
import pg from 'pg';
import { Project } from 'ts-morph';

// CONFIG
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://user:pass@127.0.0.1:5434/legal';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const ollama = new Ollama({ host: OLLAMA_URL });

/**
 * Get file hash for change detection
 */
function getFileHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get embedding for text
 */
async function getEmbedding(text) {
  const response = await ollama.embeddings({
    model: EMBED_MODEL,
    prompt: text
  });
  return response.embedding;
}

/**
 * Parse file with ts-morph and extract metadata
 */
async function analyzeFile(filePath, project) {
  console.log(`  📄 ${filePath}`);

  const sourceFile = project.addSourceFileAtPath(filePath);
  const content = sourceFile.getFullText();
  const hash = getFileHash(content);

  // Extract exports
  const exports = sourceFile.getExportedDeclarations();
  const exportsList = [];

  exports.forEach((declarations, name) => {
    declarations.forEach(decl => {
      const kind = decl.getKindName();
      const line = decl.getStartLineNumber();
      exportsList.push({ name, kind, line });
    });
  });

  // Extract imports
  const importDeclarations = sourceFile.getImportDeclarations();
  const importsList = importDeclarations.map(imp => {
    const from = imp.getModuleSpecifierValue();
    const specifiers = imp.getNamedImports().map(ni => ({
      name: ni.getName(),
      alias: ni.getAliasNode()?.getText()
    }));
    const defaultImport = imp.getDefaultImport()?.getText();
    if (defaultImport) {
      specifiers.unshift({ name: 'default', alias: defaultImport });
    }
    return { from, specifiers };
  });

  // Determine module kind
  const hasImportExport = importsList.length > 0 || exportsList.length > 0;
  const isSvelte = filePath.endsWith('.svelte');
  const moduleKind = isSvelte ? 'svelte' : (hasImportExport ? 'esm' : 'script');

  // Build lightweight AST summary (top-level declarations)
  const astSummary = {
    classes: sourceFile.getClasses().map(c => ({
      name: c.getName(),
      exported: c.isExported(),
      line: c.getStartLineNumber()
    })),
    functions: sourceFile.getFunctions().map(f => ({
      name: f.getName(),
      exported: f.isExported(),
      line: f.getStartLineNumber()
    })),
    interfaces: sourceFile.getInterfaces().map(i => ({
      name: i.getName(),
      exported: i.isExported(),
      line: i.getStartLineNumber()
    })),
    typeAliases: sourceFile.getTypeAliases().map(t => ({
      name: t.getName(),
      exported: t.isExported(),
      line: t.getStartLineNumber()
    }))
  };

  // Get error count for this file
  const errorCountRes = await pool.query(
    'SELECT COUNT(*) as count FROM ts_errors WHERE path = $1',
    [filePath]
  );
  const errorCount = parseInt(errorCountRes.rows[0]?.count || 0);

  return {
    path: filePath,
    module_kind: moduleKind,
    exports: exportsList,
    imports: importsList,
    hash,
    ast_summary: astSummary,
    error_count: errorCount
  };
}

/**
 * Create file node in knowledge graph
 */
async function createFileNode(fileData) {
  const uri = `file:${fileData.path}`;
  const meta = {
    path: fileData.path,
    module_kind: fileData.module_kind,
    error_count: fileData.error_count,
    hash: fileData.hash
  };

  const result = await pool.query(
    `SELECT get_or_create_node($1, $2, $3, $4) as id`,
    ['file', fileData.path, uri, JSON.stringify(meta)]
  );

  return result.rows[0].id;
}

/**
 * Create import edges in knowledge graph
 */
async function createImportEdges(fileData) {
  const fromUri = `file:${fileData.path}`;

  for (const imp of fileData.imports) {
    // Resolve relative imports to absolute paths
    let toPath = imp.from;
    if (imp.from.startsWith('.')) {
      const dir = path.dirname(fileData.path);
      toPath = path.resolve(dir, imp.from);
      // Normalize to workspace-relative path
      toPath = path.relative(process.cwd(), toPath).replace(/\\/g, '/');
    }

    const toUri = `file:${toPath}`;

    // Create FILE_IMPORTS_FILE edge
    await pool.query(
      `SELECT create_edge($1, $2, $3, $4, $5)`,
      [
        fromUri,
        toUri,
        'FILE_IMPORTS_FILE',
        1.0,
        JSON.stringify({ specifiers: imp.specifiers })
      ]
    );
  }
}

/**
 * Create symbol nodes and edges
 */
async function createSymbolNodes(fileData) {
  const fileUri = `file:${fileData.path}`;

  for (const exp of fileData.exports) {
    const symUri = `sym:${fileData.path}:${exp.name}`;

    // Create symbol node
    await pool.query(
      `SELECT get_or_create_node($1, $2, $3, $4) as id`,
      [
        'symbol',
        `${exp.name} (${exp.kind})`,
        symUri,
        JSON.stringify({ kind: exp.kind, line: exp.line, file: fileData.path })
      ]
    );

    // Create FILE_DEFINES_SYMBOL edge
    await pool.query(
      `SELECT create_edge($1, $2, $3, $4, $5)`,
      [fileUri, symUri, 'FILE_DEFINES_SYMBOL', 1.0, JSON.stringify({ line: exp.line })]
    );
  }
}

/**
 * Link errors to symbols (find nearest symbol to error line)
 */
async function linkErrorsToSymbols(fileData) {
  const errors = await pool.query(
    'SELECT id, code, line, "column", message FROM ts_errors WHERE path = $1',
    [fileData.path]
  );

  for (const error of errors.rows) {
    const errorUri = `err:${error.code}:${fileData.path}:${error.line}:${error.column}`;

    // Find nearest symbol (class, function, etc.)
    let nearestSymbol = null;
    let minDistance = Infinity;

    const allDecls = [
      ...fileData.ast_summary.classes,
      ...fileData.ast_summary.functions,
      ...fileData.ast_summary.interfaces,
      ...fileData.ast_summary.typeAliases
    ];

    for (const decl of allDecls) {
      const distance = Math.abs(error.line - decl.line);
      if (distance < minDistance) {
        minDistance = distance;
        nearestSymbol = decl;
      }
    }

    if (nearestSymbol && minDistance <= 20) { // Within 20 lines
      const symUri = `sym:${fileData.path}:${nearestSymbol.name}`;
      await pool.query(
        `SELECT create_edge($1, $2, $3, $4, $5)`,
        [
          errorUri,
          symUri,
          'ERROR_NEAR_SYMBOL',
          1.0 / (minDistance + 1), // Weight inversely proportional to distance
          JSON.stringify({ distance: minDistance, error_message: error.message })
        ]
      );
    }
  }
}

/**
 * Main pipeline
 */
async function main() {
  console.log('🔬 Phase 89: Agentic Error Analysis Pipeline\n');
  console.log('━'.repeat(60));

  // Step 1: Initialize ts-morph project
  console.log('\n📦 Step 1: Initializing ts-morph project...');
  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true
  });

  // Step 2: Find all TypeScript/Svelte files
  console.log('\n🔍 Step 2: Finding files...');
  const patterns = [
    'src/**/*.ts',
    'src/**/*.svelte',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!node_modules/**'
  ];

  const files = await glob(patterns, { cwd: process.cwd() });
  console.log(`   Found ${files.length} files`);

  // Step 3: Ensure schema is applied
  console.log('\n🗄️  Step 3: Ensuring database schema...');
  const schemaPath = path.join(process.cwd(), 'migrations/phase89-error-graph-schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf-8');
  await pool.query(schema);
  console.log('   ✅ Schema applied');

  // Step 4: Analyze files and build index
  console.log('\n🔬 Step 4: Analyzing files and building graph...');
  let processedCount = 0;

  for (const file of files.slice(0, 50)) { // Process first 50 for demo
    try {
      const fileData = await analyzeFile(file, project);

      // Upsert file_index
      await pool.query(
        `INSERT INTO file_index (path, module_kind, exports, imports, hash, ast_summary, error_count, last_analyzed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (path) DO UPDATE SET
           module_kind = EXCLUDED.module_kind,
           exports = EXCLUDED.exports,
           imports = EXCLUDED.imports,
           hash = EXCLUDED.hash,
           ast_summary = EXCLUDED.ast_summary,
           error_count = EXCLUDED.error_count,
           last_analyzed_at = NOW(),
           updated_at = NOW()`,
        [
          fileData.path,
          fileData.module_kind,
          JSON.stringify(fileData.exports),
          JSON.stringify(fileData.imports),
          fileData.hash,
          JSON.stringify(fileData.ast_summary),
          fileData.error_count
        ]
      );

      // Create knowledge graph nodes and edges
      await createFileNode(fileData);
      await createImportEdges(fileData);
      await createSymbolNodes(fileData);
      await linkErrorsToSymbols(fileData);

      processedCount++;
      if (processedCount % 10 === 0) {
        console.log(`   Processed ${processedCount}/${files.length} files...`);
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${file}: ${error.message}`);
    }
  }

  // Step 5: Generate embeddings for errors
  console.log('\n🧮 Step 5: Generating error embeddings...');
  const errors = await pool.query(
    `SELECT e.id, e.code, e.message, e.path, e.line
     FROM ts_errors e
     LEFT JOIN error_embeddings ee ON ee.error_id = e.id
     WHERE ee.id IS NULL
     LIMIT 100`
  );

  let embeddingCount = 0;
  for (const error of errors.rows) {
    const text = `${error.code}: ${error.message} in ${error.path}:${error.line}`;
    const embedding = await getEmbedding(text);

    await pool.query(
      `INSERT INTO error_embeddings (error_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [error.id, `[${embedding.join(',')}]`]
    );

    embeddingCount++;
    if (embeddingCount % 10 === 0) {
      console.log(`   Generated ${embeddingCount}/${errors.rows.length} embeddings...`);
    }
  }

  // Step 6: Stats
  console.log('\n📊 Step 6: Graph Statistics\n');
  console.log('━'.repeat(60));

  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM kg_nodes WHERE kind = 'file') as file_nodes,
      (SELECT COUNT(*) FROM kg_nodes WHERE kind = 'error') as error_nodes,
      (SELECT COUNT(*) FROM kg_nodes WHERE kind = 'symbol') as symbol_nodes,
      (SELECT COUNT(*) FROM kg_edges WHERE type = 'FILE_IMPORTS_FILE') as import_edges,
      (SELECT COUNT(*) FROM kg_edges WHERE type = 'FILE_DEFINES_SYMBOL') as symbol_edges,
      (SELECT COUNT(*) FROM kg_edges WHERE type = 'ERROR_NEAR_SYMBOL') as error_symbol_edges,
      (SELECT COUNT(*) FROM file_index) as indexed_files,
      (SELECT COUNT(*) FROM error_embeddings) as error_embeddings
  `);

  const s = stats.rows[0];
  console.log(`   Files indexed: ${s.indexed_files}`);
  console.log(`   File nodes: ${s.file_nodes}`);
  console.log(`   Error nodes: ${s.error_nodes}`);
  console.log(`   Symbol nodes: ${s.symbol_nodes}`);
  console.log(`   Import edges: ${s.import_edges}`);
  console.log(`   Symbol definition edges: ${s.symbol_edges}`);
  console.log(`   Error-to-symbol edges: ${s.error_symbol_edges}`);
  console.log(`   Error embeddings: ${s.error_embeddings}`);

  console.log('\n✅ Phase 89 pipeline complete!\n');
  console.log('Next: View error map at http://localhost:5175/phase89/error-map');

  await pool.end();
}

main().catch(error => {
  console.error('❌ Pipeline failed:', error);
  process.exit(1);
});
