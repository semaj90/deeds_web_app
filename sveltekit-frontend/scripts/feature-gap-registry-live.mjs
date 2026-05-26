#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'feature-gap-registry-live-latest.json');

const BASE_ROWS = [
  {
    feature_id: 'retrieval.spine',
    title: 'Retrieval Spine',
    cardIdHint: 'feature-map:hyperrag-fusion',
    owner_file: 'src/lib/server/retrieval/hyperrag-fusion-service.ts',
    qdrantHints: ['retrieval', 'graph', 'lane:l0-l11', 'fusion'],
    labelHint: 'retrieval',
    sourceRefs: [
      'src/lib/server/retrieval/hyperrag-fusion-service.ts',
      'src/lib/server/retrieval/cluster-aware-reranker.ts',
      'docs/architecture/hyperrag-feature-atlas-runtime.md',
    ],
    status: 'implemented',
    storage_lane: 'Postgres + Redis + Qdrant + Neo4j',
    retrieval_lane: 'L0-L11 fused retrieval',
    nextAction: 'Keep the feature-registry overlay aligned with the live retrieval lanes.',
  },
  {
    feature_id: 'karpathy.hot_lane',
    title: 'Karpathy Hot Lane',
    cardIdHint: 'feature-map:karpathy-blend',
    owner_file: 'src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts',
    qdrantHints: ['karpathy', 'hot-lane', 'qdrant', 'redis'],
    labelHint: 'graph',
    sourceRefs: [
      'src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts',
      'scripts/karpathy-qdrant-cluster-backfill.ts',
      'scripts/karpathy-gpu-enrich.mjs',
    ],
    status: 'implemented',
    storage_lane: 'Redis + Qdrant + Postgres',
    retrieval_lane: 'L8 authority blend',
    nextAction: 'Backfill the newest hot-cluster metadata after the registry overlay lands.',
  },
  {
    feature_id: 'ace.packet_flow',
    title: 'ACE Packet Flow',
    cardIdHint: 'feature-map:ace-envelope',
    owner_file: 'src/lib/server/ace/context-assembler.ts',
    qdrantHints: ['ace', 'packet', 'context-pack', 'redis', 'postgres'],
    labelHint: 'cache',
    sourceRefs: [
      'src/lib/server/ace/context-assembler.ts',
      'src/lib/server/ace/context-cache-registry.ts',
      'src/lib/server/ace/llm-context-cache.ts',
    ],
    status: 'implemented',
    storage_lane: 'Postgres + Redis',
    retrieval_lane: 'ACE context pack assembly',
    nextAction: 'Keep packet persistence Postgres-first and treat Redis as hot-only.',
  },
  {
    feature_id: 'codebase.semantic_index',
    title: 'Codebase Semantic Index',
    cardIdHint: 'feature-map:feature-atlas',
    owner_file: 'scripts/build-atlas-index.mjs',
    qdrantHints: ['atlas', 'index', 'semantic', 'codebase'],
    labelHint: 'database',
    sourceRefs: [
      'scripts/build-atlas-index.mjs',
      'docs/atlas-index/codebase-atlas.min.json',
      'memory/index/feature-map.jsonl',
    ],
    status: 'implemented',
    storage_lane: 'Atlas JSON + Postgres mirrors',
    retrieval_lane: 'Codebase atlas indexing',
    nextAction: 'Promote a real docs/atlas/feature-registry.json overlay once the file appears.',
  },
  {
    feature_id: 'feature.labeling',
    title: 'Feature Labeling',
    cardIdHint: 'feature-map:feature-atlas',
    owner_file: 'src/lib/server/labels/feature-label-registry.ts',
    qdrantHints: ['labeling', 'registry', 'feature-map'],
    labelHint: 'general',
    sourceRefs: [
      'src/lib/server/labels/feature-label-registry.ts',
      'src/lib/server/labels/normalize-labels.ts',
    ],
    status: 'implemented',
    storage_lane: 'JSON registry + Postgres label consumers',
    retrieval_lane: 'Label normalization and classification',
    nextAction: 'Use the label registry to seed the next live atlas overlay.',
  },
  {
    feature_id: 'cluster.cards',
    title: 'Cluster Cards',
    cardIdHint: 'feature-map:atlas-reconciliation',
    owner_file: 'scripts/atlas/cache-hypergraph-cluster-cards.mjs',
    qdrantHints: ['cluster-cards', 'topology', 'redis', 'qdrant'],
    labelHint: 'graph',
    sourceRefs: [
      'scripts/atlas/cache-hypergraph-cluster-cards.mjs',
      'scripts/sync-cluster-summaries-to-qdrant.mjs',
      'src/lib/server/ace/context-packet-budgeter.ts',
    ],
    status: 'implemented',
    storage_lane: 'Redis + Qdrant',
    retrieval_lane: 'Cluster card prefetch and routing',
    nextAction: 'Refresh cluster-card tags from the live qdrant cluster-tag feed.',
  },
  {
    feature_id: 'semantic.cache.policy',
    title: 'Semantic Cache Policy',
    cardIdHint: 'feature-map:ace-envelope',
    owner_file: 'src/lib/server/ace/context-cache-registry.ts',
    qdrantHints: ['cache-policy', 'redis-hot', 'postgres-first'],
    labelHint: 'cache',
    sourceRefs: [
      'src/lib/server/ace/context-cache-registry.ts',
      'src/lib/server/ace/llm-context-cache.ts',
      'src/lib/server/ace/feature-context-cache.ts',
      '.cache/ace/context-packs/ace_context_local-json-hit_v1.json',
      '.cache/ace/context-packs/ace_context_smoke-context-pack_v1.json',
    ],
    status: 'implemented',
    storage_lane: 'Postgres + Redis hot cache',
    retrieval_lane: 'Context cache selection and fallback',
    nextAction: 'Keep Redis evaluation-only and do not turn it into durable memory.',
  },
  {
    feature_id: 'memory.address.registry',
    title: 'Memory Address Registry Placeholders',
    cardIdHint: 'feature-map:feature-atlas',
    owner_file: 'src/lib/server/ace/feature-context-matrix.ts',
    qdrantHints: ['memory-address', 'registry', 'placeholder', 'postgres'],
    labelHint: 'database',
    sourceRefs: [
      'src/lib/server/ace/feature-context-matrix.ts',
      'src/lib/server/ace/feature-context-cache.ts',
      '.cache/ace/context-packs/ace_context_smoke-context-pack_v1.json',
    ],
    status: 'implemented',
    storage_lane: 'Postgres memory-address placeholders',
    retrieval_lane: 'Feature context lookup and packet hints',
    nextAction: 'Replace placeholders with the Postgres-owned live address map later.',
  },
];

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLabel(value) {
  const text = normalize(value);
  if (!text) return 'general';
  if (/(cache|redis|context pack|context-cache|llmctx)/.test(text)) return 'cache';
  if (/(db|postgres|sql|drizzle|schema|table|index|atlas|memory address|registry)/.test(text)) return 'database';
  if (/(graph|cluster|topolog|pagerank|som|karpathy)/.test(text)) return 'graph';
  if (/(retrieval|search|rag|qdrant|vector|semantic)/.test(text)) return 'retrieval';
  if (/(mcp|agent|tool|workflow)/.test(text)) return 'agent';
  if (/(api|route|endpoint)/.test(text)) return 'api-route';
  if (/(ui|component|page|view|svelte)/.test(text)) return 'ui-component';
  if (/(symbol|function|method|class)/.test(text)) return 'symbol';
  return 'general';
}

