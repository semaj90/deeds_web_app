#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend' ? path.dirname(current) : current;
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const reportsDir = path.join(cwd, 'docs', 'reports');
const cardsPath = path.join(knowledgeDir, 'schema-indexer-contract-cards.jsonl');
const manifestPath = path.join(knowledgeDir, 'schema-indexer-contract-manifest.json');
const reportJsonPath = path.join(reportsDir, 'schema-indexer-contract-report.json');
const reportMdPath = path.join(reportsDir, 'schema-indexer-contract-report.md');

const SCHEMA_DIRS = [
  path.join(cwd, 'sveltekit-frontend', 'src', 'lib', 'server', 'db', 'schema'),
  path.join(cwd, 'sveltekit-frontend', 'src', 'lib', 'server', 'db'),
];

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function uniq(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value.trim().length > 0))];
}

function compact(text, limit = 320) {
  const normalized = String(text ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function normalizeRef(ref) {
  if (!ref) return '';
  let value = String(ref).trim().replace(/\\/g, '/');
  const svelteIdx = value.toLowerCase().indexOf('sveltekit-frontend/');
  if (svelteIdx >= 0) value = value.slice(svelteIdx + 'sveltekit-frontend/'.length);
  const repoIdx = value.toLowerCase().indexOf('deeds-web-app/');
  if (repoIdx >= 0) value = value.slice(repoIdx + 'deeds-web-app/'.length);
  return value.replace(/^\.\//, '');
}

function classifyDomain(filePath, tableName) {
  const fileName = path.basename(filePath);
  if (fileName.includes('evidence') || tableName.includes('evidence')) return 'evidence-pipeline';
  if (fileName.startsWith('admin-') || tableName.startsWith('admin_') || tableName.includes('skill')) return 'admin-ops';
  if (fileName.includes('error_') || fileName.includes('errorBrain') || tableName.includes('error_') || tableName.includes('error_brain')) return 'error-brain';
  if (fileName.includes('citations') || fileName.includes('legal-') || tableName.includes('legal_') || tableName.includes('citation')) return 'legal-corpus';
  if (fileName.includes('metadata-spine') || tableName.includes('metadata_envelope') || tableName.includes('code_relation') || tableName.includes('audit_event')) return 'metadata-spine';
  if (fileName.includes('features') || tableName.includes('feature_') || tableName.includes('grpo_')) return 'features-mapping';
  return 'general';
}

function parseTablesFromSchema(content) {
  const tables = [];
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    tables.push({ varName: match[1], tableName: match[2] });
  }
  return tables;
}

function isLikelySchemaFile(filePath) {
  const fileName = path.basename(filePath);
  return filePath.endsWith('.ts') && !filePath.endsWith('.d.ts') && (fileName.startsWith('schema-') || fileName === 'schema-postgres.ts' || fileName === 'warden-schema.ts' || fileName === 'cases.ts');
}

async function scanSchemaFiles() {
  const files = [];
  for (const dir of SCHEMA_DIRS) {
    if (!existsSync(dir)) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const abs = path.join(dir, entry.name);
      if (isLikelySchemaFile(abs) || dir.endsWith(path.join('db', 'schema'))) {
        files.push(abs);
      }
    }
  }

  const records = [];
  for (const abs of files) {
    const content = await readIfExists(abs);
    const tables = parseTablesFromSchema(content);
    const rel = normalizeRef(path.relative(cwd, abs));
    records.push({
      file: rel,
      tables: tables.map((table) => ({ ...table, domain: classifyDomain(abs, table.tableName) })),
      text: compact(content),
    });
  }
  return records;
}

function buildCard(records) {
  const files = uniq(records.map((record) => record.file));
  const tableNames = uniq(records.flatMap((record) => record.tables.map((table) => table.tableName)));
  const domains = uniq(records.flatMap((record) => record.tables.map((table) => table.domain)));
  const summary = [
    'schema-focused semantic indexer contract',
    `schema files: ${records.length}`,
    `tables: ${tableNames.length}`,
    `domains: ${domains.length}`,
    'builds 768d embeddings for prompt context engineering',
    'writes Postgres metadata envelopes, codebase files, and embeddings',
    'warmed Redis exact pointers for MCP/ACE routing',
    'not a full-repo crawler',
  ].join(' | ');

  return {
    cardId: 'schema-indexer:contract',
    kind: 'schema-indexer-contract',
    title: 'Schema Semantic Indexer Contract',
    summary,
    sourceRefs: uniq([
      'scripts/codebase-semantic-indexer.mjs',
      ...files,
      'docs/atlas/feature-registry.json',
      'docs/reports/feature-gap-registry-live-latest.json',
      'docs/reports/index-gap-memory-report.json',
    ]),
    chunkIds: uniq(['schema-indexer', 'semantic-index', ...tableNames.slice(0, 24)]),
    summaryIds: ['schema-indexer:contract'],
    featureLabels: uniq(['schema', 'semantic-index', 'prompt-context-engineering', 'mcp-search', 'atlas-contract']),
    clusterTags: uniq(['schema', 'indexer', 'prompt-engineering', 'mcp', ...domains]),
    topoClass: 'schema-indexer',
    entities: {
      files,
      routes: uniq(['docs/atlas', 'docs/reports', 'memory/knowledge']),
      tables: tableNames,
      envVars: uniq(['DATABASE_URL', 'REDIS_URL', 'OLLAMA_URL', 'SVELTEKIT_URL']),
      services: uniq(['postgres', 'redis', 'ollama', 'sveltekit']),
      commands: uniq([
        'node scripts/codebase-semantic-indexer.mjs --limit=10',
        'node scripts/codebase-semantic-indexer.mjs --write',
        'npm run knowledge:schema-indexer:refresh',
      ]),
      models: uniq(['embeddinggemma:latest']),
    },
    graphLinks: [
      {
        relation: 'implements',
        targetId: 'codebase.semantic_index',
        reason: 'schema indexer is the concrete lane behind the live semantic index registry entry',
      },
      {
        relation: 'depends_on',
        targetId: 'atlas:feature-registry',
        reason: 'schema contract supplies prompt-context engineering and atlas coverage',
      },
      {
        relation: 'uses',
        targetId: 'knowledge:index-gap:overview',
        reason: 'schema contract can be searched independently from workspace-gap cards',
      },
    ],
    retrieval: {
      redisKey: 'knowledge:schema-indexer:contract',
      qdrantPointId: stableHash(summary).slice(0, 12),
      embeddingModel: 'embeddinggemma:latest',
      embeddingDim: 768,
      score: 1,
    },
    lifecycle: {
      status: 'production_ready',
      confidence: 0.97,
      reason: 'schema contract is live, file-backed, and independent of workspace-gap cards',
    },
    schemaIndex: {
      files: records.length,
      tables: tableNames.length,
      domains,
      schemaDirs: SCHEMA_DIRS.map((dir) => normalizeRef(path.relative(cwd, dir))),
      fullRepoCrawler: false,
      promptContextEngineering: true,
      postgresWrites: true,
      redisWarmKeys: true,
    },
    searchHints: [
      'rg -n -uu "codebase-semantic-indexer|pgTable\\(" sveltekit-frontend/src/lib/server/db scripts',
      'node scripts/codebase-semantic-indexer.mjs --limit=10',
      'node scripts/codebase-semantic-indexer.mjs --write',
      'rg -n -uu "metadata_envelopes|codebase_embeddings|codebase_files" sveltekit-frontend/src/lib/server/db scripts',
    ],
  };
}

async function main() {
  const records = await scanSchemaFiles();
  const card = buildCard(records);
  const cards = [card];

  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });

  await fs.writeFile(cardsPath, `${cards.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');

  const manifest = {
    generatedAt: new Date().toISOString(),
    root: cwd,
    counts: {
      cards: cards.length,
      schemaFiles: records.length,
      tables: card.entities.tables.length,
      domains: card.schemaIndex.domains.length,
    },
    outputs: {
      cardsPath,
      manifestPath,
      reportJsonPath,
      reportMdPath,
    },
    inputs: {
      schemaDirs: card.schemaIndex.schemaDirs,
      semanticIndexer: 'scripts/codebase-semantic-indexer.mjs',
    },
    note: 'Standalone schema-indexer contract for MCP search and prompt-context engineering, independent from workspace-gap cards.',
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const report = {
    generatedAt: manifest.generatedAt,
    manifest,
    counts: manifest.counts,
    card,
    nextActions: [
      'Use this contract as the schema-only MCP search anchor.',
      'Keep workspace-gap cards separate from schema-indexer contract coverage.',
      'Run the codebase semantic indexer only against schema sources and verified contract tables.',
    ],
  };

  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(
    reportMdPath,
    [
      '# Schema Indexer Contract',
      '',
      `Generated: ${manifest.generatedAt}`,
      '',
      '## Summary',
      `- schema files: ${manifest.counts.schemaFiles}`,
      `- tables: ${manifest.counts.tables}`,
      `- domains: ${manifest.counts.domains}`,
      '',
      '## Contract',
      `- cardId: ${card.cardId}`,
      `- redisKey: ${card.retrieval.redisKey}`,
      `- qdrantPointId: ${card.retrieval.qdrantPointId}`,
      `- sourceRefs: ${card.sourceRefs.join(', ')}`,
      '',
      '## Next Actions',
      ...report.nextActions.map((step) => `- ${step}`),
      '',
    ].join('\n'),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        cards_built: cards.length,
        schema_files: records.length,
        tables: card.entities.tables.length,
        domains: card.schemaIndex.domains.length,
        cards_path: cardsPath,
        manifest_path: manifestPath,
        report_json: reportJsonPath,
        report_md: reportMdPath,
        next_exact_command: 'npm run knowledge:schema-indexer:embed',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[knowledge:schema-indexer:build] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
