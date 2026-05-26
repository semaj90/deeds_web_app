#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sortObject, stableHash } from '../index/shared.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const INPUT_PATH = join(ROOT, 'memory', 'exports', 'feature-map-cards.jsonl');
const REPORTS_DIR = join(ROOT, 'docs', 'reports');

function readJsonl(pathname) {
  if (!existsSync(pathname)) return [];
  const raw = readFileSync(pathname, 'utf8').trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map((line) => JSON.parse(line));
}

function writeJson(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, value, 'utf8');
}

function uniq(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function normalize(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-/+.]+/g, '-')
    .replace(/-{2,}/g, '-');
}

function extractNeedle(card) {
  const payload = card?.payload ?? {};
  return uniq([
    card?.id,
    ...(card?.labels ?? []),
    payload.name,
    payload.intent,
    payload.service,
    ...(payload.modules ?? []),
    ...(payload.imports ?? []),
    ...(payload.dependencies ?? []),
    ...(payload.languages ?? []),
    ...(payload.networking ?? []),
    ...(payload.offlineProcessing ?? []),
    ...(payload.cache ?? []),
    ...(payload.inferenceFallbacks ?? []),
    ...(card?.sourceRefs ?? []),
  ]).join(' ');
}

function countMatches(haystack, needles) {
  const norm = normalize(haystack);
  return needles.reduce((sum, needle) => sum + (norm.includes(normalize(needle)) ? 1 : 0), 0);
}

function collectField(card, key) {
  const payload = card?.payload ?? {};
  if (Array.isArray(payload?.[key])) return payload[key].map(String);
  return [];
}

