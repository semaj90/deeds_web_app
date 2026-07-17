#!/usr/bin/env node
/**
 * AST Facts Lane — web-tree-sitter structural parser
 *
 * Role: structural sidecar — populates tree_node_id, ast_symbols, imports,
 * exports in codebase_chunk_index. Does NOT own packet identity or ranking.
 *
 * Emits per-chunk facts:
 *   tree_node_id  — deterministic UUID: SHA-256(source_ref|language|kind|name|line)
 *   ast_symbols   — JSONB [{kind, name, line_start, line_end, node_id}]
 *   imports[]     — module specifiers imported by this chunk's file
 *   exports[]     — export names declared in this chunk's file
 *
 * Usage:
 *   node scripts/atlas/ast-treesitter-facts.mjs [--dry-run] [--limit N] [--apply]
 *   node scripts/atlas/ast-treesitter-facts.mjs --source-ref src/lib/server/auth.ts
 */

import { createRequire } from 'module';
import { resolve, join } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';

const require = createRequire(import.meta.url);
const TreeSitter = require('web-tree-sitter');
const { Parser, Language } = TreeSitter;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// __dirname = sveltekit-frontend/scripts/atlas/
// ../../.. = repo root
const REPO_ROOT = resolve(__dirname, '../../..');
const SVELTEKIT_ROOT = resolve(__dirname, '../..');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const APPLY   = args.includes('--apply');
const VERBOSE  = args.includes('--verbose');
const LIMIT    = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0') || 0;
const BATCH    = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '200') || 200;
const SOURCE_REF = args.find(a => a.startsWith('--source-ref='))?.split('=').slice(1).join('=') ?? null;

if (!DRY_RUN && !APPLY) {
  console.error('Pass --dry-run or --apply');
  process.exit(1);
}

// ── Tree-sitter init ──────────────────────────────────────────────────────────
const WASM_DIR = resolve('./node_modules/web-tree-sitter');
const TS_WASM  = resolve('./node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm');
const TSX_WASM = resolve('./node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm');

await Parser.init({
  locateFile(name) { return join(WASM_DIR, name); },
});

const tsParser  = new Parser();
const tsxParser = new Parser();
const tsLang  = await Language.load(TS_WASM);
const tsxLang = await Language.load(TSX_WASM);
tsParser.setLanguage(tsLang);
tsxParser.setLanguage(tsxLang);

function parserFor(language, filePath) {
  if (filePath?.endsWith('.svelte')) return tsxParser; // svelte script blocks treated as TSX
  if (language === 'tsx' || filePath?.endsWith('.tsx')) return tsxParser;
  return tsParser;
}

// ── Deterministic node ID ─────────────────────────────────────────────────────
function treeNodeId(sourceRef, language, kind, name, lineStart) {
  const raw = `${sourceRef}|${language}|${kind}|${name}|${lineStart}`;
  const hex = createHash('sha256').update(raw).digest('hex');
  // Format as UUID v5-ish (deterministic, not standard but stable)
  return [hex.slice(0,8), hex.slice(8,12), '5' + hex.slice(13,16),
          hex.slice(16,20), hex.slice(20,32)].join('-');
}

// ── Symbol kind classifier ────────────────────────────────────────────────────
// Maps tree-sitter node types → semantic kinds used in atlas_packets
const KIND_MAP = {
  function_declaration:           'function',
  arrow_function:                 'arrow_function',
  method_definition:              'method',
  class_declaration:              'class',
  interface_declaration:          'interface',
  type_alias_declaration:         'type',
  enum_declaration:               'enum',
  variable_declarator:            'variable',
  export_statement:               'export',
  import_statement:               'import',
  lexical_declaration:            'lexical',
};

