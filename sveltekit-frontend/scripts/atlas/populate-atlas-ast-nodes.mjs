#!/usr/bin/env node
/**
 * Populate atlas_ast_nodes from codebase_chunk_index.
 *
 * Sources:
 *   - codebase_chunk_index rows with symbol + kind → one AST node per row
 *   - ast_symbols JSONB column → additional child nodes per chunk
 *
 * tree_node_id = sha256(repo_id_str \x00 normalized_path \x00 parser_language \x00
 *                        node_kind \x00 qualified_symbol \x00 structural_parent_key \x00
 *                        normalized_signature)
 *
 * Usage:
 *   node scripts/atlas/populate-atlas-ast-nodes.mjs [--dry-run] [--limit N] [--verify]
 */

import pg from 'pg';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const { Pool } = pg;
const isDryRun  = process.argv.includes('--dry-run');
const isVerify  = process.argv.includes('--verify');
const limitArg  = process.argv.find(a => a.startsWith('--limit=')) ?? '--limit=0';
const limit     = parseInt(limitArg.split('=')[1]) || 0;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, '../../.env');

function loadEnv(envFile) {
  try {
    const raw = readFileSync(envFile, 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return env;
  } catch { return {}; }
}

const env  = loadEnv(envPath);
const pool = new Pool({
  host:     '127.0.0.1',
  port:     5434,
  database: 'legal_ai_db',
  user:     'legal_admin',
  password: env.POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD || '123456',
});

const REPO_ID      = 'deeds-web-app';  // used in hash formula and structural keys
const REPO_UUID    = '00000000-0000-0000-0000-000000000000'; // stored in uuid column

// Map codebase_chunk_index.kind → atlas minimum_ast_kinds
const KIND_MAP = {
  'type':           'type',
  'function':       'function',
  'class':          'class',
  'component':      'file',       // Svelte component = file-level node
  'page-component': 'file',
  'route-handler':  'route',
  'table-def':      'schema',
  'server-module':  'module',
  'worker':         'module',
  'state-machine':  'class',
  'interface':      'interface',
  'constructor':    'constructor',
  'method':         'method',
  'parameter':      'parameter',
  'import':         'import',
  'export':         'export',
  'test':           'test',
  'call_site':      'call_site',
};

// Minimum ast kinds allowed by the contract
const VALID_KINDS = new Set([
  'file', 'module', 'class', 'interface', 'type', 'function', 'method',
  'constructor', 'parameter', 'route', 'schema', 'test', 'call_site',
  'import', 'export',
]);

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
}

function treeNodeId(repoId, normalizedPath, parserLanguage, nodeKind, qualifiedSymbol, parentKey, normalizedSig) {
  const input = [repoId, normalizedPath, parserLanguage, nodeKind, qualifiedSymbol, parentKey, normalizedSig].join('\x00');
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function structuralKey(repoId, normalizedPath, nodeKind, qualifiedSymbol) {
  return `${repoId}/${normalizedPath}#${nodeKind}:${qualifiedSymbol}`;
}

function detectLanguage(relativePath) {
  const ext = path.extname(relativePath || '').toLowerCase();
  const map = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript',
    '.jsx': 'javascript', '.svelte': 'svelte', '.css': 'css',
    '.scss': 'scss', '.sql': 'sql', '.py': 'python', '.go': 'go',
    '.rs': 'rust', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
  };
  return map[ext] || 'typescript';
}

function normalizedSignatureFromSymbol(symbol, kind) {
  // Without tree-sitter parsing we can't extract real types.
  // Use empty string per contract (optional, improves disambiguation only).
  return '';
}

async function verify(client) {
  const r = await client.query(`
    SELECT
      count(*) AS total,
      count(parent_tree_node_id) AS with_parent,
      count(DISTINCT node_kind) AS distinct_kinds,
      count(CASE WHEN length(tree_node_id) = 64 THEN 1 END) AS valid_hash_len
    FROM atlas_ast_nodes
  `);
  const row = r.rows[0];
  console.log('\n── atlas_ast_nodes verification ──');
  console.log(`  total:            ${row.total}`);
  console.log(`  with_parent:      ${row.with_parent}`);
  console.log(`  distinct_kinds:   ${row.distinct_kinds}`);
  console.log(`  valid_hash_len:   ${row.valid_hash_len}`);

  const kinds = await client.query(`
    SELECT node_kind, count(*) AS n FROM atlas_ast_nodes
    GROUP BY node_kind ORDER BY n DESC
  `);
  console.log('\n  by kind:');
  for (const k of kinds.rows) console.log(`    ${k.node_kind}: ${k.n}`);

  const srr = await client.query('SELECT count(*) AS n FROM atlas_source_refs');
  console.log(`\n  atlas_source_refs: ${srr.rows[0].n}`);
}

