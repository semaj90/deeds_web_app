#!/usr/bin/env node
/**
 * Read-only planning pass for NESCHROM97 Qdrant payload enrichment.
 *
 * Inputs:
 *   docs/reports/neschrom97-card-registry.json
 *
 * Outputs:
 *   docs/reports/neschrom97-qdrant-tag-plan.json
 *   docs/reports/neschrom97-qdrant-tag-plan.md
 *
 * This script does not mutate Qdrant, Postgres, Redis, Neo4j, or card JSON.
 */

import path from 'node:path';
import {
  readJson,
  resolveRepoPath,
  topEntries,
  writeJson,
  writeMarkdown,
} from './_atlas-utils.mjs';

const INPUT_JSON = resolveRepoPath('docs/reports/neschrom97-card-registry.json');
const OUTPUT_JSON = resolveRepoPath('docs/reports/neschrom97-qdrant-tag-plan.json');
const OUTPUT_MD = resolveRepoPath('docs/reports/neschrom97-qdrant-tag-plan.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');

function normalizeSourceRef(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^file:/, '')
    .replace(/^\.?\//, '')
    .replace(/^sveltekit-frontend\//, '');
}

function directoryPathFromSourceRef(sourceRef) {
  const normalized = normalizeSourceRef(sourceRef);
  if (!normalized) return null;
  const dir = path.posix.dirname(normalized);
  return dir === '.' ? null : dir;
}

function featureLabelFromCard(card) {
  return card?.title ?? card?.feature_id ?? card?.feature_ids?.[0] ?? null;
}

function buildTags(card, packetKey) {
  const sourceRef = normalizeSourceRef(card?.source_ref);
  const directoryPath = directoryPathFromSourceRef(sourceRef);
  const featureId = card?.feature_id ?? card?.feature_ids?.[0] ?? null;
  const tags = new Set(['surface:neschrom97', 'surface:hyperrag']);

  if (card?.card_id) tags.add(`card:${card.card_id}`);
  if (packetKey) tags.add(`packet:${packetKey}`);
  if (sourceRef) tags.add(`source_ref:${sourceRef}`);
  if (featureId) tags.add(`feature:${featureId}`);
  if (directoryPath) tags.add(`directory:${directoryPath}`);

  return [...tags];
}

function groupKey(card) {
  const featureId = card?.feature_id ?? card?.feature_ids?.[0] ?? 'unknown-feature';
  const directoryPath = directoryPathFromSourceRef(card?.source_ref) ?? 'unknown-directory';
  return `${featureId}::${directoryPath}`;
}

function sampleRecords(records, limit = 12) {
  return records.slice(0, limit).map((record) => ({
    card_id: record.card_id,
    packet_key: record.packet_key,
    source_ref: record.source_ref,
    feature_id: record.feature_id,
    feature_label: record.feature_label,
    directory_path: record.directory_path,
    tags: record.tags,
  }));
}

function buildPlan(registry) {
  const joinedCards = Array.isArray(registry?.samples?.joinedCards) ? registry.samples.joinedCards : [];
  const unjoinedCards = Array.isArray(registry?.samples?.unjoinedCards) ? registry.samples.unjoinedCards : [];

  const readyRecords = joinedCards.map((card) => {
    const packetKey = Array.isArray(card.packet_keys) ? card.packet_keys[0] ?? null : null;
    const sourceRef = normalizeSourceRef(card.source_ref);
    const featureId = card.feature_id ?? card.feature_ids?.[0] ?? null;
    const directoryPath = directoryPathFromSourceRef(sourceRef);
    const featureLabel = featureLabelFromCard(card);
    return {
      card_id: card.card_id,
      packet_key: packetKey,
      source_ref: sourceRef,
      feature_id: featureId,
      feature_label: featureLabel,
      directory_path: directoryPath,
      tags: buildTags(card, packetKey),
      action: 'READY_TO_TAG',
    };
  });

  const joinGapRecords = unjoinedCards.map((card) => {
    const sourceRef = normalizeSourceRef(card.source_ref);
    return {
      card_id: card.card_id,
      source_ref: sourceRef,
      feature_id: card.feature_id ?? card.feature_ids?.[0] ?? null,
      feature_label: featureLabelFromCard(card),
      directory_path: directoryPathFromSourceRef(sourceRef),
      action: 'NEEDS_JOIN_BACKFILL',
      reason: 'No packet join in registry sample',
    };
  });

  const readyGroups = new Map();
  for (const record of readyRecords) {
    const key = groupKey(record);
    if (!readyGroups.has(key)) {
      readyGroups.set(key, {
        key,
        feature_id: record.feature_id ?? null,
        feature_label: record.feature_label ?? null,
        directory_path: record.directory_path ?? null,
        count: 0,
        packet_keys: new Set(),
        source_refs: new Set(),
        tags: new Set(),
      });
    }
    const group = readyGroups.get(key);
    group.count += 1;
    if (record.packet_key) group.packet_keys.add(record.packet_key);
    if (record.source_ref) group.source_refs.add(record.source_ref);
    for (const tag of record.tags) group.tags.add(tag);
  }

  const readyGroupRows = [...readyGroups.values()]
    .map((group) => ({
      key: group.key,
      feature_id: group.feature_id,
      feature_label: group.feature_label,
      directory_path: group.directory_path,
      count: group.count,
      packet_keys: [...group.packet_keys].slice(0, 6),
      source_refs: [...group.source_refs].slice(0, 6),
      tags: [...group.tags],
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

  const tagHistogram = new Map();
  for (const record of readyRecords) {
    for (const tag of record.tags) {
      tagHistogram.set(tag, (tagHistogram.get(tag) ?? 0) + 1);
    }
  }

  return {
    schema: 'neschrom97_qdrant_tag_plan.v1',
    generatedAt: new Date().toISOString(),
    input: normalizeSourceRef(path.relative(resolveRepoPath('.'), INPUT_JSON)),
    scope: {
      primaryCollection: 'codebase_chunks_768',
      excludedCollections: ['legal_documents'],
      readOnly: true,
    },
    summary: {
      registryCards: registry?.counts?.cards ?? 0,
      registryPackets: registry?.counts?.packets ?? 0,
      joinedCardSamples: joinedCards.length,
      unjoinedCardSamples: unjoinedCards.length,
      cardPacketJoinCoverage: registry?.coverage?.cardPacketJoinCoverage ?? 0,
      cardFeatureCoverage: registry?.coverage?.cardFeatureCoverage ?? 0,
      readyToTagSamples: readyRecords.length,
      needsJoinBackfillSamples: joinGapRecords.length,
      recommendedPayloadKeys: ['card_id', 'packet_key', 'source_ref', 'feature_id', 'directory_path', 'surface:neschrom97'],
    },
    payloadTemplate: {
      collection: 'codebase_chunks_768',
      payload: {
        card_id: '<card_id>',
        packet_key: '<packet_key>',
        source_ref: '<source_ref>',
        feature_id: '<feature_id>',
        feature_label: '<feature_label|null>',
        directory_path: '<directory_path|null>',
        surface: 'neschrom97',
        qdrant_tags: ['surface:neschrom97', 'surface:hyperrag'],
      },
    },
    tagHistogram: topEntries(tagHistogram, 20).map(({ key, value }) => ({ tag: key, count: value })),
    readyGroups: readyGroupRows,
    readySamples: sampleRecords(readyRecords, 12),
    joinBackfillSamples: joinGapRecords.slice(0, 12),
    nextRepairActions: [
      'Patch Qdrant payloads for the ready-to-tag sample groups first.',
      'Backfill missing packet joins for unjoined registry samples before broad payload writes.',
      'Keep legal_documents separate from codebase_chunks_768.',
      'Treat feature_label as derived display metadata, not canonical identity.',
    ],
  };
}

function buildMarkdown(plan) {
  const lines = [
    '# NESCHROM97 Qdrant Tag Plan',
    '',
    `Generated: ${plan.generatedAt}`,
    '',
    '## Scope',
    '',
    `- primary collection: ${plan.scope.primaryCollection}`,
    `- excluded collections: ${plan.scope.excludedCollections.join(', ')}`,
    `- read only: ${plan.scope.readOnly}`,
    '',
    '## Summary',
    '',
    `- registry cards: ${plan.summary.registryCards}`,
    `- registry packets: ${plan.summary.registryPackets}`,
    `- joined card samples: ${plan.summary.joinedCardSamples}`,
    `- unjoined card samples: ${plan.summary.unjoinedCardSamples}`,
    `- join coverage: ${(plan.summary.cardPacketJoinCoverage * 100).toFixed(2)}%`,
    `- feature coverage: ${(plan.summary.cardFeatureCoverage * 100).toFixed(2)}%`,
    `- ready-to-tag samples: ${plan.summary.readyToTagSamples}`,
    `- needs-join-backfill samples: ${plan.summary.needsJoinBackfillSamples}`,
    '',
    '## Payload Template',
    '',
    '```json',
    JSON.stringify(plan.payloadTemplate, null, 2),
    '```',
    '',
    '## Recommended Payload Keys',
    '',
    ...plan.summary.recommendedPayloadKeys.map((key) => `- ${key}`),
    '',
    '## Top Tag Histogram',
    '',
    ...(plan.tagHistogram.length ? plan.tagHistogram.map((entry) => `- ${entry.tag}: ${entry.count}`) : ['- none']),
    '',
    '## Ready Groups',
    '',
    ...(plan.readyGroups.length
      ? plan.readyGroups.map((group) => [
          `### ${group.feature_id ?? 'unknown'} — ${group.directory_path ?? 'unknown-directory'}`,
          '',
          `- count: ${group.count}`,
          `- feature_label: ${group.feature_label ?? 'n/a'}`,
          `- packet_keys: ${group.packet_keys.join(', ') || 'n/a'}`,
          `- source_refs: ${group.source_refs.join(', ') || 'n/a'}`,
          `- tags: ${group.tags.join(', ') || 'n/a'}`,
          '',
        ].join('\n'))
      : ['- none']),
    '## Ready Samples',
    '',
    ...(plan.readySamples.length
      ? plan.readySamples.map((sample) =>
          `- ${sample.card_id}: ${sample.source_ref} -> ${sample.feature_id ?? 'n/a'} (${sample.packet_key ?? 'no-packet'})`
        )
      : ['- none']),
    '',
    '## Join-Backfill Samples',
    '',
    ...(plan.joinBackfillSamples.length
      ? plan.joinBackfillSamples.map((sample) =>
          `- ${sample.card_id}: ${sample.source_ref} -> ${sample.feature_id ?? 'n/a'} (${sample.reason})`
        )
      : ['- none']),
    '',
    '## Next Repair Actions',
    '',
    ...plan.nextRepairActions.map((action) => `- ${action}`),
  ];

  return lines.join('\n');
}

function main() {
  const registry = readJson(INPUT_JSON, null);
  if (!registry) {
    console.error(`[neschrom97-qdrant-tag-plan] Missing input: ${INPUT_JSON}`);
    process.exit(1);
  }

  const plan = buildPlan(registry);

  if (DRY_RUN) {
    console.log('[neschrom97-qdrant-tag-plan] dry-run only');
    console.log(JSON.stringify({
      generatedAt: plan.generatedAt,
      readyToTagSamples: plan.summary.readyToTagSamples,
      needsJoinBackfillSamples: plan.summary.needsJoinBackfillSamples,
      topTags: plan.tagHistogram.slice(0, 8),
    }, null, 2));
    return;
  }

  writeJson(OUTPUT_JSON, plan);
  writeMarkdown(OUTPUT_MD, buildMarkdown(plan));

  console.log(`[neschrom97-qdrant-tag-plan] wrote ${OUTPUT_JSON}`);
  console.log(`[neschrom97-qdrant-tag-plan] wrote ${OUTPUT_MD}`);
  console.log(`[neschrom97-qdrant-tag-plan] ready-to-tag=${plan.summary.readyToTagSamples} join-backfill=${plan.summary.needsJoinBackfillSamples}`);
}

main();
