#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(SCRIPT_DIR, '..');
const OUT_JSON = join(ROOT, 'docs', 'documents-atlas-index.json');
const OUT_MD = join(ROOT, 'docs', 'documents-atlas-index.md');
const OUT_INDEX_DIR = join(ROOT, 'memory', 'index');

const INCLUDE_DIRS = ['', 'docs', 'llm', 'documents', 'scripts'];
const EXCLUDED_DIRS = new Set([
  '.git',
  '.cache',
  '.tmp',
  '.tmp-audit',
  'node_modules',
  '.svelte-kit',
  '.venv',
  '.venv_turbovec',
  '.vs',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.idea',
  '.vscode-test',
  'coverage',
  'archives',
  'archive',
  'deeds_labs',
]);

const KEYWORD_VOCAB = [
  'pgvector',
  'simd',
  'drizzle',
  'svelte',
  'mcp',
  'cuda',
  'bifrost',
  'qdrant',
  'neo4j',
  'redis',
  'postgres',
  'rabbitmq',
  'duckdb',
  'kag',
  'ace',
  'hmm',
  'turbovec',
];

const PROTOCOL_RULES = [
  { name: 'http', re: /fetch\(|RequestHandler|\bResponse\b|\bHTTP\b/i },
  { name: 'http2', re: /http2/i },
  { name: 'http3', re: /http3|quic/i },
  { name: 'sse', re: /text\/event-stream|EventSource/i },
  { name: 'websocket', re: /WebSocket|ws:\/\//i },
  { name: 'grpc', re: /\bgrpc\b|protobuf|proto/i },
  { name: 'mcp', re: /\/mcp|tools\/list|tools\/call|Model Context Protocol/i },
  { name: 'stdio', re: /process\.stdin|process\.stdout|\bstdio\b/i },
  { name: 'docker', re: /docker|docker-compose/i },
  { name: 'rabbitmq', re: /amqp|rabbitmq/i },
  { name: 'redis', re: /\bredis\b|redis-cli/i },
  { name: 'qdrant', re: /\bqdrant\b|collections/i },
  { name: 'postgres', re: /postgres|drizzle|pgTable|\bsql\b/i },
  { name: 'neo4j', re: /neo4j|Cypher|bolt:\/\//i },
];

function isCandidateFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return ext === '.md' || ext === '.txt';
}

function walkFiles(startAbsPath, collector) {
  if (!existsSync(startAbsPath)) return;
  const stat = statSync(startAbsPath);
  if (stat.isFile()) {
    if (isCandidateFile(startAbsPath)) collector.push(startAbsPath);
    return;
  }

  const entries = readdirSync(startAbsPath, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(startAbsPath, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walkFiles(abs, collector);
      continue;
    }
    if (entry.isFile() && isCandidateFile(abs)) collector.push(abs);
  }
}

function stableKeyForPath(relPath) {
  return createHash('sha1').update(relPath).digest('hex').slice(0, 16);
}

function detectProgrammingLanguage(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.txt')) return 'unknown';
  return 'unknown';
}

function detectRouteKind(relPath) {
  if (relPath.includes('/src/routes/')) {
    if (relPath.endsWith('+server.ts') || relPath.endsWith('+server.js')) return 'api-route';
    return 'sveltekit-route';
  }
  if (relPath.includes('/scripts/')) return 'script';
  if (relPath.includes('/tests/')) return 'test';
  return 'doc';
}

function guessCategory(relPath, contentLower) {
  const p = relPath.toLowerCase();
  if (p.includes('audit') || /\baudit\b/.test(contentLower)) return 'audit-report';
  if (p.includes('checklist') || /\bchecklist\b/.test(contentLower)) return 'checklist';
  if (p.includes('policy') || /\bpolicy\b/.test(contentLower)) return 'policy';
  if (p.includes('session') || /\bsession\b/.test(contentLower)) return 'session-log';
  if (p.includes('guide') || /\bguide\b/.test(contentLower)) return 'reference-guide';
  if (p.includes('design') || /\barchitecture\b|\bdesign\b/.test(contentLower)) return 'design-doc';
  return 'reference-guide';
}

function extractHeadings(lines) {
  const out = [];
  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line.trim());
    if (!m) continue;
    out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}

function extractTitle(lines, headings) {
  if (headings.length > 0) {
    const h1 = headings.find((h) => h.level === 1);
    if (h1) return h1.text;
  }
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    return t.replace(/^#\s*/, '').slice(0, 160);
  }
  return 'Untitled Document';
}

function extractSummary(text, headings) {
  const normalized = text.replace(/\r\n/g, '\n');
  const firstParagraph = normalized
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.length > 0 && !chunk.startsWith('#'));
  const headingPreview = headings.slice(0, 4).map((h) => h.text).join(' | ');
  const base = firstParagraph || headingPreview || normalized.slice(0, 250);
  return base.slice(0, 250);
}

