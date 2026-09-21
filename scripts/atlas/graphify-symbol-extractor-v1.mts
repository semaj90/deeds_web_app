#!/usr/bin/env -S npx tsx
/**
 * GRAPHIFY-SYMBOL-EXTRACTOR-01
 *
 * The "canonical Graphify extractor" referenced (but never built) by
 * drizzle/manual/20260903_graphify_symbols_edges_additive_v1.sql's comment on graphify_symbols:
 * "populated only by the canonical Graphify extractor". Until this script, nothing populated it.
 *
 * Reads graphify_files rows with parse_status = 'UNPROCESSED', dispatches per file extension:
 *   .ts/.tsx/.mts/.js/.jsx/.mjs/.cjs -> TypeScript Compiler API walk (default) or, with
 *       --use-lsp, a real typescript-language-server documentSymbol request (opt-in: spawning a
 *       language server per file is far slower than the in-process Compiler API walk, so it is
 *       never the default path).
 *   .json  -> top-level/nested key structural extraction (no code AST exists for JSON)
 *   .md    -> ATX heading structural extraction, nested by heading level
 *   .txt   -> zero symbols, marked PROCESSED (valid: opaque text has no structure to extract)
 * All file reads go through lib/source-text-envelope.mjs's SourceTextEnvelopeV1 (SOURCE-TEXT-
 * ENCODING-01): fail-closed BOM-aware decoding (UTF-8, UTF-8-BOM, UTF-16LE, UTF-16BE) plus a
 * documentKind classification. Document structure (JSON key paths, Markdown headings) is written
 * to atlas_ast_nodes, never graphify_symbols -- that table is reserved for deterministic CODE
 * symbols. Markdown's own embedded fenced code (when its language is admitted) recurses into the
 * real code parser and gains genuine graphify_symbols identity, carrying explicit provenance back
 * to its host document.
 *
 * Writes real rows into graphify_symbols; flips graphify_files.parse_status to PROCESSED on
 * success, PARSE_FAILED (with parse_error) on per-file failure -- a bad file never aborts the
 * whole batch. Default mode is --dry-run (plan only, no writes). Pass --apply to commit.
 */
import pg from 'pg';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFiles, REPO_ROOT } from './connection-config.mjs';
import { extractSymbolsFromSource } from '../graphify/lib/ts-ast-extractor.mjs';
import { extractJsonSymbols } from './lib/json-symbol-extractor.mjs';
import { extractMarkdownSymbols, extractMarkdownFences } from './lib/markdown-symbol-extractor.mjs';
import { requestDocumentSymbolsOnce, mapLspSymbolKind, fileUriFor } from './lib/lsp-client.mjs';
import { decodeSourceTextEnvelope, classifySourceKind, MARKDOWN_FENCE_LANGUAGE_TO_EXT } from './lib/source-text-envelope.mjs';
import { writeAtlasAstNodes } from './lib/atlas-ast-nodes-writer.mjs';

type ExtractedSymbol = {
  kind: string;
  name: string;
  start_line: number;
  end_line: number;
  start_byte: number;
  end_byte: number;
  signature_text: string;
  hash: string;
  ast_fingerprint: string;
  parent_chain: Array<{ kind: string; name: string }>;
};

