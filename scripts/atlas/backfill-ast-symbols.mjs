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
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const { Lang, parse } = await import(pathToFileURL(
  path.join(REPO_ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/index.js'),
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

function unique(values) {
  return [...new Set((values ?? []).map((v) => String(v).trim()).filter(Boolean))];
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

function extractAstSymbolsFromText(text, filePath) {
  const language = languageForPath(filePath);
  if (!language) return { symbols: [], method: 'ast-grep-unsupported-language', language: null };

  const symbols = [];
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
      if (nameNode) symbols.push(`${prefix}:${nameNode.text()}`);
    } else if (kind === 'import_statement') {
      const source = node.children().find((child) => child.kind() === 'string');
      if (source) symbols.push(`import:${source.text().replace(/^['"]|['"]$/g, '')}`);
    } else if (kind === 'export_statement') {
      const declarationNode = node.children().find((child) => declarationKinds.has(child.kind()));
      if (declarationNode) {
        const declaration = declarationKinds.get(declarationNode.kind());
        const nameNode = firstNamedChild(declarationNode, declaration[1]);
        if (nameNode) symbols.push(`export:${nameNode.text()}`);
      }
    }
    for (const child of node.children()) visit(child);
  }

  visit(root);
  return { symbols: unique(symbols).slice(0, 128), method: 'ast-grep-napi', language };
}

let rgFileIndex;
function getRgFileIndex() {
  if (rgFileIndex) return rgFileIndex;
  rgFileIndex = new Map();
  try {
    const output = execFileSync('rg', [
      '--files', '--hidden', '--no-ignore',
      '-g', '!node_modules/**',
      '-g', '!.git/**',
      '-g', '!.cache/**',
      '-g', '!sveltekit-frontend/.svelte-kit/**',
      '-g', '!sveltekit-frontend/.vite/**',
      '-g', '!sveltekit-frontend/.docker-build/**',
    ], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
        if (stat.isFile()) return { path: abs, text: await fs.readFile(abs, 'utf8'), resolution: 'direct' };
      } catch {
        // continue
      }
    }
    const indexed = resolveViaRg(candidate);
    if (indexed) return { path: indexed, text: await fs.readFile(indexed, 'utf8'), resolution: 'rg-files' };
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
      ORDER BY ap.packet_key
      LIMIT $1
      `,
      [LIMIT],
    );

    const planned = [];
    for (const row of rows) {
      const resolved = await resolveSourceText(row);
      const sourceText = resolved?.text || row.summary || '';
      const extracted = extractAstSymbolsFromText(sourceText, resolved?.path ?? row.source_ref);
      const astSymbols = extracted.symbols;
      if (astSymbols.length === 0) continue;

      planned.push({
        packet_key: row.packet_key,
        ast_symbols: astSymbols,
        source_ref: row.source_ref,
        resolved_path: resolved?.path ?? null,
        resolution: resolved?.resolution ?? null,
        extraction_method: extracted.method,
        extraction_language: extracted.language,
      });
    }

    console.log(JSON.stringify({
      apply: APPLY,
      fetched: rows.length,
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
          const featureUpdate = await client.query(
            `
            INSERT INTO atlas_packet_features (packet_key, ast_symbols, updated_at)
            VALUES ($1, $2::text[], NOW())
            ON CONFLICT (packet_key)
            DO UPDATE SET
              ast_symbols = EXCLUDED.ast_symbols,
              updated_at = NOW()
            WHERE atlas_packet_features.ast_symbols IS DISTINCT FROM EXCLUDED.ast_symbols
            `,
            [item.packet_key, item.ast_symbols],
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
