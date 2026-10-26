// Read-only, diagnostic: cross-checks rune spans from svelte-dom-splitter-v1 against ast-grep (tree-sitter)
// run over the same script contents. Two independent parsers must agree on every rune call.
// Never writes to Postgres, Valkey, Qdrant or Neo4j. Receipts go to .tmp/atlas/ (gitignored).
// Usage: node scripts/atlas/svelte-rune-crosscheck-v1.mjs <repo-relative .svelte file> [...]
import { svelteReceiptFileNameV1, receiptMismatchReasonV1 } from './lib/svelte-receipt-name-v1.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveSvelteSourceFileV1 } from './lib/resolve-svelte-source-file-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNES = ['$props', '$state', '$derived', '$effect'];
const AST_GREP_BIN = [
  process.env.AST_GREP_BIN,
  path.join(repoRoot, 'sveltekit-frontend', 'node_modules', '@ast-grep', 'cli-win32-x64-msvc', 'ast-grep.exe'),
  'ast-grep',
].filter(Boolean).find((p) => p === 'ast-grep' || fs.existsSync(p));

const files = process.argv.slice(2);
const runId = new Date().toISOString().replace(/[:.]/g, '-');
if (files.length === 0) { console.error('usage: svelte-rune-crosscheck-v1.mjs <file.svelte> [...]'); process.exit(2); }

// Byte offset of the first script's contents (after the opening tag's '>') and its end (before '</script>').
function scriptContents(bytes) {
  const src = bytes.toString('utf8');
  const open = /<script\b[^>]*>/.exec(src);
  if (!open) return null;
  const contentChar = open.index + open[0].length;
  const closeChar = src.indexOf('</script>', contentChar);
  if (closeChar < 0) throw new Error('unclosed <script>');
  const contentByte = Buffer.byteLength(src.slice(0, contentChar), 'utf8');
  return { contentByte, text: src.slice(contentChar, closeChar) };
}

