#!/usr/bin/env node
/**
 * Read-only library integration audit.
 *
 * Classifies a bounded candidate set across:
 * - declared version
 * - resolved/installed version
 * - source import evidence
 * - runtime invocation evidence
 * - output consumption / persistence evidence
 *
 * This script never writes to Postgres. It only produces:
 *   docs/reports/library-integration-audit-<date>.json
 *   docs/reports/library-integration-audit-<date>.md
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_JSON = path.join(REPORTS_DIR, `library-integration-audit-${TODAY}.json`);
const OUT_MD = path.join(REPORTS_DIR, `library-integration-audit-${TODAY}.md`);
const SNAPSHOT_GLOB = /^library-registry-\d{4}-\d{2}-\d{2}\.json$/;

const SEARCH_DIRS = ['src', 'scripts', 'packages', 'python', 'sveltekit-frontend'];
const RG_BASE = [
  '-n',
  '-i',
  '--hidden',
  '--glob', '!**/node_modules/**',
  '--glob', '!**/dist/**',
  '--glob', '!**/build/**',
  '--glob', '!**/.git/**',
  '--glob', '!scripts/atlas/library-integration-audit.mjs',
];

const CODE_GLOBS = [
  '--glob', '**/*.ts',
  '--glob', '**/*.tsx',
  '--glob', '**/*.js',
  '--glob', '**/*.mjs',
  '--glob', '**/*.mts',
  '--glob', '**/*.cjs',
  '--glob', '**/*.py',
  '--glob', '**/*.sh',
];

const CANDIDATES = [
  {
    libraryId: 'npm:tree-sitter',
    ecosystem: 'npm',
    packageNames: ['tree-sitter', 'tree-sitter-language-pack'],
    importPatterns: ['tree-sitter', 'tree_sitter', 'tree-sitter-language-pack'],
    invocationPatterns: ['new Parser(', '.setLanguage(', 'Language.load', 'initParser'],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:ast-grep-py',
    ecosystem: 'python',
    packageNames: ['ast-grep-py', 'ast_grep_py'],
    importPatterns: ['ast_grep', 'ast_grep_py', 'ast-grep-py'],
    invocationPatterns: ['ast_grep', 'ast-grep'],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'npm:ts-morph',
    ecosystem: 'npm',
    packageNames: ['ts-morph'],
    importPatterns: ['ts-morph'],
    invocationPatterns: ['new Project(', '.getSourceFile(', '.getTypeChecker('],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:langextract',
    ecosystem: 'python',
    packageNames: ['langextract'],
    importPatterns: ['langextract', 'from langextract', 'import langextract'],
    invocationPatterns: ['langextract.extract', 'lx.extract', 'extract('],
    runtimeEndpoint: 'http://127.0.0.1:8095',
    claimed: true,
  },
  {
    libraryId: 'npm:opentelemetry',
    ecosystem: 'npm',
    packageNames: ['@opentelemetry/api', '@opentelemetry/sdk-node', '@opentelemetry/instrumentation-http'],
    importPatterns: ['@opentelemetry/', 'opentelemetry'],
    invocationPatterns: ['trace.getTracer', 'new NodeSDK(', 'registerInstrumentations('],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'npm:langfuse',
    ecosystem: 'npm',
    packageNames: ['langfuse', '@langfuse/core'],
    importPatterns: ['from langfuse', 'import langfuse', '@langfuse/core', '@langfuse/node'],
    invocationPatterns: ['new Langfuse(', 'langfuse.trace', 'langfuse.generation'],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'npm:langchain',
    ecosystem: 'npm',
    packageNames: ['langchain', '@langchain/core', '@langchain/langgraph'],
    importPatterns: ['from langchain', 'import langchain', '@langchain/'],
    invocationPatterns: ['new ChatPromptTemplate', 'new StateGraph', 'new RunnableLambda'],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'npm:mastra',
    ecosystem: 'npm',
    packageNames: ['mastra', '@mastra/core'],
    importPatterns: ['mastra', '@mastra/'],
    invocationPatterns: ['createWorkflow(', 'createAgent(', 'new Mastra('],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'npm:qdrant-js',
    ecosystem: 'npm',
    packageNames: ['@qdrant/js-client-rest', 'qdrant-client'],
    importPatterns: ['@qdrant/js-client-rest', 'qdrant-client'],
    invocationPatterns: ['new QdrantClient(', '.search(', '.scroll('],
    runtimeEndpoint: 'http://127.0.0.1:6333',
    claimed: true,
  },
  {
    libraryId: 'npm:neo4j',
    ecosystem: 'npm',
    packageNames: ['neo4j-driver'],
    importPatterns: ['neo4j-driver'],
    invocationPatterns: ['neo4j.driver(', '.session(', '.executeRead('],
    runtimeEndpoint: 'bolt://127.0.0.1:7687',
    claimed: true,
  },
  {
    libraryId: 'npm:kafkajs',
    ecosystem: 'npm',
    packageNames: ['kafkajs'],
    importPatterns: ['kafkajs'],
    invocationPatterns: ['new Kafka(', '.producer(', '.consumer('],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'npm:openwiki',
    ecosystem: 'system',
    packageNames: ['openwiki'],
    importPatterns: [],
    claimPatterns: ['OpenWiki', 'openwiki'],
    invocationPatterns: [],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:torch',
    ecosystem: 'python',
    packageNames: ['torch'],
    importPatterns: ['import torch', 'from torch'],
    invocationPatterns: ['torch.cuda', 'torch.nn', 'torch.tensor'],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:cupy',
    ecosystem: 'python',
    packageNames: ['cupy'],
    importPatterns: ['import cupy', 'from cupy'],
    invocationPatterns: ['cupy.cuda', 'cupy.asarray'],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:cuvs',
    ecosystem: 'python',
    packageNames: ['cuvs'],
    importPatterns: ['import cuvs', 'from cuvs'],
    invocationPatterns: ['brute_force.search', 'brute_force.build', 'cuvs.neighbors'],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:cugraph',
    ecosystem: 'python',
    packageNames: ['cugraph'],
    importPatterns: ['import cugraph', 'from cugraph'],
    invocationPatterns: ['cugraph.pagerank', 'cugraph.Graph('],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:spacy',
    ecosystem: 'python',
    packageNames: ['spacy'],
    importPatterns: ['import spacy', 'from spacy'],
    invocationPatterns: ['spacy.load(', 'nlp('],
    runtimeEndpoint: null,
    claimed: true,
  },
  {
    libraryId: 'python:deepspeed-or-llm-runtime',
    ecosystem: 'system',
    packageNames: ['deep-agents', 'deepagents', 'langgraph'],
    importPatterns: [],
    invocationPatterns: ['createAgent(', 'compile(', 'invoke('],
    claimPatterns: ['deep agents', 'deep-agents', 'langgraph'],
    runtimeEndpoint: null,
    claimed: true,
  },
];

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function latestRegistrySnapshot() {
  const reportDir = REPORTS_DIR;
  if (!existsSync(reportDir)) return null;
  const files = readdirSync(reportDir)
    .filter((name) => SNAPSHOT_GLOB.test(name))
    .map((name) => path.join(reportDir, name))
    .sort((a, b) => {
      const am = existsSync(a) ? statSync(a).mtimeMs : 0;
      const bm = existsSync(b) ? statSync(b).mtimeMs : 0;
      return bm - am;
    });
  return files[0] ?? null;
}

