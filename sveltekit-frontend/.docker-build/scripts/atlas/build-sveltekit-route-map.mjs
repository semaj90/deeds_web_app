#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const ROUTES_DIR = resolve(ROOT, 'src/routes');
const TESTS_DIR = resolve(ROOT, 'tests');
const OUT_JSON = resolve(ROOT, 'docs/graph/sveltekit-route-map.json');
const OUT_MD = resolve(ROOT, 'docs/graph/sveltekit-route-map.md');

const SURFACE_FILES = new Map([
  ['+page.svelte', 'pageSvelte'],
  ['+page.ts', 'pageTs'],
  ['+page.js', 'pageJs'],
  ['+page.server.ts', 'pageServerTs'],
  ['+page.server.js', 'pageServerJs'],
  ['+layout.svelte', 'layoutSvelte'],
  ['+layout.ts', 'layoutTs'],
  ['+layout.js', 'layoutJs'],
  ['+layout.server.ts', 'layoutServerTs'],
  ['+layout.server.js', 'layoutServerJs'],
  ['+server.ts', 'serverTs'],
  ['+server.js', 'serverJs'],
  ['+error.svelte', 'errorSvelte'],
  ['+error.ts', 'errorTs'],
  ['+error.js', 'errorJs'],
]);

const SERVICE_PATTERNS = [
  ['HyperRagFusionService', /HyperRagFusionService/],
  ['bifrostChat', /\bbifrostChat\b/],
  ['generateSingleEmbedding', /\bgenerateSingleEmbedding\b/],
  ['SummaryLensesService', /\bSummaryLensesService\b/],
  ['loadAceContextPlannerHit', /\bloadAceContextPlannerHit\b/],
  ['buildAceContextPlannerState', /\bbuildAceContextPlannerState\b/],
  ['getTopAuthorityNodes', /\bgetTopAuthorityNodes\b/],
  ['getImpactNeighborhood', /\bgetImpactNeighborhood\b/],
  ['MultiQueryGenerator', /\bMultiQueryGenerator\b/],
];

const PAIRED_TESTS = [
  ...collectFiles(TESTS_DIR, (name) => /\.(test|spec)\.(ts|js|mjs|cjs)$/.test(name)),
  ...collectFiles(resolve(ROOT, 'src'), (name) => /\.(test|spec)\.(ts|js|mjs|cjs)$/.test(name)),
];

const DATASTORE_PATTERNS = [
  ['Qdrant', /\bqdrant\b|codebase_chunks_768|glyph_atlas/i],
  ['Neo4j', /\bneo4j\b|getTopAuthorityNodes|getImpactNeighborhood/i],
  ['Redis', /\bgetRedis\b|\bredis\b/i],
  ['TurboVec', /\bturbovec\b/i],
  ['ACE', /loadAceContextPlannerHit|buildAceContextPlannerState|ACE/i],
];

function isSurfaceFile(name) {
  return SURFACE_FILES.has(name);
}

function collectFiles(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, predicate));
      continue;
    }
    if (!predicate(entry.name, full)) continue;
    out.push(full);
  }
  return out;
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function toPosix(p) {
  return p.split(sep).join('/');
}

function routePathFromDir(routeDir) {
  const rel = relative(ROUTES_DIR, routeDir);
  if (!rel || rel === '.') return '/';
  const parts = rel.split(sep).filter(Boolean).filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
  return '/' + parts.join('/');
}

function routeKind(record) {
  if (record.files.pageSvelte || record.files.pageTs || record.files.pageJs || record.files.pageServerTs || record.files.pageServerJs) return 'page';
  if (record.files.layoutSvelte || record.files.layoutTs || record.files.layoutJs || record.files.layoutServerTs || record.files.layoutServerJs) return 'layout';
  if (record.files.server || record.files.serverTs || record.files.serverJs) return 'api';
  return 'mixed';
}