function detectKeywords(textLower) {
  return KEYWORD_VOCAB.filter((term) => textLower.includes(term));
}

function detectProtocols(text) {
  const found = [];
  for (const rule of PROTOCOL_RULES) {
    if (rule.re.test(text)) found.push(rule.name);
  }
  return found;
}

function detectCacheSignals(text) {
  const redisKeyMatches = [...text.matchAll(/([a-z0-9_:-]*redis[a-z0-9_:-]*)/gi)].map((m) => m[1]);
  const qdrantMatches = [...text.matchAll(/\b([a-z0-9_:-]*qdrant[a-z0-9_:-]*)\b/gi)].map((m) => m[1]);
  const postgresMatches = [...text.matchAll(/\b(pgTable|postgres|drizzle|sql)\b/gi)].map((m) => m[1]);
  const duckdbMatches = [...text.matchAll(/\bduckdb\b/gi)].map((m) => m[0]);
  const aceMatches = [...text.matchAll(/\bace:[a-z0-9:_-]+\b/gi)].map((m) => m[0]);

  const uniq = (arr) => Array.from(new Set(arr)).slice(0, 24);

  return {
    redisKeys: uniq(redisKeyMatches),
    qdrantCollections: uniq(qdrantMatches),
    postgresTables: uniq(postgresMatches),
    duckdbInputs: uniq(duckdbMatches),
    acePacketKeys: uniq(aceMatches),
  };
}

function detectRecommendation(category, summaryLower) {
  if (summaryLower.includes('todo') || summaryLower.includes('placeholder') || summaryLower.includes('stub')) {
    return { productionStatus: 'stub', nextAction: 'Fill TODO sections and verify with smoke tests.', priority: 'P1' };
  }
  if (category === 'audit-report') {
    return { productionStatus: 'ready', nextAction: 'Use findings in deterministic retrieval ranking.', priority: 'P1' };
  }
  if (category === 'session-log') {
    return { productionStatus: 'degraded', nextAction: 'Use as context fallback only, not canonical source.', priority: 'P2' };
  }
  return { productionStatus: 'ready', nextAction: 'Index for deterministic sourceRef recall.', priority: 'P2' };
}

function toSourceRef(relPath) {
  return relPath.replaceAll('\\', '/');
}