// ── AST visitor — extract structural facts from a parsed tree ─────────────────
function extractFacts(tree, sourceRef, language, filePath) {
  const symbols = [];
  const imports = [];
  const exports = [];

  function visit(node) {
    // Imports
    if (node.type === 'import_statement') {
      const src = node.children.find(c => c.type === 'string');
      if (src) {
        const specifier = src.text.replace(/^['"]|['"]$/g, '');
        imports.push(specifier);
      }
      return; // don't recurse into import — children are specifiers not symbols
    }

    // Exports
    if (node.type === 'export_statement') {
      // recurse into the export to find the declared symbol
      for (const child of node.namedChildren) {
        visit(child);
      }
      return;
    }

    const kind = KIND_MAP[node.type];
    if (kind && kind !== 'import' && kind !== 'export') {
      const nameNode = node.childForFieldName?.('name')
        ?? node.namedChildren.find(c => c.type === 'identifier' || c.type === 'type_identifier' || c.type === 'property_identifier');
      const name = nameNode?.text ?? '';
      if (name) {
        const lineStart = node.startPosition.row + 1; // 1-based
        const lineEnd   = node.endPosition.row   + 1;
        const nodeId    = treeNodeId(sourceRef, language, kind, name, lineStart);
        symbols.push({ kind, name, line_start: lineStart, line_end: lineEnd, node_id: nodeId });
        exports.push(name); // anything named in a declaration is a potential export
      }
    }

    for (const child of node.namedChildren) {
      visit(child);
    }
  }

  visit(tree.rootNode);
  return { symbols, imports, exports: [...new Set(exports)] };
}

// ── Svelte: extract <script> content offset ───────────────────────────────────
function extractSvelteScript(src) {
  const match = src.match(/<script(?:[^>]*)>([\s\S]*?)<\/script>/i);
  if (!match) return { script: '', offset: 0 };
  const offset = src.indexOf(match[1]);
  return { script: match[1], offset };
}

// ── Postgres setup ────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.PG_HOST     ?? process.env.PGHOST     ?? 'localhost',
  port:     parseInt(process.env.PG_PORT ?? process.env.PGPORT ?? '5434'),
  user:     process.env.PG_USER     ?? process.env.PGUSER     ?? 'legal_admin',
  password: process.env.PG_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD ?? '123456',
  database: process.env.PG_DATABASE ?? process.env.PGDATABASE ?? 'legal_ai_db',
  max: 4,
});

