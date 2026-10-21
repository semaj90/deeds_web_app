// Read-only, diagnostic: native AST observations (NLP sidecar /ast/chunk) plus ast-grep pattern matches,
// each keyed in a Map. Never writes to Postgres, Valkey, Qdrant or Neo4j. Receipts go to .tmp/atlas/ (gitignored).
// Fail-closed: any stage that throws is recorded as FAILED in that file's receipt and the process exits 1.
// Usage:
//   node scripts/atlas/ast-chunk-keyed-map-v1.mjs <file> [<file> ...] [--chunk-spans=<json>] [--sidecar=http://127.0.0.1:8095] [--source-root=<repo-or-snapshot>] [--source-revision=<sha256>]
// --chunk-spans applies only when exactly one file is given (spans belong to one source).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAstGrepJsonOutputV1 } from './lib/ast-grep-result-v1.mjs';
import { isValidAstChunkSourcePathV1 } from './lib/ast-chunk-source-path-v1.mjs';
import { fetchSourceObservationJsonV1 } from './lib/source-observation-http-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- input validation (regex gates; reject before any I/O on the value) ----
const RE = {
  revision: /^sha256:[0-9a-f]{64}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  loopbackUrl: /^http:\/\/127\.0\.0\.1:\d{2,5}$/,
  upstreamChunkId: /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/,
  ruleId: /^[a-z][a-z0-9_]{1,40}$/,
  metaName: /^[A-Z][A-Z0-9_]{0,40}$/,
};

