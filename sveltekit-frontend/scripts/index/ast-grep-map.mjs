#!/usr/bin/env node
import { commandExists, listFiles, readRel, run, stableHash, writeJson, writeJsonl } from './shared.mjs';
import { spawnSync } from 'node:child_process';

const hasAstGrep = commandExists('ast-grep') || commandExists('sg');
const files = listFiles({ extensions: ['.ts', '.svelte', '.js', '.mjs'], roots: ['src', 'scripts', 'tests'] });
const rows = [];

const patterns = [
  { kind: 'sveltekit_route_handler', re: /export\s+(?:const\s+)?(GET|POST|PUT|PATCH|DELETE)\b/g },
  { kind: 'exported_function', re: /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g },
  { kind: 'exported_const', re: /export\s+const\s+([A-Za-z0-9_]+)/g },
  { kind: 'drizzle_table', re: /\b(?:pgTable|sqliteTable|mysqlTable)\s*\(\s*['\"]([^'\"]+)/g },
  { kind: 'mcp_tool', re: /(?:server\.tool|registerTool|name:\s*['\"])([A-Za-z0-9_.:-]+)/g },
  { kind: 'mock_or_stub', re: /\b(?:vi\.mock|jest\.mock|test\.todo|status:\s*501|status:\s*503)/g },
  { kind: 'cache_call', re: /\b(redis\.(?:get|set|mget|hset|zadd)|getExactMatchCache|setExactMatchCache|BifrostCacheManager\.[A-Za-z0-9_]+)/g },
  { kind: 'vector_call', re: /\b(qdrant|vector\(768\)|cosine|embeddinggemma|embedTexts|searchSemanticCache)\b/gi }
];

const importFallback = [
  {
    kind: 'import_static',
    re: /import\s+(?:type\s+)?(?:[^'\"]+?)\s+from\s+['\"]([^'\"]+)['\"]/g,
    symbol: (match) => match[1]
  },
  {
    kind: 'import_dynamic',
    re: /import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
    symbol: (match) => match[1]
  }
];

function parseEventLines(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) events.push(...parsed);
      else events.push(parsed);
    } catch {
      continue;
    }
  }
  return events;
}

function normalizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '';
  return rawPath.split('\\\\').join('/');
}

function parseAstLine(file, text, fallbackIndex = 0) {
  if (!text) return fallbackIndex + 1;
  const source = readRel(file);
  const idx = source.indexOf(text);
  if (idx < 0) return fallbackIndex + 1;
  return source.slice(0, idx).split(/\r?\n/).length;
}

function pushRow({ file, kind, symbol, line, parser, text }) {
  if (!file || !kind || !symbol) return;
  const language = file.endsWith('.svelte') ? 'svelte' : file.split('.').pop();
  rows.push({
    file,
    kind,
    language,
    line,
    parser,
    stable_id: stableHash(file + ':' + kind + ':' + symbol + ':' + line),
    symbol,
    text: text ? String(text).slice(0, 300) : undefined
  });
}

function runAstImportScan() {
  const runAstTool = (command, args) => spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === 'win32'
  });

  const candidates = [
    {
      command: 'ast-grep',
      args: ['run', '--pattern', 'import $X from $SRC', '--json=stream', 'src', 'scripts', 'tests'],
      kind: 'import_static'
    },
    {
      command: 'ast-grep',
      args: ['run', '--pattern', "import($SRC)", '--json=stream', 'src', 'scripts', 'tests'],
      kind: 'import_dynamic'
    },
    {
      command: 'sg',
      args: ['run', '--pattern', 'import $X from $SRC', '--json=stream', 'src', 'scripts', 'tests'],
      kind: 'import_static'
    },
    {
      command: 'sg',
      args: ['run', '--pattern', "import($SRC)", '--json=stream', 'src', 'scripts', 'tests'],
      kind: 'import_dynamic'
    }
  ];

  const seen = new Set();
  let collected = 0;
  const diagnostics = [];

  for (const candidate of candidates) {
    if (!commandExists(candidate.command)) continue;
    const result = runAstTool(candidate.command, candidate.args);
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    if (!stdout.trim()) {
      diagnostics.push({ command: candidate.command, kind: candidate.kind, status: result.status, stdout_len: 0, stderr_len: (result.stderr || '').length, events: 0, rows: 0, error: result.error?.message || null });
      continue;
    }
    const events = parseEventLines(stdout);
    if (!events.length) {
      diagnostics.push({ command: candidate.command, kind: candidate.kind, status: result.status, stdout_len: stdout.length, stderr_len: (result.stderr || '').length, events: 0, rows: 0, error: result.error?.message || null });
      continue;
    }
    let rowsForCandidate = 0;
    let srcCapturePresent = 0;
    let symbolAfterTrim = 0;
    let symbolAfterRegex = 0;
    for (const event of events) {
      const file = normalizePath(
        event?.file
        || event?.path
        || event?.source
        || event?.data?.path?.text
      );
      const text = typeof event?.text === 'string'
        ? event.text
        : (typeof event?.lines === 'string' ? event.lines : (event?.data?.lines?.text || ''));
      const captures = event?.metaVariables?.single || event?.meta_variables?.single || {};
      const captureEntries = Object.entries(captures).map(([key, value]) => {
        const resolved = typeof value === 'string'
          ? value
          : (value?.text || value?.value || '');
        return { key, resolved: String(resolved || '') };
      });
      const srcLikeCapture = captureEntries.find((entry) => /^src$/i.test(entry.key) && entry.resolved.trim());
      const fallbackCapture = captureEntries.find((entry) => entry.key !== 'X' && entry.resolved.trim())
        || captureEntries.find((entry) => /['"]/g.test(entry.resolved) || /\$lib|\.|\//.test(entry.resolved));
      const srcCapture = srcLikeCapture?.resolved || captures?.SRC?.text || captures?.SRC?.value || fallbackCapture?.resolved || '';
      if (srcCapture) srcCapturePresent += 1;
      let symbol = String(srcCapture).replace(/^['\"]|['\"]$/g, '').trim();
      if (symbol) symbolAfterTrim += 1;
      if (!symbol && candidate.kind === 'import_static') {
        const match = String(text).match(/from\s+(['\"][^'\"]+['\"])/);
        symbol = match?.[1] ? String(match[1]).replace(/^['\"]|['\"]$/g, '').trim() : '';
        if (symbol) symbolAfterRegex += 1;
      }
      if (!symbol && candidate.kind === 'import_dynamic') {
        const match = String(text).match(/import\s*\(\s*(['\"][^'\"]+['\"])/);
        symbol = match?.[1] ? String(match[1]).replace(/^['\"]|['\"]$/g, '').trim() : '';
        if (symbol) symbolAfterRegex += 1;
      }
      const line = Number(event?.range?.start?.line ?? event?.start?.line ?? event?.line ?? 0) || parseAstLine(file, text, 0);
      if (!file || !symbol) continue;
      const id = `${candidate.kind}:${file}:${line}:${symbol}`;
      if (seen.has(id)) continue;
      seen.add(id);
      pushRow({ file, kind: candidate.kind, symbol, line, parser: 'ast-grep', text });
      collected += 1;
      rowsForCandidate += 1;
    }
    diagnostics.push({ command: candidate.command, kind: candidate.kind, status: result.status, stdout_len: stdout.length, stderr_len: (result.stderr || '').length, events: events.length, src_capture_present: srcCapturePresent, symbol_after_trim: symbolAfterTrim, symbol_after_regex: symbolAfterRegex, rows: rowsForCandidate, error: result.error?.message || null });
  }

  return { collected, diagnostics };
}

for (const file of files) {
  const text = readRel(file);
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.re)) {
      const symbol = match[1] || match[0];
      const line = text.slice(0, match.index || 0).split(/\r?\n/).length;
      pushRow({
        file,
        kind: pattern.kind,
        symbol,
        line,
        parser: hasAstGrep ? 'ast-grep+regex' : 'regex-fallback'
      });
    }
  }
}

const astImportResult = hasAstGrep ? runAstImportScan() : { collected: 0, diagnostics: [] };
const astImportCount = astImportResult.collected;
const astStaticRows = rows.filter((row) => row.parser === 'ast-grep' && row.kind === 'import_static').length;

if (astStaticRows === 0) {
  for (const file of files) {
    const text = readRel(file);
    for (const match of text.matchAll(/import\s+(?:type\s+)?(?:[^'\"]+?)\s+from\s+['\"]([^'\"]+)['\"]/g)) {
      const symbol = match[1];
      const line = text.slice(0, match.index || 0).split(/\r?\n/).length;
      pushRow({ file, kind: 'import_static', symbol, line, parser: 'regex-static-fallback', text: match[0] });
    }
  }
}

if (astImportCount === 0) {
  for (const file of files) {
    const text = readRel(file);
    for (const pattern of importFallback) {
      for (const match of text.matchAll(pattern.re)) {
        const symbol = pattern.symbol(match);
        const line = text.slice(0, match.index || 0).split(/\r?\n/).length;
        pushRow({ file, kind: pattern.kind, symbol, line, parser: 'regex-import-fallback', text: match[0] });
      }
    }
  }
}

const out = writeJsonl('symbols.jsonl', rows);
const lane = hasAstGrep && astImportCount > 0 ? 'ast-grep+regex' : (hasAstGrep ? 'regex-import-fallback' : 'regex-fallback');
writeJson('ast-summary.json', {
  artifact: out,
  ast_grep_available: hasAstGrep,
  ast_import_rows: astImportCount,
  ast_import_diagnostics: astImportResult.diagnostics,
  count: rows.length,
  generated_by: 'scripts/index/ast-grep-map.mjs',
  lane
});
console.log(JSON.stringify({ ok: true, lane, ast_import_rows: astImportCount, count: rows.length, artifact: out }, null, 2));