// Ensure ast_symbols + imports + exports columns exist
async function ensureColumns(client) {
  await client.query(`
    ALTER TABLE codebase_chunk_index
      ADD COLUMN IF NOT EXISTS ast_symbols   jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS ast_imports   text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS ast_exports   text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS ast_facts_at  timestamptz
  `);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== AST Facts Lane (web-tree-sitter) ===');
console.log(`Mode        : ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Batch       : ${BATCH}`);
if (LIMIT)      console.log(`Limit       : ${LIMIT}`);
if (SOURCE_REF) console.log(`Source ref  : ${SOURCE_REF}`);
console.log('');

const client = await pool.connect();
try {
  // Always ensure columns exist — idempotent, no harm on dry-run
  await ensureColumns(client);
  if (VERBOSE || !DRY_RUN) console.log('Columns verified ✓');

  // Build query
  let whereClause = SOURCE_REF
    ? `WHERE cci.source_ref = $1 OR cci.relative_path = $1`
    : `WHERE cci.ast_facts_at IS NULL AND cci.source_ref IS NOT NULL AND cci.language IN ('typescript','javascript','svelte','tsx')`;

  const countSql = `SELECT count(*) FROM codebase_chunk_index cci ${whereClause}`;
  const countRes = await client.query(countSql, SOURCE_REF ? [SOURCE_REF] : []);
  const total = parseInt(countRes.rows[0].count);
  const toProcess = LIMIT ? Math.min(total, LIMIT) : total;
  console.log(`Eligible chunks : ${total.toLocaleString()}`);
  console.log(`Will process    : ${toProcess.toLocaleString()}`);
  console.log('');

  let fetched = 0, updated = 0, skipped = 0, errors = 0;
  // Cache: source_ref → parsed facts (one parse per file, applied to all chunks)
  const fileFactsCache = new Map();

  // Note: for the default (non-SOURCE_REF) path, rows get ast_facts_at set after update,
  // so they drop out of the WHERE clause. Always use OFFSET 0 — no keyset drift.
  // For SOURCE_REF path, we paginate with offset since rows may already have ast_facts_at.
  let offset = 0;
  while (fetched < toProcess) {
    const batchSize = Math.min(BATCH, toProcess - fetched);
    const sql = SOURCE_REF
      ? `
        SELECT id, source_ref, relative_path, language, line_start, line_end,
               symbol, kind
        FROM codebase_chunk_index cci
        ${whereClause}
        ORDER BY cci.source_ref, cci.line_start
        LIMIT $2 OFFSET $3
      `
      : `
        SELECT id, source_ref, relative_path, language, line_start, line_end,
               symbol, kind
        FROM codebase_chunk_index cci
        ${whereClause}
        ORDER BY cci.source_ref, cci.line_start
        LIMIT $1
      `;
    const params = SOURCE_REF
      ? [SOURCE_REF, batchSize, offset]
      : [batchSize];

    const { rows } = await client.query(sql, params);
    if (!rows.length) break;
    fetched += rows.length;
    if (SOURCE_REF) offset += rows.length;

    for (const row of rows) {
      const filePath = row.source_ref ?? row.relative_path;
      if (!filePath) { skipped++; continue; }

      // Resolve absolute path — source_refs are relative to REPO_ROOT
      let absPath = filePath.startsWith('/')
        ? filePath
        : join(REPO_ROOT, filePath);
      if (!existsSync(absPath)) {
        absPath = join(SVELTEKIT_ROOT, filePath);
      }
      if (!existsSync(absPath)) { skipped++; continue; }

      // Parse file once per source_ref, cache results
      if (!fileFactsCache.has(filePath)) {
        try {
          let src = await readFile(absPath, 'utf8');
          const lang = row.language ?? (filePath.endsWith('.svelte') ? 'svelte' : 'typescript');
          let parseSource = src;
          let lineOffset = 0;
          if (lang === 'svelte') {
            const { script, offset: off } = extractSvelteScript(src);
            parseSource = script;
            lineOffset = src.slice(0, off).split('\n').length - 1;
          }
          const parser = parserFor(lang, filePath);
          const tree = parser.parse(parseSource);
          const { symbols, imports, exports } = extractFacts(tree, filePath, lang, filePath);
          // Adjust line numbers if svelte offset
          if (lineOffset > 0) {
            for (const s of symbols) {
              s.line_start += lineOffset;
              s.line_end   += lineOffset;
            }
          }
          fileFactsCache.set(filePath, { symbols, imports, exports });
        } catch (err) {
          fileFactsCache.set(filePath, { symbols: [], imports: [], exports: [] });
          if (VERBOSE) console.error(`  parse error ${filePath}: ${err.message}`);
        }
      }

      const facts = fileFactsCache.get(filePath);

      // Filter symbols to those overlapping this chunk's line range
      const chunkSymbols = facts.symbols.filter(s => {
        if (!row.line_start || !row.line_end) return true; // no line info, include all
        return s.line_start <= (row.line_end ?? Infinity) && s.line_end >= (row.line_start ?? 0);
      });

      // Canonical tree_node_id for this chunk: first overlapping symbol, or file-level
      const primarySymbol = chunkSymbols[0] ?? facts.symbols[0];
      const primaryNodeId = primarySymbol?.node_id
        ?? treeNodeId(filePath, row.language ?? 'typescript', 'file', filePath, 0);

      if (VERBOSE) {
        console.log(`  ${filePath}:${row.line_start}-${row.line_end} → ${chunkSymbols.length} symbols, ${facts.imports.length} imports`);
      }

      if (DRY_RUN) {
        if (updated < 3) {
          console.log(`[DRY-RUN] chunk id=${row.id}`);
          console.log(`  source_ref=${filePath}`);
          console.log(`  tree_node_id=${primaryNodeId}`);
          console.log(`  ast_symbols (${chunkSymbols.length}): ${JSON.stringify(chunkSymbols.slice(0,2))}`);
          console.log(`  imports (${facts.imports.length}): ${facts.imports.slice(0,3).join(', ')}`);
        }
        updated++;
        continue;
      }

      // Write to Postgres
      try {
        await client.query(`
          UPDATE codebase_chunk_index SET
            ast_symbols  = $1::jsonb,
            ast_imports  = $2::text[],
            ast_exports  = $3::text[],
            ast_facts_at = NOW(),
            updated_at   = NOW()
          WHERE id = $4
        `, [
          JSON.stringify(chunkSymbols),
          facts.imports,
          facts.exports,
          row.id,
        ]);
        updated++;
      } catch (err) {
        errors++;
        if (VERBOSE) console.error(`  update error ${row.id}: ${err.message}`);
      }
    }

    if (fetched % 1000 === 0 || fetched >= toProcess) {
      console.log(`Progress: ${fetched.toLocaleString()} fetched / ${toProcess.toLocaleString()} total  (updated=${updated}, skipped=${skipped}, errors=${errors})`);
    }
  }

  console.log('');
  console.log('─────────────────────────────────────────');
  console.log('AST Facts Lane complete');
  console.log(`  Fetched   : ${fetched}`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Skipped   : ${skipped}`);
  console.log(`  Errors    : ${errors}`);
  console.log(`  Files parsed (cached) : ${fileFactsCache.size}`);
  console.log('─────────────────────────────────────────');
} finally {
  client.release();
  await pool.end();
}