function buildAtlas() {
  const files = [];
  for (const include of INCLUDE_DIRS) {
    walkFiles(join(ROOT, include), files);
  }

  const uniqueFiles = Array.from(new Set(files.map((p) => resolve(p))));
  const entries = [];
  const inverted = new Map();
  const categoryCounts = new Map();
  let totalBytes = 0;

  const addInverted = (term, sourceRef) => {
    const key = term.toLowerCase();
    if (!inverted.has(key)) inverted.set(key, new Set());
    inverted.get(key).add(sourceRef);
  };

  for (const absPath of uniqueFiles) {
    const relPathRaw = relative(ROOT, absPath);
    if (!relPathRaw || relPathRaw.startsWith('..')) continue;

    const relPath = relPathRaw.replaceAll('\\', '/');
    const sourceRef = toSourceRef(relPath);
    const stat = statSync(absPath);
    const text = readFileSync(absPath, 'utf8');
    const lines = text.split(/\r?\n/);
    const headings = extractHeadings(lines);
    const title = extractTitle(lines, headings);
    const summary = extractSummary(text, headings);

    const lowerText = text.toLowerCase();
    const category = guessCategory(relPath, lowerText);
    const labels = detectKeywords(lowerText);
    const protocolDetected = detectProtocols(text);
    const recommendation = detectRecommendation(category, summary.toLowerCase());
    const language = detectProgrammingLanguage(relPath);
    const routeKind = detectRouteKind(`/${relPath}`);

    totalBytes += stat.size;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);

    const entry = {
      path: relPath,
      stableKey: stableKeyForPath(relPath),
      sourceRef,
      title,
      summary,
      category,
      headings,
      labels,
      featureFamily: category,
      programmingLanguage: language,
      protocolDetected,
      routeKind,
      svelteKitRoute: undefined,
      nestedRouteDepth: undefined,
      owningLibrary: undefined,
      exportedSymbols: [],
      importedSymbols: [],
      astRelations: [],
      cacheSignals: detectCacheSignals(text),
      recommendation,
      metadata: {
        sizeBytes: stat.size,
        lineCount: lines.length,
        lastModified: new Date(stat.mtimeMs).toISOString(),
      },
    };

    entries.push(entry);

    addInverted(category, sourceRef);
    addInverted(language, sourceRef);
    for (const h of headings) {
      const terms = h.text.toLowerCase().split(/[^a-z0-9_:-]+/).filter(Boolean);
      for (const term of terms.slice(0, 12)) addInverted(term, sourceRef);
    }
    for (const term of labels) addInverted(term, sourceRef);
    for (const term of protocolDetected) addInverted(term, sourceRef);
    const titleTerms = title.toLowerCase().split(/[^a-z0-9_:-]+/).filter(Boolean);
    for (const term of titleTerms.slice(0, 12)) addInverted(term, sourceRef);
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const invertedIndex = {};
  for (const [term, refs] of inverted.entries()) {
    invertedIndex[term] = Array.from(refs).sort();
  }

  const categoryBreakdown = Object.fromEntries(
    Array.from(categoryCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: ROOT.replaceAll('\\', '/'),
    totals: {
      filesScanned: entries.length,
      totalBytes,
      categoryBreakdown,
    },
    entries,
    invertedIndex,
  };
}

function renderMarkdown(index) {
  const lines = [];
  lines.push('# Documents Atlas Index');
  lines.push('');
  lines.push(`Generated: ${index.generatedAt}`);
  lines.push(`Files scanned: ${index.totals.filesScanned}`);
  lines.push(`Total bytes: ${index.totals.totalBytes}`);
  lines.push('');
  lines.push('## Category Breakdown');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|---|---:|');
  for (const [category, count] of Object.entries(index.totals.categoryBreakdown)) {
    lines.push(`| ${category} | ${count} |`);
  }
  lines.push('');
  lines.push('## Document Catalog');
  lines.push('');
  lines.push('| Path | Category | Language | Labels | Summary |');
  lines.push('|---|---|---|---|---|');
  for (const entry of index.entries) {
    const labels = entry.labels.join(', ');
    const summary = entry.summary.replace(/\|/g, '\\|');
    lines.push(`| ${entry.path} | ${entry.category} | ${entry.programmingLanguage} | ${labels} | ${summary} |`);
  }
  lines.push('');
  lines.push('## Inverted Index Terms (Top 120)');
  lines.push('');
  const terms = Object.keys(index.invertedIndex).sort().slice(0, 120);
  for (const term of terms) {
    const refs = index.invertedIndex[term].slice(0, 8).join(', ');
    lines.push(`- **${term}**: ${refs}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeJsonlOutputs(index) {
  mkdirSync(OUT_INDEX_DIR, { recursive: true });

  const astRelationsPath = join(OUT_INDEX_DIR, 'ast-relations.jsonl');
  const protocolPath = join(OUT_INDEX_DIR, 'protocol-detections.jsonl');
  const routePath = join(OUT_INDEX_DIR, 'route-service-relations.jsonl');

  const astRows = [];
  const protocolRows = [];
  const routeRows = [];

  for (const entry of index.entries) {
    for (const rel of entry.astRelations) {
      astRows.push(JSON.stringify({
        path: entry.path,
        stableKey: entry.stableKey,
        ...rel,
      }));
    }

    protocolRows.push(JSON.stringify({
      path: entry.path,
      stableKey: entry.stableKey,
      programmingLanguage: entry.programmingLanguage,
      protocolDetected: entry.protocolDetected,
      labels: entry.labels,
    }));

    routeRows.push(JSON.stringify({
      path: entry.path,
      stableKey: entry.stableKey,
      routeKind: entry.routeKind,
      svelteKitRoute: entry.svelteKitRoute ?? null,
      nestedRouteDepth: entry.nestedRouteDepth ?? null,
      owningLibrary: entry.owningLibrary ?? null,
    }));
  }

  writeFileSync(astRelationsPath, `${astRows.join('\n')}\n`);
  writeFileSync(protocolPath, `${protocolRows.join('\n')}\n`);
  writeFileSync(routePath, `${routeRows.join('\n')}\n`);
}

function main() {
  const index = buildAtlas();

  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(OUT_MD, renderMarkdown(index));
  writeJsonlOutputs(index);

  console.log('[documents-atlas] Build complete');
  console.log(`[documents-atlas] filesScanned=${index.totals.filesScanned}`);
  console.log(`[documents-atlas] totalBytes=${index.totals.totalBytes}`);
  console.log(`[documents-atlas] categoryBreakdown=${JSON.stringify(index.totals.categoryBreakdown)}`);
  console.log(`[documents-atlas] json=${relative(ROOT, OUT_JSON).replaceAll('\\', '/')}`);
  console.log(`[documents-atlas] md=${relative(ROOT, OUT_MD).replaceAll('\\', '/')}`);
}

main();