function countHits(haystack, terms) {
  const hay = normalize(haystack);
  let score = 0;
  for (const term of terms) {
    const needle = normalize(term);
    if (!needle) continue;
    if (hay.includes(needle)) score += 4;
    else {
      const compact = needle.replace(/\s+/g, '');
      if (compact && hay.includes(compact)) score += 2;
    }
  }
  return score;
}

async function readJsonIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function readJsonlIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function loadQdrantClusterTags() {
  const runsDir = path.join(ROOT, 'memory', 'runs');
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(runsDir, entry.name, 'qdrant_cluster_tags.json');
      files.push(candidate);
    }
    files.sort((a, b) => a.localeCompare(b));
    files.reverse();
    for (const candidate of files) {
      const parsed = await readJsonIfExists(candidate);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { path: candidate, data: parsed };
      }
    }
  } catch {
    // ignore
  }
  return { path: null, data: [] };
}

async function loadContextPacks() {
  const dir = path.join(ROOT, '.cache', 'ace', 'context-packs');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const packs = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const filePath = path.join(dir, entry.name);
      const parsed = await readJsonIfExists(filePath);
      if (parsed && typeof parsed === 'object') packs.push({ path: filePath, data: parsed });
    }
    packs.sort((a, b) => a.path.localeCompare(b.path));
    return packs;
  } catch {
    return [];
  }
}

function loadAtlasCardCandidates(cardRows) {
  return cardRows.map((card) => {
    const refs = uniqueStrings(card.sourceRefs ?? []);
    const labels = uniqueStrings(card.labels ?? []);
    const payload = card.payload ?? {};
    const summary = card.summary ?? '';
    return {
      raw: card,
      scoreText: normalize(
        [
          card.id,
          card.kind,
          summary,
          payload?.name,
          payload?.intent,
          payload?.service,
          ...(refs ?? []),
          ...(labels ?? []),
        ]
          .filter(Boolean)
          .join(' ')
      ),
    };
  });
}