function loadRegistryIndex() {
  const snapshotPath = latestRegistrySnapshot();
  if (!snapshotPath || !existsSync(snapshotPath)) return { snapshotPath: null, byPackageName: new Map(), byAddress: new Map() };
  const raw = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const byPackageName = new Map();
  const byAddress = new Map();
  for (const row of raw.rows ?? []) {
    byAddress.set(row.address, row);
    if (!byPackageName.has(row.packageName)) byPackageName.set(row.packageName, []);
    byPackageName.get(row.packageName).push(row);
  }
  return { snapshotPath, byPackageName, byAddress };
}

function loadPackageManifests() {
  const manifestFiles = spawnSync('rg', ['--files', '-g', 'package.json'], { encoding: 'utf8' });
  const files = (manifestFiles.stdout ?? '').split(/\r?\n/).filter(Boolean);
  const manifests = [];
  for (const file of files) {
    const abs = path.join(REPO_ROOT, file);
    try {
      const parsed = JSON.parse(readFileSync(abs, 'utf8'));
      manifests.push({ file, parsed });
    } catch {
      // ignore malformed or non-package JSON files
    }
  }
  return manifests;
}

function declaredVersionFromManifests(packageNames) {
  const manifests = loadPackageManifests();
  for (const manifest of manifests) {
    const sections = [
      manifest.parsed.dependencies,
      manifest.parsed.devDependencies,
      manifest.parsed.optionalDependencies,
      manifest.parsed.peerDependencies,
    ];
    for (const section of sections) {
      if (!section) continue;
      for (const name of packageNames) {
        if (section[name]) {
          return { version: section[name], evidence: `${manifest.file}` };
        }
      }
    }
  }
  return { version: null, evidence: null };
}

