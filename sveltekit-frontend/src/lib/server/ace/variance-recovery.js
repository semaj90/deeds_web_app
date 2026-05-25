import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SEARCH_ROOTS = ['src', 'scripts', 'docs', 'memory'];
const STOP_WORDS = new Set([
  'the', 'and', 'or', 'for', 'with', 'from', 'that', 'this', 'then', 'than', 'when',
  'into', 'onto', 'over', 'under', 'your', 'our', 'their', 'what', 'where', 'why',
  'how', 'add', 'make', 'fix', 'run', 'use', 'continue', 'please', 'next', 'step',
  'steps', 'graph', 'packet', 'cache', 'search', 'searches', 'layer', 'layers',
  'tool', 'tools', 'agent', 'agents', 'command', 'commands', 'recovery', 'semantic',
]);
const KNOWN_VARIANCE_TERMS = [
  'ace', 'atlas', 'qdrant', 'redis', 'langextract', 'did-you-mean', 'fuzzy',
  'graph', 'retrieval', 'packet', 'stream', 'cache', 'bifrost', 'gemma4',
  'opencode', 'recover', 'exports', 'summary', 'card', 'postgres', 'pgvector',
  'duckdb', 'neo4j', 'docker', 'webgpu', 'pagerank', 'mapreduce',
];

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeQuery(query) {
  return String(query ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9:_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQueryTerms(query) {
  return unique(
    normalizeQuery(query)
      .split(/[\s/_:-]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
  );
}

function basenameWithoutExt(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/, '');
}

function tokenizePath(filePath) {
  return basenameWithoutExt(filePath)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((term) => term.trim())
    .filter(Boolean);
}

function levenshtein(a, b) {
  const left = a ?? '';
  const right = b ?? '';
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const prev = new Array(right.length + 1);
  const curr = new Array(right.length + 1);

  for (let j = 0; j <= right.length; j++) prev[j] = j;
  for (let i = 1; i <= left.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= right.length; j++) prev[j] = curr[j];
  }
  return prev[right.length];
}

function stringSimilarity(a, b) {
  const left = normalizeQuery(a).replace(/\s+/g, '');
  const right = normalizeQuery(b).replace(/\s+/g, '');
  if (!left || !right) return 0;
  const distance = levenshtein(left, right);
  return 1 - Math.min(distance / Math.max(left.length, right.length), 1);
}

async function runRgLines(queryTerms) {
  if (!queryTerms.length) return [];
  const pattern = queryTerms
    .slice(0, 5)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  if (!pattern) return [];

  try {
    const { stdout } = await execFileAsync(
      'rg',
      ['-n', '-uu', '-i', '-m', '20', pattern, ...SEARCH_ROOTS],
      { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 }
    );

    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.*?):(\d+):(\d+):(.*)$/);
        if (!match) return null;
        const [, file, lineNo, columnNo, text] = match;
        return {
          file,
          line: Number(lineNo),
          column: Number(columnNo),
          text: text.trim(),
          sourceRef: `${file}:${lineNo}`,
        };
      })
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

