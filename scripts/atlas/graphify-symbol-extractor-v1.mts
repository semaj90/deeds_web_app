#!/usr/bin/env -S npx tsx
/**
 * GRAPHIFY-SYMBOL-EXTRACTOR-01
 *
 * The "canonical Graphify extractor" referenced (but never built) by
 * drizzle/manual/20260903_graphify_symbols_edges_additive_v1.sql's comment on graphify_symbols:
 * "populated only by the canonical Graphify extractor". Until this script, nothing populated it.
 *
 * Reads unprocessed graphify_files rows and, when an admitted workspace revision is supplied,
 * selects only rows joined to atlas_workspace_source_bindings by exact source_ref and
 * code_source_revision. The Graphify observation's workspace_revision is reported separately;
 * it is not treated as the admitted-source authority.
 * Dispatches per file extension:
 *   .ts/.tsx/.mts/.js/.jsx/.mjs/.cjs -> TypeScript Compiler API walk (default) or, with
 *       --use-lsp, a real typescript-language-server documentSymbol request (opt-in: spawning a
 *       language server per file is far slower than the in-process Compiler API walk, so it is
 *       never the default path).
 *   .json  -> top-level/nested key structural extraction for authored/configuration documents;
 *             known generated/test snapshots are excluded by the versioned candidate-scope policy
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
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFiles, REPO_ROOT } from './connection-config.mjs';
import { extractSymbolsFromSource } from '../graphify/lib/ts-ast-extractor.mjs';
import { extractJsonSymbols } from './lib/json-symbol-extractor.mjs';
import { JSON_SOURCE_SHAPE_POLICY_V1 } from './lib/json-source-shape-policy-v1.mjs';
import { extractMarkdownSymbols, extractMarkdownFences } from './lib/markdown-symbol-extractor.mjs';
import { requestDocumentSymbolsOnce, mapLspSymbolKind, fileUriFor } from './lib/lsp-client.mjs';
import { decodeSourceTextEnvelope, decodedOffsetToRawByte, classifySourceKind, MARKDOWN_FENCE_LANGUAGE_TO_EXT } from './lib/source-text-envelope.mjs';
import { writeAtlasAstNodes, indexSafeQualifiedSymbolV1 } from './lib/atlas-ast-nodes-writer.mjs';
import { isGraphifySymbolExcludedArtifactV1, selectBoundedSupportedExtractorCandidates } from './lib/graphify-symbol-candidate-selection-v1.mjs';
import { buildSymbolBatchPlan, validateSymbolBatchPlan, buildSymbolBaselineShards, selectLiveSymbolPlanRows, verifySymbolObservationReadback, requireSymbolBatchHeadroom, findSymbolIdentityConflicts, disambiguateSymbolOccurrenceKeysV1, disambiguateAstOccurrenceNamesV1 } from './lib/graphify-symbol-batch-plan-v1.mjs';

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
const freezePlanPath = opt('--freeze-plan', '');
const inputPlanPath = opt('--plan', '');
const rebindPlanPath = opt('--rebind-plan', '');
const shardIndex = Number(opt('--shard', '0'));
const batches = Number(opt('--batches', '1'));
const maxFilesPerRun = Number(opt('--max-files', '250'));
const workspaceIdFilter = opt('--workspace-id', '');
const workspaceRevisionFilter = opt('--workspace-revision', '');
const sourceRefsFilter = opt('--source-refs', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
let datastoreWriteAttempted = false;

if (flag('--help') || flag('-h')) {
  console.log([
    'Graphify structural symbol extractor (dry-run by default)',
    '',
    'Options:',
    '  --limit <n>                 Maximum candidate files (default: 50)',
    '  --workspace-id <uuid>       Restrict candidates to a workspace',
    '  --workspace-revision <sha>  Select exact admitted bindings (source_ref + code_source_revision)',
    '  --source-refs <a,b>         Restrict to exact source references',
    '  --use-lsp                   Use the opt-in LSP symbol provider',
    '  --freeze-plan <path>        Freeze ALL exact-byte unprocessed refs; local artifacts only',
    '  --rebind-plan <old>         With --freeze-plan, revalidate the SAME cohort under new parser bytes',
    '  --plan <path> --shard <n>    Run a fixed 1-based, 250-file shard (dry-run unless --apply)',
    '  --batches <n>               Consecutive frozen shards (default: 1, maximum: 64)',
    '  --max-files <n>             Maximum newly processed files per shard (1..250; resume same shard)',
    '  --apply                     Apply extraction writes (explicit)',
    '  --help, -h                  Show this help without connecting to Postgres',
  ].join('\n'));
  process.exit(0);
}

if (apply && !workspaceRevisionFilter) {
  throw new Error('APPLY_REQUIRES_EXPLICIT_WORKSPACE_REVISION');
}

if (freezePlanPath || inputPlanPath) {
  if (!workspaceRevisionFilter || (freezePlanPath && inputPlanPath)
    || sourceRefsFilter.length || workspaceIdFilter || args.includes('--limit')) {
    throw new Error('SYMBOL_PLAN_REQUIRES_WORKSPACE_AND_NO_SELECTION_OVERRIDES');
  }
  if (apply && freezePlanPath) throw new Error('SYMBOL_PLAN_FREEZE_CANNOT_APPLY');
  if (rebindPlanPath && (!freezePlanPath || inputPlanPath)) throw new Error('SYMBOL_PLAN_REBIND_REQUIRES_FREEZE');
  if (useLsp) throw new Error('SYMBOL_BASELINE_REQUIRES_DETERMINISTIC_PARSER');
  if (!Number.isSafeInteger(batches) || batches < 1 || batches > 64
    || !Number.isSafeInteger(maxFilesPerRun) || maxFilesPerRun < 1 || maxFilesPerRun > 250) {
    throw new Error('SYMBOL_PLAN_BATCH_BOUNDS_INVALID');
  }
  if (inputPlanPath && (!Number.isSafeInteger(shardIndex) || shardIndex < 1)) {
    throw new Error('SYMBOL_PLAN_SHARD_REQUIRED');
  }
} else if (args.includes('--shard') || args.includes('--batches') || args.includes('--max-files') || rebindPlanPath) {
  throw new Error('SYMBOL_PLAN_SHARD_REQUIRES_PLAN');
}

function symbolPlanContext() {
  const receipt = JSON.parse(fs.readFileSync(path.join(REPO_ROOT,
    'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
  if (receipt.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || receipt.authority !== true
    || receipt.workspaceRevision !== workspaceRevisionFilter) {
    throw new Error('SYMBOL_PLAN_CURRENT_ADMISSION_REQUIRED');
  }
  const require = createRequire(import.meta.url);
  const producerFiles = [
    'scripts/atlas/graphify-symbol-extractor-v1.mts',
    'scripts/graphify/lib/ts-ast-extractor.mjs',
    'scripts/atlas/lib/json-symbol-extractor.mjs',
    'scripts/atlas/lib/markdown-symbol-extractor.mjs',
    'scripts/atlas/lib/source-text-envelope.mjs',
    'scripts/atlas/lib/atlas-ast-nodes-writer.mjs',
    'scripts/atlas/lib/graphify-symbol-candidate-selection-v1.mjs',
    'scripts/atlas/lib/graphify-symbol-batch-plan-v1.mjs',
  ];
  // Bind actual parser/compiler bytes and runtime rather than a mutable producer label.
  const inputs = producerFiles.map(name => [name, createHash('sha256')
    .update(fs.readFileSync(path.join(REPO_ROOT, name))).digest('hex')]);
  inputs.push(['typescript', createHash('sha256').update(fs.readFileSync(require.resolve('typescript'))).digest('hex')]);
  inputs.push(['node', process.version]);
  return {
    workspaceRevision: workspaceRevisionFilter,
    sourceSnapshotChecksum: receipt.sourceSelectionChecksum,
    producerRevision: `sha256:${createHash('sha256').update(JSON.stringify(inputs)).digest('hex')}`,
    useLsp,
  };
}

const databaseUrl =
  env.DATABASE_URL ||
  `postgresql://${env.POSTGRES_USER ?? 'legal_admin'}:${env.POSTGRES_PASSWORD ?? '123456'}@127.0.0.1:${env.POSTGRES_PORT ?? '5434'}/${env.POSTGRES_DB ?? 'legal_ai_db'}`;

const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10000, statement_timeout: 60000 });

const LSP_LANGUAGE_ID: Record<string, string> = {
  '.ts': 'typescript', '.mts': 'typescript', '.tsx': 'typescriptreact',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascriptreact',
};

type FileKind = 'ts_js' | 'json' | 'markdown' | 'text' | 'unsupported';

function classify(sourceRef: string): FileKind {
  if (isGraphifySymbolExcludedArtifactV1(sourceRef)) return 'unsupported';
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
  const nodes = symbols.map((symbol, i) => {
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
  const occurrenceRows = disambiguateAstOccurrenceNamesV1(nodes.map(node => ({
    node_kind: node.kind,
    qualified_symbol: indexSafeQualifiedSymbolV1(node.qualifiedSymbol),
    start_byte: node.startByte,
    end_byte: node.endByte,
  })));
  return nodes.map((node, index) => ({
    ...node,
    qualifiedSymbol: occurrenceRows[index].qualified_symbol,
  }));
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
        start_line: symbol.start_line + fence.contentStartLine - 1,
        end_line: symbol.end_line + fence.contentStartLine - 1,
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

function sourceDigestForFile(absPath: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(absPath)).digest('hex')}`;
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
  /** Digest of the exact raw bytes passed to the decoder/parser. */
  sourceDigest: string;
  /** Deterministic code symbols (functions/classes/types/etc.) -> graphify_symbols. */
  codeSymbols: ExtractedSymbol[];
  /** Document structure (JSON key paths, Markdown headings) -> atlas_ast_nodes, never graphify_symbols. */
  astNodes: ExtractedSymbol[];
  /** Code symbols extracted from Markdown's own embedded fenced code -> graphify_symbols, with provenance. */
  embeddedCodeSymbols: Array<ExtractedSymbol & { provenance: Record<string, unknown> }>;
};

