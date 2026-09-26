#!/usr/bin/env node
/**
 * Backfill AST symbols into atlas_packet_features.
 *
 * Reads canonical packets, resolves a concrete source file when possible,
 * extracts AST structure via @ast-grep/napi, and writes ast_symbols into the
 * feature lane using bounded batched updates.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { classifyFeatureEligibility } from './lib/feature-eligibility-v1.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const { Lang, parse } = await import(pathToFileURL(
  path.join(REPO_ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/index.js'),
).href);
const { parse: parseSvelte } = await import(pathToFileURL(
  path.join(REPO_ROOT, 'sveltekit-frontend/node_modules/svelte/src/compiler/index.js'),
).href);

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '500');
const BATCH_SIZE = Number(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ?? '100');
const PROBE_PATH = process.argv.find((arg) => arg.startsWith('--probe='))?.slice('--probe='.length);
let changedFeatureRows = 0;
let changedCodebaseRows = 0;

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

function normalizeSourceRef(sourceRef) {
  return String(sourceRef ?? '').replace(/^[.\\/]+/, '').trim();
}

// Found live 2026-09-13: a file with literal "\n" text (not real newlines) throughout collapsed
// to one giant "line", and the markdown Setext/ATX heading regexes -- earnest, not buggy on
// correctly-formatted input -- captured the entire ~7.8KB remainder as one "heading" symbol. A
// single oversized array element broke `CREATE INDEX ... USING gin (ast_symbols)` outright
// ("index row size 3512 exceeds maximum 2712"). Cap every symbol at emission time so no single
// pathological input can defeat indexability, regardless of which extractor produced it.
const MAX_SYMBOL_LENGTH = 200;

function unique(values) {
  return [...new Set((values ?? [])
    .map((v) => String(v).trim())
    .filter(Boolean)
    .map((v) => (v.length > MAX_SYMBOL_LENGTH ? `${v.slice(0, MAX_SYMBOL_LENGTH)}…` : v)))];
}

function toCodebaseAstSymbols(symbols) {
  return symbols.map((symbol) => {
    const separator = symbol.indexOf(':');
    const prefix = separator >= 0 ? symbol.slice(0, separator) : 'symbol';
    const name = separator >= 0 ? symbol.slice(separator + 1) : symbol;
    const kind = {
      fn: 'function',
      class: 'class',
      method: 'method',
      var: 'variable',
      interface: 'interface',
      type: 'type',
      enum: 'enum',
      import: 'import',
      export: 'export',
    }[prefix] ?? prefix;
    return { kind, name };
  });
}

function languageForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.ts') return Lang.TypeScript;
  if (extension === '.tsx') return Lang.Tsx;
  if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') return Lang.JavaScript;
  return null;
}

function firstNamedChild(node, kinds) {
  return node.children().find((child) => kinds.has(child.kind()));
}

// Stable per-symbol node identity (the "CST" piece): a hash of file path + symbol name + the
// node's exact byte range, matching the `{symbolName: hash}` shape already consumed by
// scripts/atlas/populate-structural-facts.mjs / feature_structural_facts. Distinct from
// `ast_symbols` (name + kind only, no positional identity) -- this is what changes when the SAME
// symbol name moves or is edited, which is the point of a concrete-syntax-tree-level identity.
function treeNodeId(filePath, name, range) {
  const key = `${filePath ?? ''}:${name}:${range.start.index}:${range.end.index}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function extractAstGrepSymbols(text, filePath, languageOverride) {
  const language = languageOverride ?? languageForPath(filePath);
  if (!language) return { symbols: [], method: 'ast-grep-unsupported-language', language: null, treeNodeIds: {} };

  const symbols = [];
  const treeNodeIds = {};
  const root = parse(language, String(text ?? '')).root();
  const declarationKinds = new Map([
    ['function_declaration', ['fn', new Set(['identifier'])]],
    ['generator_function_declaration', ['fn', new Set(['identifier'])]],
    ['class_declaration', ['class', new Set(['type_identifier', 'identifier'])]],
    ['method_definition', ['method', new Set(['property_identifier', 'private_property_identifier', 'identifier'])]],
    ['variable_declarator', ['var', new Set(['identifier', 'destructuring_pattern'])]],
    ['interface_declaration', ['interface', new Set(['type_identifier', 'identifier'])]],
    ['type_alias_declaration', ['type', new Set(['type_identifier', 'identifier'])]],
    ['enum_declaration', ['enum', new Set(['identifier', 'type_identifier'])]],
  ]);

  function visit(node) {
    const kind = node.kind();
    const declaration = declarationKinds.get(kind);
    if (declaration) {
      const [prefix, nameKinds] = declaration;
      const nameNode = firstNamedChild(node, nameKinds);
      if (nameNode) {
        symbols.push(`${prefix}:${nameNode.text()}`);
        treeNodeIds[nameNode.text()] = treeNodeId(filePath, nameNode.text(), node.range());
      }
    } else if (kind === 'import_statement') {
      const source = node.children().find((child) => child.kind() === 'string');
      if (source) symbols.push(`import:${source.text().replace(/^['"]|['"]$/g, '')}`);
    } else if (kind === 'export_statement') {
      const declarationNode = node.children().find((child) => declarationKinds.has(child.kind()));
      if (declarationNode) {
        const declaration = declarationKinds.get(declarationNode.kind());
        const nameNode = firstNamedChild(declarationNode, declaration[1]);
        if (nameNode) {
          symbols.push(`export:${nameNode.text()}`);
          treeNodeIds[nameNode.text()] = treeNodeId(filePath, nameNode.text(), declarationNode.range());
        }
      }
    }
    for (const child of node.children()) visit(child);
  }

  visit(root);
  return { symbols: unique(symbols).slice(0, 128), method: 'ast-grep-napi', language, treeNodeIds };
}

// Svelte: real AST access via svelte/compiler's parse(), not regex. Slices out
// the <script> block's byte range (instance.content for a plain <script>,
// module.content for <script module>/<script context="module">) and feeds it
// through the same ast-grep TypeScript path used for .ts files -- Svelte 5
// scripts are TS/JS, so no separate visitor logic is needed once isolated.
function extractSvelteSymbols(text, filePath) {
  const source = String(text ?? '');
  let parsed;
  try {
    parsed = parseSvelte(source, { filename: filePath, modern: true });
  } catch {
    return { symbols: [], method: 'svelte-parse-failed', language: null, treeNodeIds: {} };
  }
  const blocks = [parsed.instance, parsed.module].filter(Boolean);
  if (blocks.length === 0) return { symbols: [], method: 'svelte-no-script-block', language: null, treeNodeIds: {} };
  const symbols = [];
  const treeNodeIds = {};
  for (const block of blocks) {
    const scriptText = source.slice(block.content.start, block.content.end);
    const inner = extractAstGrepSymbols(scriptText, filePath, Lang.TypeScript);
    symbols.push(...inner.symbols);
    Object.assign(treeNodeIds, inner.treeNodeIds);
  }
  return { symbols: unique(symbols).slice(0, 128), method: 'svelte-script-block', language: 'svelte', treeNodeIds };
}

// JSON: no "declaration" concept, but top-level (and one level of nesting,
// for wrapper shapes like {"data": {...}}) object keys are a real, honest
// structural payload -- what a reader would call "what's in this file" at a
// glance. Arrays get an `item_count:N` marker instead of enumerating items.
function extractJsonSymbols(text) {
  let value;
  try {
    value = JSON.parse(String(text ?? ''));
  } catch {
    return { symbols: [], method: 'json-parse-failed', language: null, treeNodeIds: {} };
  }
  const symbols = [];
  const describe = (node, prefix, depth) => {
    if (depth > 1) return;
    if (Array.isArray(node)) {
      symbols.push(`${prefix}item_count:${node.length}`);
      return;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        symbols.push(`${prefix}key:${key}`);
        if (depth === 0) describe(node[key], `${key}.`, depth + 1);
      }
    }
  };
  describe(value, '', 0);
  return { symbols: unique(symbols).slice(0, 128), method: 'json-keys', language: 'json', treeNodeIds: {} };
}

// Markdown: ATX (`#`) and Setext (`===`/`---` underline) heading text as
// symbols, in document order, de-duplicated. This is the same structural
// signal a table-of-contents generator would use -- a real, if shallow,
// payload, not an invented one.
function extractMarkdownSymbols(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const symbols = [];
  for (let i = 0; i < lines.length; i += 1) {
    const atx = /^(#{1,6})\s+(.+?)\s*#*$/.exec(lines[i]);
    if (atx) {
      symbols.push(`h${atx[1].length}:${atx[2].trim()}`);
      continue;
    }
    const next = lines[i + 1] ?? '';
    if (/^\s*$/.test(lines[i])) continue;
    if (/^=+\s*$/.test(next)) { symbols.push(`h1:${lines[i].trim()}`); i += 1; continue; }
    if (/^-+\s*$/.test(next) && lines[i].trim().length > 0) { symbols.push(`h2:${lines[i].trim()}`); i += 1; }
  }
  return { symbols: unique(symbols).slice(0, 128), method: 'markdown-headings', language: 'markdown', treeNodeIds: {} };
}

// SQL: statement-target extraction via regex, not a real parser (no SQL
// parser dependency in this repo). Deliberately narrow -- only the
// CREATE/ALTER/DROP object-name shape, which is unambiguous and low-risk to
// get right with a regex, unlike full expression/clause parsing.
function extractSqlSymbols(text) {
  const source = String(text ?? '');
  const symbols = [];
  const pattern = /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|VIEW|FUNCTION|TRIGGER|TYPE|SCHEMA|EXTENSION|SEQUENCE|MATERIALIZED\s+VIEW)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?("?[\w.]+"?)/gi;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const kind = match[2].toLowerCase().replace(/\s+/g, '_');
    const name = match[3].replace(/"/g, '');
    symbols.push(`${match[1].toLowerCase()}_${kind}:${name}`);
  }
  return { symbols: unique(symbols).slice(0, 128), method: 'sql-statements', language: 'sql', treeNodeIds: {} };
}

// Python: regex-based def/class extraction, not a real parser. No Python AST
// library is available in this Node-only script; a regex anchored on
// top-of-line `def`/`class` keywords is a reasonable, honestly-labeled
// approximation (misses decorators-as-symbols, nested closures beyond one
// level of indentation context is not tracked) rather than a claimed full
// parse.
function extractPythonSymbols(text) {
  const source = String(text ?? '');
  const symbols = [];
  const defPattern = /^[ \t]*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
  const classPattern = /^[ \t]*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/gm;
  let match;
  while ((match = defPattern.exec(source)) !== null) symbols.push(`fn:${match[1]}`);
  while ((match = classPattern.exec(source)) !== null) symbols.push(`class:${match[1]}`);
  return { symbols: unique(symbols).slice(0, 128), method: 'python-regex', language: 'python', treeNodeIds: {} };
}

const EXTENSION_DISPATCH = new Map([
  ['.svelte', extractSvelteSymbols],
  ['.json', extractJsonSymbols],
  ['.md', extractMarkdownSymbols],
  ['.mdx', extractMarkdownSymbols],
  ['.sql', extractSqlSymbols],
  ['.py', extractPythonSymbols],
  ['.pyi', extractPythonSymbols],
]);

function extractAstSymbolsFromText(text, filePath) {
  const extension = path.extname(filePath ?? '').toLowerCase();
  const dispatched = EXTENSION_DISPATCH.get(extension);
  if (dispatched) return dispatched(text, filePath);
  return extractAstGrepSymbols(text, filePath);
}

let rgFileIndex;
function getRgFileIndex() {
  if (rgFileIndex) return rgFileIndex;
  rgFileIndex = new Map();
  try {
    // Found live 2026-09-13: this command's real output is 109.6MB and growing (repo size),
    // well past the old 64MB maxBuffer -- it was failing with ENOBUFS and silently degrading
    // to an empty index (every rg-fallback resolution attempt failed with no error surfaced).
    // Bumped the buffer AND added the same junk-tree excludes established in
    // upsert-whole-codebase-atlas-packets.mjs / feature-eligibility-v1.mjs (target/.fingerprint,
    // .python311, backups, qdrant-windows) -- smaller output, and this index no longer wastes
    // entries on files the eligibility classifier would reject anyway.
    const output = execFileSync('rg', [
      '--files', '--hidden', '--no-ignore',
      '-g', '!node_modules/**',
      '-g', '!.git/**',
      '-g', '!.cache/**',
      '-g', '!sveltekit-frontend/.svelte-kit/**',
      '-g', '!sveltekit-frontend/.vite/**',
      '-g', '!sveltekit-frontend/.docker-build/**',
      '-g', '!**/target/**/.fingerprint/**',
      '-g', '!.python311/**',
      '-g', '!qdrant-windows/**',
      '-g', '!**/*-backup*/**',
      '-g', '!**/*backups*/**',
    ], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    for (const line of output.split(/\r?\n/)) {
      const relative = line.trim();
      if (!relative) continue;
      const normalized = relative.replace(/\\/g, '/').replace(/^\.\//, '');
      rgFileIndex.set(normalized.toLowerCase(), path.join(REPO_ROOT, relative));
    }
  } catch (error) {
    console.warn(`[ast-symbols] rg file inventory unavailable: ${error.message}`);
  }
  return rgFileIndex;
}

function resolveViaRg(candidate) {
  const normalized = candidate.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  const variants = [normalized, normalized.replace(/^sveltekit-frontend\//, '')];
  const index = getRgFileIndex();
  for (const variant of variants) {
    const direct = index.get(variant) ?? index.get(`sveltekit-frontend/${variant}`);
    if (direct) return direct;
  }
  const suffixMatches = [...index.entries()]
    .filter(([relative]) => variants.some((variant) => relative.endsWith(`/${variant}`)))
    .map(([, absolute]) => absolute);
  return suffixMatches.length === 1 ? suffixMatches[0] : null;
}

// Crashed a 2026-09-13 full-backlog run with `RangeError: Invalid string length` reading a
// resolved candidate whose real on-disk size exceeded Node's max string length -- a resolved path
// is not evidence it's a reasonably-sized text file. Matches the existing MAX_SOURCE_BYTES pattern
// in scripts/atlas/materialize-addressable-packets.mjs (12MB) rather than inventing a new limit.
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

async function resolveSourceText(row) {
  const candidates = [
    row.file_path,
    row.source_path,
    row.relative_path,
    row.canonical_source_ref,
    row.source_ref,
  ].filter(Boolean).map((v) => normalizeSourceRef(v));

  for (const candidate of candidates) {
    for (const base of [REPO_ROOT, FRONTEND_ROOT]) {
      const abs = path.resolve(base, candidate);
      try {
        const stat = await fs.stat(abs);
        if (stat.isFile() && stat.size <= MAX_SOURCE_BYTES) return { path: abs, text: await fs.readFile(abs, 'utf8'), resolution: 'direct' };
      } catch {
        // continue
      }
    }
    const indexed = resolveViaRg(candidate);
    if (indexed) {
      const stat = await fs.stat(indexed).catch(() => null);
      if (stat && stat.size <= MAX_SOURCE_BYTES) return { path: indexed, text: await fs.readFile(indexed, 'utf8'), resolution: 'rg-files' };
      continue;
    }
  }

  return null;
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function main() {
  const client = await pool.connect();
  try {
    const packetCols = await getColumns(client, 'atlas_packets');
    const featureCols = await getColumns(client, 'atlas_packet_features');
    const codebaseCols = await getColumns(client, 'codebase_chunk_index');
    const pathCandidates = ['file_path', 'source_path', 'canonical_source_ref', 'source_ref']
      .filter((column) => packetCols.has(column));

    const selectColumns = [
      'ap.packet_key',
      'ap.source_ref',
      'ap.feature_id',
      'ap.title_id',
      packetCols.has('file_path') ? 'ap.file_path' : 'NULL::text AS file_path',
      packetCols.has('source_path') ? 'ap.source_path' : 'NULL::text AS source_path',
      packetCols.has('canonical_source_ref') ? 'ap.canonical_source_ref' : 'NULL::text AS canonical_source_ref',
      packetCols.has('relative_path') ? 'ap.relative_path' : 'NULL::text AS relative_path',
      featureCols.has('ast_symbols') ? 'apf.ast_symbols AS existing_ast_symbols' : 'ARRAY[]::text[] AS existing_ast_symbols',
      packetCols.has('summary') ? 'COALESCE(ap.summary, \'\') AS summary' : '\'\'::text AS summary',
    ];

    const { rows } = await client.query(
      `
      SELECT
        ${selectColumns.join(',\n        ')}
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      WHERE COALESCE(CARDINALITY(apf.ast_symbols), 0) = 0
        -- retroactive CST backfill: rows already carrying ast_symbols from an ast-grep-backed
        -- type (real parse tree available) but missing tree_node_ids -- added 2026-09-13 when
        -- treeNodeIds was introduced, so anything processed before that date needs a second pass.
        OR (
          COALESCE(apf.tree_node_ids, '{}'::jsonb) = '{}'::jsonb
          AND ap.source_ref ~* '\\.(ts|tsx|js|jsx|mjs|cjs|svelte)$'
        )
      ORDER BY ap.packet_key
      LIMIT $1
      `,
      [LIMIT],
    );

    // Pre-filter using the canonical eligibility classifier BEFORE the expensive
    // multi-candidate file-resolution walk (stat x4 dirs x N candidates + rg fallback).
    // Found live 2026-09-13: without this, most of a batch's wall-clock time was spent
    // resolving/rejecting rows that could never succeed anyway (build artifacts, binary
    // assets, vendored runtimes -- ~44% of any packet_key-ordered window) or rows whose
    // extension has no extractor built yet (rs/go/proto/sh/yaml/c-family/ps1 -- would
    // dispatch-miss and return `ast-grep-unsupported-language` regardless). Skipping
    // both up front cuts wasted resolution attempts roughly in half.
    let skippedIneligible = 0;
    let skippedUnimplemented = 0;
    const eligibleRows = rows.filter((row) => {
      const classification = classifyFeatureEligibility(row.source_ref);
      if (!classification.eligible) { skippedIneligible += 1; return false; }
      if (!classification.hasExtractor) { skippedUnimplemented += 1; return false; }
      return true;
    });

    // Resolution is I/O-bound (fs.stat/readFile across multiple candidate paths per row),
    // not CPU-bound -- sequential `await` per row was the real bottleneck (found live
    // 2026-09-13: a 3000-row batch took 14-18 minutes despite regex/AST extraction itself
    // being fast). Node's event loop can dispatch many of these concurrently without
    // worker_threads (there's no CPU-heavy compute to parallelize); a bounded concurrency
    // pool over the existing async I/O is the correct fix, not a threading/worker model.
    const CONCURRENCY = Number(process.argv.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1] ?? '24');
    async function resolveOne(row) {
      const resolved = await resolveSourceText(row);
      const sourceText = resolved?.text || row.summary || '';
      const extracted = extractAstSymbolsFromText(sourceText, resolved?.path ?? row.source_ref);
      const astSymbols = extracted.symbols;
      if (astSymbols.length === 0) return null;
      return {
        packet_key: row.packet_key,
        ast_symbols: astSymbols,
        source_ref: row.source_ref,
        resolved_path: resolved?.path ?? null,
        resolution: resolved?.resolution ?? null,
        extraction_method: extracted.method,
        extraction_language: extracted.language,
        tree_node_ids: extracted.treeNodeIds ?? {},
      };
    }

    const planned = [];
    for (let i = 0; i < eligibleRows.length; i += CONCURRENCY) {
      const chunk = eligibleRows.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map((row) => resolveOne(row)));
      for (const result of results) if (result) planned.push(result);
    }

    console.log(JSON.stringify({
      apply: APPLY,
      fetched: rows.length,
      skipped_ineligible: skippedIneligible,
      skipped_unimplemented_extractor: skippedUnimplemented,
      resolution_attempted: eligibleRows.length,
      planned: planned.length,
      batch_size: BATCH_SIZE,
      sample: planned.slice(0, 5),
    }, null, 2));

    if (!APPLY) {
      return;
    }

    for (let i = 0; i < planned.length; i += BATCH_SIZE) {
      const batch = planned.slice(i, i + BATCH_SIZE);
      await client.query('BEGIN');
      try {
        for (const item of batch) {
          // tree_node_ids: only overwrite when this extraction actually produced node identities
          // (ast-grep-backed types: ts/tsx/js/jsx/mjs/cjs/svelte). Regex-based extractors
          // (json/markdown/sql/python) have no real CST, so they pass `{}` -- COALESCE keeps
          // whatever was already there rather than clobbering it with an empty map.
          const treeNodeIdsJson = JSON.stringify(item.tree_node_ids ?? {});
          const featureUpdate = await client.query(
            `
            INSERT INTO atlas_packet_features
              (packet_key, ast_symbols, tree_node_ids, ast_language, ast_extraction_method, ast_coverage, updated_at)
            VALUES ($1, $2::text[], $3::jsonb, $4, $5, 1.0, NOW())
            ON CONFLICT (packet_key)
            DO UPDATE SET
              ast_symbols = EXCLUDED.ast_symbols,
              tree_node_ids = CASE WHEN $3::jsonb = '{}'::jsonb THEN atlas_packet_features.tree_node_ids ELSE $3::jsonb END,
              ast_language = EXCLUDED.ast_language,
              ast_extraction_method = EXCLUDED.ast_extraction_method,
              ast_coverage = 1.0,
              updated_at = NOW()
            WHERE atlas_packet_features.ast_symbols IS DISTINCT FROM EXCLUDED.ast_symbols
               OR (COALESCE(atlas_packet_features.tree_node_ids, '{}'::jsonb) = '{}'::jsonb AND $3::jsonb != '{}'::jsonb)
            `,
            [item.packet_key, item.ast_symbols, treeNodeIdsJson, item.extraction_language, item.extraction_method],
          );
          changedFeatureRows += featureUpdate.rowCount;

          if (codebaseCols.has('ast_symbols') && codebaseCols.has('source_ref')) {
            const codebaseSymbolJson = JSON.stringify(toCodebaseAstSymbols(item.ast_symbols));
            const codebaseUpdate = await client.query(
              `
              UPDATE codebase_chunk_index
              SET ast_symbols = $1::jsonb${codebaseCols.has('updated_at') ? ', updated_at = NOW()' : ''}
              WHERE (source_ref = $2 OR relative_path = $2)
                AND ast_symbols IS DISTINCT FROM $1::jsonb
              `,
              [codebaseSymbolJson, item.source_ref],
            );
            changedCodebaseRows += codebaseUpdate.rowCount;
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    const verify = await client.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE COALESCE(CARDINALITY(ast_symbols), 0) > 0)::int AS populated
      FROM atlas_packet_features
      `,
    );

    console.log(JSON.stringify({
      status: 'applied',
      total: verify.rows[0].total,
      populated: verify.rows[0].populated,
      coverage_percent: verify.rows[0].total > 0
        ? Number(((verify.rows[0].populated / verify.rows[0].total) * 100).toFixed(2))
        : 0,
      changed_feature_rows: changedFeatureRows,
      changed_codebase_rows: changedCodebaseRows,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

if (PROBE_PATH) {
  const absolutePath = path.resolve(REPO_ROOT, PROBE_PATH);
  const probeText = await fs.readFile(absolutePath, 'utf8');
  const probe = extractAstSymbolsFromText(probeText, absolutePath);
  console.log(JSON.stringify({ path: absolutePath, ...probe }, null, 2));
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