function extractImports(content) {
  const imports = new Set();
  const staticRe = /\bimport\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, dynamicRe]) {
    let match;
    while ((match = re.exec(content))) imports.add(match[1]);
  }
  return [...imports];
}

function inferServices(content) {
  return SERVICE_PATTERNS.filter(([, re]) => re.test(content)).map(([name]) => name);
}

function inferDatastores(content) {
  return DATASTORE_PATTERNS.filter(([, re]) => re.test(content)).map(([name]) => name);
}

function inferValidation(content) {
  if (/from\s+['"]zod['"]/.test(content) || /\bfrom\s+['"].*zod.*['"]/.test(content) || /\b(?:safeParse|z\.)\b/.test(content)) return 'zod';
  if (/\bsuperValidate\b|\bsuperForm\b/.test(content)) return 'superforms';
  return null;
}

function inferAuth(content) {
  return /locals\.user|requireAuth|getSession/.test(content);
}

function inferFailOpen(content) {
  return /fail open|fails open|catch \(err\).*console\.warn|catch \{\s*return \[\]/s.test(content);
}

function buildFileMap(surfaceFiles) {
  const out = {};
  for (const [name, key] of SURFACE_FILES.entries()) {
    if (surfaceFiles.has(name)) out[key] = toPosix(relative(ROOT, surfaceFiles.get(name)));
  }
  return out;
}

function collectRouteRecords() {
  const routeFiles = collectFiles(ROUTES_DIR, isSurfaceFile);
  const grouped = new Map();

  for (const file of routeFiles) {
    const dir = dirname(file);
    const name = file.split(sep).pop();
    if (!grouped.has(dir)) grouped.set(dir, new Map());
    grouped.get(dir).set(name, file);
  }

  return [...grouped.entries()].map(([dir, surfaceFiles]) => {
    const contents = [...surfaceFiles.values()].map((filePath) => readText(filePath)).join('\n\n');
    const imports = [...new Set([...surfaceFiles.values()].flatMap((filePath) => extractImports(readText(filePath))))];
    const kind = routeKind(buildRecordShape(surfaceFiles));
    const routePath = routePathFromDir(dir);
    const pairedTest = findPairedTests(routePath, surfaceFiles);
    const authRequired = inferAuth(contents);
    const validation = inferValidation(contents);
    const services = inferServices(contents);
    const datastores = inferDatastores(contents);
    const serverOnly = Boolean(surfaceFiles.has('+server.ts') || surfaceFiles.has('+server.js') || surfaceFiles.has('+page.server.ts') || surfaceFiles.has('+page.server.js') || surfaceFiles.has('+layout.server.ts') || surfaceFiles.has('+layout.server.js'));

    return {
      routePath,
      kind,
      files: buildFileMap(surfaceFiles),
      imports,
      serverOnly,
      authRequired,
      validation,
      services,
      datastores,
      tests: pairedTest,
      status: deriveStatus(kind, authRequired, validation, pairedTest.length > 0),
      failOpen: inferFailOpen(contents),
    };
  }).sort((a, b) => a.routePath.localeCompare(b.routePath));
}

function buildRecordShape(surfaceFiles) {
  return {
    files: {
      server: surfaceFiles.get('+server.ts') || surfaceFiles.get('+server.js'),
      serverJs: surfaceFiles.get('+server.js'),
      serverTs: surfaceFiles.get('+server.ts'),
      pageSvelte: surfaceFiles.get('+page.svelte'),
      pageTs: surfaceFiles.get('+page.ts') || surfaceFiles.get('+page.js'),
      pageJs: surfaceFiles.get('+page.js'),
      pageServerTs: surfaceFiles.get('+page.server.ts'),
      pageServerJs: surfaceFiles.get('+page.server.js'),
      layoutSvelte: surfaceFiles.get('+layout.svelte'),
      layoutTs: surfaceFiles.get('+layout.ts') || surfaceFiles.get('+layout.js'),
      layoutJs: surfaceFiles.get('+layout.js'),
      layoutServerTs: surfaceFiles.get('+layout.server.ts'),
      layoutServerJs: surfaceFiles.get('+layout.server.js'),
    },
  };
}

function deriveStatus(kind, authRequired, validation, hasTest) {
  if (kind === 'api') return authRequired && validation === 'zod' && hasTest ? 'SHIPPED' : 'PARTIAL';
  if (kind === 'page') return hasTest ? 'SHIPPED' : 'PARTIAL';
  return hasTest ? 'SHIPPED' : 'PARTIAL';
}

function findPairedTests(routePath, surfaceFiles) {
  const routeSlug = routePath === '/' ? 'root' : routePath.replace(/^\//, '');
  const exactGuess = toPosix(relative(ROOT, resolve(ROOT, 'tests/routes', `${routeSlug}.test.ts`)));
  const candidates = new Set();

  if (statSync(resolve(ROOT, 'tests/routes'), { throwIfNoEntry: false })) {
    const exactPath = resolve(ROOT, 'tests/routes', `${routeSlug}.test.ts`);
    if (statSync(exactPath, { throwIfNoEntry: false })) candidates.add(toPosix(relative(ROOT, exactPath)));
  }

  const routeFragments = [routePath, routeSlug, ...[...surfaceFiles.values()].map((p) => p.split(sep).pop())].filter(Boolean);
  for (const testFile of PAIRED_TESTS) {
    const content = readText(testFile);
    const testRel = toPosix(relative(ROOT, testFile));
    if (testRel === exactGuess) candidates.add(testRel);
    if (routeFragments.some((fragment) => content.includes(fragment) || testRel.includes(fragment.replace(/^\//, '')))) {
      candidates.add(testRel);
    }
  }

  return [...candidates];
}

function renderMarkdown(records) {
  const counts = {
    total: records.length,
    api: records.filter((r) => r.kind === 'api').length,
    page: records.filter((r) => r.kind === 'page').length,
    layout: records.filter((r) => r.kind === 'layout').length,
    partial: records.filter((r) => r.status !== 'SHIPPED').length,
  };

  const lines = [
    '# SvelteKit Route Map',
    '',
    `- Total routes: ${counts.total}`,
    `- API routes: ${counts.api}`,
    `- Page routes: ${counts.page}`,
    `- Layout routes: ${counts.layout}`,
    `- Partial routes: ${counts.partial}`,
    '',
    '## Routes',
    '',
  ];

  for (const record of records) {
    lines.push(`### ${record.routePath}`);
    lines.push(`- kind: ${record.kind}`);
    lines.push(`- status: ${record.status}`);
    lines.push(`- serverOnly: ${record.serverOnly}`);
    lines.push(`- authRequired: ${record.authRequired}`);
    lines.push(`- validation: ${record.validation ?? 'none'}`);
    if (record.services.length) lines.push(`- services: ${record.services.join(', ')}`);
    if (record.datastores.length) lines.push(`- datastores: ${record.datastores.join(', ')}`);
    if (record.tests.length) lines.push(`- tests: ${record.tests.join(', ')}`);
    lines.push('- files:');
    for (const [key, value] of Object.entries(record.files)) {
      lines.push(`  - ${key}: ${value}`);
    }
    if (record.imports.length) {
      lines.push('- imports:');
      for (const imp of record.imports.slice(0, 20)) lines.push(`  - ${imp}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const records = collectRouteRecords();
  const payload = {
    generatedAt: new Date().toISOString(),
    root: 'sveltekit-frontend',
    records,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  writeFileSync(OUT_MD, renderMarkdown(records));

  console.log(`[route-map] wrote ${relative(ROOT, OUT_JSON)}`);
  console.log(`[route-map] wrote ${relative(ROOT, OUT_MD)}`);
  console.log(`[route-map] routes=${records.length}`);
}

main();