function chooseBestCard(row, cards) {
  if (row.cardIdHint) {
    const hinted = cards.find((card) => card.raw.id === row.cardIdHint);
    if (hinted) return hinted.raw;
  }
  const rowText = [row.feature_id, row.title, row.owner_file, row.storage_lane, row.retrieval_lane, row.nextAction].join(' ');
  const terms = rowText.split(/[\s/.:_-]+/).filter((part) => part.length > 2);
  let best = null;
  let bestScore = 0;

  for (const card of cards) {
    const score = countHits(card.scoreText, terms) + countHits(row.owner_file, card.raw.sourceRefs ?? []);
    if (score > bestScore) {
      best = card.raw;
      bestScore = score;
    }
  }

  return best;
}

function chooseBestCluster(row, clusters) {
  const rowTerms = [row.feature_id, row.title, row.owner_file, row.storage_lane, row.retrieval_lane, row.nextAction]
    .flatMap((value) => String(value).split(/[\s/.:_-]+/))
    .filter((part) => part.length > 2);

  let best = null;
  let bestScore = 0;
  for (const cluster of clusters) {
    const hay = [
      cluster.clusterKey,
      cluster.clusterSrc,
      cluster.fileCount,
      ...(cluster.topoClasses ?? []),
      ...(cluster.topFiles ?? []),
      ...(cluster.topTags ?? []).map((tag) => `${tag.tag} ${tag.count}`),
    ].join(' ');
    const score = countHits(hay, rowTerms);
    if (score > bestScore) {
      best = cluster;
      bestScore = score;
    }
  }
  return best;
}

function pickAuthorityRefs(row, authorityRows) {
  const owners = new Set([row.owner_file, ...(row.sourceRefs ?? [])]);
  const ranked = authorityRows
    .filter((item) => owners.has(item.filePath) || (Array.isArray(item.sourceRefs) && item.sourceRefs.some((ref) => owners.has(ref))))
    .sort((a, b) => (b.combinedScore ?? 0) - (a.combinedScore ?? 0))
    .map((item) => item.filePath);
  return ranked;
}

function buildLaneEvidence(row) {
  const evidenceByFeature = {
    'retrieval.spine': {
      smokeRefs: ['npm run smoke:mcp:core-gate', 'npm run graph:exports:smoke'],
      reportRefs: ['docs/reports/pgvector-integrity-lane-2026-05-20.md'],
    },
    'karpathy.hot_lane': {
      smokeRefs: ['npm run mcp-health', 'npm run atlas:hyperrag:rerank'],
      reportRefs: ['memory/runs/2026-05-24T23-09-00/qdrant_cluster_tags.json'],
    },
    'ace.packet_flow': {
      smokeRefs: ['npm run memory:claude-mem:smoke', 'npm run memory:agent-observation:smoke'],
      reportRefs: ['docs/architecture/opencode-claude-mem-bridge.md', 'docs/operations/stack-audit-playbook.md'],
    },
    'codebase.semantic_index': {
      smokeRefs: ['npm run codebase:semantic-index:smoke', 'npm run codebase:semantic-index:report'],
      reportRefs: ['docs/reports/codebase-semantic-index-latest.md'],
    },
    'feature.labeling': {
      smokeRefs: ['npm run knowledge:documents:smoke', 'npm run knowledge:documents:embed:smoke'],
      reportRefs: ['memory/knowledge/document-knowledge-report.md'],
    },
    'cluster.cards': {
      smokeRefs: ['npm run smoke:cluster-cards', 'npm run cards:validate'],
      reportRefs: ['docs/reports/top-100-codebase-summary-cards.md'],
    },
    'semantic.cache.policy': {
      smokeRefs: ['npm run knowledge:documents:synthesize:smoke'],
      reportRefs: ['memory/knowledge/document-knowledge-synthesis-manifest.json'],
    },
    'memory.address.registry': {
      smokeRefs: ['npm run memory:claude-mem:smoke'],
      reportRefs: ['src/routes/api/memory/status/+server.ts'],
    },
  };

  return evidenceByFeature[row.feature_id] ?? { smokeRefs: [], reportRefs: [] };
}

