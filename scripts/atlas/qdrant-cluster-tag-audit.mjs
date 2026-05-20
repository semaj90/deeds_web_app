#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import {
  fileLanguage,
  resolveRepoPath,
  topEntries,
  writeJson,
  writeMarkdown,
} from './_atlas-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../sveltekit-frontend');
const REPO_ROOT = resolve(__dirname, '../..');

dotenv.config({ path: resolve(REPO_ROOT, '.env') });
dotenv.config({ path: resolve(ROOT, '.env'), override: false });

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const OUTPUT_JSON = resolveRepoPath('docs/graph/qdrant-cluster-tag-audit.json');
const OUTPUT_MD = resolveRepoPath('docs/graph/qdrant-cluster-tag-audit.md');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function readArg(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const LIMIT = parsePositiveInt(readArg('--limit', '0'), 0);
const TOP_TAGS = parsePositiveInt(readArg('--top-tags', '12'), 12);
const TOP_LANGUAGES = parsePositiveInt(readArg('--top-languages', '8'), 8);
const FROZEN_FACET_LIMIT = parsePositiveInt(readArg('--facet-limit', '100'), 100);

async function facetClusters() {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/facet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'neo4j_gpuCluster', limit: FROZEN_FACET_LIMIT }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Facet API failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.result?.hits) ? data.result.hits : [];
}

function normalizeLanguage(payload) {
  const rawLanguage = typeof payload?.language === 'string' ? payload.language.trim().toLowerCase() : '';
  const candidatePath = payload?.relativePath || payload?.path || payload?.file_path || '';
  const inferredLanguage = fileLanguage(candidatePath);
  const language = rawLanguage || inferredLanguage;
  return language && language !== 'other' ? language : null;
}

