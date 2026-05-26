#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const reportsDir = path.join(cwd, 'docs', 'reports');
const cardsPath = path.join(knowledgeDir, 'index-gap-memory-cards.jsonl');
const manifestPath = path.join(knowledgeDir, 'index-gap-memory-manifest.json');
const reportJsonPath = path.join(reportsDir, 'index-gap-memory-report.json');
const reportMdPath = path.join(reportsDir, 'index-gap-memory-report.md');

const FEATURE_REGISTRY_CANDIDATES = [
  path.join(cwd, 'sveltekit-frontend', 'docs', 'atlas', 'feature-registry.json'),
  path.join(cwd, 'docs', 'atlas', 'feature-registry.json'),
  path.join(cwd, 'docs', 'atlas-index', 'feature-gap-registry.json'),
  path.join(cwd, 'sveltekit-frontend', 'docs', 'atlas-index', 'feature-gap-registry.json'),
];

const LIVE_REGISTRY_CANDIDATES = [
  path.join(cwd, 'sveltekit-frontend', 'docs', 'reports', 'feature-gap-registry-live-latest.json'),
  path.join(cwd, 'docs', 'reports', 'feature-gap-registry-live-latest.json'),
];

const FEATURE_MAP_CARD_CANDIDATES = [
  path.join(cwd, 'sveltekit-frontend', 'memory', 'exports', 'feature-map-cards.jsonl'),
  path.join(cwd, 'memory', 'exports', 'feature-map-cards.jsonl'),
];

const CLUSTER_CARD_CANDIDATES = [
  path.join(cwd, 'sveltekit-frontend', 'memory', 'exports', 'cluster-cards.jsonl'),
  path.join(cwd, 'memory', 'exports', 'cluster-cards.jsonl'),
];

const PATHWAY_CARD_CANDIDATES = [
  path.join(cwd, 'sveltekit-frontend', 'memory', 'exports', 'pathway-cards.jsonl'),
  path.join(cwd, 'memory', 'exports', 'pathway-cards.jsonl'),
];

const ATLAS_TOP_CANDIDATES = [
  path.join(cwd, 'memory', 'atlas', 'codebase-atlas.top.json'),
  path.join(cwd, 'sveltekit-frontend', 'memory', 'atlas', 'codebase-atlas.top.json'),
];

const RELEVANT_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts', '.json', '.md', '.svelte', '.ps1', '.sh', '.sql', '.css', '.html', '.yaml', '.yml']);
const ARCHIVE_PATTERNS = [
  /[\\/]deeds_labs[\\/](archived|dead)-/i,
  /[\\/]deeds_labs[\\/].*dead/i,
  /[\\/]\\.phase\d*-backup[\\/]/i,
  /[\\/]_archived[\\/]/i,
  /\.backup\./i,
  /\.bak$/i,
];