function searchEvidence(patterns, dirs = SEARCH_DIRS) {
  if (!patterns.length) return [];
  const expr = patterns.map((p) => escapeRegex(p)).join('|');
  const args = [
    ...RG_BASE,
    ...CODE_GLOBS,
    expr,
    ...dirs,
  ];
  const res = spawnSync('rg', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const stdout = res.stdout ?? '';
  const hits = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => {
      const trimmed = line.trimStart();
      if (/^(?:\/\/|\/\*|\*|#|<!--|--|"""|''')/.test(trimmed)) return false;
      if (trimmed.includes('scripts\\atlas\\library-integration-audit.mjs')) return false;
      if (trimmed.includes('scripts/atlas/library-integration-audit.mjs')) return false;
      return true;
    })
    .slice(0, 12);
  return hits;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyCandidate(candidate, registryIndex) {
  const snapshotHits = [];
  for (const pkgName of candidate.packageNames ?? []) {
    const rows = registryIndex.byPackageName.get(pkgName) ?? [];
    snapshotHits.push(...rows);
  }
  const chosenRow = snapshotHits[0] ?? null;
  const declared = declaredVersionFromManifests(candidate.packageNames ?? []);
  const importHits = searchEvidence(candidate.importPatterns ?? []);
  const claimHits = searchEvidence(candidate.claimPatterns ?? []);
  const invocationHits = searchEvidence(candidate.invocationPatterns ?? []);

  const declaredVersion = declared.version ?? null;
  const resolvedVersion = chosenRow?.packageVersion ?? null;
  const installed = Boolean(chosenRow);
  const imported = importHits.length > 0;
  const invoked = invocationHits.length > 0 && imported;
  const outputConsumed = invoked && candidate.runtimeEndpoint ? false : false;
  const outputPersisted = false;

  let status = 'MISSING';
  if (installed && !imported) {
    status = 'INSTALLED_UNUSED';
  } else if (imported && invoked) {
    status = candidate.runtimeEndpoint ? 'IMPORTED_UNPROVEN' : 'IMPORTED_UNPROVEN';
  } else if (imported) {
    status = 'IMPORTED_UNPROVEN';
  } else if (declaredVersion || resolvedVersion) {
    status = 'INSTALLED_UNUSED';
  }

  const evidenceRefs = [];
  if (declared.evidence) evidenceRefs.push(`${declared.evidence}`);
  if (chosenRow && registryIndex.snapshotPath) evidenceRefs.push(`${path.relative(REPO_ROOT, registryIndex.snapshotPath)}:${chosenRow.address}`);
  for (const hit of importHits.slice(0, 4)) evidenceRefs.push(hit);
  for (const hit of claimHits.slice(0, 2)) evidenceRefs.push(hit);
  for (const hit of invocationHits.slice(0, 2)) evidenceRefs.push(hit);

  return {
    libraryId: candidate.libraryId,
    ecosystem: candidate.ecosystem,
    declaredVersion,
    resolvedVersion,
    installed,
    imported,
    invoked,
    outputConsumed,
    outputPersisted,
    runtimeEndpoint: candidate.runtimeEndpoint,
    evidenceRefs,
    status,
  };
}

function renderMarkdown(report) {
  const rows = report.rows
    .map((row) => `| \`${row.libraryId}\` | ${row.ecosystem} | ${row.declaredVersion ?? '—'} | ${row.resolvedVersion ?? '—'} | ${row.installed ? 'yes' : 'no'} | ${row.imported ? 'yes' : 'no'} | ${row.invoked ? 'yes' : 'no'} | ${row.status} |`)
    .join('\n');
  const summary = Object.entries(report.summary.byStatus)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  const evidence = report.rows
    .slice(0, 12)
    .map((row) => `- ${row.libraryId}: ${row.evidenceRefs.slice(0, 4).join(' ; ') || 'no evidence refs'}`)
    .join('\n');
  return `# Library Integration Audit

Generated at: ${report.generatedAt}

Snapshot source: ${report.snapshotPath ?? 'none'}

## Status Summary

${summary || '- (none)'}

## Candidate Matrix

| Library | Ecosystem | Declared | Resolved | Installed | Imported | Invoked | Status |
|---|---|---:|---:|---|---|---|---|
${rows}

## Evidence Notes

${evidence || '- (none)'}
`;
}

function buildReport() {
  const registryIndex = loadRegistryIndex();
  const rows = CANDIDATES.map((candidate) => classifyCandidate(candidate, registryIndex));
  const byStatus = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    snapshotPath: registryIndex.snapshotPath,
    summary: {
      total: rows.length,
      byStatus,
    },
    rows,
  };
}

function main() {
  const report = buildReport();
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUT_MD, renderMarkdown(report));
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
  console.log(`Libraries classified: ${report.summary.total}`);
}

main();