async function scrollCluster(clusterId) {
  const rawTags = new Map();
  const derivedTags = new Map();
  const languages = new Map();
  let offset = null;
  let totalPoints = 0;

  do {
    const body = {
      filter: { must: [{ key: 'neo4j_gpuCluster', match: { value: clusterId } }] },
      with_payload: ['tags', 'language', 'relativePath', 'path', 'file_path'],
      with_vector: false,
      limit: 200,
    };
    if (offset !== null) body.offset = offset;

    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Scroll failed for cluster ${clusterId}: ${response.status}`);
    }

    const data = await response.json();
    const points = Array.isArray(data?.result?.points) ? data.result.points : [];

    for (const point of points) {
      totalPoints++;
      const payload = point?.payload ?? {};
      const pointTags = Array.isArray(payload.tags) ? payload.tags.filter((tag) => typeof tag === 'string' && tag.length > 0) : [];
      const language = normalizeLanguage(payload);

      for (const tag of pointTags) {
        rawTags.set(tag, (rawTags.get(tag) ?? 0) + 1);
        derivedTags.set(tag, (derivedTags.get(tag) ?? 0) + 1);
      }

      if (language) {
        languages.set(language, (languages.get(language) ?? 0) + 1);
        const langTag = `lang:${language}`;
        derivedTags.set(langTag, (derivedTags.get(langTag) ?? 0) + 1);
      }
    }

    offset = data?.result?.next_page_offset ?? null;
  } while (offset !== null);

  return { rawTags, derivedTags, languages, totalPoints };
}

function mapEntries(map, limit) {
  return topEntries(map, limit).map(({ key, value }) => ({ name: key, count: value }));
}

function formatList(entries) {
  return entries.length > 0
    ? entries.map((entry) => `- ${entry.name}: ${entry.count}`).join('\n')
    : '- (none)';
}

async function main() {
  const startedAt = Date.now();
  const clusterHits = await facetClusters();
  const orderedHits = [...clusterHits].sort((left, right) => right.count - left.count);
  const selectedHits = LIMIT > 0 ? orderedHits.slice(0, LIMIT) : orderedHits;

  if (selectedHits.length === 0) {
    console.log('[qdrant-cluster-tag-audit] No clusters found');
    return;
  }

  console.log(`[qdrant-cluster-tag-audit] auditing ${selectedHits.length} clusters from ${COLLECTION}`);

  const globalRawTags = new Map();
  const globalDerivedTags = new Map();
  const globalLanguages = new Map();
  const clusters = [];
  let scannedPoints = 0;

  for (const hit of selectedHits) {
    const clusterId = hit.value;
    const clusterLabel = `cluster:gpu:${clusterId}`;
    const { rawTags, derivedTags, languages, totalPoints } = await scrollCluster(clusterId);
    scannedPoints += totalPoints;

    for (const [tag, count] of rawTags) {
      globalRawTags.set(tag, (globalRawTags.get(tag) ?? 0) + count);
    }
    for (const [tag, count] of derivedTags) {
      globalDerivedTags.set(tag, (globalDerivedTags.get(tag) ?? 0) + count);
    }
    for (const [language, count] of languages) {
      globalLanguages.set(language, (globalLanguages.get(language) ?? 0) + count);
    }

    const clusterReport = {
      clusterId,
      clusterLabel,
      qdrantFacetCount: hit.count,
      pointCount: totalPoints,
      uniqueRawTags: rawTags.size,
      uniqueDerivedTags: derivedTags.size,
      uniqueLanguages: languages.size,
      topRawTags: mapEntries(rawTags, TOP_TAGS),
      topDerivedTags: mapEntries(derivedTags, TOP_TAGS),
      topLanguages: mapEntries(languages, TOP_LANGUAGES),
    };

    clusters.push(clusterReport);

    console.log(
      `[qdrant-cluster-tag-audit] ${clusterLabel} points=${totalPoints} rawTags=${rawTags.size} languages=${languages.size}`
    );
  }

  const report = {
    collection: COLLECTION,
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    clusterCount: clusters.length,
    scannedPoints,
    topTagsLimit: TOP_TAGS,
    topLanguagesLimit: TOP_LANGUAGES,
    clusters,
    global: {
      rawTags: mapEntries(globalRawTags, TOP_TAGS),
      derivedTags: mapEntries(globalDerivedTags, TOP_TAGS),
      languages: mapEntries(globalLanguages, TOP_LANGUAGES),
    },
  };

  console.log('\n[qdrant-cluster-tag-audit] Global top derived tags:');
  console.log(formatList(report.global.derivedTags.slice(0, TOP_TAGS)));
  console.log('\n[qdrant-cluster-tag-audit] Global top languages:');
  console.log(formatList(report.global.languages.slice(0, TOP_LANGUAGES)));

  if (!DRY_RUN) {
    writeJson(OUTPUT_JSON, report);
    writeMarkdown(
      OUTPUT_MD,
      [
        '# Qdrant Cluster Tag Audit',
        '',
        `- collection: ${COLLECTION}`,
        `- cluster count: ${report.clusterCount}`,
        `- scanned points: ${report.scannedPoints}`,
        `- dry run: ${report.dryRun}`,
        '',
        '## Global Top Derived Tags',
        '',
        formatList(report.global.derivedTags.slice(0, TOP_TAGS)),
        '',
        '## Global Top Raw Tags',
        '',
        formatList(report.global.rawTags.slice(0, TOP_TAGS)),
        '',
        '## Global Languages',
        '',
        formatList(report.global.languages.slice(0, TOP_LANGUAGES)),
        '',
        '## Cluster Breakdown',
        '',
        ...clusters.flatMap((cluster) => [
          `### ${cluster.clusterLabel}`,
          '',
          `- qdrant facet count: ${cluster.qdrantFacetCount}`,
          `- point count: ${cluster.pointCount}`,
          `- raw tags: ${cluster.uniqueRawTags}`,
          `- derived tags: ${cluster.uniqueDerivedTags}`,
          `- languages: ${cluster.uniqueLanguages}`,
          '',
          'Top Derived Tags',
          '',
          formatList(cluster.topDerivedTags),
          '',
          'Top Languages',
          '',
          formatList(cluster.topLanguages),
          '',
        ]),
      ].join('\n')
    );
    console.log(`\n[qdrant-cluster-tag-audit] wrote ${OUTPUT_JSON}`);
    console.log(`[qdrant-cluster-tag-audit] wrote ${OUTPUT_MD}`);
  } else {
    console.log('\n[qdrant-cluster-tag-audit] --dry-run: skipping docs writes');
  }

  console.log(
    `[qdrant-cluster-tag-audit] completed in ${Date.now() - startedAt}ms`
  );
}

main().catch((err) => {
  console.error('[qdrant-cluster-tag-audit] error:', err.message);
  process.exit(1);
});