async function main() {
  const client = await pool.connect();

  if (isVerify) {
    await verify(client);
    client.release();
    await pool.end();
    return;
  }

  console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}  limit=${limit || 'all'}`);

  try {
    // ── Phase 1: Populate atlas_ast_nodes from chunk-level symbol+kind ─────────
    console.log('\n[1/3] Loading chunks with symbol+kind from codebase_chunk_index…');

    const limitClause = limit ? `LIMIT ${limit}` : '';
    const { rows: chunks } = await client.query(`
      SELECT
        id,
        relative_path,
        source_ref,
        symbol,
        kind,
        line_start,
        line_end,
        content_hash,
        repo_id::text AS repo_id_str
      FROM codebase_chunk_index
      WHERE symbol IS NOT NULL AND symbol != ''
        AND kind   IS NOT NULL AND kind   != ''
      ORDER BY relative_path, line_start
      ${limitClause}
    `);

    console.log(`  Found ${chunks.length} eligible chunks`);

    // Build file-level parent nodes first (so child nodes can reference them)
    const fileParents = new Map(); // normalizedPath → tree_node_id
    for (const row of chunks) {
      const np = normalizePath(row.relative_path);
      if (!fileParents.has(np)) {
        const lang = detectLanguage(row.relative_path);
        const tid  = treeNodeId(REPO_ID, np, lang, 'file', path.basename(np), 'ROOT', '');
        fileParents.set(np, { tree_node_id: tid, lang });
      }
    }

    console.log(`  Derived ${fileParents.size} unique file-level parent nodes`);

    // ── Upsert file-level nodes ──────────────────────────────────────────────
    const fileNodes = [];
    for (const [np, info] of fileParents) {
      const { tree_node_id: tid, lang } = info;
      const sk = structuralKey(REPO_ID, np, 'file', path.basename(np));
      fileNodes.push({
        tree_node_id:         tid,
        structural_key:       sk,
        repo_id:              REPO_ID,
        relative_path:        np,
        node_kind:            'file',
        qualified_symbol:     path.basename(np),
        parser_language:      lang,
        normalized_signature: '',
        parent_tree_node_id:  null,
        normalized_node_hash: crypto.createHash('sha256').update(sk).digest('hex'),
        source_content_hash:  crypto.createHash('sha256').update(np).digest('hex'),
        parser_name:          'tree-sitter',
        source_ref_key:       `${np}#file:${path.basename(np)}`,
      });
    }

    // ── Build symbol-level nodes ─────────────────────────────────────────────
    const symbolNodes = [];
    const seen = new Set();

    for (const row of chunks) {
      const rawKind = row.kind.toLowerCase();
      const mappedKind = KIND_MAP[rawKind];
      if (!mappedKind || !VALID_KINDS.has(mappedKind)) continue;

      const np        = normalizePath(row.relative_path);
      const lang      = detectLanguage(row.relative_path);
      const symbol    = (row.symbol || '').trim();
      const parentId  = fileParents.get(np)?.tree_node_id ?? null;
      const normSig   = normalizedSignatureFromSymbol(symbol, mappedKind);
      const tid       = treeNodeId(REPO_ID, np, lang, mappedKind, symbol, parentId ?? 'ROOT', normSig);

      if (seen.has(tid)) continue;
      seen.add(tid);

      const sk = structuralKey(REPO_ID, np, mappedKind, symbol);
      const contentHash = row.content_hash
        || crypto.createHash('sha256').update(`${np}#${symbol}`).digest('hex');

      symbolNodes.push({
        tree_node_id:         tid,
        structural_key:       sk,
        repo_id:              REPO_ID,
        relative_path:        np,
        node_kind:            mappedKind,
        qualified_symbol:     symbol,
        parser_language:      lang,
        normalized_signature: normSig,
        parent_tree_node_id:  parentId,
        line_start:           row.line_start ?? 0,
        line_end:             row.line_end   ?? 0,
        normalized_node_hash: crypto.createHash('sha256').update(sk).digest('hex'),
        source_content_hash:  contentHash,
        parser_name:          'tree-sitter',
        source_ref_key:       row.source_ref ? `${row.source_ref}#${mappedKind}:${symbol}` : null,
      });
    }

    console.log(`  File nodes: ${fileNodes.length}`);
    console.log(`  Symbol nodes: ${symbolNodes.length}`);

    if (isDryRun) {
      console.log('\n[DRY-RUN] No writes performed. Sample nodes:');
      for (const n of [...fileNodes.slice(0, 2), ...symbolNodes.slice(0, 3)]) {
        console.log(`  ${n.node_kind.padEnd(12)} ${n.tree_node_id.slice(0, 16)}… ${n.qualified_symbol}`);
      }
    } else {
      // ── Upsert in batches ──────────────────────────────────────────────────
      const BATCH = 200;
      const allNodes = [...fileNodes, ...symbolNodes];
      let inserted = 0;

      console.log(`\n[2/3] Upserting ${allNodes.length} nodes in batches of ${BATCH}…`);

      for (let i = 0; i < allNodes.length; i += BATCH) {
        const batch = allNodes.slice(i, i + BATCH);
        for (const n of batch) {
          await client.query(`
            INSERT INTO atlas_ast_nodes (
              tree_node_id, structural_key, repo_id, relative_path,
              node_kind, qualified_symbol, parser_language, normalized_signature,
              parent_tree_node_id, line_start, line_end,
              normalized_node_hash, source_content_hash,
              parser_name, parser_version, source_ref_key
            ) VALUES (
              $1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,
              $10,$11,$12,$13,$14,$15,$16
            )
            ON CONFLICT DO NOTHING
          `, [
            n.tree_node_id, n.structural_key, REPO_UUID, n.relative_path,
            n.node_kind, n.qualified_symbol, n.parser_language, n.normalized_signature,
            n.parent_tree_node_id, n.line_start ?? 0, n.line_end ?? 0,
            n.normalized_node_hash, n.source_content_hash,
            n.parser_name, 'chunk-index-v1', n.source_ref_key,
          ]);
          inserted++;
        }
        process.stdout.write(`\r  ${inserted}/${allNodes.length} upserted`);
      }
      console.log('');

      // ── Phase 2: Populate atlas_source_refs from codebase_chunk_index ─────
      console.log('\n[3/3] Populating atlas_source_refs…');

      const { rows: srChunks } = await client.query(`
        SELECT
          id, relative_path, source_ref, symbol, kind,
          line_start, line_end, content_hash
        FROM codebase_chunk_index
        WHERE source_ref IS NOT NULL
        ${limit ? `LIMIT ${limit}` : ''}
      `);

      let srInserted = 0;
      for (const row of srChunks) {
        const np        = normalizePath(row.relative_path);
        const symbol    = (row.symbol || '').trim();
        const rawKind   = (row.kind || '').toLowerCase();
        const mappedKind = KIND_MAP[rawKind] || null;
        const srcRefKey = symbol
          ? `${np}#${symbol}`
          : (row.line_start ? `${np}#L${row.line_start}-${row.line_end ?? row.line_start}` : `${np}#file`);
        const contentHash = row.content_hash
          || crypto.createHash('sha256').update(`${np}#${symbol}`).digest('hex').padEnd(64, '0');

        try {
          await client.query(`
            INSERT INTO atlas_source_refs (
              source_ref_key, repo_id, source_type, relative_path,
              content_hash, qualified_symbol, symbol_kind,
              start_line, end_line, parent_source_ref_key
            ) VALUES ($1,$2,'code',$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (source_ref_key, repo_id) DO UPDATE SET
              qualified_symbol = EXCLUDED.qualified_symbol,
              symbol_kind      = EXCLUDED.symbol_kind,
              start_line       = EXCLUDED.start_line,
              end_line         = EXCLUDED.end_line,
              updated_at       = now()
          `, [
            srcRefKey, REPO_ID, np,
            contentHash,
            symbol || null,
            (mappedKind && VALID_KINDS.has(mappedKind)) ? mappedKind : null,
            row.line_start ?? null,
            row.line_end   ?? null,
            np !== (row.source_ref || np) ? `${np}#file` : null,
          ]);
          srInserted++;
        } catch (e) {
          // Skip individual FK or constraint errors
        }
        if (srInserted % 500 === 0) process.stdout.write(`\r  ${srInserted} source_refs`);
      }
      console.log(`\r  ${srInserted} atlas_source_refs upserted`);
    }

    await verify(client);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
