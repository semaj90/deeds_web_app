#!/usr/bin/env node
import crypto from 'node:crypto';
import { MASTER_FEATURE_MAP } from '../../src/lib/server/atlas/master-feature-map.ts';
import { sortObject, stableHash } from '../index/shared.mjs';

function compact(text, limit = 220) {
  const normalized = String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function cardLabels(...labels) {
  return [...new Set(labels.filter(Boolean).map((label) => String(label).trim()).filter(Boolean))].sort();
}

function hashCard(card) {
  const clone = { ...card };
  delete clone.hash;
  return stableHash(JSON.stringify(sortObject(clone)));
}

function makeCard(base) {
  const card = { ...base };
  card.hash = hashCard(card);
  return card;
}

function scoreOf(card) {
  const scores = card.scores ?? {};
  return [
    Number(scores.rank ?? 0),
    Number(scores.authority ?? 0),
    Number(scores.recency ?? 0),
  ].reduce((sum, value) => sum + value, 0);
}

function statusRank(status) {
  switch (String(status ?? '').toLowerCase()) {
    case 'active':
      return 95;
    case 'partial':
      return 82;
    case 'dry_run':
      return 68;
    case 'planned':
      return 54;
    case 'research_spike':
      return 42;
    case 'deprecated':
      return 12;
    default:
      return 20;
  }
}

function featureSourceRefs(entry) {
  const refs = new Set(['src/lib/server/atlas/master-feature-map.ts']);
  if (entry?.params?.docRef) refs.add(String(entry.params.docRef));
  for (const file of entry?.evidence?.files ?? []) refs.add(String(file));
  for (const file of entry?.pathMapping ?? []) refs.add(String(file));
  return [...refs];
}

function featureSummary(entry) {
  const stores = Array.isArray(entry?.stores) ? entry.stores.join(', ') : 'none';
  const clusters = Array.isArray(entry?.clusters) && entry.clusters.length > 0
    ? entry.clusters.map(String).join(', ')
    : 'none';
  return compact(
    `${entry.name} — ${entry.intent}. Status ${entry.status}. ` +
    `Service ${entry.service}; stores ${stores}; clusters ${clusters}`
  );
}

function featureLabels(entry) {
  const stores = Array.isArray(entry?.stores) ? entry.stores.map((store) => `store:${store}`) : [];
  const clusters = Array.isArray(entry?.clusters) ? entry.clusters.map((cluster) => `cluster:${cluster}`) : [];
  const pathMapping = Array.isArray(entry?.pathMapping) ? entry.pathMapping.map((path) => `path:${path}`) : [];
  return cardLabels(
    'feature-map',
    `status:${entry.status}`,
    `service:${entry.service}`,
    ...stores,
    ...clusters,
    ...pathMapping,
  );
}

export function buildMasterFeatureCards() {
  const cards = Object.values(MASTER_FEATURE_MAP).map((entry) => {
    const rank = statusRank(entry.status);
    const evidenceCount = Array.isArray(entry?.evidence?.files) ? entry.evidence.files.length : 0;
    return makeCard({
      id: `feature-map:${entry.id}`,
      kind: 'feature',
      labels: featureLabels(entry),
      summary: featureSummary(entry),
      sourceRefs: featureSourceRefs(entry),
      scores: {
        rank,
        authority: Math.min(1, (Array.isArray(entry.stores) ? entry.stores.length : 0) * 0.1 + evidenceCount * 0.05),
      },
      payload: {
        id: entry.id,
        name: entry.name,
        intent: entry.intent,
        service: entry.service,
        stores: entry.stores,
        clusters: entry.clusters,
        status: entry.status,
        params: entry.params,
        pathMapping: entry.pathMapping ?? [],
        failOpen: entry.failOpen,
      },
    });
  });

  return cards.sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));
}