function collectCounts(cards, key) {
  const counts = new Map();
  for (const card of cards) {
    for (const value of collectField(card, key)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function buildQueries(cards) {
  return [
    { id: 'feature-lane', query: 'feature labels modules imports dependencies languages networking' },
    { id: 'offline-lane', query: 'duckdb couchdb offline processing cache export' },
    { id: 'graph-lane', query: 'neo4j imports dependency chain graph projection' },
    { id: 'inference-lane', query: 'gemma4 opencode inference fallback cache' },
    { id: 'realtime-lane', query: 'svelte-realtime stream sse live update' },
    { id: 'inspector-lane', query: 'svelte-inspector inspector inspecter debug' },
  ].map((entry) => {
    const scored = cards
      .map((card) => {
        const haystack = extractNeedle(card);
        const score =
          countMatches(haystack, entry.query.split(/\s+/)) +
          Number(card?.scores?.rank ?? 0) * 0.01 +
          Number(card?.scores?.authority ?? 0) * 0.01;
        return { card, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || String(a.card.id).localeCompare(String(b.card.id)))
      .slice(0, 10);

    return {
      id: entry.id,
      query: entry.query,
      topCards: scored.map((row) => ({
        id: row.card.id,
        kind: row.card.kind,
        score: Number(row.score.toFixed(3)),
        labels: row.card.labels ?? [],
        summary: row.card.summary ?? '',
        sourceRefs: row.card.sourceRefs ?? [],
      })),
    };
  });
}

function buildReport(cards) {
  const cardsWithNewFields = cards.filter((card) => {
    const payload = card?.payload ?? {};
    return ['modules', 'imports', 'dependencies', 'languages', 'networking', 'offlineProcessing', 'cache', 'inferenceFallbacks']
      .some((key) => Array.isArray(payload?.[key]) && payload[key].length > 0);
  });

  const featureCards = cards.filter((card) => card.kind === 'feature');
  const report = {
    generatedAt: new Date().toISOString(),
    input: {
      path: 'memory/exports/feature-map-cards.jsonl',
      count: cards.length,
      featureCount: featureCards.length,
      richFieldCount: cardsWithNewFields.length,
      digest: stableHash(JSON.stringify(sortObject(cards.slice(0, 5)))),
    },
    fieldCounts: {
      modules: collectCounts(cards, 'modules'),
      imports: collectCounts(cards, 'imports'),
      dependencies: collectCounts(cards, 'dependencies'),
      languages: collectCounts(cards, 'languages'),
      networking: collectCounts(cards, 'networking'),
      offlineProcessing: collectCounts(cards, 'offlineProcessing'),
      cache: collectCounts(cards, 'cache'),
      inferenceFallbacks: collectCounts(cards, 'inferenceFallbacks'),
    },
    semantics: {
      featureCards: cardsWithNewFields.slice(0, 50).map((card) => ({
        id: card.id,
        labels: card.labels ?? [],
        modules: collectField(card, 'modules'),
        imports: collectField(card, 'imports'),
        dependencies: collectField(card, 'dependencies'),
        languages: collectField(card, 'languages'),
        networking: collectField(card, 'networking'),
        offlineProcessing: collectField(card, 'offlineProcessing'),
        cache: collectField(card, 'cache'),
        inferenceFallbacks: collectField(card, 'inferenceFallbacks'),
        sourceRefs: card.sourceRefs ?? [],
      })),
      multiQuery: buildQueries(cards),
    },
    laneNotes: [
      {
        lane: 'DuckDB',
        status: 'planned',
        note: 'Offline feature-card aggregates can be mirrored into DuckDB later for batch analysis and reporting.',
      },
      {
        lane: 'CouchDB',
        status: 'planned',
        note: 'Durable feature-card documents can be persisted to CouchDB later for offline sync and docstore-style lookups.',
      },
      {
        lane: 'Gemma4 / OpenCode',
        status: 'planned',
        note: 'Frontend inference and assistant registration should consume the same JSON cards without changing the schema.',
      },
    ],
    recommendations: [],
  };

  const recs = [];
  if (cardsWithNewFields.length > 0) {
    recs.push({
      priority: 'medium',
      title: 'Keep rich feature-card fields aligned across generators',
      details: `${cardsWithNewFields.length} feature cards already carry modules/imports/dependencies and lane metadata. Keep the contract stable so later multi-query passes can reuse it.`,
      nextAction: 'Use this report as the input contract for any new offline DuckDB or CouchDB mirror.',
      sourceRefs: cardsWithNewFields.slice(0, 10).map((card) => card.id),
    });
  }

  const offlineHeavy = cards.filter((card) => {
    const payload = card?.payload ?? {};
    const lanes = [...(payload.offlineProcessing ?? []), ...(payload.cache ?? []), ...(payload.inferenceFallbacks ?? [])];
    return lanes.some((value) => normalize(value).includes('duckdb') || normalize(value).includes('couchdb') || normalize(value).includes('gemma4') || normalize(value).includes('opencode'));
  });
  if (offlineHeavy.length > 0) {
    recs.push({
      priority: 'low',
      title: 'Keep offline lanes explicit but non-blocking',
      details: `${offlineHeavy.length} cards already signal offline or fallback lanes. Keep those as evaluated paths rather than request-path dependencies.`,
      nextAction: 'Mirror the same cards into offline stores later, then keep runtime reads on the authoritative Postgres/Redis path.',
      sourceRefs: offlineHeavy.slice(0, 10).map((card) => card.id),
    });
  }

  report.recommendations = recs;
  return report;
}

function writeReports(report) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const jsonPath = join(REPORTS_DIR, 'feature-card-semantics-report.json');
  const mdPath = join(REPORTS_DIR, 'feature-card-semantics-report.md');

  writeJson(jsonPath, report);

  const md = [
    '# Feature Card Semantics Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Cards: ${report.input.count}  |  Feature cards: ${report.input.featureCount}  |  Rich cards: ${report.input.richFieldCount}`,
    '',
    '## Field Counts',
    '',
    ...Object.entries(report.fieldCounts).flatMap(([key, values]) => [
      `### ${key}`,
      ...values.slice(0, 10).map((row) => `- ${row.value}: ${row.count}`),
      '',
    ]),
    '## Multi Query',
    '',
    ...report.semantics.multiQuery.flatMap((item) => [
      `### ${item.id}`,
      `- query: ${item.query}`,
      ...item.topCards.map((card) => `- ${card.id} (${card.kind}) [${card.score}]`),
      '',
    ]),
    '## Recommendations',
    '',
    ...report.recommendations.flatMap((rec) => [
      `### ${rec.title}`,
      `- priority: ${rec.priority}`,
      `- details: ${rec.details}`,
      `- nextAction: ${rec.nextAction}`,
      rec.sourceRefs?.length ? `- sourceRefs: ${rec.sourceRefs.map((ref) => `\`${ref}\``).join(', ')}` : '',
      '',
    ].filter(Boolean)),
  ].join('\n');

  writeText(mdPath, md);
  return { jsonPath, mdPath };
}

function main() {
  const cards = readJsonl(INPUT_PATH);
  const report = buildReport(cards);
  const outputs = writeReports(report);
  console.log(JSON.stringify({
    ok: true,
    generatedAt: report.generatedAt,
    cards: report.input.count,
    richCards: report.input.richFieldCount,
    outputs,
  }, null, 2));
}

main();
