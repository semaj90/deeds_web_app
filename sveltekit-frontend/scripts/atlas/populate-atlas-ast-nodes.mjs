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
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { buildAstSourceRefKey } from '../../../scripts/atlas/lib/ast-source-ref-key.mjs';

const { Pool } = pg;
const isDryRun  = process.argv.includes('--dry-run');
const isVerify  = process.argv.includes('--verify');
const limitArg  = process.argv.find(a => a.startsWith('--limit=')) ?? '--limit=0';
const limit     = parseInt(limitArg.split('=')[1]) || 0;
const scopeArg  = process.argv.find(a => a.startsWith('--scope='));
const scopePath = scopeArg ? path.resolve(scopeArg.slice('--scope='.length).trim()) : null;
const graphifyParse = process.argv.includes('--graphify-parse');
const declarationsOnly = process.argv.includes('--declarations-only');
const graphifyReportArg = process.argv.find(a => a.startsWith('--out='));
const graphifyReportPath = graphifyReportArg
  ? path.resolve(graphifyReportArg.slice('--out='.length).trim())
  : null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, '../../.env');
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const inventoryArg = process.argv.find(a => a.startsWith('--inventory='));
const inventoryPath = path.resolve(inventoryArg?.slice('--inventory='.length).trim()
  || path.join(REPO_ROOT, '.tmp/atlas/graphify-file-index-v1/packets.jsonl'));
const candidatesArg = process.argv.find(a => a.startsWith('--candidates-out='));
const candidatesOutputPath = candidatesArg
  ? path.resolve(candidatesArg.slice('--candidates-out='.length).trim())
  : null;

const astGrep = graphifyParse
  ? await import(pathToFileURL(path.join(FRONTEND_ROOT, 'node_modules/@ast-grep/napi/index.js')).href)
  : null;

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

function astLanguage(relativePath) {
  const ext = path.extname(relativePath || '').toLowerCase();
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return astGrep?.Lang.TypeScript ?? null;
  if (ext === '.tsx') return astGrep?.Lang.Tsx ?? null;
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return astGrep?.Lang.JavaScript ?? null;
  return null;
}

