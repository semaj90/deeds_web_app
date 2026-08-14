#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const reportPath = path.resolve(repoRoot, 'docs/reports/okf-library-ownership.json');
const markdownPath = path.resolve(repoRoot, 'docs/reports/okf-library-ownership.md');

const candidates = [
  ['tree-sitter', /tree[-_ ]?sitter/i],
  ['ast-grep', /ast[-_ ]?grep/i],
  ['ts-morph', /ts[-_ ]?morph/i],
  ['LangExtract', /langextract/i],
  ['Deep Agents', /deep[-_ ]?agents|deepagents/i],
  ['LangChain', /langchain/i],
  ['LangGraph', /langgraph/i],
  ['OpenWiki', /openwiki/i],
  ['Neo4j GDS', /neo4j|graphdatascience|gds./i],
  ['cuGraph', /cugraph/i],
  ['cuVS', /cuvs/i],
  ['TurboVec', /turbovec|turboquant/i],
  ['PyTorch', /torch|pytorch|libtorch/i],
  ['Langfuse', /langfuse/i],
  ['OpenTelemetry', /opentelemetry|opentelemetry/i],
  ['Mastra', /mastra/i],
  ['PostgreSQL AIO', /async_io|io_method|postgresql.*aio|aio.*postgresql/i],
  ['pgvector', /pgvector|vector\s*\(/i],
  ['Bitmap indexes', /bitmaps+(index|scan)|bitset|allowlist|slot.?mask/i],
  ['Qdrant', /qdrant/i],
  ['Valkey', /valkey|redis/i],
  ['Kanban recommendations', /kanban|recommendation|work_item/i],
];

const roots = [
  'scripts',
  'sveltekit-frontend/src',
  'packages',
  'services',
  'docker',
];
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py', '.rs', '.sql']);
const ignored = new Set(['node_modules', '.git', '.tmp', 'target', '.svelte-kit', 'dist', 'build', 'coverage']);

async function collectFiles(directory, files = []) {
  let entries;
  try {
    entries = await readdir(path.resolve(repoRoot, directory), { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(relative, files);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(relative);
  }
  return files;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(path.resolve(repoRoot, filePath), 'utf8'));
  } catch {
    return null;
  }
}

const files = (await Promise.all(roots.map((root) => collectFiles(root)))).flat();
const packageFiles = ['package.json', 'sveltekit-frontend/package.json', ...files.filter((file) => path.basename(file) === 'package.json')];
const packages = [];
for (const file of [...new Set(packageFiles)]) {
  const manifest = await readJson(file);
  if (manifest) packages.push({ path: file, manifest });
}

const sourceTexts = [];
for (const file of files) {
  if (path.basename(file) === 'package.json') continue;
  if (/audit-okf-library-ownership|library-integration-audit|library-registry-scan/i.test(file)) continue;
  try {
    sourceTexts.push({ path: file, text: await readFile(path.resolve(repoRoot, file), 'utf8') });
  } catch {
    // A read failure is captured as missing evidence for that file, not a fatal audit error.
  }
}

function packageNames(manifest) {
  return Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  });
}

const results = candidates.map(([name, pattern]) => {
  const matchingLines = (text) => text.split(/\r?\n/).filter((line) => pattern.test(line));
  const declaredIn = packages
    .filter(({ manifest }) => packageNames(manifest).some((dependency) => pattern.test(dependency)))
    .map(({ path: file }) => file);
  const importedIn = sourceTexts
    .filter(({ text }) => matchingLines(text).some((line) => /\b(import|from|require|use|import_module|pip|cargo)\b/i.test(line)))
    .map(({ path: file }) => file)
    .slice(0, 30);
  const endpointMatches = [...new Set(sourceTexts.flatMap(({ text }) => text.match(/https?:\/\/[^\s'"`]+|:\d{4,5}\b/g) ?? []))]
    .filter((endpoint) => pattern.test(endpoint) || /:8095|:8098|:8099|:8791|:11434|:6333|:6379/.test(endpoint));
  const invoked = importedIn.length > 0 && sourceTexts.some(({ text }) => matchingLines(text).some((line) => /\b(await|new|connect|project|search|query|run|stream|classify|embed|fetch)\b|\.search\(|\.query\(|\.upsert\(/i.test(line)));
  const persisted = importedIn.length > 0 && sourceTexts.some(({ text }) => matchingLines(text).some((line) => /insert|upsert|persist|writeFile|COPY |CREATE TABLE|drizzle|qdrant.*upsert|redis.*set/i.test(line)));
  let classification = 'MISSING';
  if (declaredIn.length > 0 && importedIn.length === 0) classification = 'INSTALLED_UNUSED';
  else if (importedIn.length > 0 && (!invoked || !persisted)) classification = 'IMPORTED_UNPROVEN';
  else if (importedIn.length > 0) classification = 'WIRED_CANDIDATE';
  if (name === 'PostgreSQL AIO' || name === 'Bitmap indexes') classification = importedIn.length > 0 ? 'CAPABILITY_EVIDENCE_ONLY' : 'NOT_PROVEN';
  return {
    capability: name,
    declared: declaredIn.length > 0,
    declaredIn,
    imported: importedIn.length > 0,
    importedIn,
    invoked,
    outputConsumed: invoked,
    outputPersisted: persisted,
    runtimeEndpoints: endpointMatches,
    classification,
  };
});

const report = {
  schema: 'atlas.okf-library-ownership.v1',
  status: 'PROVEN_READ_ONLY_AUDIT',
  generatedAt: new Date().toISOString(),
  roots,
  filesScanned: sourceTexts.length,
  packageManifestsScanned: packages.length,
  results,
  policy: {
    canonicalTruth: ['Postgres', 'Graphify identity/revision owners'],
    projectionsOrExecutors: ['Qdrant', 'Neo4j GDS', 'cuVS', 'PyTorch', 'pgvector'],
    cache: ['Valkey'],
    orchestrationOrDocumentation: ['LangChain', 'Deep Agents', 'LangGraph', 'OpenWiki', 'Kanban recommendations'],
    noLiveMutations: true,
  },
  gaps: results.filter((item) => ['MISSING', 'NOT_PROVEN', 'INSTALLED_UNUSED', 'IMPORTED_UNPROVEN'].includes(item.classification)).map((item) => item.capability),
};

const lines = [
  '# Parent Atlas OKF library ownership audit',
  '',
  `Generated: ${report.generatedAt}`,
  `Status: ${report.status}`,
  `Files scanned: ${report.filesScanned}`,
  '',
  '| Capability | Classification | Declared | Imported | Invoked | Persisted |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
  ...results.map((item) => `| ${item.capability} | ${item.classification} | ${item.declared} | ${item.imported} | ${item.invoked} | ${item.outputPersisted} |`),
  '',
  'This is a read-only evidence scan. It does not install packages, call service endpoints, write canonical data, or promote an owner.',
];

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  filesScanned: report.filesScanned,
  packageManifestsScanned: report.packageManifestsScanned,
  gaps: report.gaps,
  reportPath: path.relative(repoRoot, reportPath),
  markdownPath: path.relative(repoRoot, markdownPath),
}, null, 2));