async function extractSymbolsForFile(absPath: string, sourceRef: string, kind: FileKind): Promise<ExtractionResult> {
  const rawBuffer = fs.readFileSync(absPath);
  const sourceDigest = `sha256:${createHash('sha256').update(rawBuffer).digest('hex')}`;
  const envelope = decodeSourceTextEnvelope(rawBuffer, sourceRef);
  const text = envelope.text;
  const ext = path.extname(sourceRef).toLowerCase();
  const rawSpans = (symbols: ExtractedSymbol[]) => symbols.map(symbol => ({ ...symbol,
    start_byte: decodedOffsetToRawByte(envelope, symbol.start_byte),
    end_byte: decodedOffsetToRawByte(envelope, symbol.end_byte),
  }));

  if (kind === 'ts_js') {
    const codeSymbols = useLsp
      ? await extractViaLsp(absPath, text, ext)
      : (extractSymbolsFromSource(text, sourceRef) as ExtractedSymbol[]);
    return { sourceDigest, codeSymbols: rawSpans(codeSymbols), astNodes: [], embeddedCodeSymbols: [] };
  }
  if (kind === 'json') {
    return { sourceDigest, codeSymbols: [], astNodes: rawSpans(extractJsonSymbols(text, sourceRef,
      { maxSymbols: JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile }) as ExtractedSymbol[]), embeddedCodeSymbols: [] };
  }
  if (kind === 'markdown') {
    const astNodes = extractMarkdownSymbols(text, sourceRef) as ExtractedSymbol[];
    const embeddedCodeSymbols = extractMarkdownEmbeddedCodeSymbols(text, sourceRef);
    return { sourceDigest, codeSymbols: [], astNodes: rawSpans(astNodes), embeddedCodeSymbols: embeddedCodeSymbols.map(symbol => ({
      ...symbol, start_byte: decodedOffsetToRawByte(envelope, symbol.start_byte),
      end_byte: decodedOffsetToRawByte(envelope, symbol.end_byte),
      provenance: { ...symbol.provenance, spanBasis: 'RAW_FILE_BYTES',
        ...Object.fromEntries(['fenceStartByte', 'fenceEndByte', 'embeddedStartByte', 'embeddedEndByte'].map(key =>
          [key, decodedOffsetToRawByte(envelope, Number(symbol.provenance[key]))])),
      },
    })) };
  }
  return { sourceDigest, codeSymbols: [], astNodes: [], embeddedCodeSymbols: [] }; // 'text' -- opaque, no structure to extract yet
}