const env = loadEnvFiles([
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env'),
  path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'),
]);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const apply = flag('--apply');
const useLsp = flag('--use-lsp');
const limit = Number(opt('--limit', '50'));
const workspaceIdFilter = opt('--workspace-id', '');
const workspaceRevisionFilter = opt('--workspace-revision', '');
const sourceRefsFilter = opt('--source-refs', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (flag('--help') || flag('-h')) {
  console.log([
    'Graphify structural symbol extractor (dry-run by default)',
    '',
    'Options:',
    '  --limit <n>                 Maximum candidate files (default: 50)',
    '  --workspace-id <uuid>       Restrict candidates to a workspace',
    '  --workspace-revision <sha>  Restrict candidates to an exact workspace revision',
    '  --source-refs <a,b>         Restrict to exact source references',
    '  --use-lsp                   Use the opt-in LSP symbol provider',
    '  --apply                     Apply extraction writes (explicit)',
    '  --help, -h                  Show this help without connecting to Postgres',
  ].join('\n'));
  process.exit(0);
}

if (apply && !workspaceRevisionFilter) {
  throw new Error('APPLY_REQUIRES_EXPLICIT_WORKSPACE_REVISION');
}

const databaseUrl =
  env.DATABASE_URL ||
  `postgresql://${env.POSTGRES_USER ?? 'legal_admin'}:${env.POSTGRES_PASSWORD ?? '123456'}@127.0.0.1:${env.POSTGRES_PORT ?? '5434'}/${env.POSTGRES_DB ?? 'legal_ai_db'}`;

const pool = new pg.Pool({ connectionString: databaseUrl, statement_timeout: 60000 });

const LSP_LANGUAGE_ID: Record<string, string> = {
  '.ts': 'typescript', '.mts': 'typescript', '.tsx': 'typescriptreact',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascriptreact',
};

type FileKind = 'ts_js' | 'json' | 'markdown' | 'text' | 'unsupported';

function classify(sourceRef: string): FileKind {
  const kind = classifySourceKind(sourceRef);
  if (!kind) return 'unsupported';
  if (kind.documentKind === 'code') return 'ts_js';
  if (kind.documentKind === 'json') return 'json';
  if (kind.documentKind === 'markdown') return 'markdown';
  if (kind.documentKind === 'plaintext') return 'text';
  return 'unsupported';
}

type AstNodeInput = {
  kind: string;
  qualifiedSymbol: string;
  startByte: number;
  endByte: number;
  startLine: number;
  endLine: number;
  sourceContentDigest: string;
  parentIndex: number | null;
};

/** SOURCE-TEXT-ENCODING-01: graphify_symbols is a deterministic CODE-symbol table (functions,
 * classes, types) -- JSON key paths and Markdown headings are document structure, not code
 * symbols, and belong in atlas_ast_nodes instead. This maps the existing per-kind extractor
 * output into atlas_ast_nodes writer input, preserving parent_chain as parent_tree_node_id
 * linkage via index into the flat node list (same ordering the extractors already produce:
 * parent before child). */
function toAstNodeInputs(symbols: ExtractedSymbol[], sourceContentDigest: string): AstNodeInput[] {
  const indexByQualifiedPath = new Map<string, number>();
  return symbols.map((symbol, i) => {
    const qualifiedPath = [...symbol.parent_chain.map((p) => p.name), symbol.name].join('.');
    const parentPath = symbol.parent_chain.length > 0 ? symbol.parent_chain.map((p) => p.name).join('.') : null;
    const parentIndex = parentPath !== null ? indexByQualifiedPath.get(parentPath) ?? null : null;
    indexByQualifiedPath.set(qualifiedPath, i);
    return {
      kind: symbol.kind,
      qualifiedSymbol: qualifiedPath,
      startByte: symbol.start_byte,
      endByte: symbol.end_byte,
      startLine: symbol.start_line,
      endLine: symbol.end_line,
      // ast_fingerprint is node-grain evidence and is intentionally not used
      // for atlas_ast_nodes.source_content_hash. The caller supplies the
      // whole-file digest from graphify_files.content_hash.
      sourceContentDigest,
      parentIndex,
    };
  });
}

/** Markdown's embedded fenced code MAY recurse into the real code parser and gain genuine symbol
 * identity in graphify_symbols -- but only for an admitted fence language, and always carrying
 * explicit document/section provenance in `metadata` so it's traceable back to its host Markdown
 * file. The heading structure itself never becomes a code symbol. */
function extractMarkdownEmbeddedCodeSymbols(markdownText: string, sourceRef: string): Array<ExtractedSymbol & { provenance: Record<string, unknown> }> {
  const fences = extractMarkdownFences(markdownText);
  const out: Array<ExtractedSymbol & { provenance: Record<string, unknown> }> = [];
  for (const fence of fences) {
    const ext = fence.language ? MARKDOWN_FENCE_LANGUAGE_TO_EXT[fence.language] : undefined;
    if (!ext || ext === '.json' || ext === '.jsonc') continue; // code recursion only, not JSON fences
    const fenceText = markdownText.slice(fence.contentStartByte, fence.contentEndByte);
    let embedded: ExtractedSymbol[];
    try {
      embedded = extractSymbolsFromSource(fenceText, `${sourceRef}#fence`) as ExtractedSymbol[];
    } catch {
      continue; // a malformed fence never aborts the whole file
    }
    for (const symbol of embedded) {
      out.push({
        ...symbol,
        start_byte: symbol.start_byte + fence.contentStartByte,
        end_byte: symbol.end_byte + fence.contentStartByte,
        provenance: {
          parentDocument: sourceRef,
          parentSection: fence.parentSection,
          fenceLanguage: fence.language,
          fenceStartByte: fence.fenceStartByte,
          fenceEndByte: fence.fenceEndByte,
          embeddedStartByte: fence.contentStartByte,
          embeddedEndByte: fence.contentEndByte,
        },
      });
    }
  }
  return out;
}

function stableSymbolKey(fileId: string, kind: string, qualifiedPath: string): string {
  return createHash('sha256').update(`${fileId}:${kind}:${qualifiedPath}`).digest('hex');
}

/** Convert an LSP {line, character} position (0-based, per-line UTF-16 code units) into this
 * lane's established "byte offset" convention -- a character index into the decoded JS string,
 * matching what ts-ast-extractor.mjs already produces via node.getStart()/getEnd(). */
function buildLineOffsetTable(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function positionToOffset(lineOffsets: number[], position: { line: number; character: number }): number {
  const base = lineOffsets[position.line] ?? lineOffsets[lineOffsets.length - 1] ?? 0;
  return base + position.character;
}

function flattenLspSymbols(
  nodes: any[],
  text: string,
  lineOffsets: number[],
  parentChain: Array<{ kind: string; name: string }>,
): ExtractedSymbol[] {
  const out: ExtractedSymbol[] = [];
  for (const node of nodes ?? []) {
    // DocumentSymbol has {name, kind, range, children?}; SymbolInformation has {name, kind, location:{range}}.
    const range = node.range ?? node.location?.range;
    if (!range) continue;
    const startByte = positionToOffset(lineOffsets, range.start);
    const endByte = positionToOffset(lineOffsets, range.end);
    const kind = mapLspSymbolKind(node.kind);
    const fullText = text.slice(startByte, endByte);
    out.push({
      kind,
      name: node.name ?? 'anonymous',
      start_line: (range.start.line ?? 0) + 1,
      end_line: (range.end.line ?? 0) + 1,
      start_byte: startByte,
      end_byte: Math.max(endByte, startByte),
      signature_text: fullText.slice(0, 400),
      hash: createHash('sha256').update(fullText).digest('hex').slice(0, 12),
      ast_fingerprint: createHash('sha256').update(fullText).digest('hex'),
      parent_chain: parentChain,
    });
    if (Array.isArray(node.children) && node.children.length > 0) {
      out.push(...flattenLspSymbols(node.children, text, lineOffsets, [...parentChain, { kind, name: node.name }]));
    }
  }
  return out;
}

// Spawn the real Node entry point (lib/cli.mjs) directly via `node`, never the .cmd/.bin shim --
// see lsp-client.mjs's comment on why: a shimmed spawn's child process can outlive a timeout kill.
const TS_LANGUAGE_SERVER_CLI = path.join(
  REPO_ROOT, 'sveltekit-frontend', 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs',
);

async function extractViaLsp(absPath: string, text: string, ext: string): Promise<ExtractedSymbol[]> {
  const languageId = LSP_LANGUAGE_ID[ext] ?? 'typescript';
  const result = await requestDocumentSymbolsOnce({
    command: process.execPath,
    args: [TS_LANGUAGE_SERVER_CLI, '--stdio'],
    languageId,
    content: text,
    fileUri: fileUriFor(absPath),
    timeoutMs: 15000,
  });
  const lineOffsets = buildLineOffsetTable(text);
  return flattenLspSymbols(result as any[], text, lineOffsets, []);
}

type ExtractionResult = {
  /** Deterministic code symbols (functions/classes/types/etc.) -> graphify_symbols. */
  codeSymbols: ExtractedSymbol[];
  /** Document structure (JSON key paths, Markdown headings) -> atlas_ast_nodes, never graphify_symbols. */
  astNodes: ExtractedSymbol[];
  /** Code symbols extracted from Markdown's own embedded fenced code -> graphify_symbols, with provenance. */
  embeddedCodeSymbols: Array<ExtractedSymbol & { provenance: Record<string, unknown> }>;
};

async function extractSymbolsForFile(absPath: string, sourceRef: string, kind: FileKind): Promise<ExtractionResult> {
  const rawBuffer = fs.readFileSync(absPath);
  const envelope = decodeSourceTextEnvelope(rawBuffer, sourceRef);
  const text = envelope.text;
  const ext = path.extname(sourceRef).toLowerCase();

  if (kind === 'ts_js') {
    const codeSymbols = useLsp
      ? await extractViaLsp(absPath, text, ext)
      : (extractSymbolsFromSource(text, sourceRef) as ExtractedSymbol[]);
    return { codeSymbols, astNodes: [], embeddedCodeSymbols: [] };
  }
  if (kind === 'json') {
    return { codeSymbols: [], astNodes: extractJsonSymbols(text, sourceRef) as ExtractedSymbol[], embeddedCodeSymbols: [] };
  }
  if (kind === 'markdown') {
    const astNodes = extractMarkdownSymbols(text, sourceRef) as ExtractedSymbol[];
    const embeddedCodeSymbols = extractMarkdownEmbeddedCodeSymbols(text, sourceRef);
    return { codeSymbols: [], astNodes, embeddedCodeSymbols };
  }
  return { codeSymbols: [], astNodes: [], embeddedCodeSymbols: [] }; // 'text' -- opaque, no structure to extract yet
}

async function main() {
  const queryParams: Array<string | number> = [limit];
  let sourceRefClause = '';
  if (sourceRefsFilter.length > 0) {
    queryParams.push(sourceRefsFilter as unknown as string);
    sourceRefClause = `AND source_ref = ANY($${queryParams.length}::text[])`;
  }
  let workspaceClause = '';
  if (workspaceIdFilter) {
    queryParams.push(workspaceIdFilter);
    workspaceClause = `AND workspace_id = $${queryParams.length}`;
  }
  if (workspaceRevisionFilter) {
    queryParams.push(workspaceRevisionFilter);
    workspaceClause += ` AND workspace_revision = $${queryParams.length}`;
  }
  const candidates = await pool.query<{
    file_id: string;
    source_ref: string;
    workspace_id: string;
    workspace_revision: string | null;
    source_revision: string;
    content_hash: string;
    parser_name: string | null;
    parser_version: string | null;
  }>(
    `SELECT file_id, source_ref, workspace_id, workspace_revision, source_revision,
            content_hash, parser_name, parser_version
     FROM graphify_files
     WHERE parse_status = 'UNPROCESSED'
       ${sourceRefClause}
       ${workspaceClause}
     ORDER BY source_ref
     LIMIT $1`,
    queryParams,
  );

  const supportedRows = candidates.rows
    .map((row) => ({ row, kind: classify(row.source_ref) }))
    .filter((entry) => entry.kind !== 'unsupported');
  const skippedUnsupported = candidates.rows.length - supportedRows.length;

  const plan: Array<{
    fileId: string;
    sourceRef: string;
    workspaceRevision: string | null;
    workspaceRevisionMatches: boolean;
    fileKind: FileKind;
    outcome: 'WOULD_EXTRACT' | 'FILE_MISSING_ON_DISK' | 'PARSE_FAILED';
    symbolCount?: number;
    error?: string;
  }> = [];

  let totalSymbolsExtracted = 0;
  let totalSymbolsInserted = 0;
  let filesProcessed = 0;
  let filesFailed = 0;
  const byFileKind: Record<string, number> = {};
  const workspaceRevisions = new Set(candidates.rows.map((row) => row.workspace_revision).filter(Boolean));
  const workspaceRevisionMismatchCount = candidates.rows.filter((row) =>
    Boolean(workspaceRevisionFilter) && row.workspace_revision !== workspaceRevisionFilter,
  ).length;

  for (const { row, kind } of supportedRows) {
    byFileKind[kind] = (byFileKind[kind] ?? 0) + 1;
    const absPath = path.join(REPO_ROOT, row.source_ref);
    if (!fs.existsSync(absPath)) {
      plan.push({
        fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
        workspaceRevisionMatches: !workspaceRevisionFilter || row.workspace_revision === workspaceRevisionFilter,
        fileKind: kind, outcome: 'FILE_MISSING_ON_DISK',
      });
      if (apply) {
        await pool.query(
          `UPDATE graphify_files SET parse_status = 'PARSE_FAILED', parse_error = $2::jsonb, updated_at = now() WHERE file_id = $1`,
          [row.file_id, JSON.stringify({ reason: 'FILE_MISSING_ON_DISK', source_ref: row.source_ref })],
        );
        filesFailed += 1;
      }
      continue;
    }

    let extraction: ExtractionResult;
    try {
      extraction = await extractSymbolsForFile(absPath, row.source_ref, kind);
    } catch (error) {
      plan.push({
        fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
        workspaceRevisionMatches: !workspaceRevisionFilter || row.workspace_revision === workspaceRevisionFilter,
        fileKind: kind, outcome: 'PARSE_FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
      if (apply) {
        await pool.query(
          `UPDATE graphify_files SET parse_status = 'PARSE_FAILED', parse_error = $2::jsonb, updated_at = now() WHERE file_id = $1`,
          [row.file_id, JSON.stringify({ reason: 'PARSE_FAILED', message: error instanceof Error ? error.message : String(error) })],
        );
        filesFailed += 1;
      }
      continue;
    }

    const { codeSymbols, astNodes, embeddedCodeSymbols } = extraction;
    const totalCount = codeSymbols.length + astNodes.length + embeddedCodeSymbols.length;
    plan.push({
      fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
      workspaceRevisionMatches: !workspaceRevisionFilter || row.workspace_revision === workspaceRevisionFilter,
      fileKind: kind, outcome: 'WOULD_EXTRACT', symbolCount: totalCount,
    });
    totalSymbolsExtracted += totalCount;

    if (!apply) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Deterministic code symbols (ts_js) -> graphify_symbols, unchanged from before.
      const insertedSymbolIdByPath = new Map<string, string>();
      for (const symbol of codeSymbols) {
        const qualifiedPath = [...symbol.parent_chain.map((p) => p.name), symbol.name].join('.');
        const parentPath = symbol.parent_chain.length > 0 ? symbol.parent_chain.map((p) => p.name).join('.') : null;
        const parentSymbolId = parentPath ? insertedSymbolIdByPath.get(parentPath) ?? null : null;
        const key = stableSymbolKey(row.file_id, symbol.kind, qualifiedPath);
        const result = await client.query<{ symbol_id: string }>(
          `INSERT INTO graphify_symbols (
             file_id, stable_symbol_key, symbol_kind, qualified_name, parent_symbol_id,
             start_byte, end_byte, start_row, end_row, signature_text, source_text_hash,
             ast_fingerprint, metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
           ON CONFLICT (file_id, stable_symbol_key) DO UPDATE SET metadata = graphify_symbols.metadata
           RETURNING symbol_id`,
          [
            row.file_id, key, symbol.kind, qualifiedPath, parentSymbolId,
            symbol.start_byte, symbol.end_byte, symbol.start_line, symbol.end_line,
            symbol.signature_text, symbol.hash, symbol.ast_fingerprint,
            JSON.stringify({
              extractor: 'graphify-symbol-extractor-v1',
              extractor_source: useLsp ? 'lsp:typescript-language-server' : 'ts-ast-extractor.mjs',
            }),
          ],
        );
        const symbolId = result.rows[0]?.symbol_id;
        if (symbolId) {
          insertedSymbolIdByPath.set(qualifiedPath, symbolId);
          totalSymbolsInserted += 1;
        }
      }

      // Markdown's embedded fenced code -> graphify_symbols too, but with explicit provenance
      // (parentDocument/parentSection/fence spans) tying it back to its host Markdown file --
      // per SOURCE-TEXT-ENCODING-01, this is real code identity, not document structure.
      const insertedEmbeddedIdByPath = new Map<string, string>();
      for (const symbol of embeddedCodeSymbols) {
        const qualifiedPath = [...symbol.parent_chain.map((p) => p.name), symbol.name].join('.');
        const parentPath = symbol.parent_chain.length > 0 ? symbol.parent_chain.map((p) => p.name).join('.') : null;
        const parentSymbolId = parentPath ? insertedEmbeddedIdByPath.get(parentPath) ?? null : null;
        const key = stableSymbolKey(row.file_id, `fence:${symbol.kind}`, qualifiedPath);
        const result = await client.query<{ symbol_id: string }>(
          `INSERT INTO graphify_symbols (
             file_id, stable_symbol_key, symbol_kind, qualified_name, parent_symbol_id,
             start_byte, end_byte, start_row, end_row, signature_text, source_text_hash,
             ast_fingerprint, metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
           ON CONFLICT (file_id, stable_symbol_key) DO UPDATE SET metadata = graphify_symbols.metadata
           RETURNING symbol_id`,
          [
            row.file_id, key, symbol.kind, qualifiedPath, parentSymbolId,
            symbol.start_byte, symbol.end_byte, symbol.start_line, symbol.end_line,
            symbol.signature_text, symbol.hash, symbol.ast_fingerprint,
            JSON.stringify({
              extractor: 'graphify-symbol-extractor-v1',
              extractor_source: 'markdown-embedded-fence',
              ...symbol.provenance,
            }),
          ],
        );
        const symbolId = result.rows[0]?.symbol_id;
        if (symbolId) {
          insertedEmbeddedIdByPath.set(qualifiedPath, symbolId);
          totalSymbolsInserted += 1;
        }
      }

      // Document structure (json/markdown headings) -> atlas_ast_nodes, never graphify_symbols.
      if (astNodes.length > 0) {
        const parserLanguage = kind === 'json' ? 'json' : 'markdown';
        const parserName = kind === 'json' ? 'json-symbol-extractor' : 'markdown-symbol-extractor';
        const { inserted } = await writeAtlasAstNodes(client, {
          sourceRef: row.source_ref,
          parserLanguage,
          parserName,
          parserVersion: row.parser_version,
          sourceRevision: row.source_revision,
          workspaceId: row.workspace_id,
          nodes: toAstNodeInputs(astNodes, row.content_hash),
        });
        totalSymbolsInserted += inserted;
      }

      await client.query(
        `UPDATE graphify_files SET parse_status = 'PROCESSED', updated_at = now() WHERE file_id = $1`,
        [row.file_id],
      );
      await client.query('COMMIT');
      filesProcessed += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const report = {
    schema: 'atlas.graphify-symbol-extractor-receipt.v1',
    generatedAt: new Date().toISOString(),
    apply,
    useLsp,
    limit,
    workspaceIdFilter: workspaceIdFilter || null,
    workspaceRevisionFilter: workspaceRevisionFilter || null,
    workspaceRevisionCount: workspaceRevisions.size,
    workspaceRevisionMismatchCount,
    candidatesConsidered: candidates.rows.length,
    skippedUnsupported,
    byFileKind,
    filesProcessed,
    filesFailed,
    totalSymbolsExtracted,
    totalSymbolsInserted: apply ? totalSymbolsInserted : null,
    plan,
  };

  const dir = path.join(REPO_ROOT, 'docs', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `graphify-symbol-extractor-v1-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({ ...report, plan: undefined, _reportPath: path.relative(REPO_ROOT, outPath) }, null, 2));
  await pool.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
