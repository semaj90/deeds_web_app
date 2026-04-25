#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(HERE, '..');
const WORKSPACE_ROOT = resolve(FRONTEND_ROOT, '..');
const ROOT_DB_DIR = resolve(FRONTEND_ROOT, 'src/lib/server/db');
const SCAN_ROOTS = [ROOT_DB_DIR].filter((dirPath) => existsSync(dirPath));
const EXTRA_SCHEMA_FILES = [resolve(FRONTEND_ROOT, 'src/lib/db/schema/ace-web.ts')].filter((filePath) => existsSync(filePath));
const OUTPUT_DIR = resolve(WORKSPACE_ROOT, 'next_steps/active');
const MANIFEST_JSON_PATH = resolve(OUTPUT_DIR, 'SCHEMA_MANIFEST.json');
const MANIFEST_MD_PATH = resolve(OUTPUT_DIR, 'SCHEMA_MANIFEST.md');
const OWNERSHIP_MD_PATH = resolve(OUTPUT_DIR, 'SCHEMA_FILE_OWNERSHIP.md');
const CONSOLIDATION_MD_PATH = resolve(OUTPUT_DIR, 'SCHEMA_CONSOLIDATION_PLAN.md');
const SUMMARY_DOC_PATH = resolve(FRONTEND_ROOT, 'data/knowledge/drizzle-schema-reference.md');

const DRY_RUN = process.argv.includes('--dry-run');

const CODE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs', '.mts', '.cts']);
const WORKSPACE_SCAN_EXTENSIONS = new Set([...CODE_EXTENSIONS, '.svelte']);
const IGNORED_DIRS = new Set([
  '.git',
  '.python311',
  '.svelte-kit',
  'artifacts',
  'build',
  'coverage',
  'deeds_labs',
  'dist',
  'logs',
  'minio',
  'minio-data',
  'models',
  'node_modules',
  'next_steps',
  'onnx',
  '__pycache__',
]);

const ROOT_SCHEMA_NAME_PATTERNS = [
  /^additional-tables\.ts$/i,
  /^cases\.ts$/i,
  /^enhanced-legal-schema\.ts$/i,
  /^legal-schema\.ts$/i,
  /^lucia-schema\.ts$/i,
  /^schema(?:[-.].+)?\.ts$/i,
  /^unified-schema(?:[-.].+)?\.ts$/i,
  /^vector-schema\.ts$/i,
  /^warden-schema\.ts$/i,
];

const ROOT_SCHEMA_FILE_ALLOWLIST = new Set([
  'additional-tables.ts',
  'cases.ts',
  'enhanced-legal-schema.ts',
  'legal-schema.ts',
  'lucia-schema.ts',
  'schema-actual.ts',
  'schema-canvas-autosaves.ts',
  'schema-canvas.ts',
  'schema-chat.ts',
  'schema-enhanced.ts',
  'schema-evidence-crud.ts',
  'schema-gpu-metrics.ts',
  'schema-ingestion.ts',
  'schema-old.ts',
  'schema-pgvector-512.ts',
  'schema-phase78.ts',
  'schema-phase89-preserved.ts',
  'schema-postgres-enhanced.ts',
  'schema-postgres.ts',
  'schema-prosecutor.ts',
  'schema-sqlite.ts',
  'schema-test-rag.ts',
  'schema-timeline.ts',
  'schema-unified.ts',
  'schema-web.ts',
  'schema-week3-kb.ts',
  'schema.ts',
  'unified-schema-clean.ts',
  'unified-schema.ts',
  'vector-schema.ts',
  'warden-schema.ts',
]);

const FEATURE_BUCKETS = [
  'legal corpus',
  'courtroom / simulation',
  'audio',
  'research / synthesis',
  'AST intelligence',
  'context engine',
  'chat',
  'analytics',
  'infra/runtime',
];

const DOMAIN_PLANS = {
  'legal corpus': {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema/index.ts',
    owner: 'legal corpus',
    supportingPatterns: [
      '/src/lib/server/db/schema/jurisdictions.ts',
      '/src/lib/server/db/schema/library-',
      '/src/lib/server/db/schema/legal-',
      '/src/lib/server/db/schema/page-artifacts.ts',
      '/src/lib/server/db/schema/ingestion-jobs.ts',
      '/src/lib/server/db/schema/state-constitution-sources.ts',
      '/src/lib/server/db/schema/case-library-links.ts',
    ],
    migrationPolicy: 'Add new legal corpus tables in dedicated domain files and re-export through schema/index.ts only.',
  },
  'courtroom / simulation': {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    owner: 'courtroom / simulation',
    supportingPatterns: [
      '/src/lib/server/db/schema-charges.ts',
      '/src/lib/server/db/schema-prosecutor.ts',
      '/src/lib/server/db/schema-canvas',
      '/src/lib/server/db/schema-timeline.ts',
    ],
    migrationPolicy: 'Keep runtime tables on the canonical schema while simulation-specific helpers remain temporary compatibility layers.',
  },
  audio: {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    owner: 'audio pipeline',
    supportingPatterns: [],
    migrationPolicy: 'Keep audio tables on the canonical schema until a dedicated audio schema is introduced and adopted.',
  },
  'research / synthesis': {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema/index.ts',
    owner: 'research / synthesis',
    supportingPatterns: [
      '/src/lib/server/db/schema/search-analytics.ts',
      '/src/lib/server/db/schema/reports.ts',
      '/src/lib/server/db/schema-week3-kb.ts',
      '/src/lib/server/db/schema-test-rag.ts',
    ],
    migrationPolicy: 'Prefer domain sub-schemas; treat experiment-only entrypoints as remove-after-verification candidates.',
  },
  'AST intelligence': {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema/codebase-intelligence.ts',
    owner: 'codebase intelligence',
    supportingPatterns: ['/src/lib/server/db/schema-postgres.ts'],
    migrationPolicy: 'New AST intelligence tables should land in codebase-intelligence.ts and be re-exported through schema/index.ts.',
  },
  'context engine': {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema.ts',
    owner: 'ACE / context engine',
    supportingPatterns: [
      '/src/lib/db/schema/ace-web.ts',
      '/src/lib/server/db/schema-chat.ts',
      '/src/lib/server/db/schema.ts',
    ],
    migrationPolicy: 'Keep context-engine entrypoints behind schema.ts while wrapper imports are traced and normalized.',
  },
  chat: {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema-chat.ts',
    owner: 'chat',
    supportingPatterns: ['/src/lib/server/db/schema/ai_chat.ts', '/src/lib/server/db/schema.ts'],
    migrationPolicy: 'Route new chat tables through schema-chat.ts; keep schema.ts as compatibility re-export only.',
  },
  analytics: {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts',
    owner: 'analytics',
    supportingPatterns: [
      '/src/lib/server/db/schema/analytics.ts',
      '/src/lib/server/db/schema/error_',
      '/src/lib/server/db/schema/errorBrainDiffs.ts',
      '/src/lib/server/db/schema/route_',
    ],
    migrationPolicy: 'Keep analytics tables in dedicated sub-schemas and re-export through schema/index.ts.',
  },
  'infra/runtime': {
    canonicalFile: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    owner: 'core runtime db',
    supportingPatterns: [
      '/src/lib/server/db/schema.ts',
      '/src/lib/server/db/schema-postgres-enhanced.ts',
      '/src/lib/server/db/schema-old.ts',
      '/src/lib/server/db/schema-actual.ts',
    ],
    migrationPolicy: 'Only schema-postgres.ts is authoritative for shared runtime tables; wrappers must not define new tables.',
  },
};