function fail(msg) {
  console.error(`ast-chunk-keyed-map-v1: ${msg}`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
if (files.length === 0) fail('usage: <file> [<file> ...] [--chunk-spans=<json>] [--sidecar=<url>]');
for (const f of files) {
  if (!isValidAstChunkSourcePathV1(f)) fail(`rejected path: ${JSON.stringify(f)}`);
}
const sidecar = opt('sidecar', 'http://127.0.0.1:8095');
if (!RE.loopbackUrl.test(sidecar)) fail(`sidecar must be loopback http://127.0.0.1:<port>: ${sidecar}`);
const chunkSpansPath = opt('chunk-spans', null);
const sourceRootInput = opt('source-root', repoRoot);
const expectedSourceRevision = opt('source-revision', null);
let sourceRoot;
try { sourceRoot = fs.realpathSync(path.resolve(sourceRootInput)); }
catch { fail('source root is unavailable'); }
const repoRootReal = fs.realpathSync(repoRoot);
const sourceRootRelative = path.relative(repoRootReal, sourceRoot);
const snapshotRoot = path.join(repoRootReal, '.tmp', 'workspace-source-snapshots');
const snapshotRevision = path.relative(snapshotRoot, sourceRoot);
if ((sourceRoot !== repoRootReal && !/^[0-9a-f]{64}$/.test(snapshotRevision)) ||
    sourceRootRelative.startsWith('..') || path.isAbsolute(sourceRootRelative)) fail('source root must be the repository root or a materialized workspace snapshot');
if (expectedSourceRevision && !RE.revision.test(expectedSourceRevision)) fail('source revision must be SHA-256 qualified');
if (sourceRoot !== repoRootReal && (!expectedSourceRevision || files.length !== 1)) fail('snapshot input requires one file and an expected source revision');
if (chunkSpansPath && files.length !== 1) fail('--chunk-spans requires exactly one file');

// ---- ast-grep binary: Node cannot spawn the npm .cmd shim by name on Windows ----
const AST_GREP_CANDIDATES = [
  process.env.AST_GREP_BIN,
  path.join(repoRoot, 'sveltekit-frontend', 'node_modules', '@ast-grep', 'cli-win32-x64-msvc', 'ast-grep.exe'),
  path.join(repoRoot, 'sveltekit-frontend', 'node_modules', '@ast-grep', 'cli-linux-x64-gnu', 'ast-grep'),
  'ast-grep',
].filter(Boolean);
const astGrepBin = AST_GREP_CANDIDATES.find((p) => p === 'ast-grep' || fs.existsSync(p));

// ast-grep rule -> native node types it should agree with, and which metavariable names the symbol.
const RULES = [
  { id: 'named_function', pattern: 'function $NAME', meta: 'NAME', agreesWith: ['function_declaration'] },
  { id: 'const_binding', pattern: 'const $NAME = $$$', meta: 'NAME', agreesWith: ['variable_declarator'] },
  { id: 'await_call', pattern: 'await $FN($$$)', meta: 'FN', agreesWith: [] },
];
const PYTHON_RULES = [
  { id: 'function_definition', pattern: 'def $NAME', meta: 'NAME', agreesWith: ['function_definition'] },
  { id: 'assignment', pattern: '$NAME = $$$', meta: 'NAME', agreesWith: [] },
  { id: 'await_call', pattern: 'await $FN($$$)', meta: 'FN', agreesWith: [] },
];
const CPP_RULES = [
  { id: 'napi_module', pattern: 'NAPI_MODULE($MODULE, $INIT)', meta: 'MODULE', agreesWith: [] },
  { id: 'napi_export_registration', pattern: 'registerFn($ENV, $EXPORTS, $NAME, $FN)', meta: 'NAME', agreesWith: [] },
];
const RULES_BY_LANGUAGE = new Map([
  ['typescript', RULES], ['tsx', RULES], ['javascript', RULES], ['python', PYTHON_RULES], ['cpp', CPP_RULES],
]);
const CPP_EXTENSIONS = new Set(['.cc', '.cpp', '.hpp']);

// Language authority: the sidecar's live /capabilities languageBindings (FILE_EXTENSION -> SIDECAR_LANGUAGE).
// No local copy of the map. Loaded once; if it cannot be loaded, the run fails closed before any file is read.
const SIDECAR_LANGUAGE_TO_AST_GREP = new Map([
  ['typescript', 'typescript'], ['tsx', 'tsx'], ['javascript', 'javascript'], ['python', 'python'],
  ['rust', 'rust'], ['go', 'go'], ['java', 'java'], ['svelte', null], // ast-grep cannot parse svelte
]);

async function loadLanguageAuthority(url) {
  const res = await fetch(`${url}/capabilities`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`/capabilities HTTP ${res.status}`);
  const body = await res.json();
  const bindings = Array.isArray(body?.ast?.languageBindings) ? body.ast.languageBindings : null;
  if (!bindings) throw new Error('/capabilities has no ast.languageBindings');
  const map = new Map();
  for (const b of bindings) {
    if (b.fromNamespace !== 'FILE_EXTENSION' || b.toNamespace !== 'SIDECAR_LANGUAGE') continue;
    if (!/^\.[a-z]{1,8}$/.test(b.fromLabel) || !SIDECAR_LANGUAGE_TO_AST_GREP.has(b.toLabel)) {
      throw new Error(`unrecognised binding: ${b.fromLabel} -> ${b.toLabel}`);
    }
    map.set(b.fromLabel, b.toLabel);
  }
  if (map.size === 0) throw new Error('no FILE_EXTENSION bindings in sidecar authority');
  return map;
}

function validateAstByteSpans(body, source, rel, sourceRevision) {
  if (!Array.isArray(body?.chunks)) throw new Error('chunks is not an array');
  if (body.file_path !== rel) throw new Error('sidecar file_path does not match requested path');
  if (body.source_revision !== sourceRevision) throw new Error('sidecar source_revision does not match disk bytes');
  const seen = new Set();
  for (const [index, chunk] of body.chunks.entries()) {
    if (typeof chunk?.upstream_chunk_id !== 'string' || !RE.upstreamChunkId.test(chunk.upstream_chunk_id)) {
      throw new Error(`UPSTREAM_CHUNK_ID_INVALID at chunk ${index}`);
    }
    if (typeof chunk?.node_type !== 'string' || chunk.node_type.length === 0
      || typeof chunk?.kind !== 'string' || chunk.kind.length === 0) {
      throw new Error(`NODE_KIND_INVALID at chunk ${index}`);
    }
    const start = chunk?.start_byte;
    const end = chunk?.end_byte;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      throw new Error(`SPAN_INVALID at chunk ${index}`);
    }
    if (end > source.byteLength) throw new Error(`SPAN_OUT_OF_BOUNDS at chunk ${index}`);
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(source.subarray(start, end));
    } catch {
      throw new Error(`SPAN_NOT_UTF8_BOUNDARY at chunk ${index}`);
    }
    const key = `${chunk.upstream_chunk_id}:${start}:${end}`;
    if (seen.has(key)) throw new Error(`DUPLICATE_UPSTREAM_CHUNK_SPAN at chunk ${index}`);
    seen.add(key);
  }
}