function resolveGraphifyFile(sourceRef) {
  const raw = String(sourceRef || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const candidates = [
    path.resolve(REPO_ROOT, raw),
    path.resolve(FRONTEND_ROOT, raw),
    raw.startsWith('$lib/') ? path.resolve(FRONTEND_ROOT, 'src/lib', raw.slice(5)) : null,
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function astName(node) {
  const names = new Set([
    'identifier', 'type_identifier', 'property_identifier',
    'private_property_identifier', 'shorthand_property_identifier_pattern',
  ]);
  return node.children().find((child) => names.has(child.kind()))?.text() ?? null;
}

function graphifyAstCandidates(sourceRef, absolutePath, sourceText) {
  const language = astLanguage(sourceRef);
  if (!language) return { skipped: true, candidates: [] };
  const root = astGrep.parse(language, sourceText).root();
  const kinds = new Map([
    ['function_declaration', 'function'],
    ['generator_function_declaration', 'function'],
    ['class_declaration', 'class'],
    ['method_definition', 'method'],
    ['interface_declaration', 'interface'],
    ['type_alias_declaration', 'type'],
    ['enum_declaration', 'enum'],
    ['variable_declarator', 'variable'],
  ]);
  const candidates = [];
  const visit = (node) => {
    const symbolKind = kinds.get(node.kind());
    if (symbolKind && (!declarationsOnly || symbolKind !== 'variable')) {
      const name = astName(node);
      if (name) {
        const range = node.range();
        candidates.push({
          source_ref: sourceRef,
          relative_path: sourceRef,
          symbol_name: name,
          symbol_kind: symbolKind,
          ast_kind: node.kind(),
          start_byte: Buffer.byteLength(sourceText.slice(0, range.start.index), 'utf8'),
          end_byte: Buffer.byteLength(sourceText.slice(0, range.end.index), 'utf8'),
          start_line: range.start.line + 1,
          start_column: range.start.column,
          end_line: range.end.line + 1,
          end_column: range.end.column,
        });
      }
    }
    for (const child of node.children()) visit(child);
  };
  visit(root);
  return { skipped: false, candidates };
}

function loadGraphifyPacketIndex() {
  if (!existsSync(inventoryPath)) return new Map();
  const index = new Map();
  for (const line of readFileSync(inventoryPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const packet = JSON.parse(line);
      if (packet.source_ref && !index.has(packet.source_ref)) index.set(packet.source_ref, packet);
    } catch {
      // The scope audit already reports malformed inventory rows separately.
    }
  }
  return index;
}

function graphifyInventorySha256() {
  if (!existsSync(inventoryPath)) return null;
  return crypto.createHash('sha256').update(readFileSync(inventoryPath)).digest('hex');
}

async function runGraphifyParseProbe() {
  if (!scopePath) throw new Error('--graphify-parse requires --scope=...');
  const scope = JSON.parse(readFileSync(scopePath, 'utf8'));
  const refs = Array.isArray(scope.includedSourceRefs) ? scope.includedSourceRefs.filter(Boolean) : [];
  const boundedRefs = limit ? refs.slice(0, limit) : refs;
  const packetIndex = loadGraphifyPacketIndex();
  const inventorySha256 = graphifyInventorySha256();
  const report = {
    schema: 'atlas.graphify-ast-node-candidate-probe.v1',
    status: 'DRY_RUN',
    readOnly: true,
    databaseWrites: false,
    scopePath,
    inventoryPath,
    inventorySha256,
    scopeFiles: refs.length,
    filesConsidered: boundedRefs.length,
    filesResolved: 0,
    filesMissing: 0,
    filesParsed: 0,
    filesSkippedUnsupported: 0,
    packetIdentityResolved: 0,
    packetTreeNodeResolved: 0,
    sourceRevisionResolved: 0,
    candidateCount: 0,
    candidatePolicy: declarationsOnly ? 'DECLARATION_LIKE_ONLY' : 'ALL_NAMED_DECLARATIONS',
    candidatesByKind: {},
    missingSample: [],
    sampleCandidates: [],
    candidatesOutputPath,
    extractor: 'ast-grep-napi',
  };
  const allCandidates = [];
  for (const sourceRef of boundedRefs) {
    const absolutePath = resolveGraphifyFile(sourceRef);
    if (!absolutePath) {
      report.filesMissing++;
      if (report.missingSample.length < 20) report.missingSample.push(sourceRef);
      continue;
    }
    report.filesResolved++;
    const extracted = graphifyAstCandidates(sourceRef, absolutePath, readFileSync(absolutePath, 'utf8'));
    if (extracted.skipped) {
      report.filesSkippedUnsupported++;
      continue;
    }
    report.filesParsed++;
    const packet = packetIndex.get(sourceRef);
    if (packet) {
      report.packetIdentityResolved++;
      if (packet.tree_node_id) report.packetTreeNodeResolved++;
      if (packet.source_revision) report.sourceRevisionResolved++;
    }
    report.candidateCount += extracted.candidates.length;
    for (const candidate of extracted.candidates) {
      if (packet) {
        candidate.packet_key = packet.packet_key ?? null;
        candidate.feature_id = packet.feature_id ?? null;
        candidate.graphify_packet_tree_node_id = packet.tree_node_id ?? null;
        candidate.source_revision = packet.source_revision ?? null;
        candidate.workspace_revision = packet.workspace_revision ?? null;
        candidate.domain_class = packet.domain_class ?? null;
      }
      if (candidatesOutputPath) allCandidates.push(candidate);
      report.candidatesByKind[candidate.symbol_kind] = (report.candidatesByKind[candidate.symbol_kind] ?? 0) + 1;
      if (report.sampleCandidates.length < 10) report.sampleCandidates.push(candidate);
    }
  }
  if (candidatesOutputPath) {
    writeFileSync(candidatesOutputPath, `${allCandidates.map((candidate) => JSON.stringify(candidate)).join('\n')}\n`);
  }
  if (graphifyReportPath) writeFileSync(graphifyReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
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
  if (graphifyParse) {
    await runGraphifyParseProbe();
    return;
  }
  const client = await pool.connect();

  if (isVerify) {
    await verify(client);
    client.release();
    await pool.end();
    return;
  }

  let scopeRefs = null;
  if (scopePath) {
    const scope = JSON.parse(readFileSync(scopePath, 'utf8'));
    scopeRefs = Array.isArray(scope.includedSourceRefs) ? scope.includedSourceRefs.filter(Boolean) : [];
    if (!scopeRefs.length) throw new Error(`Scope report has no includedSourceRefs: ${scopePath}`);
  }
  console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}  limit=${limit || 'all'}  scope=${scopePath ? scopeRefs.length : 'database-default'}`);

  try {
    // ── Phase 1: Populate atlas_ast_nodes from chunk-level symbol+kind ─────────
    console.log('\n[1/3] Loading chunks with symbol+kind from codebase_chunk_index…');

    const limitClause = limit ? `LIMIT ${limit}` : '';
    const scopeClause = scopeRefs ? 'AND (source_ref = ANY($1::text[]) OR relative_path = ANY($1::text[]))' : '';
    const chunkParams = scopeRefs ? [scopeRefs] : [];
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
        ${scopeClause}
      ORDER BY relative_path, line_start
      ${limitClause}
    `, chunkParams);

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
        source_ref_key:       buildAstSourceRefKey(row.source_ref, mappedKind, symbol),
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