function ensureDirectory(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function toWorkspacePath(filePath) {
  return normalizeSlashes(relative(WORKSPACE_ROOT, filePath));
}

function toFrontendPath(filePath) {
  return normalizeSlashes(relative(FRONTEND_ROOT, filePath));
}

function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

function isCodeFile(filePath, allowedExtensions) {
  const extension = extname(filePath);
  if (!allowedExtensions.has(extension)) {
    return false;
  }
  return !filePath.endsWith('.d.ts');
}

function walkFiles(dirPath, allowedExtensions, output = []) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name)) {
        walkFiles(resolve(dirPath, entry.name), allowedExtensions, output);
      }
      continue;
    }
    const filePath = resolve(dirPath, entry.name);
    if (isCodeFile(filePath, allowedExtensions)) {
      output.push(filePath);
    }
  }
  return output;
}

function extractDefinitions(sourceText) {
  const tables = [];
  const enums = [];
  const tablePattern = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:pgTable|sqliteTable|mysqlTable)\(\s*(['"`])([^'"`]+)\2/gm;
  const enumPattern = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*pgEnum\(\s*(['"`])([^'"`]+)\2/gm;

  let match;
  while ((match = tablePattern.exec(sourceText))) {
    tables.push({ exportName: match[1], dbName: match[3] });
  }
  while ((match = enumPattern.exec(sourceText))) {
    enums.push({ exportName: match[1], dbName: match[3] });
  }

  return { tables, enums };
}

function isSchemaModule(filePath, sourceText, definitions) {
  const fileName = basename(filePath);
  const frontendPath = toFrontendPath(filePath).toLowerCase();

  if (definitions.tables.length > 0 || definitions.enums.length > 0) {
    return true;
  }

  if (frontendPath.includes('/schema/')) {
    return true;
  }

  if (ROOT_SCHEMA_NAME_PATTERNS.some((pattern) => pattern.test(fileName))) {
    return true;
  }

  return /export\s+\*\s+from\s+['"][^'"]*(?:schema|ace-web|legal-relations|analytics|citations|evidence|reports|persons)/i.test(sourceText);
}

function extractImportSpecifiers(sourceText) {
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"]+)['"]/gm,
    /\bexport\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sourceText))) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function resolveImportTarget(importerPath, specifier) {
  let basePath;

  if (specifier.startsWith('$lib/')) {
    basePath = resolve(FRONTEND_ROOT, 'src/lib', specifier.slice('$lib/'.length));
  } else if (specifier.startsWith('$routes/')) {
    basePath = resolve(FRONTEND_ROOT, 'src/routes', specifier.slice('$routes/'.length));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    basePath = resolve(dirname(importerPath), specifier);
  } else if (specifier.startsWith('src/')) {
    basePath = resolve(FRONTEND_ROOT, specifier);
  } else {
    return null;
  }

  return resolveCodePath(basePath);
}

function resolveCodePath(basePath) {
  const extension = extname(basePath);
  const candidates = [];

  if (extension) {
    candidates.push(basePath);
    for (const candidateExtension of CODE_EXTENSIONS) {
      if (candidateExtension !== extension) {
        candidates.push(basePath.slice(0, -extension.length) + candidateExtension);
      }
    }
  } else {
    candidates.push(basePath);
    for (const candidateExtension of CODE_EXTENSIONS) {
      candidates.push(basePath + candidateExtension);
      candidates.push(resolve(basePath, `index${candidateExtension}`));
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate) && isCodeFile(candidate, CODE_EXTENSIONS)) {
      return candidate;
    }
  }

  return null;
}

function classifyImporter(importerPath) {
  const workspacePath = toWorkspacePath(importerPath).toLowerCase();
  const isTestFile = /(^|\/)(tests?|__tests__)\//.test(workspacePath) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(workspacePath);
  const isScriptFile = /(^|\/)scripts\//.test(workspacePath) || /(^|\/)(playwright|vitest|vite|svelte|drizzle)\.config\./.test(workspacePath);
  const isRuntimeFile = /(^|\/)(src|routes)\//.test(workspacePath) && !isTestFile;

  if (isTestFile || isScriptFile) {
    return 'testOrScript';
  }

  if (isRuntimeFile) {
    return 'runtime';
  }

  return 'other';
}

function addToNestedSet(map, key, value) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(value);
}

function getSchemaFamily(filePath) {
  const name = basename(filePath).replace(/\.[^.]+$/, '').toLowerCase();
  if (name === 'schema' || name.startsWith('schema-') || name.startsWith('unified-schema')) {
    return 'schema-family';
  }
  if (name.includes('legal')) {
    return 'legal-family';
  }
  if (name.includes('vector') || name.includes('pgvector')) {
    return 'vector-family';
  }
  if (name.includes('canvas')) {
    return 'canvas-family';
  }
  if (name.includes('chat')) {
    return 'chat-family';
  }
  if (name.includes('evidence')) {
    return 'evidence-family';
  }
  if (name.includes('prosecutor') || name.includes('timeline') || name.includes('charges')) {
    return 'simulation-family';
  }
  return name;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function dominantBucket(buckets) {
  const counts = new Map();
  for (const bucket of buckets) {
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  })[0]?.[0] ?? 'infra/runtime';
}

function inferFeatureBucket(definitionName, dbName, sourceFile) {
  const probe = `${definitionName} ${dbName} ${sourceFile}`.toLowerCase();

  if (/(audio|whisper|transcript)/.test(probe)) {
    return 'audio';
  }

  if (/(ast|codebase|cluster|repo|enrichment|filefeatures|auditreports)/.test(probe)) {
    return 'AST intelligence';
  }

  if (/(research|knowledgeartifact|synthesis|websearch|userresearch|qlora|summary)/.test(probe)) {
    return 'research / synthesis';
  }

  if (/(ace|glyph|context|agentsession|contextbuffer|servicecapabilities|modelregistry|contexttimeline)/.test(probe)) {
    return 'context engine';
  }

  if (/(chat|rag|yorhachat|chatdocumentattachment)/.test(probe)) {
    return 'chat';
  }

  if (/(analytics|feedback|routehealth|route_error|error_|diagnosis|usage|audit|queryvariance|chunkhit|responsefeedback|errorbrain)/.test(probe)) {
    return 'analytics';
  }

  if (/(fictional|courtroom|prosecutor|canvas|charges|poi|personsofinterest|timelineevents|yorhaevidence|yorhacases)/.test(probe)) {
    return 'courtroom / simulation';
  }

  if (/(legal|canon|jurisdiction|citation|statute|librarydocument|glossary|precedent|termexamples|caselibrarylinks|pageartifacts|authority|corpus|legalnode)/.test(probe)) {
    return 'legal corpus';
  }

  return 'infra/runtime';
}

function guessOwner(fileInfo) {
  const lowerPath = fileInfo.file.toLowerCase();
  if (lowerPath.endsWith('/schema-postgres.ts')) {
    return 'canonical postgres schema';
  }
  if (lowerPath.endsWith('/schema.ts')) {
    return 'schema compatibility barrel';
  }
  if (lowerPath.endsWith('/schema/index.ts')) {
    return 'domain schema barrel';
  }
  if (lowerPath.endsWith('/schema-chat.ts') || lowerPath.endsWith('/ai_chat.ts')) {
    return 'chat';
  }
  if (/(schema-old|schema-actual|unified-schema|clean|phase\d+)/.test(lowerPath)) {
    return 'legacy compatibility layer';
  }

  const dominant = dominantBucket(fileInfo.definitionBuckets);
  if (dominant === 'infra/runtime') {
    return 'core runtime db';
  }
  return dominant;
}

function summarizeRootImportState(fileInfo) {
  if (fileInfo.importers.runtime.length > 0) {
    return 'yes';
  }
  if (fileInfo.importers.testOrScript.length > 0 || fileInfo.importers.other.length > 0) {
    return 'tests/scripts only';
  }
  return 'no';
}

function classifyFileStatus(fileInfo, familyPeers, duplicateDefinitionNames) {
  const runtimeCount = fileInfo.importers.runtime.length;
  const nonRuntimeCount = fileInfo.importers.testOrScript.length + fileInfo.importers.other.length;
  const hasDefinitions = fileInfo.tables.length + fileInfo.enums.length > 0;
  const hasLegacyVariantName = /(old|actual|clean|enhanced|phase\d+|sqlite|test-rag|week3|unified)/i.test(basename(fileInfo.absolutePath));
  const hasFamilyPeers = familyPeers.length > 0;
  const duplicateCount = duplicateDefinitionNames.length;

  if (runtimeCount > 0) {
    return 'imported by runtime';
  }

  if (nonRuntimeCount > 0) {
    return 'imported only by tests/scripts';
  }

  if (duplicateCount > 0 || (hasLegacyVariantName && hasFamilyPeers)) {
    return 'legacy duplicate';
  }

  if (!hasDefinitions || /placeholder|no-op|backward compatibility/i.test(fileInfo.sourceText)) {
    return 'dead candidate';
  }

  return 'unknown owner';
}

function manifestStatusFor(definition, fileStatus, duplicateFiles) {
  if (duplicateFiles.length > 0 || fileStatus === 'legacy duplicate') {
    return 'duplicate candidate';
  }
  if (fileStatus === 'imported only by tests/scripts') {
    return 'migration-only';
  }
  if (fileStatus === 'imported by runtime') {
    return 'active';
  }
  return 'legacy';
}

function collectNotes(fileInfo, familyPeers, duplicateDefinitionNames) {
  const notes = [];
  if (/export\s+\*/.test(fileInfo.sourceText)) {
    notes.push('re-export wrapper');
  }
  if (/@ts-nocheck/.test(fileInfo.sourceText)) {
    notes.push('ts-nocheck compatibility layer');
  }
  if (/placeholder|no-op|backward compatibility/i.test(fileInfo.sourceText)) {
    notes.push('placeholder or compatibility module');
  }
  if (fileInfo.importers.internalChain.length > 0) {
    notes.push(`re-export chain: ${fileInfo.importers.internalChain.slice(0, 3).join(', ')}`);
  }
  if (familyPeers.length > 0) {
    notes.push(`family peers: ${familyPeers.join(', ')}`);
  }
  if (duplicateDefinitionNames.length > 0) {
    notes.push(`duplicate definitions: ${duplicateDefinitionNames.join(', ')}`);
  }
  if (notes.length === 0) {
    notes.push('no external importers found');
  }
  return notes;
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function renderMarkdownTable(headers, rows) {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map((row) => `| ${row.map(escapeMarkdownCell).join(' | ')} |`);
  return [headerRow, separatorRow, ...bodyRows].join('\n');
}

function listOrDash(values) {
  return values.length > 0 ? values.join(', ') : '-';
}

function buildManifest() {
  const candidateFiles = new Map();

  for (const scanRoot of SCAN_ROOTS) {
    for (const filePath of walkFiles(scanRoot, CODE_EXTENSIONS)) {
      const sourceText = readText(filePath);
      const definitions = extractDefinitions(sourceText);
      if (isSchemaModule(filePath, sourceText, definitions)) {
        candidateFiles.set(filePath, {
          absolutePath: filePath,
          file: toWorkspacePath(filePath),
          sourceText,
          tables: definitions.tables,
          enums: definitions.enums,
          family: getSchemaFamily(filePath),
        });
      }
    }
  }

  for (const filePath of EXTRA_SCHEMA_FILES) {
    const sourceText = readText(filePath);
    const definitions = extractDefinitions(sourceText);
    if (isSchemaModule(filePath, sourceText, definitions)) {
      candidateFiles.set(filePath, {
        absolutePath: filePath,
        file: toWorkspacePath(filePath),
        sourceText,
        tables: definitions.tables,
        enums: definitions.enums,
        family: getSchemaFamily(filePath),
      });
    }
  }

  const reverseGraph = new Map();
  const workspaceFiles = walkFiles(WORKSPACE_ROOT, WORKSPACE_SCAN_EXTENSIONS).filter((filePath) => {
    const workspacePath = toWorkspacePath(filePath);
    return workspacePath !== toWorkspacePath(MANIFEST_JSON_PATH) && workspacePath !== toWorkspacePath(MANIFEST_MD_PATH);
  });

  for (const importerPath of workspaceFiles) {
    const sourceText = candidateFiles.get(importerPath)?.sourceText ?? readText(importerPath);
    for (const specifier of extractImportSpecifiers(sourceText)) {
      const resolvedTarget = resolveImportTarget(importerPath, specifier);
      if (resolvedTarget && candidateFiles.has(resolvedTarget) && resolvedTarget !== importerPath) {
        addToNestedSet(reverseGraph, resolvedTarget, importerPath);
      }
    }
  }

  const collectUpstreamImporters = (targetPath) => {
    const runtime = new Set();
    const testOrScript = new Set();
    const other = new Set();
    const internalChain = new Set();
    const queue = [targetPath];
    const visitedCandidates = new Set([targetPath]);

    while (queue.length > 0) {
      const current = queue.shift();
      for (const importerPath of reverseGraph.get(current) ?? []) {
        if (candidateFiles.has(importerPath)) {
          if (!visitedCandidates.has(importerPath)) {
            visitedCandidates.add(importerPath);
            internalChain.add(toWorkspacePath(importerPath));
            queue.push(importerPath);
          }
          continue;
        }

        const importerType = classifyImporter(importerPath);
        const importerWorkspacePath = toWorkspacePath(importerPath);
        if (importerType === 'runtime') {
          runtime.add(importerWorkspacePath);
        } else if (importerType === 'testOrScript') {
          testOrScript.add(importerWorkspacePath);
        } else {
          other.add(importerWorkspacePath);
        }
      }
    }

    return {
      runtime: [...runtime].sort((left, right) => left.localeCompare(right)),
      testOrScript: [...testOrScript].sort((left, right) => left.localeCompare(right)),
      other: [...other].sort((left, right) => left.localeCompare(right)),
      internalChain: [...internalChain].sort((left, right) => left.localeCompare(right)),
    };
  };

  const fileFamilies = new Map();
  for (const fileInfo of candidateFiles.values()) {
    addToNestedSet(fileFamilies, fileInfo.family, fileInfo.file);
  }

  const tableDefinitionsByName = new Map();
  const enumDefinitionsByName = new Map();

  for (const fileInfo of candidateFiles.values()) {
    for (const table of fileInfo.tables) {
      addToNestedSet(tableDefinitionsByName, table.dbName, fileInfo.file);
    }
    for (const enumInfo of fileInfo.enums) {
      addToNestedSet(enumDefinitionsByName, enumInfo.dbName, fileInfo.file);
    }
  }

  const allFiles = [...candidateFiles.values()].map((fileInfo) => {
    const importers = collectUpstreamImporters(fileInfo.absolutePath);
    const definitionBuckets = [
      ...fileInfo.tables.map((table) => inferFeatureBucket(table.exportName, table.dbName, fileInfo.file)),
      ...fileInfo.enums.map((enumInfo) => inferFeatureBucket(enumInfo.exportName, enumInfo.dbName, fileInfo.file)),
    ];
    const familyPeers = [...(fileFamilies.get(fileInfo.family) ?? [])]
      .filter((peer) => peer !== fileInfo.file)
      .sort((left, right) => left.localeCompare(right));
    const duplicateDefinitionNames = uniqueSorted([
      ...fileInfo.tables
        .filter((table) => (tableDefinitionsByName.get(table.dbName) ?? new Set()).size > 1)
        .map((table) => table.dbName),
      ...fileInfo.enums
        .filter((enumInfo) => (enumDefinitionsByName.get(enumInfo.dbName) ?? new Set()).size > 1)
        .map((enumInfo) => enumInfo.dbName),
    ]);
    const enrichedFileInfo = { ...fileInfo, importers, definitionBuckets };
    const status = classifyFileStatus(enrichedFileInfo, familyPeers, duplicateDefinitionNames);
    const notes = collectNotes(enrichedFileInfo, familyPeers, duplicateDefinitionNames);

    return {
      ...fileInfo,
      importers,
      definitionBuckets,
      dominantBucket: definitionBuckets.length > 0 ? dominantBucket(definitionBuckets) : 'infra/runtime',
      owner: guessOwner(enrichedFileInfo),
      status,
      runtimeImported: summarizeRootImportState({ importers }),
      familyPeers,
      duplicateDefinitionNames,
      notes,
    };
  }).sort((left, right) => left.file.localeCompare(right.file));

  const rootSchemaFiles = allFiles.filter(
    (fileInfo) => dirname(fileInfo.absolutePath) === ROOT_DB_DIR && ROOT_SCHEMA_FILE_ALLOWLIST.has(basename(fileInfo.absolutePath))
  );
  const allDefinitions = [];

  for (const fileInfo of allFiles) {
    const referencedFrom = uniqueSorted([
      ...fileInfo.importers.runtime,
      ...fileInfo.importers.testOrScript,
      ...fileInfo.importers.other,
    ]);

    for (const table of fileInfo.tables) {
      const duplicateFiles = [...(tableDefinitionsByName.get(table.dbName) ?? new Set())]
        .map(normalizeSlashes)
        .filter((peerFile) => peerFile !== fileInfo.file)
        .sort((left, right) => left.localeCompare(right));
      allDefinitions.push({
        kind: 'table',
        exportName: table.exportName,
        name: table.dbName,
        sourceFile: fileInfo.file,
        featureBucket: inferFeatureBucket(table.exportName, table.dbName, fileInfo.file),
        fileClassification: fileInfo.status,
        status: manifestStatusFor(table, fileInfo.status, duplicateFiles),
        referencedFrom,
        relatedSchemaFiles: uniqueSorted([...duplicateFiles, ...fileInfo.familyPeers]),
      });
    }

    for (const enumInfo of fileInfo.enums) {
      const duplicateFiles = [...(enumDefinitionsByName.get(enumInfo.dbName) ?? new Set())]
        .map(normalizeSlashes)
        .filter((peerFile) => peerFile !== fileInfo.file)
        .sort((left, right) => left.localeCompare(right));
      allDefinitions.push({
        kind: 'enum',
        exportName: enumInfo.exportName,
        name: enumInfo.dbName,
        sourceFile: fileInfo.file,
        featureBucket: inferFeatureBucket(enumInfo.exportName, enumInfo.dbName, fileInfo.file),
        fileClassification: fileInfo.status,
        status: manifestStatusFor(enumInfo, fileInfo.status, duplicateFiles),
        referencedFrom,
        relatedSchemaFiles: uniqueSorted([...duplicateFiles, ...fileInfo.familyPeers]),
      });
    }
  }

  const tables = allDefinitions.filter((definition) => definition.kind === 'table');
  const enums = allDefinitions.filter((definition) => definition.kind === 'enum');
  const uniqueTableNames = uniqueSorted(tables.map((definition) => definition.name));
  const uniqueEnumNames = uniqueSorted(enums.map((definition) => definition.name));
  const activeUniqueTableNames = uniqueSorted(
    tables.filter((definition) => definition.status === 'active').map((definition) => definition.name)
  );
  const activeUniqueEnumNames = uniqueSorted(
    enums.filter((definition) => definition.status === 'active').map((definition) => definition.name)
  );
  const bucketSummary = FEATURE_BUCKETS.map((bucket) => ({
    bucket,
    tables: uniqueSorted(
      tables.filter((definition) => definition.featureBucket === bucket).map((definition) => definition.name)
    ).length,
    enums: uniqueSorted(
      enums.filter((definition) => definition.featureBucket === bucket).map((definition) => definition.name)
    ).length,
    files: uniqueSorted(
      allFiles
        .filter((fileInfo) => fileInfo.definitionBuckets.includes(bucket))
        .map((fileInfo) => fileInfo.file)
    ),
  }));

  const duplicates = {
    tables: [...tableDefinitionsByName.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([name, files]) => ({ kind: 'table', name, files: [...files].map(normalizeSlashes).sort((left, right) => left.localeCompare(right)) }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    enums: [...enumDefinitionsByName.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([name, files]) => ({ kind: 'enum', name, files: [...files].map(normalizeSlashes).sort((left, right) => left.localeCompare(right)) }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    fileFamilies: [...fileFamilies.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([family, files]) => ({ family, files: [...files].sort((left, right) => left.localeCompare(right)) }))
      .sort((left, right) => left.family.localeCompare(right.family)),
  };

  return {
    generatedAt: new Date().toISOString(),
    authoritativeSource: {
      roots: SCAN_ROOTS.map(toWorkspacePath),
      extraFiles: EXTRA_SCHEMA_FILES.map(toWorkspacePath),
      summaryDoc: toWorkspacePath(SUMMARY_DOC_PATH),
    },
    summary: {
      tableCount: tables.length,
      enumCount: enums.length,
      uniqueTableCount: uniqueTableNames.length,
      uniqueEnumCount: uniqueEnumNames.length,
      activeUniqueTableCount: activeUniqueTableNames.length,
      activeUniqueEnumCount: activeUniqueEnumNames.length,
      rootSchemaFileCount: rootSchemaFiles.length,
      activeDefinitionCount: allDefinitions.filter((definition) => definition.status === 'active').length,
      legacyDefinitionCount: allDefinitions.filter((definition) => definition.status === 'legacy').length,
      duplicateCandidateCount: allDefinitions.filter((definition) => definition.status === 'duplicate candidate').length,
      migrationOnlyCount: allDefinitions.filter((definition) => definition.status === 'migration-only').length,
    },
    buckets: bucketSummary,
    files: allFiles.map((fileInfo) => ({
      file: fileInfo.file,
      runtimeImported: fileInfo.runtimeImported,
      tables: fileInfo.tables.map((table) => table.dbName),
      enums: fileInfo.enums.map((enumInfo) => enumInfo.dbName),
      owner: fileInfo.owner,
      status: fileInfo.status,
      notes: fileInfo.notes,
      importers: fileInfo.importers,
    })),
    rootSchemaFiles: rootSchemaFiles.map((fileInfo) => ({
      file: fileInfo.file,
      runtimeImported: fileInfo.runtimeImported,
      tables: fileInfo.tables.map((table) => table.dbName),
      enums: fileInfo.enums.map((enumInfo) => enumInfo.dbName),
      owner: fileInfo.owner,
      status: fileInfo.status,
      notes: fileInfo.notes,
      importers: fileInfo.importers,
    })),
    definitions: {
      tables: tables.sort((left, right) => left.name.localeCompare(right.name)),
      enums: enums.sort((left, right) => left.name.localeCompare(right.name)),
    },
    duplicates,
  };
}

function renderManifestMarkdown(manifest) {
  const totalsTable = renderMarkdownTable(
    ['Metric', 'Count'],
    [
      ['table declarations', manifest.summary.tableCount],
      ['enum declarations', manifest.summary.enumCount],
      ['unique table names', manifest.summary.uniqueTableCount],
      ['unique enum names', manifest.summary.uniqueEnumCount],
      ['active unique table names', manifest.summary.activeUniqueTableCount],
      ['active unique enum names', manifest.summary.activeUniqueEnumCount],
      ['root schema files', manifest.summary.rootSchemaFileCount],
      ['active definitions', manifest.summary.activeDefinitionCount],
      ['legacy definitions', manifest.summary.legacyDefinitionCount],
      ['duplicate candidates', manifest.summary.duplicateCandidateCount],
      ['migration-only definitions', manifest.summary.migrationOnlyCount],
    ]
  );

  const bucketTable = renderMarkdownTable(
    ['Bucket', 'Tables', 'Enums', 'Files'],
    manifest.buckets.map((bucket) => [bucket.bucket, bucket.tables, bucket.enums, listOrDash(bucket.files)])
  );

  const activeFiles = manifest.files
    .filter((fileInfo) => fileInfo.status === 'imported by runtime')
    .map((fileInfo) => [
      fileInfo.file,
      fileInfo.tables.length,
      fileInfo.enums.length,
      fileInfo.owner,
      listOrDash(fileInfo.notes),
    ]);

  const legacyFiles = manifest.rootSchemaFiles
    .filter((fileInfo) => fileInfo.status !== 'imported by runtime')
    .map((fileInfo) => [
      fileInfo.file,
      fileInfo.status,
      fileInfo.runtimeImported,
      fileInfo.tables.length,
      fileInfo.enums.length,
      listOrDash(fileInfo.notes),
    ]);

  const duplicateRows = [
    ...manifest.duplicates.tables.map((duplicate) => ['table', duplicate.name, listOrDash(duplicate.files)]),
    ...manifest.duplicates.enums.map((duplicate) => ['enum', duplicate.name, listOrDash(duplicate.files)]),
  ];

  const sections = [
    '# Schema Manifest',
    '',
    `Generated from code on ${manifest.generatedAt}.`,
    '',
    `Authority is frozen to ${manifest.authoritativeSource.roots.join(' and ')}.`,
    '',
    '## Current Totals',
    '',
    totalsTable,
    '',
    '## Feature Buckets',
    '',
    bucketTable,
    '',
    '## Active Schema Files',
    '',
    renderMarkdownTable(['File', 'Tables', 'Enums', 'Owner', 'Notes'], activeFiles),
    '',
    '## Legacy / Dead Candidates',
    '',
    renderMarkdownTable(['File', 'Classification', 'Runtime imported?', 'Tables', 'Enums', 'Notes'], legacyFiles),
    '',
    '## Duplicate Definition Candidates',
    '',
    duplicateRows.length > 0
      ? renderMarkdownTable(['Kind', 'Name', 'Defined in'], duplicateRows)
      : 'No exact duplicate table or enum names were found.',
    '',
    '## Tables By Feature',
    '',
  ];

  for (const bucket of FEATURE_BUCKETS) {
    const definitions = manifest.definitions.tables.filter((definition) => definition.featureBucket === bucket);
    sections.push(`### ${bucket}`);
    sections.push('');
    sections.push(
      definitions.length > 0
        ? renderMarkdownTable(
            ['DB name', 'Export', 'Source file', 'Status', 'Referenced from'],
            definitions.map((definition) => [
              definition.name,
              definition.exportName,
              definition.sourceFile,
              definition.status,
              listOrDash(definition.referencedFrom),
            ])
          )
        : 'No tables in this bucket.'
    );
    sections.push('');
  }

  sections.push('## Enums By Feature');
  sections.push('');

  for (const bucket of FEATURE_BUCKETS) {
    const definitions = manifest.definitions.enums.filter((definition) => definition.featureBucket === bucket);
    sections.push(`### ${bucket}`);
    sections.push('');
    sections.push(
      definitions.length > 0
        ? renderMarkdownTable(
            ['DB name', 'Export', 'Source file', 'Status', 'Referenced from'],
            definitions.map((definition) => [
              definition.name,
              definition.exportName,
              definition.sourceFile,
              definition.status,
              listOrDash(definition.referencedFrom),
            ])
          )
        : 'No enums in this bucket.'
    );
    sections.push('');
  }

  return sections.join('\n');
}

function renderOwnershipMarkdown(manifest) {
  return [
    '# Schema File Ownership',
    '',
    `Generated from code on ${manifest.generatedAt}.`,
    '',
    renderMarkdownTable(
      ['File', 'Runtime imported?', 'Tables', 'Enums', 'Owner', 'Status', 'Notes'],
      manifest.rootSchemaFiles.map((fileInfo) => [
        fileInfo.file,
        fileInfo.runtimeImported,
        fileInfo.tables.length === 0 ? '-' : fileInfo.tables.join(', '),
        fileInfo.enums.length === 0 ? '-' : fileInfo.enums.join(', '),
        fileInfo.owner,
        fileInfo.status,
        listOrDash(fileInfo.notes),
      ])
    ),
  ].join('\n');
}

function renderSummaryDoc(manifest) {
  const bucketTable = renderMarkdownTable(
    ['Bucket', 'Tables', 'Enums'],
    manifest.buckets.map((bucket) => [bucket.bucket, bucket.tables, bucket.enums])
  );

  const activeFileRows = manifest.files
    .filter((fileInfo) => fileInfo.status === 'imported by runtime')
    .map((fileInfo) => [fileInfo.file, fileInfo.owner, fileInfo.tables.length, fileInfo.enums.length]);

  const legacyRows = manifest.rootSchemaFiles
    .filter((fileInfo) => fileInfo.status !== 'imported by runtime')
    .map((fileInfo) => [fileInfo.file, fileInfo.status, fileInfo.runtimeImported, listOrDash(fileInfo.notes)]);

  const sections = [
    '# Drizzle Schema Reference',
    '',
    `Generated from ${toWorkspacePath(MANIFEST_JSON_PATH)} on ${manifest.generatedAt}.`,
    '',
    '> This file is generated. Current schema code is the authority; prose summaries are stale if they diverge from the manifest.',
    '',
    '## Current Totals',
    '',
    renderMarkdownTable(
      ['Metric', 'Count'],
      [
        ['table declarations', manifest.summary.tableCount],
        ['enum declarations', manifest.summary.enumCount],
        ['unique table names', manifest.summary.uniqueTableCount],
        ['unique enum names', manifest.summary.uniqueEnumCount],
        ['active unique table names', manifest.summary.activeUniqueTableCount],
        ['active unique enum names', manifest.summary.activeUniqueEnumCount],
        ['root schema files', manifest.summary.rootSchemaFileCount],
      ]
    ),
    '',
    '## Feature Buckets',
    '',
    bucketTable,
    '',
    '## Active Schema Files',
    '',
    renderMarkdownTable(['File', 'Owner', 'Tables', 'Enums'], activeFileRows),
    '',
    '## Legacy / Dead Candidates',
    '',
    renderMarkdownTable(['File', 'Classification', 'Runtime imported?', 'Notes'], legacyRows),
    '',
    '## Tables By Feature',
    '',
  ];

  for (const bucket of FEATURE_BUCKETS) {
    const tables = manifest.definitions.tables.filter((definition) => definition.featureBucket === bucket);
    sections.push(`### ${bucket} Tables`);
    sections.push('');
    if (tables.length === 0) {
      sections.push('No tables in this bucket.');
      sections.push('');
      continue;
    }
    sections.push(
      renderMarkdownTable(
        ['DB name', 'Export', 'Source file', 'Status'],
        tables.map((definition) => [definition.name, definition.exportName, definition.sourceFile, definition.status])
      )
    );
    sections.push('');
  }

  sections.push('## Enums By Feature');
  sections.push('');

  for (const bucket of FEATURE_BUCKETS) {
    const enums = manifest.definitions.enums.filter((definition) => definition.featureBucket === bucket);
    sections.push(`### ${bucket}`);
    sections.push('');
    if (enums.length === 0) {
      sections.push('No enums in this bucket.');
      sections.push('');
      continue;
    }
    sections.push(
      renderMarkdownTable(
        ['DB name', 'Export', 'Source file', 'Status'],
        enums.map((definition) => [definition.name, definition.exportName, definition.sourceFile, definition.status])
      )
    );
    sections.push('');
  }

  return sections.join('\n');
}

function deprecationActionFor(fileInfo) {
  if (fileInfo.status === 'legacy duplicate' || fileInfo.status === 'dead candidate') {
    return 'archive';
  }
  if (fileInfo.status === 'imported only by tests/scripts') {
    return 'remove after verification';
  }
  return 'keep';
}

function nonRuntimeImportersFor(fileInfo) {
  return [...fileInfo.importers.testOrScript, ...fileInfo.importers.other];
}

function isBackupOnlyImporter(importerPath) {
  const normalized = importerPath.toLowerCase();
  return (
    normalized.includes('scripts/api-cleanup/reports/backup-') ||
    normalized.includes('scripts/phase104-backups/')
  );
}

function hasOnlyBackupImporters(fileInfo) {
  const importers = nonRuntimeImportersFor(fileInfo);
  return importers.length > 0 && importers.every(isBackupOnlyImporter);
}

function retirementPriorityRank(fileInfo) {
  const definitionCount = fileInfo.tables.length + fileInfo.enums.length;

  if (fileInfo.status === 'dead candidate') {
    return definitionCount === 0 ? 0 : 1;
  }

  if (fileInfo.status === 'legacy duplicate') {
    return definitionCount === 0 ? 2 : 3;
  }

  if (fileInfo.status === 'imported only by tests/scripts') {
    return 4;
  }

  if (fileInfo.status === 'unknown owner') {
    return 5;
  }

  return 6;
}

function compareRetirementPriority(left, right) {
  const importerDelta = nonRuntimeImportersFor(left).length - nonRuntimeImportersFor(right).length;
  if (importerDelta !== 0) {
    return importerDelta;
  }

  const rankDelta = retirementPriorityRank(left) - retirementPriorityRank(right);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  const definitionDelta = (left.tables.length + left.enums.length) - (right.tables.length + right.enums.length);
  if (definitionDelta !== 0) {
    return definitionDelta;
  }

  return left.file.localeCompare(right.file);
}

function importerProfile(fileInfo) {
  const runtimeCount = fileInfo.importers.runtime.length;
  const testCount = fileInfo.importers.testOrScript.length;
  const otherCount = fileInfo.importers.other.length;
  const nonRuntimeCount = testCount + otherCount;

  if (runtimeCount > 0) {
    return `${runtimeCount} runtime importer(s)`;
  }

  if (nonRuntimeCount === 0) {
    return 'no external importers';
  }

  if (hasOnlyBackupImporters(fileInfo)) {
    return `${nonRuntimeCount} backup-only importer(s)`;
  }

  const parts = [];
  if (testCount > 0) {
    parts.push(`${testCount} test/script`);
  }
  if (otherCount > 0) {
    parts.push(`${otherCount} other`);
  }
  return `${parts.join(' + ')} importer(s)`;
}

function retirementReason(fileInfo) {
  const definitionCount = fileInfo.tables.length + fileInfo.enums.length;

  if (fileInfo.status === 'dead candidate') {
    if (definitionCount === 0) {
      return 'No importers and no remaining schema declarations.';
    }
    return 'No importers remain; orphaned declarations can be retired after one last duplicate check.';
  }

  if (fileInfo.status === 'legacy duplicate') {
    if (definitionCount === 0) {
      return 'Wrapper-only duplicate with no importers.';
    }
    return 'Duplicate definitions are unreferenced; archive after confirming the canonical file still covers the names.';
  }

  if (fileInfo.status === 'imported only by tests/scripts') {
    if (hasOnlyBackupImporters(fileInfo)) {
      return 'Only archival backup trees still import this file.';
    }
    return 'Non-runtime importers still exist and must be redirected or deleted first.';
  }

  if (fileInfo.status === 'unknown owner') {
    return 'Import graph is clean, but canonical ownership is still unresolved.';
  }

  return 'Keep until a narrower retirement condition is established.';
}

function retirementNextStep(fileInfo) {
  if (fileInfo.status === 'unknown owner') {
    return `Assign an owner for ${listOrDash(fileInfo.tables)} before archival.`;
  }

  if (nonRuntimeImportersFor(fileInfo).length === 0) {
    return 'Archive the file, regenerate the manifest, and verify the duplicate set shrinks as expected.';
  }

  if (hasOnlyBackupImporters(fileInfo)) {
    return 'Delete or retarget the backup-only script importers, then regenerate the manifest.';
  }

  return 'Redirect the remaining non-runtime imports to the canonical schema file first.';
}

function buildRetirementPlan(rootFiles) {
  const candidates = rootFiles
    .filter((fileInfo) => fileInfo.status !== 'imported by runtime')
    .filter((fileInfo) => deprecationActionFor(fileInfo) !== 'keep' || fileInfo.status === 'unknown owner');

  const readyNow = candidates
    .filter((fileInfo) => nonRuntimeImportersFor(fileInfo).length === 0)
    .filter((fileInfo) => fileInfo.status !== 'unknown owner')
    .sort(compareRetirementPriority);

  const backupBlocked = candidates
    .filter((fileInfo) => nonRuntimeImportersFor(fileInfo).length > 0)
    .filter((fileInfo) => hasOnlyBackupImporters(fileInfo))
    .sort(compareRetirementPriority);

  const hold = candidates
    .filter(
      (fileInfo) =>
        fileInfo.status === 'unknown owner' ||
        (nonRuntimeImportersFor(fileInfo).length > 0 && !hasOnlyBackupImporters(fileInfo))
    )
    .sort(compareRetirementPriority);

  return { readyNow, backupBlocked, hold };
}

function renderConsolidationPlan(manifest) {
  const rootFiles = manifest.rootSchemaFiles;
  const retirementPlan = buildRetirementPlan(rootFiles);
  const sections = [
    '# Schema Consolidation Plan',
    '',
    `Generated from code on ${manifest.generatedAt}.`,
    '',
    '## Domain Ownership',
    '',
  ];

  const domainRows = FEATURE_BUCKETS.map((bucket) => {
    const plan = DOMAIN_PLANS[bucket];
    const supportingFiles = uniqueSorted(
      manifest.files
        .map((fileInfo) => fileInfo.file)
        .filter((filePath) => plan.supportingPatterns.some((pattern) => filePath.includes(pattern.replace(/^\//, ''))))
    );
    const legacyFiles = rootFiles
      .filter((fileInfo) => fileInfo.owner === plan.owner || fileInfo.notes.some((note) => note.includes(bucket.split('/')[0].trim())))
      .filter((fileInfo) => fileInfo.status !== 'imported by runtime')
      .map((fileInfo) => fileInfo.file);
    return [
      bucket,
      plan.canonicalFile,
      plan.owner,
      listOrDash(supportingFiles),
      listOrDash(uniqueSorted(legacyFiles)),
      plan.migrationPolicy,
    ];
  });

  sections.push(
    renderMarkdownTable(
      ['Domain', 'Canonical schema file', 'Owning feature/system', 'Supporting helper files', 'Legacy files to verify', 'Migration policy'],
      domainRows
    )
  );
  sections.push('');
  sections.push('## Deprecation List');
  sections.push('');

  const deprecationRows = rootFiles.map((fileInfo) => {
    const action = deprecationActionFor(fileInfo);
    return [fileInfo.file, action, fileInfo.status, listOrDash(fileInfo.notes)];
  });

  sections.push(renderMarkdownTable(['File', 'Decision', 'Classification', 'Reason'], deprecationRows));
  sections.push('');
  sections.push('## Import-Traced Retirement Order');
  sections.push('');
  sections.push('### Wave 1: Zero-import retirements');
  sections.push('');
  sections.push(
    retirementPlan.readyNow.length > 0
      ? renderMarkdownTable(
          ['Order', 'File', 'Classification', 'Importer profile', 'Why next', 'Next step'],
          retirementPlan.readyNow.map((fileInfo, index) => [
            index + 1,
            fileInfo.file,
            fileInfo.status,
            importerProfile(fileInfo),
            retirementReason(fileInfo),
            retirementNextStep(fileInfo),
          ])
        )
      : 'No zero-import retirement candidates.'
  );
  sections.push('');
  sections.push('### Wave 2: Backup-only importer cleanup');
  sections.push('');
  sections.push(
    retirementPlan.backupBlocked.length > 0
      ? renderMarkdownTable(
          ['Order', 'File', 'Classification', 'Importer profile', 'Blocking importers', 'Next step'],
          retirementPlan.backupBlocked.map((fileInfo, index) => [
            index + 1,
            fileInfo.file,
            fileInfo.status,
            importerProfile(fileInfo),
            listOrDash(nonRuntimeImportersFor(fileInfo).slice(0, 5)),
            retirementNextStep(fileInfo),
          ])
        )
      : 'No backup-only importer blockers.'
  );
  sections.push('');
  sections.push('### Hold');
  sections.push('');
  sections.push(
    retirementPlan.hold.length > 0
      ? renderMarkdownTable(
          ['File', 'Classification', 'Importer profile', 'Why held', 'Next step'],
          retirementPlan.hold.map((fileInfo) => [
            fileInfo.file,
            fileInfo.status,
            importerProfile(fileInfo),
            retirementReason(fileInfo),
            retirementNextStep(fileInfo),
          ])
        )
      : 'No held files.'
  );
  sections.push('');
  sections.push('## Cleanup Sequence');
  sections.push('');
  sections.push('1. Regenerate the manifest after every schema edit.');
  sections.push('2. Remove dead references in docs, scripts, and wrappers before touching definitions.');
  sections.push('3. Redirect imports to the proposed canonical file for each domain, keeping compatibility re-exports as needed.');
  sections.push('4. Archive or remove legacy root files only after runtime import tracing stays clean.');

  return sections.join('\n');
}

function writeOutputs(manifest) {
  ensureDirectory(OUTPUT_DIR);
  ensureDirectory(dirname(SUMMARY_DOC_PATH));

  writeFileSync(MANIFEST_JSON_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(MANIFEST_MD_PATH, `${renderManifestMarkdown(manifest)}\n`);
  writeFileSync(OWNERSHIP_MD_PATH, `${renderOwnershipMarkdown(manifest)}\n`);
  writeFileSync(CONSOLIDATION_MD_PATH, `${renderConsolidationPlan(manifest)}\n`);
  writeFileSync(SUMMARY_DOC_PATH, `${renderSummaryDoc(manifest)}\n`);
}

const manifest = buildManifest();

if (!DRY_RUN) {
  writeOutputs(manifest);
}

console.log(
  JSON.stringify(
    {
      generatedAt: manifest.generatedAt,
      outputsWritten: !DRY_RUN,
      outputFiles: {
        manifestJson: toWorkspacePath(MANIFEST_JSON_PATH),
        manifestMarkdown: toWorkspacePath(MANIFEST_MD_PATH),
        ownershipMarkdown: toWorkspacePath(OWNERSHIP_MD_PATH),
        consolidationMarkdown: toWorkspacePath(CONSOLIDATION_MD_PATH),
        summaryDoc: toWorkspacePath(SUMMARY_DOC_PATH),
      },
      summary: manifest.summary,
    },
    null,
    2
  )
);