function sha256Json(obj) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex')}`;
}

async function analyzeFile(rel, chunkSpansFile) {
  const stages = [];
  const stage = async (name, fn) => {
    try {
      const out = await fn();
      stages.push({ name, status: 'OK' });
      return out;
    } catch (err) {
      stages.push({ name, status: 'FAILED', error: String(err?.message ?? err).slice(0, 500),
        ...(typeof err?.cause?.code === 'string' ? { causeCode: err.cause.code } : {}),
        ...(err?.observationAttempts ? { transportAttempts: err.observationAttempts } : {}) });
      return null;
    }
  };

  const extension = path.extname(rel).toLowerCase();
  const sidecarLanguage = languageAuthority.get(extension) ?? null;
  const language = sidecarLanguage ?? (CPP_EXTENSIONS.has(extension) ? 'cpp' : null);
  let sourceFilePath;
  const source = await stage('read_source', () => {
    if (!language) throw new Error(`unsupported extension: ${rel}`);
    const abs = path.resolve(sourceRoot, ...rel.split('/'));
    if (!fs.existsSync(abs)) throw new Error(`file not found: ${rel}`);
    sourceFilePath = fs.realpathSync(abs);
    const relative = path.relative(sourceRoot, sourceFilePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`source escapes root: ${rel}`);
    return fs.readFileSync(sourceFilePath);
  });

  if (!source) return { rel, stages, receipt: null, outPath: null };

  const sourceRevision = `sha256:${crypto.createHash('sha256').update(source).digest('hex')}`;
  if (expectedSourceRevision && sourceRevision !== expectedSourceRevision) {
    stages.push({ name: 'source_revision', status: 'FAILED', error: 'source bytes do not match the expected revision' });
    return { rel, stages, receipt: null, outPath: null };
  }

  // ---- native AST via sidecar, schema-checked ----
  let ast = null;
  let astTransportAttempts = [];
  if (sidecarLanguage) {
    ast = await stage('sidecar_ast_chunk', async () => {
      const observation = await fetchSourceObservationJsonV1(`${sidecar}/ast/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source.toString('utf8'), language: sidecarLanguage, filePath: rel, sourceRevision }),
        signal: AbortSignal.timeout(60000),
      });
      astTransportAttempts = observation.attempts;
      const body = observation.body;
      if (body?.schema !== 'atlas.ast.evidence.v1') throw new Error(`unexpected schema: ${body?.schema}`);
      validateAstByteSpans(body, source, rel, sourceRevision);
      return body;
    });
  } else {
    stages.push({ name: 'sidecar_ast_chunk', status: 'SKIPPED', reason: '8095 has no C++ language binding; AST-grep-only diagnostic' });
  }

  const nativeMap = new Map();
  const nativeDuplicates = [];
  const nativeOutOfBounds = [];
  if (ast) {
    for (const c of ast.chunks) {
      if (!Number.isInteger(c.start_byte) || !Number.isInteger(c.end_byte)) { nativeOutOfBounds.push(String(c.upstream_chunk_id)); continue; }
      const key = `${rel}|${c.upstream_chunk_id}|${c.start_byte}-${c.end_byte}`;
      if (c.start_byte < 0 || c.end_byte > source.length || c.start_byte >= c.end_byte) nativeOutOfBounds.push(key);
      if (nativeMap.has(key)) { nativeDuplicates.push(key); continue; }
      nativeMap.set(key, {
        observationKind: 'sidecar_chunk_observation',
        upstreamChunkId: c.upstream_chunk_id,
        nodeType: c.node_type, kind: c.kind, name: c.name ?? null,
        startLine: c.start_line, endLine: c.end_line,
        startByte: c.start_byte, endByte: c.end_byte,
        callCount: (c.calls ?? []).length, importCount: (c.imports ?? []).length,
      });
    }
  }

  // ---- ast-grep patterns (native binary, argv array, no shell, bounded timeout) ----
  const grepMap = new Map();
  const grepStats = {};
  const agreement = { checked: 0, exact: 0, enclosed: 0, disagreed: [] };
  await stage('ast_grep_patterns', () => {
    const astGrepLanguage = sidecarLanguage ? SIDECAR_LANGUAGE_TO_AST_GREP.get(language) : language === 'cpp' ? 'cpp' : null;
    if (astGrepLanguage === null) {
      grepStats.skipped = `ast-grep cannot parse ${language}; tree-sitter path only`;
      return;
    }
    const rules = RULES_BY_LANGUAGE.get(language);
    if (!rules) {
      grepStats.skipped = `no validated ast-grep patterns for ${language}; tree-sitter path only`;
      return;
    }
    if (!astGrepBin) throw new Error('no ast-grep binary found (set AST_GREP_BIN)');
    for (const rule of rules) {
      if (!RE.ruleId.test(rule.id)) throw new Error(`bad rule id: ${rule.id}`);
      if (!RE.metaName.test(rule.meta)) throw new Error(`bad metavariable name: ${rule.meta}`);
      let raw;
      let exitCode = 0;
      let stderr = '';
      try {
        raw = execFileSync(astGrepBin, ['run', '-p', rule.pattern, '-l', astGrepLanguage, '--json=compact', sourceFilePath], {
          encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
        });
      } catch (err) {
        raw = typeof err?.stdout === 'string' ? err.stdout : '';
        stderr = typeof err?.stderr === 'string' ? err.stderr : String(err?.message ?? err);
        exitCode = Number.isInteger(err?.status) ? err.status : -1;
      }
      const matches = parseAstGrepJsonOutputV1({ stdout: raw, stderr, exitCode, ruleId: rule.id });
      grepStats[rule.id] = 0;
      for (const m of matches) {
        const s = m?.range?.byteOffset?.start, e = m?.range?.byteOffset?.end;
        if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > source.length || s >= e) continue;
        const key = `${rel}|${rule.id}|${s}-${e}`;
        if (grepMap.has(key)) continue;
        grepStats[rule.id] += 1;
        const symbol = m.metaVariables?.single?.[rule.meta]?.text ?? null;
        const covering = [...nativeMap.values()].filter((n) => n.startByte <= s && n.endByte >= e);
        const coveringTypes = covering.map((n) => n.nodeType);
        if (rule.agreesWith.length > 0) {
          agreement.checked += 1;
          // EXACT: a native node of the expected type covers the match (same name when the node has one).
          const exact = covering.some((n) => rule.agreesWith.includes(n.nodeType) && (n.name === null || n.name === symbol));
          // ENCLOSED: only an enclosing container covers it. The native chunker segments top-level
          // declarations, so a local binding inside a function is expected to be covered by that function.
          const enclosed = !exact && covering.some((n) => n.nodeType === 'function_declaration' || n.nodeType === 'export_statement');
          if (exact) agreement.exact += 1;
          else if (enclosed) agreement.enclosed += 1;
          else agreement.disagreed.push({ rule: rule.id, symbol, line: m.range.start.line + 1, coveringTypes });
        }
        grepMap.set(key, {
          observationKind: 'ast_grep_match',
          rule: rule.id, symbol,
          text: String(m.text).slice(0, 120),
          startLine: m.range.start.line + 1, endLine: m.range.end.line + 1,
          startByte: s, endByte: e,
          coveredByNative: covering.length > 0,
          coveringNodeTypes: coveringTypes,
        });
      }
    }
  });

  // ---- optional comparison to lineage chunk spans (validated) ----
  let comparison = null;
  if (chunkSpansFile) {
    await stage('lineage_comparison', () => {
      const spans = JSON.parse(fs.readFileSync(path.resolve(chunkSpansFile), 'utf8'));
      if (!Array.isArray(spans)) throw new Error('chunk spans file must be a JSON array');
      comparison = spans.map((s) => {
        if (!RE.uuid.test(String(s.id))) throw new Error(`bad chunk id: ${s.id}`);
        if (!Number.isInteger(s.line_start) || !Number.isInteger(s.line_end) || s.line_start < 1 || s.line_end < s.line_start) throw new Error(`bad span for ${s.id}`);
        const all = [...nativeMap.values()];
        return {
          chunkRowId: s.id,
          lines: [s.line_start, s.line_end],
          nativeNodesFullyInside: all.filter((v) => v.startLine >= s.line_start && v.endLine <= s.line_end).length,
          nativeNodesOverlapping: all.filter((v) => v.startLine <= s.line_end && v.endLine >= s.line_start).length,
          chunkRevision: s.source_revision ?? null,
        };
      });
    });
  }

  const histogram = {};
  for (const v of nativeMap.values()) histogram[v.nodeType] = (histogram[v.nodeType] ?? 0) + 1;

  const body = {
    schema: 'atlas.ast-chunk-keyed-map.v4',
    generated_at: new Date().toISOString(),
    mode: 'READ_ONLY_DIAGNOSTIC',
    canonicalAuthority: false,
    writesPerformed: false,
    source: { path: rel, disk_sha256: sourceRevision, disk_bytes: source.length, language },
    sidecar: ast ? { url: sidecar, engine: ast.engine, engine_version: ast.engine_version, syntax_status: ast.syntax_status ?? null, error_tag: ast.error_tag ?? null, transportAttempts: astTransportAttempts } : null,
    stages,
    counts: {
      nativeChunks: ast ? ast.chunks.length : 0,
      nativeMapEntries: nativeMap.size,
      nativeDuplicates: nativeDuplicates.length,
      nativeOutOfBounds: nativeOutOfBounds.length,
      astGrepMatches: grepMap.size,
      astGrepCoveredByNative: [...grepMap.values()].filter((m) => m.coveredByNative).length,
    },
    astGrepMatchesByRule: grepStats,
    nativeObservations: [...nativeMap.entries()].map(([key, value]) => ({ key, value })),
    astGrepObservations: [...grepMap.entries()].map(([key, value]) => ({ key, value })),
    agreement: {
      checked: agreement.checked,
      exact: agreement.exact,
      enclosed: agreement.enclosed,
      disagreed: agreement.disagreed.length,
      disagreedSample: agreement.disagreed.slice(0, 50),
      note: 'exact = native node of expected type covers the match; enclosed = only an enclosing function/export covers it (native chunker granularity); disagreed = no covering node of a compatible kind',
    },
    nativeNodeTypeHistogram: histogram,
    comparisonToLineageChunks: comparison,
    identityNote: 'nativeObservations are keyed by path|upstream_chunk_id|byteSpan; astGrepObservations are keyed by path|ruleId|byteSpan. Both arrays are diagnostic observations only (canonicalAuthority=false); neither key is parse_node_id, tree_node_id, packet_key, or symbol identity.',
  };
  const receipt = { ...body, receiptChecksum: sha256Json(body) };

  const outDir = path.join(repoRoot, '.tmp', 'atlas');
  fs.mkdirSync(outDir, { recursive: true });
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `ast-chunk-keyed-map-v4-${runStamp}-${path.basename(rel).replace(/[^\w.-]/g, '_')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return { rel, stages, receipt, outPath };
}

const chunkSpansFile = chunkSpansPath;
let languageAuthority;
if (files.some((file) => !CPP_EXTENSIONS.has(path.extname(file).toLowerCase()))) {
  try {
    languageAuthority = await loadLanguageAuthority(sidecar);
  } catch (err) {
    console.error(`ast-chunk-keyed-map-v1: language authority unavailable, refusing to run: ${err.message}`);
    process.exit(1);
  }
} else {
  languageAuthority = new Map();
}
const results = [];
for (const f of files) {
  results.push(await analyzeFile(f, chunkSpansFile));
}

const failed = results.filter((r) => r.stages.some((s) => s.status === 'FAILED'));
const summary = {
  filesRequested: files.length,
  filesFailed: failed.length,
  exitCode: failed.length > 0 ? 1 : 0,
  files: results.map((r) => ({
    path: r.rel,
    source: r.receipt?.source ?? null,
    outPath: r.outPath,
    stageStatus: r.stages.map((s) => `${s.name}:${s.status}`),
    counts: r.receipt?.counts ?? null,
    agreement: r.receipt ? { checked: r.receipt.agreement.checked, exact: r.receipt.agreement.exact, enclosed: r.receipt.agreement.enclosed, disagreed: r.receipt.agreement.disagreed } : null,
    receiptChecksum: r.receipt?.receiptChecksum ?? null,
  })),
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.exitCode);