function buildRow(row, cards, clusters, authorityRows, contextPacks) {
  const card = chooseBestCard(row, cards);
  const cluster = chooseBestCluster(row, clusters);
  const rowText = normalize([row.feature_id, row.title, row.owner_file, row.storage_lane, row.retrieval_lane].join(' '));
  const packRefs = contextPacks
    .filter((pack) => {
      const packed = normalize(JSON.stringify(pack.data));
      const packMentionsCache = packed.includes('cache') || packed.includes('context pack') || packed.includes('llmctx');
      return packMentionsCache && (rowText.includes('cache') || rowText.includes('packet') || rowText.includes('memory'));
    })
    .flatMap((pack) => pack.data.sourceRefs ?? []);

  const sourceRefs = uniqueStrings([
    row.owner_file,
    ...(row.sourceRefs ?? []),
    ...(card?.sourceRefs ?? []),
    ...packRefs,
    ...pickAuthorityRefs(row, authorityRows),
  ]);

  const qdrantTags = uniqueStrings([
    'feature-map',
    ...(row.qdrantHints ?? []),
    ...(card?.labels ?? []),
    ...(cluster?.topTags ?? []).slice(0, 4).map((tag) => tag.tag),
    ...(cluster?.topoClasses ?? []).slice(0, 4),
    row.retrieval_lane,
    row.storage_lane,
  ]).slice(0, 8);

  const turbovecLabel = row.labelHint ?? normalizeLabel(
    [
      row.feature_id,
      row.title,
      row.owner_file,
      row.storage_lane,
      row.retrieval_lane,
      ...(row.qdrantHints ?? []),
      ...(card?.labels ?? []),
      ...(cluster?.topoClasses ?? []),
      ...(cluster?.topTags ?? []).slice(0, 3).map((tag) => tag.tag),
    ].join(' ')
  );
  const laneEvidence = buildLaneEvidence(row);

  return {
    feature_id: row.feature_id,
    owner_file: row.owner_file,
    sourceRefs,
    status: row.status,
    storage_lane: row.storage_lane,
    retrieval_lane: row.retrieval_lane,
    qdrantTags,
    turbovecLabel,
    smokeRefs: laneEvidence.smokeRefs,
    reportRefs: laneEvidence.reportRefs,
    nextAction: row.nextAction,
  };
}

async function main() {
  const featureRegistryPath = path.join(ROOT, 'docs', 'atlas', 'feature-registry.json');
  const atlasIndexPath = path.join(ROOT, 'docs', 'atlas-index', 'codebase-atlas.min.json');
  const authorityPath = path.join(ROOT, 'logs', 'authority', 'latest.json');
  const featureCardsPath = path.join(ROOT, 'memory', 'exports', 'feature-map-cards.jsonl');

  const [featureRegistryContract, atlasIndex, authority, featureCards] = await Promise.all([
    readJsonIfExists(featureRegistryPath),
    readJsonIfExists(atlasIndexPath),
    readJsonIfExists(authorityPath),
    readJsonlIfExists(featureCardsPath),
  ]);
  const qdrantClusterTags = await loadQdrantClusterTags();
  const contextPacks = await loadContextPacks();

  const clusterRows = Array.isArray(qdrantClusterTags.data) ? qdrantClusterTags.data : [];
  const cardCandidates = loadAtlasCardCandidates(featureCards);
  const authorityRows = Array.isArray(authority?.rows) ? authority.rows : [];
  const rows = BASE_ROWS.map((row) => buildRow(row, cardCandidates, clusterRows, authorityRows, contextPacks));

  const inputStatus = {
    docsAtlasFeatureRegistry: {
      present: Boolean(featureRegistryContract),
      path: featureRegistryPath,
    },
    docsAtlasIndex: {
      present: Boolean(atlasIndex),
      path: atlasIndexPath,
      generatedAt: atlasIndex?.generated_at ?? null,
    },
    authorityLatest: {
      present: Boolean(authority),
      path: authorityPath,
      generatedAt: authority?.generatedAt ?? null,
    },
    aceContextPacks: {
      present: contextPacks.length > 0,
      count: contextPacks.length,
      paths: contextPacks.map((pack) => pack.path),
    },
    qdrantClusterTags: {
      present: clusterRows.length > 0,
      path: qdrantClusterTags.path,
      clusterCount: clusterRows.length,
    },
    featureMapCards: {
      present: featureCards.length > 0,
      path: featureCardsPath,
      count: featureCards.length,
    },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    root: ROOT,
    inputStatus,
    summary: {
      implementedRows: rows.length,
      missingLiveAtlasContract: !inputStatus.docsAtlasFeatureRegistry.present,
      missingLiveAtlasIndex: !inputStatus.docsAtlasIndex.present,
      missingAuthoritySnapshot: !inputStatus.authorityLatest.present,
    },
    rows,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
  console.log(`✅ feature-gap registry report written to ${REPORT_PATH}`);
  console.log(`rows=${rows.length} digest=${digest} missingAtlas=${!inputStatus.docsAtlasFeatureRegistry.present}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