async function markAdmittedFileParseFailure(
  row: { file_id: string; source_ref: string; source_revision: string },
  reason: Record<string, unknown>,
): Promise<void> {
  if (inputPlanPath) diskHeadroom();
  const client = await pool.connect();
  try {
    datastoreWriteAttempted = true;
    await client.query('BEGIN');
    const binding = await client.query(
      `SELECT 1 FROM atlas_workspace_source_bindings
       WHERE repo_id = 'deeds-web-app' AND workspace_revision = $1
         AND canonical_source_ref = $2 AND source_revision = $3`,
      [workspaceRevisionFilter, row.source_ref, row.source_revision],
    );
    if (binding.rowCount !== 1) throw new Error('ADMITTED_SOURCE_BINDING_CHANGED_BEFORE_FAILURE_UPDATE');

    const sourceRow = await client.query(
      `SELECT 1 FROM graphify_files
       WHERE file_id = $1 AND source_ref = $2 AND code_source_revision = $3
         AND parse_status = 'UNPROCESSED'
       FOR UPDATE`,
      [row.file_id, row.source_ref, row.source_revision],
    );
    if (sourceRow.rowCount !== 1) throw new Error('GRAPHIFY_SOURCE_OBSERVATION_CHANGED_BEFORE_FAILURE_UPDATE');

    const update = await client.query(
      `UPDATE graphify_files
          SET parse_status = 'PARSE_FAILED', parse_error = $4::jsonb, updated_at = now()
        WHERE file_id = $1 AND source_ref = $2 AND code_source_revision = $3
          AND parse_status = 'UNPROCESSED'
        RETURNING file_id`,
      [row.file_id, row.source_ref, row.source_revision, JSON.stringify(reason)],
    );
    if (update.rowCount !== 1) throw new Error('GRAPHIFY_FAILURE_UPDATE_READBACK_FAILED');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function expectedObservations(extraction: ExtractionResult, row: { file_id: string; source_revision: string }, kind: FileKind) {
  const symbols = disambiguateSymbolOccurrenceKeysV1([...extraction.codeSymbols.map(symbol => ({ symbol, fence: false })),
    ...extraction.embeddedCodeSymbols.map(symbol => ({ symbol, fence: true }))].map(({ symbol, fence }) => ({
    stable_symbol_key: stableSymbolKey(row.file_id, `${fence ? 'fence:' : ''}${symbol.kind}`,
      [...symbol.parent_chain.map(p => p.name), symbol.name].join('.')),
    source_text_hash: symbol.hash, ast_fingerprint: symbol.ast_fingerprint,
    start_byte: symbol.start_byte, end_byte: symbol.end_byte,
  })));
  const ast = toAstNodeInputs(extraction.astNodes, extraction.sourceDigest).map(node => ({
    node_kind: node.kind, qualified_symbol: indexSafeQualifiedSymbolV1(node.qualifiedSymbol),
    source_revision: row.source_revision, source_content_hash: extraction.sourceDigest,
    parser_name: kind === 'json' ? 'json-symbol-extractor' : 'markdown-symbol-extractor',
    parser_version: kind === 'json' ? 'json-symbol-extractor-v1' : 'markdown-symbol-extractor-v1',
    start_byte: node.startByte, end_byte: node.endByte,
  }));
  return { symbols, ast };
}

async function readbackObservations(client: pg.PoolClient,
  row: { file_id: string; source_ref: string; source_revision: string }, expected: ReturnType<typeof expectedObservations>) {
  const bindings = await client.query(`SELECT gf.parse_status
    FROM atlas_workspace_source_bindings b JOIN graphify_files gf
      ON gf.file_id=$1 AND gf.source_ref=b.canonical_source_ref AND gf.code_source_revision=b.source_revision
    WHERE b.repo_id='deeds-web-app' AND b.workspace_revision=$2
      AND b.canonical_source_ref=$3 AND b.source_revision=$4`,
  [row.file_id, workspaceRevisionFilter, row.source_ref, row.source_revision]);
  const symbols = await client.query(`SELECT stable_symbol_key, source_text_hash, ast_fingerprint, start_byte, end_byte
    FROM graphify_symbols WHERE file_id=$1`, [row.file_id]);
  const ast = await client.query(`SELECT node_kind, qualified_symbol, source_revision, source_content_hash,
    parser_name, parser_version, start_byte, end_byte FROM atlas_ast_nodes
    WHERE repo_id='00000000-0000-0000-0000-000000000000'::uuid AND relative_path=$1 AND source_revision=$2`,
  [row.source_ref.replace(/\\/g, '/').toLowerCase(), row.source_revision]);
  return verifySymbolObservationReadback(expected, { bindings: bindings.rows, symbols: symbols.rows, ast: ast.rows });
}

async function independentReadback(row: { file_id: string; source_ref: string; source_revision: string },
  expected: ReturnType<typeof expectedObservations>) {
  const reader = await pool.connect();
  try {
    await reader.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await readbackObservations(reader, row, expected);
    await reader.query('ROLLBACK');
    return result;
  } finally {
    // ROLLBACK is harmless after success and also clears a failed read transaction.
    await reader.query('ROLLBACK').catch(() => {});
    reader.release();
  }
}

function diskHeadroom() {
  const stat = fs.statfsSync(REPO_ROOT);
  const availableBytes = stat.bavail * stat.bsize;
  requireSymbolBatchHeadroom(availableBytes);
  return availableBytes;
}

async function main(currentShard = shardIndex) {
  const planContext = freezePlanPath || inputPlanPath ? symbolPlanContext() : null;
  const frozenPlan = inputPlanPath
    ? validateSymbolBatchPlan(JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, inputPlanPath), 'utf8')), planContext)
    : null;
  const previousPlan = rebindPlanPath ? JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, rebindPlanPath), 'utf8')) : null;
  if (previousPlan) validateSymbolBatchPlan(previousPlan, { ...planContext, producerRevision: previousPlan.producerRevision });
  const shard = frozenPlan ? buildSymbolBaselineShards(frozenPlan).shards[currentShard - 1] : null;
  if (frozenPlan && !shard) throw new Error('SYMBOL_PLAN_SHARD_OUT_OF_RANGE');
  if (frozenPlan && shardIndex + batches - 1 > buildSymbolBaselineShards(frozenPlan).shards.length) {
    throw new Error('SYMBOL_PLAN_BATCH_RANGE_OUT_OF_BOUNDS');
  }
  const plannedRows = previousPlan?.rows ?? (shard ? frozenPlan.rows.slice(shard.offset, shard.offset + shard.maxFiles) : null);
  const selectedRefs = plannedRows ? plannedRows.map(row => row.sourceRef) : sourceRefsFilter;
  // In the admitted path, LIMIT must be applied after source-kind filtering.
  // Applying it in SQL first lets unsupported files at the front of the
  // lexicographic source_ref order starve the bounded extractor of supported
  // candidates (for example, a five-row plan can contain four skipped files).
  const queryParams: Array<string | number> = workspaceRevisionFilter ? [] : [limit];
  let sourceRefClause = '';
  if (selectedRefs.length > 0) {
    queryParams.push(selectedRefs as unknown as string);
    sourceRefClause = `AND gf.source_ref = ANY($${queryParams.length}::text[])`;
  }
  let workspaceClause = '';
  if (workspaceIdFilter) {
    queryParams.push(workspaceIdFilter);
    workspaceClause = `AND gf.workspace_id = $${queryParams.length}`;
  }
  let admittedBindingJoin = '';
  let admittedWorkspaceRevisionSelect = 'NULL::text';
  let sourceRevisionSelect = 'COALESCE(gf.code_source_revision, gf.source_revision)';
  if (workspaceRevisionFilter) {
    queryParams.push(workspaceRevisionFilter);
    const revisionParam = `$${queryParams.length}`;
    admittedWorkspaceRevisionSelect = `binding.workspace_revision`;
    sourceRevisionSelect = 'binding.source_revision';
    admittedBindingJoin = `JOIN atlas_workspace_source_bindings binding
       ON binding.repo_id = 'deeds-web-app'
      AND binding.workspace_revision = ${revisionParam}
      AND binding.canonical_source_ref = gf.source_ref
      AND binding.source_revision = gf.code_source_revision`;
  }
  const queryLimitClause = workspaceRevisionFilter ? '' : `LIMIT $1`;
  const candidates = await pool.query<{
    file_id: string;
    source_ref: string;
    workspace_id: string;
    workspace_revision: string | null;
    graphify_workspace_revision: string | null;
    source_revision: string;
    content_hash: string;
    parser_name: string | null;
    parser_version: string | null;
    parse_status: string;
  }>(
    `SELECT gf.file_id, gf.source_ref, gf.workspace_id,
            COALESCE(${admittedWorkspaceRevisionSelect}, gf.workspace_revision) AS workspace_revision,
            gf.workspace_revision AS graphify_workspace_revision,
            ${sourceRevisionSelect} AS source_revision,
            gf.content_hash, gf.parser_name, gf.parser_version, gf.parse_status
     FROM graphify_files gf
       ${admittedBindingJoin}
     WHERE ${plannedRows ? 'TRUE' : "gf.parse_status = 'UNPROCESSED'"}
       ${sourceRefClause}
       ${workspaceClause}
     ORDER BY gf.source_ref
       ${queryLimitClause}`,
    queryParams,
  );

  const checkCurrentSourceBytes = workspaceRevisionFilter
    ? (row: { source_ref: string; source_revision: string }): boolean | 'MISSING' | 'READ_ERROR' => {
      const absPath = path.join(REPO_ROOT, row.source_ref);
      if (!fs.existsSync(absPath)) return 'MISSING';
      try {
        return sourceDigestForFile(absPath) === row.source_revision;
      } catch {
        return 'READ_ERROR';
      }
    }
    : null;
  const resume = plannedRows ? selectLiveSymbolPlanRows(plannedRows, candidates.rows, workspaceRevisionFilter, true) : null;
  const selectionLimit = freezePlanPath ? Math.max(1, candidates.rows.length) : shard?.maxFiles ?? limit;
  const byteChecks = new Map<string, boolean | 'MISSING' | 'READ_ERROR'>();
  if (previousPlan && resume?.outcomes.some(member => ['LIVE_ADMITTED_BINDING_MISSING', 'AMBIGUOUS_LIVE_IDENTITY',
    'LIVE_IDENTITY_OR_REVISION_MISMATCH'].includes(member.status))) throw new Error('SYMBOL_PLAN_REBIND_LIVE_IDENTITY_CHANGED');
  const selection = selectBoundedSupportedExtractorCandidates(previousPlan ? candidates.rows : resume?.candidates ?? candidates.rows, classify, selectionLimit,
    checkCurrentSourceBytes ? row => {
      const result = checkCurrentSourceBytes(row);
      byteChecks.set(row.source_ref, result);
      return result;
    } : null);
  const supportedRows = selection.candidates;
  const skippedUnsupported = selection.skippedUnsupported;

  if (freezePlanPath) {
    if (previousPlan && supportedRows.length !== previousPlan.rowCount) {
      throw new Error('SYMBOL_PLAN_REBIND_REJECTED_MEMBERSHIP_OR_REVISION_DRIFT');
    }
    const manifest = buildSymbolBatchPlan({ ...planContext, rows: supportedRows.map(({ row, kind }) => ({
      fileId: row.file_id, sourceRef: row.source_ref, sourceRevision: row.source_revision, fileKind: kind,
    })) });
    const output = path.resolve(REPO_ROOT, freezePlanPath);
    const shardsPath = `${output}.shards.json`;
    // Never overwrite a frozen work set. These are plans, not admission or execution receipts.
    if (fs.existsSync(output) || fs.existsSync(shardsPath)) throw new Error('SYMBOL_PLAN_OUTPUT_EXISTS');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    const shards = buildSymbolBaselineShards(manifest);
    fs.writeFileSync(shardsPath, JSON.stringify(shards, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(`${output}.freeze.json`, JSON.stringify({
      schema: 'atlas.graphify-symbol-baseline-freeze.v1', generatedAt: new Date().toISOString(),
      manifestChecksum: manifest.planChecksum, revalidatedPreviousManifestChecksum: previousPlan?.planChecksum ?? null,
      manifestRowCount: manifest.rowCount, canonicalAuthority: false, datastoreWrites: false,
      ...selection, candidates: undefined,
    }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: 'FROZEN_NOT_EXECUTED', canonicalAuthority: false,
      revalidatedPreviousManifestChecksum: previousPlan?.planChecksum ?? null,
      datastoreWrites: false, manifestPath: output, shardsPath, manifestChecksum: manifest.planChecksum,
      rowCount: manifest.rowCount, shardCount: shards.shards.length, ...selection, candidates: undefined }, null, 2));
    return;
  }

  const plan: Array<{
    fileId: string;
    sourceRef: string;
    workspaceRevision: string | null;
    graphifyWorkspaceRevision: string | null;
    workspaceRevisionMatches: boolean;
    sourceRevision: string;
    sourceDigest?: string;
    fileKind: FileKind;
    outcome: 'WOULD_EXTRACT' | 'FILE_MISSING_ON_DISK' | 'SOURCE_REVISION_MISMATCH' | 'PARSE_FAILED'
      | 'RESOURCE_LIMIT_DEFERRED' | 'NOT_ATTEMPTED_RUN_LIMIT' | 'PROCESSED_WITH_SYMBOLS'
      | 'IDENTITY_CONFLICT_DEFERRED'
      | 'PROCESSED_STRUCTURE_ONLY' | 'PROCESSED_NO_EVIDENCE' | 'READBACK_FAILED'
      | 'WRITE_FAILED_ROLLED_BACK' | 'COMMIT_OUTCOME_UNKNOWN';
    symbolCount?: number;
    error?: string;
  }> = [];

  let totalSymbolsExtracted = 0;
  let totalSymbolsInserted = 0;
  let filesProcessed = 0;
  let filesFailed = 0;
  const byFileKind: Record<string, number> = {};
  const workspaceRevisions = new Set(supportedRows.map(({ row }) => row.workspace_revision).filter(Boolean));
  const graphifyWorkspaceRevisionMismatchCount = supportedRows.filter(({ row }) =>
    Boolean(workspaceRevisionFilter) && row.graphify_workspace_revision !== workspaceRevisionFilter,
  ).length;
  let sourceRevisionMismatchCount = 0;
  let fatalError: string | null = null;
  const readbacks: Array<Record<string, unknown>> = [];
  let availableBytes: number | null = null;

  try {
  if (apply && frozenPlan) availableBytes = diskHeadroom();
  for (const { row, kind } of supportedRows) {
    byFileKind[kind] = (byFileKind[kind] ?? 0) + 1;
    const absPath = path.join(REPO_ROOT, row.source_ref);
    if (frozenPlan && apply && row.parse_status !== 'PROCESSED' && filesProcessed >= maxFilesPerRun) {
      plan.push({ fileId: row.file_id, sourceRef: row.source_ref, sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision, graphifyWorkspaceRevision: row.graphify_workspace_revision,
        workspaceRevisionMatches: true, fileKind: kind, outcome: 'NOT_ATTEMPTED_RUN_LIMIT' });
      continue;
    }
    if (!fs.existsSync(absPath)) {
      plan.push({
        fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
        graphifyWorkspaceRevision: row.graphify_workspace_revision,
        workspaceRevisionMatches: !workspaceRevisionFilter || row.workspace_revision === workspaceRevisionFilter,
        sourceRevision: row.source_revision,
        fileKind: kind, outcome: 'FILE_MISSING_ON_DISK',
      });
      if (apply) {
        await markAdmittedFileParseFailure(row, { reason: 'FILE_MISSING_ON_DISK', source_ref: row.source_ref });
        filesFailed += 1;
      }
      continue;
    }

    let extraction: ExtractionResult;
    if (kind === 'json' && fs.statSync(absPath).size > JSON_SOURCE_SHAPE_POLICY_V1.maxSourceBytes) {
      plan.push({ fileId: row.file_id, sourceRef: row.source_ref, sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision, graphifyWorkspaceRevision: row.graphify_workspace_revision,
        workspaceRevisionMatches: true, fileKind: kind, outcome: 'RESOURCE_LIMIT_DEFERRED',
        sourceBytes: fs.statSync(absPath).size,
        error: 'STRUCTURAL_RESOURCE_LIMIT_DEFERRED:SOURCE_BYTES_EXCEED_LIMIT' });
      continue;
    }
    try {
      extraction = await extractSymbolsForFile(absPath, row.source_ref, kind);
    } catch (error) {
      const resourceDeferred = error instanceof Error && error.message.startsWith('STRUCTURAL_RESOURCE_LIMIT_DEFERRED:');
      plan.push({
        fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
        graphifyWorkspaceRevision: row.graphify_workspace_revision,
        workspaceRevisionMatches: !workspaceRevisionFilter || row.workspace_revision === workspaceRevisionFilter,
        sourceRevision: row.source_revision,
        fileKind: kind, outcome: resourceDeferred ? 'RESOURCE_LIMIT_DEFERRED' : 'PARSE_FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
      if (apply && !resourceDeferred) {
        await markAdmittedFileParseFailure(row, {
          reason: 'PARSE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
        filesFailed += 1;
      }
      continue;
    }

    if (workspaceRevisionFilter && extraction.sourceDigest !== row.source_revision) {
      sourceRevisionMismatchCount += 1;
      plan.push({
        fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
        graphifyWorkspaceRevision: row.graphify_workspace_revision,
        workspaceRevisionMatches: true,
        sourceRevision: row.source_revision,
        fileKind: kind, outcome: 'SOURCE_REVISION_MISMATCH',
        error: `EXPECTED_${row.source_revision}_GOT_${extraction.sourceDigest}`,
      });
      continue;
    }

    if (workspaceRevisionFilter && sourceDigestForFile(absPath) !== extraction.sourceDigest) {
      sourceRevisionMismatchCount += 1;
      plan.push({
        fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
        graphifyWorkspaceRevision: row.graphify_workspace_revision,
        workspaceRevisionMatches: true,
        sourceRevision: row.source_revision,
        fileKind: kind, outcome: 'SOURCE_REVISION_MISMATCH',
        error: 'SOURCE_BYTES_CHANGED_DURING_EXTRACTION',
      });
      continue;
    }

    const { codeSymbols, astNodes, embeddedCodeSymbols } = extraction;
    const totalCount = codeSymbols.length + astNodes.length + embeddedCodeSymbols.length;
    if (frozenPlan && totalCount > 2000) {
      plan.push({ fileId: row.file_id, sourceRef: row.source_ref, sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision, graphifyWorkspaceRevision: row.graphify_workspace_revision,
        workspaceRevisionMatches: true, fileKind: kind, outcome: 'RESOURCE_LIMIT_DEFERRED',
        symbolCount: totalCount, error: 'OBSERVATIONS_EXCEED_2000_PER_FILE' });
      continue;
    }
    plan.push({
      fileId: row.file_id, sourceRef: row.source_ref, workspaceRevision: row.workspace_revision,
      graphifyWorkspaceRevision: row.graphify_workspace_revision,
      workspaceRevisionMatches: !workspaceRevisionFilter || row.workspace_revision === workspaceRevisionFilter,
      sourceRevision: row.source_revision,
      sourceDigest: extraction.sourceDigest,
      fileKind: kind, outcome: 'WOULD_EXTRACT', symbolCount: totalCount,
    });
    totalSymbolsExtracted += totalCount;

    const entry = plan[plan.length - 1];
    const expected = expectedObservations(extraction, row, kind);
    const identityConflicts = [...findSymbolIdentityConflicts(expected.symbols),
      ...findSymbolIdentityConflicts(expected.ast.map(node => ({
        stable_symbol_key: `AST:${node.node_kind}:${node.qualified_symbol}`,
        source_text_hash: node.source_content_hash, ast_fingerprint: node.source_revision,
        start_byte: node.start_byte, end_byte: node.end_byte,
      })))];
    if (frozenPlan && identityConflicts.length) {
      entry.outcome = 'IDENTITY_CONFLICT_DEFERRED';
      entry.error = JSON.stringify(identityConflicts);
      continue;
    }
    if (frozenPlan && row.parse_status === 'PROCESSED') {
      const readback = await independentReadback(row, expected);
      readbacks.push({ fileId: row.file_id, sourceRef: row.source_ref, sourceRevision: row.source_revision,
        mode: 'RESUME_READ_ONLY', ...readback });
      entry.outcome = readback.proven
        ? (expected.symbols.length ? 'PROCESSED_WITH_SYMBOLS' : expected.ast.length ? 'PROCESSED_STRUCTURE_ONLY' : 'PROCESSED_NO_EVIDENCE')
        : 'READBACK_FAILED';
      continue;
    }

    if (!apply) continue;

    if (frozenPlan) availableBytes = diskHeadroom();
    const client = await pool.connect();
    const insertedBeforeFile = totalSymbolsInserted;
    let commitAttempted = false;
    let committed = false;
    try {
      datastoreWriteAttempted = true;
      await client.query('BEGIN');

      if (workspaceRevisionFilter) {
        const binding = await client.query(
          `SELECT 1 FROM atlas_workspace_source_bindings
           WHERE repo_id = 'deeds-web-app' AND workspace_revision = $1
             AND canonical_source_ref = $2 AND source_revision = $3`,
          [workspaceRevisionFilter, row.source_ref, row.source_revision],
        );
        if (binding.rowCount !== 1) throw new Error('ADMITTED_SOURCE_BINDING_CHANGED_BEFORE_WRITE');
        const sourceRow = await client.query(
          `SELECT 1 FROM graphify_files
           WHERE file_id = $1 AND source_ref = $2 AND code_source_revision = $3
             AND parse_status = 'UNPROCESSED'
           FOR UPDATE`,
          [row.file_id, row.source_ref, row.source_revision],
        );
        if (sourceRow.rowCount !== 1) throw new Error('GRAPHIFY_SOURCE_OBSERVATION_CHANGED_BEFORE_WRITE');
        if (sourceDigestForFile(absPath) !== extraction.sourceDigest) {
          throw new Error('SOURCE_BYTES_CHANGED_BEFORE_WRITE');
        }
      }

      // Deterministic code symbols (ts_js) -> graphify_symbols, unchanged from before.
      const insertedSymbolIdByPath = new Map<string, string>();
      for (const [symbolIndex, symbol] of codeSymbols.entries()) {
        const qualifiedPath = [...symbol.parent_chain.map((p) => p.name), symbol.name].join('.');
        const parentPath = symbol.parent_chain.length > 0 ? symbol.parent_chain.map((p) => p.name).join('.') : null;
        const parentSymbolId = parentPath ? insertedSymbolIdByPath.get(parentPath) ?? null : null;
        const key = expected.symbols[symbolIndex]?.stable_symbol_key;
        if (!key) throw new Error(`EXPECTED_CODE_SYMBOL_KEY_MISSING:${symbolIndex}`);
        const result = await client.query<{ symbol_id: string }>(
          `INSERT INTO graphify_symbols (
             file_id, stable_symbol_key, symbol_kind, qualified_name, parent_symbol_id,
             start_byte, end_byte, start_row, end_row, signature_text, source_text_hash,
             ast_fingerprint, metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
           ON CONFLICT (file_id, stable_symbol_key) DO NOTHING
           RETURNING symbol_id`,
          [
            row.file_id, key, symbol.kind, qualifiedPath, parentSymbolId,
            symbol.start_byte, symbol.end_byte, symbol.start_line, symbol.end_line,
            symbol.signature_text, symbol.hash, symbol.ast_fingerprint,
            JSON.stringify({
              extractor: 'graphify-symbol-extractor-v1',
              extractor_source: useLsp ? 'lsp:typescript-language-server' : 'ts-ast-extractor.mjs',
              source_revision: row.source_revision, workspace_revision: workspaceRevisionFilter || null,
              producer_revision: planContext?.producerRevision ?? null,
              span_basis: 'RAW_FILE_BYTES', observation_hash_basis: 'DECODED_TEXT_UTF8',
            }),
          ],
        );
        const symbolId = result.rows[0]?.symbol_id ?? (await client.query<{ symbol_id: string }>(
          `SELECT symbol_id FROM graphify_symbols WHERE file_id = $1 AND stable_symbol_key = $2`,
          [row.file_id, key],
        )).rows[0]?.symbol_id;
        if (symbolId) {
          insertedSymbolIdByPath.set(qualifiedPath, symbolId);
          if ((result.rowCount ?? 0) > 0) totalSymbolsInserted += 1;
        }
      }

      // Markdown's embedded fenced code -> graphify_symbols too, but with explicit provenance
      // (parentDocument/parentSection/fence spans) tying it back to its host Markdown file --
      // per SOURCE-TEXT-ENCODING-01, this is real code identity, not document structure.
      const insertedEmbeddedIdByPath = new Map<string, string>();
      for (const [symbolIndex, symbol] of embeddedCodeSymbols.entries()) {
        const qualifiedPath = [...symbol.parent_chain.map((p) => p.name), symbol.name].join('.');
        const parentPath = symbol.parent_chain.length > 0 ? symbol.parent_chain.map((p) => p.name).join('.') : null;
        const parentSymbolId = parentPath ? insertedEmbeddedIdByPath.get(parentPath) ?? null : null;
        const key = expected.symbols[codeSymbols.length + symbolIndex]?.stable_symbol_key;
        if (!key) throw new Error(`EXPECTED_FENCED_SYMBOL_KEY_MISSING:${symbolIndex}`);
        const result = await client.query<{ symbol_id: string }>(
          `INSERT INTO graphify_symbols (
             file_id, stable_symbol_key, symbol_kind, qualified_name, parent_symbol_id,
             start_byte, end_byte, start_row, end_row, signature_text, source_text_hash,
             ast_fingerprint, metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
           ON CONFLICT (file_id, stable_symbol_key) DO NOTHING
           RETURNING symbol_id`,
          [
            row.file_id, key, symbol.kind, qualifiedPath, parentSymbolId,
            symbol.start_byte, symbol.end_byte, symbol.start_line, symbol.end_line,
            symbol.signature_text, symbol.hash, symbol.ast_fingerprint,
            JSON.stringify({
              extractor: 'graphify-symbol-extractor-v1',
              extractor_source: 'markdown-embedded-fence',
              source_revision: row.source_revision, workspace_revision: workspaceRevisionFilter || null,
              producer_revision: planContext?.producerRevision ?? null,
              span_basis: 'RAW_FILE_BYTES', observation_hash_basis: 'DECODED_TEXT_UTF8',
              ...symbol.provenance,
            }),
          ],
        );
        const symbolId = result.rows[0]?.symbol_id ?? (await client.query<{ symbol_id: string }>(
          `SELECT symbol_id FROM graphify_symbols WHERE file_id = $1 AND stable_symbol_key = $2`,
          [row.file_id, key],
        )).rows[0]?.symbol_id;
        if (symbolId) {
          insertedEmbeddedIdByPath.set(qualifiedPath, symbolId);
          if ((result.rowCount ?? 0) > 0) totalSymbolsInserted += 1;
        }
      }

      // Document structure (json/markdown headings) -> atlas_ast_nodes, never graphify_symbols.
      if (astNodes.length > 0) {
        const parserLanguage = kind === 'json' ? 'json' : 'markdown';
        const parserName = kind === 'json' ? 'json-symbol-extractor' : 'markdown-symbol-extractor';
        // parser_version on graphify_files describes an older inventory observation, not this
        // extractor run. Record the actual producer revision unconditionally; never inherit a
        // stale-but-non-null version from the legacy row.
        const parserVersion = kind === 'json'
          ? 'json-symbol-extractor-v1'
          : 'markdown-symbol-extractor-v1';
        const { inserted } = await writeAtlasAstNodes(client, {
          sourceRef: row.source_ref,
          parserLanguage,
          parserName,
          parserVersion,
          sourceRevision: row.source_revision,
          workspaceId: row.workspace_id,
          nodes: toAstNodeInputs(astNodes, extraction.sourceDigest),
        });
        totalSymbolsInserted += inserted;
      }

      const processed = await client.query(
        `UPDATE graphify_files
            SET parse_status = 'PROCESSED', updated_at = now()
          WHERE file_id = $1 AND source_ref = $2 AND code_source_revision = $3
            AND parse_status = 'UNPROCESSED'
          RETURNING file_id`,
        [row.file_id, row.source_ref, row.source_revision],
      );
      if (processed.rowCount !== 1) throw new Error('GRAPHIFY_PROCESSED_STATUS_READBACK_FAILED');
      if (frozenPlan) {
        const beforeCommit = await readbackObservations(client, row, expected);
        if (!beforeCommit.proven) throw new Error(`OBSERVATION_READBACK_REJECTED:${JSON.stringify(beforeCommit.rejects.slice(0, 5))}`);
      }
      commitAttempted = true;
      await client.query('COMMIT');
      committed = true;
      filesProcessed += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      totalSymbolsInserted = insertedBeforeFile;
      entry.outcome = commitAttempted ? 'COMMIT_OUTCOME_UNKNOWN' : 'WRITE_FAILED_ROLLED_BACK';
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      client.release();
    }
    if (frozenPlan && committed) {
      // If the independent connection fails, the receipt must still record the committed row.
      entry.outcome = 'READBACK_FAILED';
      const readback = await independentReadback(row, expected);
      readbacks.push({ fileId: row.file_id, sourceRef: row.source_ref, sourceRevision: row.source_revision,
        mode: 'INDEPENDENT_POST_COMMIT_READ_ONLY', ...readback });
      entry.outcome = readback.proven
        ? (expected.symbols.length ? 'PROCESSED_WITH_SYMBOLS' : expected.ast.length ? 'PROCESSED_STRUCTURE_ONLY' : 'PROCESSED_NO_EVIDENCE')
        : 'READBACK_FAILED';
      if (!readback.proven) throw new Error('INDEPENDENT_OBSERVATION_READBACK_FAILED');
    }
  }
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  }

  const memberChecks = resume?.outcomes.map(entry => ({ ...entry,
    byteCheck: byteChecks.get(entry.sourceRef) ?? null,
    extractionOutcome: plan.find(result => result.sourceRef === entry.sourceRef)?.outcome ?? null,
    readbackProven: readbacks.some(result => result.fileId === entry.fileId && result.proven === true),
  })) ?? null;
  const shardCompletionProven = Boolean(memberChecks?.length && !fatalError
    && memberChecks.every(entry => entry.readbackProven));

  const report = {
    schema: 'atlas.graphify-symbol-extractor-receipt.v1',
    frozenManifestChecksum: frozenPlan?.planChecksum ?? null,
    shard,
    frozenMemberChecks: memberChecks,
    shardCompletionProven,
    status: fatalError ? 'PARTIAL_FAILURE' : shardCompletionProven ? 'SHARD_READBACK_PROVEN' : 'SHARD_INCOMPLETE',
    fatalError,
    availableBytes,
    maxFilesPerRun,
    readbacks,
    generatedAt: new Date().toISOString(),
    apply,
    useLsp,
    limit,
    workspaceIdFilter: workspaceIdFilter || null,
    workspaceRevisionFilter: workspaceRevisionFilter || null,
    admissionMode: workspaceRevisionFilter ? 'CANONICAL_WORKSPACE_SOURCE_BINDING' : 'GRAPHIFY_OBSERVATION_ONLY',
    workspaceRevisionCount: workspaceRevisions.size,
    graphifyWorkspaceRevisionMismatchCount,
    sourceRevisionMismatchCount,
    candidatePoolRows: selection.candidatePoolRows,
    supportedCandidatePoolRows: selection.supportedCandidatePoolRows,
    precheckRowsExamined: selection.precheckRowsExamined,
    precheckRevisionMismatchRows: selection.precheckRevisionMismatchRows,
    precheckMissingSourceRows: selection.precheckMissingSourceRows,
    precheckReadErrorRows: selection.precheckReadErrorRows,
    sourceRevisionRejectSample: selection.sourceRevisionRejectSample,
    candidatesConsidered: supportedRows.length,
    skippedUnsupported,
    byFileKind,
    filesProcessed,
    filesFailed,
    totalSymbolsExtracted,
    totalSymbolsInserted: apply ? totalSymbolsInserted : null,
    datastoreWriteAttempted,
    plan,
  };

  const dir = path.join(REPO_ROOT, 'docs', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `graphify-symbol-extractor-v1-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({ ...report, plan: undefined, frozenMemberChecks: undefined, readbacks: undefined,
    _reportPath: path.relative(REPO_ROOT, outPath) }, null, 2));
  return { ...report, reportPath: path.relative(REPO_ROOT, outPath) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = async () => {
    const reports: Array<NonNullable<Awaited<ReturnType<typeof main>>>> = [];
    for (let i = 0; i < (inputPlanPath ? batches : 1); i += 1) {
      const report = await main(shardIndex + i);
      if (report) reports.push(report);
      if (report?.fatalError) break;
    }
    if (inputPlanPath && reports.length) {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, inputPlanPath), 'utf8'));
      const members = reports.flatMap(report => report.frozenMemberChecks ?? []);
      const verified = members.filter(member => member.readbackProven).length;
      const fullManifestVisited = members.length === manifest.rowCount
        && new Set(members.map(member => member.fileId)).size === manifest.rowCount;
      const outcomeCounts: Record<string, number> = {};
      for (const member of members) {
        const outcome = member.extractionOutcome ?? (member.byteCheck === false ? 'REVISION_DRIFTED'
          : member.byteCheck === 'MISSING' ? 'SOURCE_MISSING' : member.status);
        outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;
      }
      const summary = {
        schema: 'atlas.graphify-symbol-baseline-run.v1', generatedAt: new Date().toISOString(),
        manifestChecksum: reports[0].frozenManifestChecksum, manifestRowCount: manifest.rowCount,
        workspaceRevision: workspaceRevisionFilter, apply, firstShard: shardIndex, requestedBatches: batches,
        visitedMembers: members.length, independentlyVerifiedMembers: verified, fullManifestVisited,
        baselineSealProven: fullManifestVisited && verified === manifest.rowCount
          && reports.every(report => report.shardCompletionProven),
        filesCommittedThisRun: reports.reduce((n, report) => n + report.filesProcessed, 0),
        outcomeCounts, receipts: reports.map(report => report.reportPath),
        canonicalAuthority: false, projectionAdmissionPromoted: false,
      };
      const outPath = path.join(REPO_ROOT, 'docs/reports', `graphify-symbol-baseline-run-${Date.now()}.json`);
      fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
      console.log(JSON.stringify({ ...summary, reportPath: path.relative(REPO_ROOT, outPath) }, null, 2));
    }
  };
  run().catch((err) => {
    console.error(err);
    const dir = path.join(REPO_ROOT, 'docs', 'reports');
    const failurePath = path.join(dir, `graphify-symbol-runtime-failure-${Date.now()}.json`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(failurePath, JSON.stringify({
        schema: 'atlas.graphify-symbol-runtime-failure.v1', generatedAt: new Date().toISOString(),
        status: 'EXECUTION_BLOCKED', apply, workspaceRevision: workspaceRevisionFilter || null,
        manifestPath: inputPlanPath || freezePlanPath || null, shardIndex: inputPlanPath ? shardIndex : null,
        datastoreWriteAttempted, datastoreWritesMayHaveOccurred: datastoreWriteAttempted,
        errorCode: err?.code ?? null, error: err instanceof Error ? err.message : String(err),
      }, null, 2) + '\n', { flag: 'wx' });
      console.error(`Runtime receipt: ${path.relative(REPO_ROOT, failurePath)}`);
    } catch (receiptError) {
      console.error('Could not preserve runtime failure receipt:', receiptError);
    }
    process.exitCode = 1;
  }).finally(() => pool.end());
}
