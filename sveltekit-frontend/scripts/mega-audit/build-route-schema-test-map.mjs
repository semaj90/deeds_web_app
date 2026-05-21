#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROUTES_ROOT = path.join(ROOT, 'src', 'routes', 'api');
const TMP_DIR = path.join(ROOT, '.tmp', 'mega-audit');

function walk(dir, predicate) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, predicate));
      continue;
    }
    if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

function toPosix(p) {
  return p.replaceAll('\\', '/');
}

function routeFromFile(filePath) {
  const rel = toPosix(path.relative(path.join(ROOT, 'src', 'routes'), filePath));
  return '/' + rel.replace(/^api\//, 'api/').replace('/+server.ts', '');
}

function parseSchemaRefs(source) {
  const refs = new Set();
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*schema-postgres[^'"]*['"]/g;
  for (const m of source.matchAll(importRe)) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim())
      .map((s) => s.replace(/^type\s+/, ''))
      .map((s) => s.split(/\s+as\s+/i)[0]?.trim())
      .filter(Boolean);
    for (const name of names) refs.add(name);
  }
  return [...refs].sort();
}

function findTestsForRoute(routePath, routeFileRel, testFilesWithContent) {
  const routeLeaf = routePath.split('/').filter(Boolean).pop() ?? '';
  const candidates = [];

  for (const [testRel, content] of testFilesWithContent) {
    if (
      content.includes(routePath) ||
      content.includes(routeFileRel) ||
      (routeLeaf && content.includes(routeLeaf) && content.includes('/api/'))
    ) {
      candidates.push(testRel);
    }
  }

  return [...new Set(candidates)].sort();
}

const routeFiles = walk(ROUTES_ROOT, (f) => f.endsWith('+server.ts'));
const testFiles = [
  ...walk(path.join(ROOT, 'tests'), (f) => /\.(spec|test)\.(ts|js|mjs)$/.test(f)),
  ...walk(path.join(ROOT, 'src'), (f) => /\.(spec|test)\.(ts|js|mjs)$/.test(f)),
];

const testFilesWithContent = new Map();
for (const testFile of testFiles) {
  const rel = toPosix(path.relative(ROOT, testFile));
  let content = '';
  try {
    content = fs.readFileSync(testFile, 'utf8');
  } catch {
    content = '';
  }
  testFilesWithContent.set(rel, content);
}

const rows = [];
const schemaTables = new Set();

for (const file of routeFiles) {
  const fileRel = toPosix(path.relative(ROOT, file));
  const route = routeFromFile(file);
  const source = fs.readFileSync(file, 'utf8');
  const schemaRefs = parseSchemaRefs(source);
  for (const s of schemaRefs) schemaTables.add(s);

  const tests = findTestsForRoute(route, fileRel, testFilesWithContent);

  rows.push({
    route,
    file: fileRel,
    schemaRefs,
    tests,
    hasSchemaRefs: schemaRefs.length > 0,
    hasTests: tests.length > 0,
  });
}

rows.sort((a, b) => a.route.localeCompare(b.route));

const output = {
  generatedAt: new Date().toISOString(),
  totalRoutes: rows.length,
  routeWithSchemaRefs: rows.filter((r) => r.hasSchemaRefs).length,
  routeWithTests: rows.filter((r) => r.hasTests).length,
  schemaTablesReferencedByApiRoutes: [...schemaTables].sort(),
  routes: rows,
};

fs.mkdirSync(TMP_DIR, { recursive: true });
const outFile = path.join(TMP_DIR, 'route-schema-test-map.json');
fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      file: toPosix(path.relative(ROOT, outFile)),
      totalRoutes: output.totalRoutes,
      routeWithSchemaRefs: output.routeWithSchemaRefs,
      routeWithTests: output.routeWithTests,
      schemaTables: output.schemaTablesReferencedByApiRoutes.length,
    },
    null,
    2
  )
);