function uniq(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => String(value).trim()))];
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRef(ref) {
  if (!ref) return '';
  let value = String(ref).trim();
  value = value.replace(/^local:/i, '');
  value = value.replace(/^file:/i, '');
  value = value.replace(/#L\d+(?:-sha256:[a-f0-9]+)?$/i, '');
  value = value.replace(/\\/g, '/');
  const svelteIdx = value.toLowerCase().indexOf('sveltekit-frontend/');
  if (svelteIdx >= 0) value = value.slice(svelteIdx + 'sveltekit-frontend/'.length);
  const repoIdx = value.toLowerCase().indexOf('deeds-web-app/');
  if (repoIdx >= 0) value = value.slice(repoIdx + 'deeds-web-app/'.length);
  value = value.replace(/^\.\//, '');
  return value;
}

function isLikelyFileRef(ref) {
  const value = normalizeRef(ref);
  if (!value) return false;
  if (/^(npm run|node |pwsh |bun |git |rg |Get-ChildItem|docker |Invoke-RestMethod|curl |python )/i.test(value)) {
    return false;
  }
  return /\.[a-z0-9]{1,6}$/i.test(value);
}

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function makeId(kind, title, seed) {
  return `${kind}:${stableHash(`${title}::${seed}`).slice(0, 12)}`;
}

function scoreCard(card) {
  const lifecycle = card.lifecycle ?? {};
  const status = String(lifecycle.status ?? 'active');
  const base = status === 'production_ready' ? 3 : status === 'active' ? 2 : status === 'archive_to_deeds_lab' ? 1 : 0;
  const refBoost = (card.sourceRefs ?? []).length > 0 ? 0.5 : 0;
  const labelBoost = (card.featureLabels ?? []).length > 0 ? 0.25 : 0;
  return base + refBoost + labelBoost;
}

function classifyPath(filePath) {
  const normalized = normalizeText(filePath);
  const isBackup = ARCHIVE_PATTERNS.some((re) => re.test(filePath));
  const isGenerated = /(?:^|[\\/])(dist|build|\.svelte-kit|node_modules|coverage|tmp|\.tmp|reports)[\\/]/i.test(filePath) || /\.gen\./i.test(filePath);
  const looksAtlas = /(?:atlas|feature|memory|knowledge|kag|engram|ace|qdrant|redis|mcp|graph|cluster|pathway|card|cards)/i.test(filePath);
  const tokens = normalized.split(' ').filter((token) => token.length > 2);
  return { isBackup, isGenerated, looksAtlas, tokens };
}

function extractEntitiesFromText(text) {
  const source = String(text ?? '');
  const files = uniq((source.match(/(?:[\w./-]+\.(?:ts|tsx|js|mjs|cjs|mts|json|md|svelte|ps1|sh|sql|css|html|yaml|yml))/gi) ?? []).slice(0, 40));
  const routes = uniq(
    (source.match(/\/(?:api|routes|mcp|sse|graph|atlas|docs|memory|knowledge|admin|cases|evidence|documents)[\w/\-\[\].?=]*/gi) ?? [])
      .filter((route) => !/\.(?:ts|tsx|js|mjs|cjs|mts|json|md|svelte|ps1|sh|sql|css|html|yaml|yml)(?:[?#].*)?$/i.test(route))
      .slice(0, 40)
  );
  const tables = uniq((source.match(/\b(?:agent_memory_observations|intent_synthesis|intent_synthesis_rewards|llm_context_cache|summary_cards|document_knowledge|feature_maps|codebase_chunks_768|knowledge_base|cluster_cards|pathway_cards|metadata_envelopes|codebase_files|codebase_embeddings)\b/gi) ?? []).map((value) => value.toLowerCase()));
  const envVars = uniq((source.match(/\b[A-Z0-9_]{3,40}\b/g) ?? []).filter((value) => /[A-Z]/.test(value)));
  const services = uniq(
    ['redis', 'qdrant', 'postgres', 'ollama', 'bifrost', 'turboquant', 'trace', 'engram', 'langextract', 'duckdb', 'neo4j', 'bun', 'cuda', 'webgpu', 'mcp'].filter((service) =>
      new RegExp(`\\b${service}\\b`, 'i').test(source)
    )
  );
  const commands = uniq((source.match(/(?:npm run [\w:-]+|node [\w./\\-]+|pwsh [^`"\n]+|bun [^`"\n]+|git [^`"\n]+)/gi) ?? []).slice(0, 25).map((value) => value.trim()));
  const models = uniq((source.match(/(?:embeddinggemma:latest|gemma4[-_:\w]*|qwen[0-9.]*|nomic-embed-text|deepseek[-_:\w]*|turboquant\/gemma4-tq)/gi) ?? []).map((value) => value.toLowerCase()));

  return { files, routes, tables, envVars, services, commands, models };
}

function compact(text, limit = 260) {
  const normalized = String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function candidatePaths(paths) {
  return paths.filter((candidate) => existsSync(candidate));
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readJsonlIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseGitStatus(root) {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    return { ok: false, entries: [], stderr: (result.stderr ?? '').trim() };
  }

  const entries = [];
  for (const line of (result.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
    const code = line.slice(0, 2);
    const rawPath = line.slice(3);
    const file = normalizeRef(rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath);
    if (!file) continue;
    entries.push({
      status: code.trim() || '??',
      file,
      untracked: code.startsWith('??'),
      modified: !code.startsWith('??'),
    });
  }
  return { ok: true, entries, stderr: '' };
}

function isRelevantFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return RELEVANT_EXTS.has(ext) || filePath.endsWith('package.json') || filePath.endsWith('opencode.json') || filePath.endsWith('LLMS.md');
}

function isIndexedRef(filePath, indexedRefs) {
  const target = normalizeRef(filePath);
  if (!target) return false;
  for (const ref of indexedRefs) {
    const normalized = normalizeRef(ref);
    if (!normalized) continue;
    if (normalized === target || normalized.endsWith(`/${target}`) || target.endsWith(`/${normalized}`) || normalized.includes(target) || target.includes(normalized)) {
      return true;
    }
  }
  return false;
}

async function readCandidateText(root, filePath) {
  const abs = path.join(root, filePath);
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile() || stat.size > 180_000) {
      return '';
    }
    const raw = await fs.readFile(abs, 'utf8');
    return raw.slice(0, 20_000);
  } catch {
    return '';
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function main() {
  const featureRegistry = (await Promise.all(candidatePaths(FEATURE_REGISTRY_CANDIDATES).map((filePath) => readJsonIfExists(filePath))))[0] ?? [];
  const liveRegistry = (await Promise.all(candidatePaths(LIVE_REGISTRY_CANDIDATES).map((filePath) => readJsonIfExists(filePath))))[0] ?? { rows: [], summary: {} };
  const featureMapCards = candidatePaths(FEATURE_MAP_CARD_CANDIDATES)[0] ? await readJsonlIfExists(candidatePaths(FEATURE_MAP_CARD_CANDIDATES)[0]) : [];
  const clusterCards = candidatePaths(CLUSTER_CARD_CANDIDATES)[0] ? await readJsonlIfExists(candidatePaths(CLUSTER_CARD_CANDIDATES)[0]) : [];
  const pathwayCards = candidatePaths(PATHWAY_CARD_CANDIDATES)[0] ? await readJsonlIfExists(candidatePaths(PATHWAY_CARD_CANDIDATES)[0]) : [];
  const atlasTop = candidatePaths(ATLAS_TOP_CANDIDATES)[0] ? await readJsonIfExists(candidatePaths(ATLAS_TOP_CANDIDATES)[0], null) : null;
  const git = parseGitStatus(cwd);
  const gitEntries = git.entries.filter((entry) => isRelevantFile(entry.file));

  const indexedRefs = new Set();
  const indexedFeatureKeys = new Set();
  const featureRows = Array.isArray(liveRegistry.rows) ? liveRegistry.rows : [];

  for (const row of featureRegistry) {
    for (const ref of asArray(row?.sourceRefs)) if (isLikelyFileRef(ref)) indexedRefs.add(normalizeRef(ref));
    if (row?.featureKey) indexedFeatureKeys.add(row.featureKey);
  }
  for (const row of featureRows) {
    for (const ref of asArray(row?.sourceRefs)) if (isLikelyFileRef(ref)) indexedRefs.add(normalizeRef(ref));
    for (const ref of asArray(row?.smokeRefs)) if (isLikelyFileRef(ref)) indexedRefs.add(normalizeRef(ref));
    for (const ref of asArray(row?.reportRefs)) if (isLikelyFileRef(ref)) indexedRefs.add(normalizeRef(ref));
    if (row?.owner_file && isLikelyFileRef(row.owner_file)) indexedRefs.add(normalizeRef(row.owner_file));
    if (row?.feature_id) indexedFeatureKeys.add(row.feature_id);
  }
  for (const card of featureMapCards) {
    for (const ref of asArray(card?.sourceRefs)) if (isLikelyFileRef(ref)) indexedRefs.add(normalizeRef(ref));
  }
  for (const card of clusterCards) {
    for (const ref of asArray(card?.sourceRefs)) if (isLikelyFileRef(ref)) indexedRefs.add(normalizeRef(ref));
  }
  for (const card of pathwayCards) {
    for (const ref of asArray(card?.sourceRefs)) if (isLikelyFileRef(ref)) indexedRefs.add(normalizeRef(ref));
  }
  if (atlasTop && Array.isArray(atlasTop.top)) {
    for (const row of atlasTop.top.slice(0, 100)) {
      if (row?.a) indexedRefs.add(normalizeRef(row.a));
      if (row?.p) indexedRefs.add(normalizeRef(row.p));
      if (row?.d) indexedRefs.add(normalizeRef(row.d));
    }
  }

  const trackedChanges = gitEntries.filter((entry) => !entry.untracked);
  const untrackedChanges = gitEntries.filter((entry) => entry.untracked);
  const indexedTracked = [];
  const indexedUntracked = [];
  const trackedGaps = [];
  const untrackedGaps = [];

  for (const entry of trackedChanges) {
    if (isIndexedRef(entry.file, indexedRefs)) indexedTracked.push(entry.file);
    else trackedGaps.push(entry);
  }
  for (const entry of untrackedChanges) {
    if (isIndexedRef(entry.file, indexedRefs)) indexedUntracked.push(entry.file);
    else untrackedGaps.push(entry);
  }

  const cards = [];

  const overviewSummary = [
    `feature registry rows: ${featureRows.length}`,
    `feature registry overlay rows: ${Array.isArray(featureRegistry) ? featureRegistry.length : 0}`,
    `git tracked relevant changes: ${trackedChanges.length}`,
    `git untracked relevant changes: ${untrackedChanges.length}`,
    `indexed tracked matches: ${indexedTracked.length}`,
    `unindexed tracked gaps: ${trackedGaps.length}`,
    `unindexed untracked gaps: ${untrackedGaps.length}`,
  ].join(' | ');

  cards.push({
    cardId: 'index-gap:overview',
    kind: 'overview',
    title: 'Indexed vs Untracked Local Atlas Coverage',
    summary: overviewSummary,
    sourceRefs: uniq([
      'docs/atlas/feature-registry.json',
      'docs/reports/feature-gap-registry-live-latest.json',
      'memory/exports/feature-map-cards.jsonl',
    ]),
    chunkIds: ['git:status', 'feature-gap:registry', 'atlas:feature-registry'],
    summaryIds: ['index-gap:overview'],
    featureLabels: ['atlas', 'feature-gap', 'indexed-vs-untracked', 'mcp-search'],
    clusterTags: ['coverage', 'local', 'registry', 'mcp'],
    topoClass: 'coverage-overview',
    entities: extractEntitiesFromText(overviewSummary),
    graphLinks: [
      {
        relation: 'depends_on',
        targetId: 'feature-gap:registry',
        reason: 'coverage overview anchors the live registry and local workspace scan',
      },
    ],
    retrieval: {
      redisKey: 'knowledge:index-gap:overview',
      qdrantPointId: stableHash(overviewSummary).slice(0, 12),
      embeddingModel: 'embeddinggemma:latest',
      embeddingDim: 768,
      score: 1,
    },
    lifecycle: {
      status: 'active',
      confidence: 0.98,
      reason: 'coverage overview card for indexed vs untracked local atlas analysis',
    },
    indexedState: {
      featureRegistryRows: Array.isArray(featureRegistry) ? featureRegistry.length : 0,
      liveRows: featureRows.length,
      indexedTracked: indexedTracked.length,
      unindexedTracked: trackedGaps.length,
      unindexedUntracked: untrackedGaps.length,
      atlasTopPresent: Boolean(atlasTop),
      liveAtlasContract: Boolean(liveRegistry?.summary && liveRegistry.summary.missingLiveAtlasContract === false),
    },
    searchHints: [
      'rg --files -uu | rg "atlas|feature|memory|knowledge|engram|ace|qdrant|redis|mcp"',
      'git status --porcelain --untracked-files=all',
      'node scripts/opencode/find-feature-files.mjs --feature "feature registry atlas"',
    ],
  });

  for (const row of featureRows) {
    const sourceRefs = uniq(
      [
        row.owner_file,
        ...asArray(row.sourceRefs),
        ...asArray(row.smokeRefs),
        ...asArray(row.reportRefs),
      ]
        .map(normalizeRef)
        .filter((ref) => ref && isLikelyFileRef(ref))
    );
    const summary = compact([
      row.title,
      row.status,
      row.storage_lane,
      row.retrieval_lane,
      row.nextAction,
      `smokeRefs: ${(row.smokeRefs ?? []).join(', ')}`,
      `reportRefs: ${(row.reportRefs ?? []).join(', ')}`,
    ].filter(Boolean).join(' | '));
    const commandHints = uniq([
      ...(row.smokeRefs ?? []).filter((value) => !isLikelyFileRef(value)),
      ...(row.reportRefs ?? []).filter((value) => !isLikelyFileRef(value)),
    ]);
    const featureLabels = uniq([
      row.feature_id,
      row.turbovecLabel,
      ...(row.qdrantTags ?? []),
      normalizeText(row.title).replace(/\s+/g, '-'),
    ]);
    cards.push({
      cardId: `feature-gap:${row.feature_id}`,
      kind: 'feature-gap',
      title: row.title ?? row.feature_id ?? 'feature-gap',
      summary,
      sourceRefs,
      chunkIds: uniq([
        row.feature_id,
        ...(row.smokeRefs ?? []).map((value) => `smoke:${value}`),
      ]),
      summaryIds: ['feature-gap:registry', row.feature_id],
      featureLabels,
      clusterTags: uniq([...(row.qdrantTags ?? []), row.turbovecLabel, row.retrieval_lane, row.storage_lane]),
      topoClass: row.status,
      entities: extractEntitiesFromText([row.title ?? row.feature_id, row.owner_file, row.storage_lane, row.retrieval_lane, row.nextAction, ...sourceRefs].join('\n')),
      graphLinks: [
        {
          relation: 'implements',
          targetId: row.feature_id,
          reason: row.nextAction ?? 'feature gap registry row',
        },
        {
          relation: 'depends_on',
          targetId: 'atlas:feature-registry',
          reason: 'live registry row should stay aligned with the atlas overlay',
        },
      ],
      retrieval: {
        redisKey: `knowledge:feature-gap:${row.feature_id}`,
        qdrantPointId: stableHash(`${row.feature_id}:${sourceRefs.join('|')}`).slice(0, 12),
        embeddingModel: 'embeddinggemma:latest',
        embeddingDim: 768,
        score: row.status === 'implemented' ? 0.97 : row.status === 'partial' ? 0.84 : 0.71,
      },
      lifecycle: {
        status: row.status === 'implemented' ? 'production_ready' : row.status === 'partial' ? 'active' : 'candidate_prune',
        confidence: row.status === 'implemented' ? 0.95 : 0.8,
        reason: row.nextAction ?? `registry row status: ${row.status}`,
      },
      indexedState: {
        liveStatus: row.status,
        indexed: true,
        sourceRefsCount: sourceRefs.length,
        smokeRefsCount: (row.smokeRefs ?? []).length,
        reportRefsCount: (row.reportRefs ?? []).length,
      },
      searchHints: [
        `rg -n -uu "${String(row.title ?? row.feature_id ?? 'feature').replace(/"/g, '\\"')}" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs`,
        `node scripts/opencode/find-feature-files.mjs --feature "${row.feature_id}" --json`,
        ...commandHints.map((value) => `evidence:${value}`),
      ],
    });
  }

  const workspaceGaps = [...trackedGaps, ...untrackedGaps];
  for (const entry of workspaceGaps) {
    const content = await readCandidateText(cwd, entry.file);
    const fileInfo = classifyPath(entry.file);
    const basename = path.basename(entry.file);
    const title = entry.file;
    const summary = compact([
      entry.untracked ? 'untracked local file' : 'modified tracked file not represented in the local atlas overlay',
      entry.status,
      basename,
      fileInfo.isBackup ? 'backup/archive candidate' : '',
      fileInfo.isGenerated ? 'generated artifact' : '',
    ].filter(Boolean).join(' | '));
    const sourceRefs = uniq([
      `local:${entry.file}`,
      entry.file,
    ].filter((ref) => isLikelyFileRef(ref)));
    const labelSeed = uniq([
      ...fileInfo.tokens.slice(0, 8),
      ...entry.file.split(/[\\/._-]+/).filter((token) => token.length > 2).slice(0, 10),
    ]);
    const entities = extractEntitiesFromText([entry.file, content].join('\n'));
    const status = fileInfo.isBackup || fileInfo.isGenerated ? 'candidate_prune' : 'active';
    cards.push({
      cardId: `workspace-gap:${stableHash(entry.file).slice(0, 16)}`,
      kind: entry.untracked ? 'untracked-file' : 'tracked-gap',
      title,
      summary,
      sourceRefs,
      chunkIds: [entry.file, `git:${entry.status}`],
      summaryIds: ['workspace-gap', entry.file],
      featureLabels: uniq([
        ...labelSeed,
        entry.untracked ? 'untracked' : 'tracked-gap',
        fileInfo.isBackup ? 'archive-candidate' : '',
        fileInfo.isGenerated ? 'generated' : '',
      ]),
      clusterTags: uniq([
        ...entry.file.split(/[\\/]/).filter(Boolean).slice(0, 5),
        fileInfo.isBackup ? 'backup' : '',
        fileInfo.isGenerated ? 'generated' : '',
      ]),
      topoClass: entry.untracked ? 'untracked' : 'tracked-gap',
      entities,
      graphLinks: [
        {
          relation: entry.untracked ? 'depends_on' : 'uses',
          targetId: 'atlas:feature-registry',
          reason: 'local workspace change not yet represented in the atlas overlay',
        },
      ],
      retrieval: {
        redisKey: `knowledge:workspace-gap:${stableHash(entry.file).slice(0, 12)}`,
        qdrantPointId: stableHash(`${entry.file}:${entry.status}`).slice(0, 12),
        embeddingModel: 'embeddinggemma:latest',
        embeddingDim: 768,
        score: fileInfo.isBackup ? 0.18 : entry.untracked ? 0.66 : 0.58,
      },
      lifecycle: {
        status,
        confidence: fileInfo.isBackup || fileInfo.isGenerated ? 0.9 : 0.72,
        reason: fileInfo.isBackup
          ? 'backup or archive path'
          : fileInfo.isGenerated
            ? 'generated artifact'
            : entry.untracked
              ? 'untracked local file not yet in atlas coverage'
              : 'tracked file missing from local atlas coverage',
      },
      workspaceState: {
        status: entry.status,
        untracked: entry.untracked,
        modified: entry.modified,
        indexed: isIndexedRef(entry.file, indexedRefs),
      },
      searchHints: [
        `git status --porcelain --untracked-files=all | Select-String "${String(entry.file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
        `rg --files -uu | rg "${String(entry.file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
        `rg -n -uu "${String(basename).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts`,
      ],
    });
  }

  cards.sort((a, b) => scoreCard(b) - scoreCard(a) || a.kind.localeCompare(b.kind) || a.cardId.localeCompare(b.cardId));

  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(cardsPath, `${cards.map((card) => JSON.stringify(card)).join('\n')}\n`, 'utf8');

  const manifest = {
    generatedAt: new Date().toISOString(),
    root: cwd,
    inputs: {
      featureRegistry: FEATURE_REGISTRY_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null,
      liveRegistry: LIVE_REGISTRY_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null,
      featureMapCards: FEATURE_MAP_CARD_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null,
      clusterCards: CLUSTER_CARD_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null,
      pathwayCards: PATHWAY_CARD_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null,
      atlasTop: ATLAS_TOP_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null,
    },
    git: {
      ok: git.ok,
      relevantChanges: gitEntries.length,
      trackedChanges: trackedChanges.length,
      untrackedChanges: untrackedChanges.length,
      indexedTracked: indexedTracked.length,
      indexedUntracked: indexedUntracked.length,
      trackedGaps: trackedGaps.length,
      untrackedGaps: untrackedGaps.length,
    },
    counts: {
      cards: cards.length,
      featureGapRows: featureRows.length,
      workspaceGapCards: workspaceGaps.length,
      overviewCards: 1,
      productionReady: cards.filter((card) => card.lifecycle?.status === 'production_ready').length,
      active: cards.filter((card) => card.lifecycle?.status === 'active').length,
      candidatePrune: cards.filter((card) => card.lifecycle?.status === 'candidate_prune').length,
      archiveToDeedsLab: cards.filter((card) => card.lifecycle?.status === 'archive_to_deeds_lab').length,
    },
    indexedCoverage: {
      indexedRefs: [...indexedRefs].filter(Boolean).length,
      indexedFeatureKeys: indexedFeatureKeys.size,
      atlasOverlayPresent: Boolean(featureRegistry),
      liveAtlasContract: Boolean(liveRegistry?.summary && liveRegistry.summary.missingLiveAtlasContract === false),
    },
    outputs: {
      cardsPath,
      manifestPath,
      reportJsonPath,
      reportMdPath,
    },
    note: 'Indexed-vs-untracked local atlas cards are downstream from the canonical Postgres/Qdrant/Redis/ACE stack.',
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const preview = {
    generatedAt: manifest.generatedAt,
    cards: cards.length,
    workspaceGapCards: workspaceGaps.length,
    indexedTracked: indexedTracked.length,
    untrackedGaps: untrackedGaps.length,
    trackedGaps: trackedGaps.length,
    featureGapRows: featureRows.length,
    atlasOverlayPresent: Boolean(featureRegistry),
    liveAtlasContract: Boolean(liveRegistry?.summary && liveRegistry.summary.missingLiveAtlasContract === false),
  };

  await fs.writeFile(reportJsonPath, JSON.stringify(preview, null, 2), 'utf8');
  await fs.writeFile(
    reportMdPath,
    [
      '# Indexed vs Untracked Local Atlas Memory Cards',
      '',
      `Generated: ${manifest.generatedAt}`,
      '',
      '## Summary',
      `- feature gap rows: ${featureRows.length}`,
      `- cards: ${cards.length}`,
      `- workspace gap cards: ${workspaceGaps.length}`,
      `- tracked gaps: ${trackedGaps.length}`,
      `- untracked gaps: ${untrackedGaps.length}`,
      `- indexed tracked matches: ${indexedTracked.length}`,
      `- atlas overlay present: ${Boolean(featureRegistry)}`,
      `- live atlas contract: ${Boolean(liveRegistry?.summary && liveRegistry.summary.missingLiveAtlasContract === false)}`,
      '',
      '## Next Actions',
      '- Promote workspace-gap cards into atlas coverage only after reviewing sourceRefs and searchHints.',
      '- Keep backup/archive candidates out of active atlas coverage.',
      '- Run the embed step before MCP search routing consumes the new cards.',
      '',
      '## Search Hints',
      ...cards.slice(0, 20).flatMap((card) => [
        `- ${card.cardId}: ${Array.isArray(card.searchHints) ? card.searchHints.join(' | ') : ''}`,
      ]),
      '',
    ].join('\n'),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        cards_built: cards.length,
        workspace_gap_cards: workspaceGaps.length,
        tracked_gaps: trackedGaps.length,
        untracked_gaps: untrackedGaps.length,
        indexed_tracked: indexedTracked.length,
        manifest_path: manifestPath,
        cards_path: cardsPath,
        report_json: reportJsonPath,
        report_md: reportMdPath,
        next_exact_command: 'npm run knowledge:index-gap:embed',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[knowledge:index-gap:build] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