async function runRgFiles(queryTerms) {
  if (!queryTerms.length) return [];

  try {
    const { stdout } = await execFileAsync(
      'rg',
      ['--files', '-uu', ...SEARCH_ROOTS],
      { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 }
    );

    const files = stdout.split(/\r?\n/).filter(Boolean);
    const scored = files.map((file) => {
      const lower = file.toLowerCase();
      const stemTokens = tokenizePath(file);
      let score = 0;

      for (const term of queryTerms) {
        if (lower.includes(term)) score += 2;
        if (stemTokens.includes(term)) score += 1.5;
        if (path.basename(file).toLowerCase().includes(term)) score += 1.25;
        if (stemTokens.some((token) => stringSimilarity(token, term) >= 0.72)) score += 0.5;
      }

      return { file, score };
    });

    return scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.file)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function readLatestQdrantClusterTags() {
  try {
    const runsDir = path.resolve(process.cwd(), 'memory', 'runs');
    if (!fs.existsSync(runsDir)) return [];
    const entries = fs
      .readdirSync(runsDir)
      .filter((entry) => /^\d{4}-\d{2}-\d{2}T/.test(entry))
      .sort();
    if (!entries.length) return [];
    const latestDir = path.join(runsDir, entries[entries.length - 1]);
    const clusterPath = path.join(latestDir, 'qdrant_cluster_tags.json');
    if (!fs.existsSync(clusterPath)) return [];
    const raw = fs.readFileSync(clusterPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function scoreClusterRelevance(entry, queryLower, queryTerms) {
  let score = 0;
  for (const { tag, count } of entry.topTags ?? []) {
    const tagLower = String(tag ?? '').toLowerCase();
    if (!tagLower) continue;
    if (queryLower.includes(tagLower) || queryTerms.has(tagLower)) {
      score += Math.min(0.15, 0.05 * Math.log2((Number(count) || 0) + 1));
    }
  }
  for (const topoClass of entry.topoClasses ?? []) {
    const topoLower = String(topoClass ?? '').toLowerCase();
    if (topoLower && queryLower.includes(topoLower)) score += 0.1;
  }
  return score;
}

function collectSourceRefs({ sourceRefs = [], rankedCards = [] }) {
  const refs = [];
  for (const ref of sourceRefs) {
    if (typeof ref === 'string' && ref.trim()) refs.push(ref.trim());
  }
  for (const card of rankedCards) {
    if (!card || typeof card !== 'object') continue;
    const candidate = card.sourceRefs ?? card.sourceRefs ?? [];
    if (Array.isArray(candidate)) {
      for (const ref of candidate) {
        if (typeof ref === 'string' && ref.trim()) refs.push(ref.trim());
      }
    }
    const pathRef = card.path ?? card.filePath;
    if (typeof pathRef === 'string' && pathRef.trim()) refs.push(pathRef.trim());
  }
  return unique(refs).slice(0, 20);
}

function buildEntityList({ queryTerms, sourceRefs, qdrantTags, clusterTagRecall }) {
  const entities = [];
  for (const term of queryTerms) {
    if (/^[A-Z0-9][A-Za-z0-9:-]*$/.test(term) || /[0-9]/.test(term) || term.includes(':')) {
      entities.push(term);
    }
  }
  for (const ref of sourceRefs) {
    const tokens = tokenizePath(ref);
    for (const token of tokens) {
      if (token.length >= 3 && !STOP_WORDS.has(token)) entities.push(token);
    }
  }
  for (const tag of [...qdrantTags, ...clusterTagRecall]) {
    const cleaned = String(tag ?? '').trim();
    if (cleaned && cleaned.length >= 3) entities.push(cleaned);
  }
  return unique(entities).slice(0, 20);
}

function buildDidYouMean({ query, queryTerms, sourceRefs, qdrantTags, clusterTagRecall }) {
  const base = query.trim();
  const suggestions = [];
  const seedTerms = unique([...qdrantTags, ...clusterTagRecall, ...sourceRefs.map((ref) => basenameWithoutExt(ref))]);

  for (const term of seedTerms) {
    if (!term) continue;
    const candidate = base.includes(term) ? base : `${term} ${base}`.trim();
    if (candidate && !suggestions.includes(candidate)) suggestions.push(candidate);
    if (suggestions.length >= 3) break;
  }

  if (!suggestions.length) {
    const fallback = queryTerms.length > 0 ? queryTerms.slice(0, 3).join(' ') : base;
    if (fallback) suggestions.push(fallback);
  }

  return suggestions.slice(0, 3);
}

function buildRankedCards({ lineHits, fileHits, qdrantTags, clusterTagRecall }) {
  const cards = [];

  for (const hit of lineHits) {
    cards.push({
      path: hit.file,
      sourceRefs: [hit.sourceRef],
      summary: hit.text.slice(0, 180),
      labels: [...qdrantTags.slice(0, 3), ...clusterTagRecall.slice(0, 2)],
      score: 0.92,
      why: 'exact-search-line-hit',
    });
  }

  for (const file of fileHits) {
    cards.push({
      path: file,
      sourceRefs: [`${file}:L1`],
      summary: `Filename fallback candidate for ${file}`,
      labels: [...qdrantTags.slice(0, 2)],
      score: 0.68,
      why: 'filename-fallback',
    });
  }

  return cards.slice(0, 12);
}

function buildSemanticCacheHits(lokiData) {
  const collections = Array.isArray(lokiData?.collections) ? lokiData.collections : [];
  const hits = [];
  for (const collection of collections) {
    const name = String(collection?.name ?? '').trim();
    const size = Array.isArray(collection?.data) ? collection.data.length : 0;
    if (name && size > 0) hits.push(`loki:${name}:${size}`);
  }
  return unique(hits).slice(0, 8);
}

export async function buildVarianceRecoveryContext(input) {
  const query = String(input?.query ?? '').trim();
  const queryTerms = extractQueryTerms(query);
  const queryLower = normalizeQuery(query);
  const termSet = new Set(queryTerms);
  const lokiData = input?.lokiData ?? null;
  const clusterTags = Array.isArray(input?.clusterTags) && input.clusterTags.length > 0
    ? input.clusterTags
    : readLatestQdrantClusterTags();

  const [lineHits, fileHits] = await Promise.all([
    runRgLines(queryTerms),
    runRgFiles(queryTerms),
  ]);

  const scoredClusters = clusterTags
    .map((entry) => ({ entry, score: scoreClusterRelevance(entry, queryLower, termSet) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  const qdrantTags = unique(
    scoredClusters.flatMap(({ entry }) => (entry.topTags ?? []).slice(0, 4).map((item) => String(item.tag ?? '').trim()).filter(Boolean))
  ).slice(0, 8);

  const clusterTagRecall = unique(
    scoredClusters.flatMap(({ entry }) => [
      String(entry.clusterKey ?? '').trim(),
      ...(entry.topoClasses ?? []).map((topo) => String(topo ?? '').trim()),
    ].filter(Boolean))
  ).slice(0, 8);

  const sourceRefs = collectSourceRefs({
    sourceRefs: [
      ...(lineHits.map((hit) => hit.sourceRef)),
      ...(fileHits.slice(0, 5).map((file) => `${file}:L1`)),
      ...(input?.sourceRefs ?? []),
    ],
    rankedCards: Array.isArray(input?.rankedCards) ? input.rankedCards : [],
  });

  const semanticSearchHits = unique([
    ...lineHits.map((hit) => hit.sourceRef),
    ...scoredClusters.map(({ entry }) => `qdrant:${entry.clusterKey}`),
  ]).slice(0, 10);

  const rankedCards = buildRankedCards({
    lineHits,
    fileHits,
    qdrantTags,
    clusterTagRecall,
  });

  const fuzzySearchCandidates = unique([
    ...fileHits,
    ...sourceRefs,
    ...rankedCards.map((card) => card.path).filter(Boolean),
  ]).slice(0, 12);

  const varianceRecovery = {
    exactMatchFailed: sourceRefs.length === 0,
    fuzzySearchCandidates,
    didYouMean: buildDidYouMean({
      query,
      queryTerms,
      sourceRefs,
      qdrantTags,
      clusterTagRecall,
    }),
    semanticSearchHits,
    qdrantTags,
    clusterTagRecall,
    langextractEntities: buildEntityList({
      queryTerms,
      sourceRefs,
      qdrantTags,
      clusterTagRecall,
    }),
    semanticCacheHits: buildSemanticCacheHits(lokiData),
    acePacket: input?.promptCacheKey ?? undefined,
    nextSteps: sourceRefs.length > 0
      ? ['synthesis']
      : [
          'run exact search',
          'recall cluster tags',
          'extract entities',
          'build ACE packet',
        ],
  };

  return {
    sourceRefs,
    rankedCards,
    varianceRecovery,
  };
}
