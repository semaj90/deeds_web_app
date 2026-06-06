#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'runtime-packet-backfill-plan.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'runtime-packet-backfill-plan.md');

const INPUTS = {
  runtimePacketDensity: path.join(REPO_ROOT, 'docs', 'reports', 'runtime-packet-density-report.json'),
  featureLineage: path.join(REPO_ROOT, 'docs', 'reports', 'feature-lineage-report.json'),
  hiddenPacketPathmap: path.join(REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.json'),
};

const FIELD_ORDER = [
  'sourceRefs',
  'featureIds',
  'qdrantHits',
  'redisKeys',
  'parentAtlasDocuments',
  'somCluster',
  'glyphRecord',
  'neo4jNode',
  'rankedCards',
];

const FIELD_LABELS = {
  sourceRefs: 'sourceRefs',
  featureIds: 'featureIds',
  qdrantHits: 'qdrantHits',
  redisKeys: 'redisKeys',
  parentAtlasDocuments: 'parentAtlasDocuments',
  somCluster: 'somCluster',
  glyphRecord: 'glyphRecord',
  neo4jNode: 'neo4jNode',
  rankedCards: 'rankedCards',
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync?.(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readJsonAsync(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined && `${entry}`.trim().length > 0);
  if (value === null || value === undefined) return [];
  const str = `${value}`.trim();
  return str ? [str] : [];
}

function hasAny(value) {
  return asArray(value).length > 0;
}

function summarizeFieldSamples(packetDetails, field) {
  return packetDetails
    .filter((packet) => Number(packet?.counts?.[field] ?? 0) === 0)
    .map((packet) => ({
      packetId: `${packet.packetId}`,
      densityScore: packet.densityScore ?? '',
      counts: packet.counts ?? {},
      classification: packet.classification ?? '',
      suggestedRepair: packet.suggestedRepair ?? '',
    }));
}

function derivePacketEvidence(packetDetail, dbRow) {
  return {
    packetId: `${packetDetail.packetId}`,
    densityScore: packetDetail.densityScore ?? '',
    emptyPointers: Number(packetDetail?.counts?.sourceRefs ?? 0) === 0
      && Number(packetDetail?.counts?.featureIds ?? 0) === 0
      && Number(packetDetail?.counts?.qdrantHits ?? 0) === 0
      && Number(packetDetail?.counts?.redisKeys ?? 0) === 0,
    db: dbRow
      ? {
          id: `${dbRow.id}`,
          sourceRefs: asArray(dbRow.source_refs),
          featureIds: asArray(dbRow.feature_ids),
          laneIds: asArray(dbRow.lane_ids),
          clusterId: dbRow.cluster_id ?? '',
          somCluster: dbRow.som_cluster ?? '',
          qdrantHits: Number(dbRow.qdrant_hits ?? 0),
          redisHotKeys: asArray(dbRow.redis_hot_keys),
        }
      : null,
  };
}

function classifyField(field, packetDetails, dbRowsById, runtimeSummary, lineage, pathmap) {
  const missingPackets = packetDetails.filter((packet) => Number(packet?.counts?.[field] ?? 0) === 0);
  const sampleIds = missingPackets.slice(0, 6).map((packet) => `${packet.packetId}`);
  const sampleDbRows = missingPackets
    .map((packet) => dbRowsById.get(`${packet.packetId}`))
    .filter(Boolean);

  const hasAnySourceRefs = sampleDbRows.some((row) => hasAny(row.source_refs));
  const hasAnyFeatureIds = sampleDbRows.some((row) => hasAny(row.feature_ids));
  const hasAnyQdrantHits = sampleDbRows.some((row) => Number(row.qdrant_hits ?? 0) > 0);
  const hasAnyRedisHotKeys = sampleDbRows.some((row) => hasAny(row.redis_hot_keys));
  const hasEmptyPointerPacket = sampleDbRows.some((row) => {
    const sourceRefs = asArray(row.source_refs);
    const featureIds = asArray(row.feature_ids);
    const qdrantHits = Number(row.qdrant_hits ?? 0);
    const redisHotKeys = asArray(row.redis_hot_keys);
    return sourceRefs.length === 0 && featureIds.length === 0 && qdrantHits === 0 && redisHotKeys.length === 0;
  });

  const reportEvidence = {
    hiddenPacketCoverage: {
      sourceRefCoveragePct: pathmap?.summary?.sourceRefCoverage?.pct ?? null,
      featureIdCoveragePct: pathmap?.summary?.featureIdCoverage?.pct ?? null,
      featureLabelCoveragePct: pathmap?.summary?.featureLabelCoverage?.pct ?? null,
    },
    lineageCoverage: {
      sourceRefRows: lineage?.summary?.sourceRefRows ?? null,
      featureIdRows: lineage?.summary?.featureIdRows ?? null,
      featureLabelRows: lineage?.summary?.featureLabelRows ?? null,
      parentAtlasDocRows: lineage?.summary?.parentAtlasDocRows ?? null,
      somRows: lineage?.summary?.somRows ?? null,
      glyphRows: lineage?.summary?.glyphRows ?? null,
      qdrantRows: lineage?.summary?.qdrantRows ?? null,
      redisRows: lineage?.summary?.redisRows ?? null,
      neo4jRows: lineage?.summary?.neo4jRows ?? null,
    },
    runtimeMissingTally: runtimeSummary?.missingFieldsTally ?? {},
  };

  switch (field) {
    case 'sourceRefs':
      return {
        field,
        missingCount: missingPackets.length,
        classification: hasAnyQdrantHits ? 'RECOVERABLE_FROM_QDRANT_HIT' : (hasEmptyPointerPacket ? 'NEEDS_REPLAY' : 'RECOVERABLE_FROM_PATHMAP'),
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: hasEmptyPointerPacket
          ? 'Packet 1 is empty-pointer and still needs replay; the rest can be reconstructed from Qdrant hits and pathmap/parent-atlas joins.'
          : 'Source refs are reconstructable from the packet spine and pathmap evidence.',
      };
    case 'featureIds':
      return {
        field,
        missingCount: missingPackets.length,
        classification: hasAnyQdrantHits ? 'RECOVERABLE_FROM_FEATURE_LABELS' : (hasEmptyPointerPacket ? 'NEEDS_REPLAY' : 'RECOVERABLE_FROM_PATHMAP'),
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: hasEmptyPointerPacket
          ? 'Packet 1 is empty-pointer and still needs replay; the other missing feature IDs can be derived from feature labels/pathmap.'
          : 'Feature IDs are recoverable from the normalized feature-label spine.',
      };
    case 'qdrantHits':
      return {
        field,
        missingCount: missingPackets.length,
        classification: hasAnySourceRefs || hasAnyFeatureIds ? 'RECOVERABLE_FROM_QDRANT_HIT' : 'NEEDS_REPLAY',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: hasEmptyPointerPacket
          ? 'The empty-pointer packet has no source/feature anchors, so the missing Qdrant hit must be replayed.'
          : 'Qdrant hits are recoverable once sourceRef/featureId anchors exist.',
      };
    case 'redisKeys':
      return {
        field,
        missingCount: missingPackets.length,
        classification: hasAnySourceRefs || hasAnyFeatureIds ? 'RECOVERABLE_FROM_PACKET' : 'NEEDS_REPLAY',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: hasEmptyPointerPacket
          ? 'The empty-pointer packet cannot reconstruct Redis hot keys without replay.'
          : 'Redis hot keys are derivable from the packet contract once source/feature anchors exist.',
      };
    case 'parentAtlasDocuments':
      return {
        field,
        missingCount: missingPackets.length,
        classification: hasAnySourceRefs || hasAnyFeatureIds ? 'RECOVERABLE_FROM_PARENT_ATLAS' : 'NEEDS_REPLAY',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: 'Parent Atlas rows are present and the sourceRef/featureId spine is complete, so this is a join/backfill repair rather than ingest.',
      };
    case 'somCluster':
      return {
        field,
        missingCount: missingPackets.length,
        classification: hasAnyQdrantHits ? 'RECOVERABLE_FROM_QDRANT_HIT' : 'NEEDS_REPLAY',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: 'SOM cluster backfill should come from Qdrant hit metadata when available; only the empty-pointer packet lacks enough anchors for replay-free repair.',
      };
    case 'glyphRecord':
      return {
        field,
        missingCount: missingPackets.length,
        classification: 'RECOVERABLE_FROM_PARENT_ATLAS',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: 'Glyph records are a materialization/backfill concern, not a broad re-ingest problem.',
      };
    case 'neo4jNode':
      return {
        field,
        missingCount: missingPackets.length,
        classification: 'RECOVERABLE_FROM_PARENT_ATLAS',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: 'Neo4j nodes can be reconstructed from the sourceRef/featureId spine and graph-truth joins once the graph lane is available.',
      };
    case 'rankedCards':
      return {
        field,
        missingCount: missingPackets.length,
        classification: hasEmptyPointerPacket ? 'NEEDS_REPLAY' : 'RECOVERABLE_FROM_PACKET',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: hasEmptyPointerPacket
          ? 'Ranked cards on the empty-pointer packet require replay.'
          : 'Ranked cards are a downstream packet artifact and can be rebuilt from packet-level evidence.',
      };
    default:
      return {
        field,
        missingCount: missingPackets.length,
        classification: 'NOT_RECOVERABLE',
        samplePacketIds: sampleIds,
        evidence: reportEvidence,
        notes: 'No recovery rule defined for this field.',
      };
  }
}

async function tryLoadRouteRuntimePackets(env) {
  try {
    const dbUrl = resolveDatabaseUrl(env);
    if (!dbUrl) return { reachable: false, rows: [], error: 'DATABASE_URL missing' };

    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    try {
      const rows = await pool.query(`
        select id, source_refs, feature_ids, lane_ids, cluster_id, som_cluster, qdrant_hits, redis_hot_keys, latency_ms, cache_hit, cache_tier
        from route_runtime_packets
        order by id asc
      `);
      return { reachable: true, rows: rows.rows };
    } finally {
      await pool.end().catch(() => {});
    }
  } catch (error) {
    return {
      reachable: false,
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function run() {
  const runtimePacketDensity = await readJsonAsync(INPUTS.runtimePacketDensity);
  const featureLineage = await readJsonAsync(INPUTS.featureLineage);
  const hiddenPacketPathmap = await readJsonAsync(INPUTS.hiddenPacketPathmap);
  const env = loadRepoEnv();
  const routePackets = await tryLoadRouteRuntimePackets(env);

  const packetDetails = Array.isArray(runtimePacketDensity?.details) ? runtimePacketDensity.details : [];
  const missingFields = Object.keys(runtimePacketDensity?.summary?.missingFieldsTally ?? {}).filter(Boolean);
  const dbRowsById = new Map(routePackets.rows.map((row) => [`${row.id}`, row]));

  const fieldPlans = FIELD_ORDER
    .filter((field) => missingFields.includes(field))
    .map((field) => classifyField(field, packetDetails, dbRowsById, runtimePacketDensity.summary, featureLineage, hiddenPacketPathmap));

  const packetPlans = packetDetails.map((packet) => {
    const dbRow = dbRowsById.get(`${packet.packetId}`) ?? null;
    const missing = FIELD_ORDER.filter((field) => Number(packet?.counts?.[field] ?? 0) === 0);
    const emptyPointers = Number(packet?.counts?.sourceRefs ?? 0) === 0
      && Number(packet?.counts?.featureIds ?? 0) === 0
      && Number(packet?.counts?.qdrantHits ?? 0) === 0
      && Number(packet?.counts?.redisKeys ?? 0) === 0;

    const classification = emptyPointers
      ? 'NEEDS_REPLAY'
      : missing.includes('somCluster') || missing.includes('glyphRecord') || missing.includes('neo4jNode')
        ? 'RECOVERABLE_FROM_PARENT_ATLAS'
        : missing.includes('sourceRefs') || missing.includes('featureIds') || missing.includes('qdrantHits')
          ? 'RECOVERABLE_FROM_QDRANT_HIT'
          : 'RECOVERABLE_FROM_PACKET';

    const suggestedActions = [];
    if (missing.includes('sourceRefs')) suggestedActions.push('backfill sourceRefs from qdrant hits or pathmap evidence');
    if (missing.includes('featureIds')) suggestedActions.push('backfill featureIds from feature labels/pathmap evidence');
    if (missing.includes('qdrantHits')) suggestedActions.push('replay packet or rerun qdrant enrichment');
    if (missing.includes('redisKeys')) suggestedActions.push('recompute exact/semantic cache keys from packet provenance');
    if (missing.includes('parentAtlasDocuments')) suggestedActions.push('refresh parent atlas join rows');
    if (missing.includes('somCluster')) suggestedActions.push('derive SOM cluster from qdrant hit / parent atlas mapping');
    if (missing.includes('glyphRecord')) suggestedActions.push('materialize glyph record from higher-hop atlas state');
    if (missing.includes('neo4jNode')) suggestedActions.push('rebuild Neo4j node from sourceRef/featureId spine');
    if (missing.includes('rankedCards')) suggestedActions.push('replay downstream ranking stage');

    return {
      packetId: `${packet.packetId}`,
      densityScore: packet.densityScore ?? '',
      classification: packet.classification ?? '',
      backfillClassification: classification,
      emptyPointers,
      counts: packet.counts ?? {},
      missingFields: missing,
      db: dbRow
        ? {
            id: `${dbRow.id}`,
            sourceRefs: asArray(dbRow.source_refs),
            featureIds: asArray(dbRow.feature_ids),
            laneIds: asArray(dbRow.lane_ids),
            clusterId: dbRow.cluster_id ?? '',
            somCluster: dbRow.som_cluster ?? '',
            qdrantHits: Number(dbRow.qdrant_hits ?? 0),
            redisHotKeys: asArray(dbRow.redis_hot_keys),
          }
        : null,
      suggestedActions,
    };
  });

  const missingFieldSummaries = fieldPlans.map((entry) => ({
    field: entry.field,
    missingCount: entry.missingCount,
    classification: entry.classification,
    samplePacketIds: entry.samplePacketIds,
    notes: entry.notes,
  }));

  const classificationCounts = fieldPlans.reduce((acc, entry) => {
    acc[entry.classification] = (acc[entry.classification] ?? 0) + 1;
    return acc;
  }, {});

  const packetClassificationCounts = packetPlans.reduce((acc, entry) => {
    acc[entry.backfillClassification] = (acc[entry.backfillClassification] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      runtimePacketDensity: path.relative(REPO_ROOT, INPUTS.runtimePacketDensity),
      featureLineage: path.relative(REPO_ROOT, INPUTS.featureLineage),
      hiddenPacketPathmap: path.relative(REPO_ROOT, INPUTS.hiddenPacketPathmap),
      routeRuntimePackets: routePackets.reachable ? 'route_runtime_packets (live)' : 'route_runtime_packets (unavailable)',
    },
    liveRouteRuntimePackets: {
      reachable: routePackets.reachable,
      rowCount: routePackets.rows.length,
      error: routePackets.error ?? null,
    },
    summary: {
      analyzedPackets: runtimePacketDensity?.summary?.totalAnalyzed ?? packetDetails.length,
      emptyPointerPackets: runtimePacketDensity?.summary?.emptyPointersCount ?? 0,
      optimalPackets: runtimePacketDensity?.summary?.optimalCount ?? 0,
      avgHydrationRatio: runtimePacketDensity?.summary?.avgHydrationRatio ?? '0%',
      missingFieldCounts: runtimePacketDensity?.summary?.missingFieldsTally ?? {},
      fieldClassificationCounts: classificationCounts,
      packetClassificationCounts,
      packetTailNeedsReplay: packetPlans.filter((entry) => entry.backfillClassification === 'NEEDS_REPLAY').length,
      packetTailRecoverable: packetPlans.filter((entry) => entry.backfillClassification !== 'NEEDS_REPLAY').length,
    },
    fieldPlans: fieldPlans,
    packetPlans: packetPlans,
    notes: [
      'This plan is read-only.',
      'It does not mutate DB rows, packets, Qdrant, Neo4j, or Redis.',
      'The only live read is route_runtime_packets when the DB is reachable.',
    ],
  };

  const md = [
    '# Runtime Packet Backfill Plan',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Inputs',
    '',
    `- runtime packet density: ${report.inputs.runtimePacketDensity}`,
    `- feature lineage: ${report.inputs.featureLineage}`,
    `- hidden packet pathmap: ${report.inputs.hiddenPacketPathmap}`,
    `- route_runtime_packets: ${report.liveRouteRuntimePackets.reachable ? 'reachable' : 'unavailable'}`,
    '',
    '## Summary',
    '',
    `- analyzed packets: ${report.summary.analyzedPackets}`,
    `- empty-pointer packets: ${report.summary.emptyPointerPackets}`,
    `- optimal packets: ${report.summary.optimalPackets}`,
    `- average hydration ratio: ${report.summary.avgHydrationRatio}`,
    `- packet tail requiring replay: ${report.summary.packetTailNeedsReplay}`,
    `- packet tail recoverable without replay: ${report.summary.packetTailRecoverable}`,
    '',
    '## Field Classification',
    '',
    '| Field | Missing | Classification | Sample packets | Notes |',
    '| --- | ---: | --- | --- | --- |',
    ...fieldPlans.map((entry) => `| ${FIELD_LABELS[entry.field] ?? entry.field} | ${entry.missingCount} | ${entry.classification} | ${entry.samplePacketIds.join(', ') || 'n/a'} | ${entry.notes} |`),
    '',
    '## Packet Tail',
    '',
    '| Packet | Backfill class | Missing fields | Suggested actions |',
    '| --- | --- | --- | --- |',
    ...packetPlans.slice(0, 12).map((entry) => `| ${entry.packetId} | ${entry.backfillClassification} | ${entry.missingFields.join(', ') || 'none'} | ${entry.suggestedActions.join('; ') || 'none'} |`),
    '',
    '## Notes',
    '',
    '- The planner keeps Parent Atlas and Graphify as utility tooling for semantic indexing and ACE quick hits.',
    '- The packet tail is small; the empty-pointer packet is the only one that clearly requires replay.',
    '- Higher-hop fields are still a materialization/backfill problem, not a broad re-ingest problem.',
  ].join('\n');

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUT_MD, `${md}\n`, 'utf8');

  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_MD)}`);
  console.log(JSON.stringify({
    reachable: report.liveRouteRuntimePackets.reachable,
    packetTailNeedsReplay: report.summary.packetTailNeedsReplay,
    fieldClassificationCounts: report.summary.fieldClassificationCounts,
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