function astGrepRuneCalls(tmpFile) {
  const found = [];
  // Four call forms per base rune: plain, generic (TS instantiation), .raw and .by member calls.
  const forms = RUNES.flatMap((base) => {
    const b = base.replace('$', '_');
    return [`${b}($$$)`, `${b}<$$$>($$$)`, `${b}.raw($$$)`, `${b}.by($$$)`].map((p) => ({ rune: base, pattern: p }));
  });
  for (const { rune, pattern } of forms) {
    // ast-grep reads "$name" as a metavariable, so the literal rune name must not contain "$".
    // The temp copy swaps every "$" for "_" (one byte for one byte), so offsets are unchanged.
    let raw;
    try {
      raw = execFileSync(AST_GREP_BIN, ['run', '-p', pattern, '-l', 'typescript', '--json=compact', tmpFile], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    } catch (err) {
      // ast-grep can exit non-zero while still writing a valid JSON array on stdout. Use that array only if it parses.
      raw = typeof err.stdout === 'string' ? err.stdout : '';
      try { JSON.parse(raw || '[]'); } catch { throw new Error(`ast-grep ${rune} failed: ${String(err.stderr || err.message).slice(0, 200)}`); }
    }
    const matches = JSON.parse(raw || '[]');
    if (!Array.isArray(matches)) throw new Error(`ast-grep ${rune} returned a non-array`);
    for (const m of matches) {
      const s = m.range.byteOffset.start, e = m.range.byteOffset.end;
      found.push({ rune, s, e });
    }
  }
  return found;
}

function analyze(rel) {
  const stages = [];
  const stage = (name, fn) => {
    try { const v = fn(); stages.push({ name, status: 'OK' }); return v; }
    catch (err) { stages.push({ name, status: 'FAILED', error: String(err?.message ?? err).slice(0, 300) }); return null; }
  };
  let sourcePath;
  try { sourcePath = resolveSvelteSourceFileV1(repoRoot, rel).absolutePath; }
  catch (err) { return { rel, rejected: true, stages: [{ name: 'resolve_source_path', status: 'REJECTED', error: String(err?.message ?? err) }], receipt: null, outPath: null }; }
  const bytes = fs.readFileSync(sourcePath);
  const sourceRevision = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  const sourceKey = crypto.createHash('sha256').update(rel).digest('hex').slice(0, 12);
  const splitPath = path.join(repoRoot, '.tmp', 'atlas', svelteReceiptFileNameV1(rel));
  const split = stage('load_splitter_receipt', () => {
    const r = JSON.parse(fs.readFileSync(splitPath, 'utf8'));
    const mismatch = receiptMismatchReasonV1(r, rel, sourceRevision);
    if (mismatch) throw new Error(`${mismatch}: splitter receipt does not belong to this path and bytes; rerun the splitter`);
    return r;
  });
  const contents = stage('extract_script', () => scriptContents(bytes));
  let grepCalls = null;
  if (contents) {
    const tmp = path.join(repoRoot, '.tmp', 'atlas', `rune-crosscheck-${runId}-${sourceKey}-${path.basename(rel)}.ts`);
    stage('write_contents', () => fs.writeFileSync(tmp, contents.text.replace(/\$/g, '_'), 'utf8'));
    grepCalls = stage('ast_grep_runes', () => astGrepRuneCalls(tmp).map((c) => ({ ...c, s: c.s + contents.contentByte, e: c.e + contents.contentByte })));
  }
  const splitRunes = split ? split.runes.filter((r) => r.rune !== undefined) : [];
  const comparison = stage('compare', () => {
    const mismatches = [];
    // Compare on the base rune name ("$state.raw" -> "$state"). A single rune statement may contain
    // at most one call of that base name.
    const base = (name) => name.split('.')[0];
    // Every svelte-splitter rune must contain exactly one ast-grep rune call of the same base name.
    for (const r of splitRunes) {
      const inside = (grepCalls ?? []).filter((c) => base(c.rune) === base(r.rune) && c.s >= r.byteStart && c.e <= r.byteEnd);
      const unique = new Set(inside.map((c) => `${c.s}-${c.e}`));
      if (unique.size !== 1) mismatches.push({ side: 'splitter', rune: r.rune, span: [r.byteStart, r.byteEnd], ast_grep_inside: unique.size });
    }
    // Every ast-grep rune call must fall inside exactly one splitter rune span.
    for (const c of grepCalls ?? []) {
      const owners = splitRunes.filter((r) => base(r.rune) === base(c.rune) && c.s >= r.byteStart && c.e <= r.byteEnd);
      if (owners.length !== 1) mismatches.push({ side: 'ast_grep', rune: c.rune, span: [c.s, c.e], splitter_owners: owners.length });
    }
    return { splitterRunes: splitRunes.length, astGrepRuneCalls: (grepCalls ?? []).length, mismatches };
  });
  // Markup check (second scanner = offset-preserving regex over raw markup vs svelte/compiler modern AST fragment nodes).
  // Both counts and exact UTF-8 byte-span containment for elements and event handlers must agree.
  const markupCheck = stage('markup_regex_check', () => {
    const src = bytes.toString('utf8');
    const toByte = (charIdx) => Buffer.byteLength(src.slice(0, charIdx), 'utf8');
    const markup = src
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => ' '.repeat(m.length))
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => ' '.repeat(m.length))
      .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));

    const elementSpans = [];
    const elRe = /<([A-Za-z][\w.:-]*)\b/g;
    let m;
    while ((m = elRe.exec(markup)) !== null) {
      if (/^<svelte:/.test(m[0])) continue;
      elementSpans.push({ tag: m[1], byteStart: toByte(m.index), byteEnd: toByte(m.index + m[0].length) });
    }

    const handlerSpans = [];
    const hRe = /\b(on:[a-zA-Z]+(?:\|[a-zA-Z]+)*|on[a-z]+)(?=\s*=\s*[\{"'])/g;
    while ((m = hRe.exec(markup)) !== null) {
      handlerSpans.push({ attr: m[1], byteStart: toByte(m.index), byteEnd: toByte(m.index + m[1].length) });
    }

    const splitElementNodes = split ? split.nodes.filter((n) => n.kind === 'RegularElement' || n.kind === 'Component' || n.kind === 'TitleElement') : [];
    const splitHandlerNodes = split ? split.eventHandlers : [];

    const spanMismatches = [];
    for (const el of elementSpans) {
      const owners = splitElementNodes.filter((n) => n.name === el.tag && n.byteStart <= el.byteStart && n.byteEnd >= el.byteEnd);
      if (owners.length === 0) spanMismatches.push({ kind: 'element_unmatched_in_splitter', tag: el.tag, span: [el.byteStart, el.byteEnd] });
    }
    for (const h of handlerSpans) {
      const owners = splitHandlerNodes.filter((sh) => sh.byteStart <= h.byteStart && sh.byteEnd >= h.byteEnd);
      if (owners.length === 0) spanMismatches.push({ kind: 'handler_unmatched_in_splitter', attr: h.attr, span: [h.byteStart, h.byteEnd] });
    }
    for (const sh of splitHandlerNodes) {
      const inside = handlerSpans.filter((h) => h.byteStart >= sh.byteStart && h.byteEnd <= sh.byteEnd);
      if (inside.length === 0) spanMismatches.push({ kind: 'splitter_handler_unmatched_in_scanner', event: sh.event, span: [sh.byteStart, sh.byteEnd] });
    }

    const regexElements = elementSpans.length;
    const splitterElements = split ? splitElementNodes.length : null;
    const regexHandlers = handlerSpans.length;
    const splitterHandlers = split ? splitHandlerNodes.length : null;
    return {
      method: 'regex_span_and_count_crosscheck',
      independentSyntaxParser: false,
      qualification: 'SPAN_CONTAINMENT_PROVEN',
      regexElements,
      splitterElements,
      regexHandlers,
      splitterHandlers,
      spanMismatchesCount: spanMismatches.length,
      spanMismatches,
      match: regexElements === splitterElements && regexHandlers === splitterHandlers && spanMismatches.length === 0,
    };
  });
  if (markupCheck && !markupCheck.match) {
    (comparison ? comparison.mismatches : []).push({ side: 'markup', ...markupCheck });
  }
  const receipt = {
    schema: 'atlas.svelte-rune-crosscheck.v2',
    generated_at: new Date().toISOString(),
    mode: 'DIAGNOSTIC_SCRATCH_WRITE',
    canonicalAuthority: false,
    writesPerformed: true,
    canonicalDatastoreWritesPerformed: false,
    writeEffects: [
      'writes normalized temporary TypeScript files under .tmp/atlas/',
      'writes diagnostic receipt files under .tmp/atlas/',
    ],
    source: { path: rel, disk_sha256: sourceRevision },
    parsers: { splitter: 'svelte/compiler parse(modern)', crosscheck: 'ast-grep (tree-sitter), typescript grammar over script contents' },
    stages,
    counts: comparison ? { splitterRunes: comparison.splitterRunes, astGrepRuneCalls: comparison.astGrepRuneCalls, mismatches: comparison.mismatches.length } : null,
    mismatches: comparison ? comparison.mismatches : [],
    markupCheck,
  };
  receipt.receiptChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
  const outPath = path.join(repoRoot, '.tmp', 'atlas', `svelte-rune-crosscheck-v2-${runId}-${sourceKey}-${path.basename(rel)}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return { rel, stages, receipt, outPath };
}

const results = files.map(analyze);
const failed = results.filter((r) => !r.rejected && (r.stages.some((s) => s.status === 'FAILED') || (r.receipt?.mismatches.length > 0)));
const rejected = results.filter((r) => r.rejected).length;
const summary = {
  filesRequested: files.length,
  filesProcessed: results.filter((r) => r.receipt !== null).length,
  filesFailed: failed.length,
  filesRejected: rejected,
  filesSkipped: 0,
  exitCode: failed.length || rejected ? 1 : 0,
  files: results.map((r) => ({ path: r.rel, rejected: r.rejected ?? false, counts: r.receipt?.counts ?? null, stageStatus: r.stages.map((s) => `${s.name}:${s.status}`), outPath: r.outPath })),
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.exitCode);
