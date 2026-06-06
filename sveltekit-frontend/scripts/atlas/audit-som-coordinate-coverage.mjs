#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  normalizeFeatureId,
  normalizePathLike,
  normalizeSourceRef,
  normalizeSourceRefs,
} from './audit-jsonl.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'som-coordinate-coverage-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'som-coordinate-coverage-report.md');

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const LIMIT_DEFAULT = 5000;
const BATCH_SIZE = 500;
const CLUSTER_TOPOLOGY_CANDIDATES = [
  path.join(REPO_ROOT, '.tmp', 'offline-analysis', 'cluster-topology.json'),
  path.join(REPO_ROOT, '.tmp', 'offline-analysis', 'fe-graph-cluster-topology.json'),
];

function parseLimit(argv) {
  const match = argv.find((arg) => arg.startsWith('--limit='));
  const envLimit = process.env.npm_config_limit;
  const value = Number.parseInt(match?.split('=')[1] ?? envLimit ?? `${LIMIT_DEFAULT}`, 10);
  return Number.isFinite(value) && value > 0 ? value : LIMIT_DEFAULT;
}

function ensureDir(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function resolveFirstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizePathLike(entry))
      .filter(Boolean);
  }
  const normalized = normalizePathLike(value);
  return normalized ? [normalized] : [];
}

function firstPresent(...values) {
  for (const value of values) {
    const normalized = normalizePathLike(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeClusterValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.replace(/\s+/g, '');
}

function parseRowColCluster(value) {
  const text = normalizeClusterValue(value);
  if (!text) return null;
  const match = text.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  return { somRow: Number(match[1]), somCol: Number(match[2]) };
}

function coordKey(somRow, somCol) {
  if (!Number.isFinite(somRow) || !Number.isFinite(somCol)) return null;
  return `${Number(somRow)}:${Number(somCol)}`;
}

function addToSetMap(map, key, value) {
  if (!key || !value) return;
  const normalizedKey = normalizeClusterValue(key);
  if (!normalizedKey) return;
  const normalizedValue = normalizeClusterValue(value);
  if (!normalizedValue) return;
  let bucket = map.get(normalizedKey);
  if (!bucket) {
    bucket = new Set();
    map.set(normalizedKey, bucket);
  }
  bucket.add(normalizedValue);
}

function getMapValues(map, key) {
  if (!key) return [];
  const normalizedKey = normalizeClusterValue(key);
  if (!normalizedKey) return [];
  return [...(map.get(normalizedKey) ?? [])];
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => `${a}`.localeCompare(`${b}`));
}

function sampleTopLevelKeys(row, limit = 12) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
  return Object.keys(row).slice(0, limit);
}

function summarizeEvidenceRows(rows) {
  return rows.slice(0, 4).map((row) => ({
    table: row.table,
    sourceRef: row.sourceRef ?? null,
    featureId: row.featureId ?? null,
    qdrantPointId: row.qdrantPointId ?? null,
    somCluster: row.somCluster ?? null,
    centroidId: row.centroidId ?? null,
  }));
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildClusterMap(clusterTopology) {
  const map = new Map();
  const clusters = Array.isArray(clusterTopology?.clusters) ? clusterTopology.clusters : [];

  for (const cluster of clusters) {
    const somRow = Number(cluster?.somRow);
    const somCol = Number(cluster?.somCol);
    const coords = Number.isFinite(somRow) && Number.isFinite(somCol) ? { somRow, somCol } : null;
    if (!coords) continue;

    const keys = uniqueSorted([
      cluster?.clusterId,
      cluster?.somCluster,
      coordKey(coords.somRow, coords.somCol),
    ]);
    for (const key of keys) {
      map.set(normalizeClusterValue(key), {
        clusterId: cluster?.clusterId ?? null,
        somCluster: cluster?.somCluster ?? null,
        somRow: coords.somRow,
        somCol: coords.somCol,
      });
    }
  }

  return map;
}

function scrollPointPayload(point) {
  const payload = point?.payload ?? {};
  const sourceRef = normalizeSourceRef(payload) ?? normalizeSourceRef(point);
  const sourceRefs = normalizeSourceRefs(payload).length > 0 ? normalizeSourceRefs(payload) : normalizeSourceRefs(point);
  const featureId = normalizeFeatureId(payload) ?? normalizeFeatureId(point);
  const featureIds = Array.isArray(payload.feature_ids) && payload.feature_ids.length > 0
    ? payload.feature_ids.map((entry) => normalizePathLike(entry)).filter(Boolean)
    : Array.isArray(payload.featureIds) && payload.featureIds.length > 0
      ? payload.featureIds.map((entry) => normalizePathLike(entry)).filter(Boolean)
      : featureId
        ? [featureId]
        : [];
  const somRow = Number.isFinite(Number(payload.somRow))
    ? Number(payload.somRow)
    : Number.isFinite(Number(payload.som_row))
      ? Number(payload.som_row)
      : Number.isFinite(Number(payload.som_bmu_row))
        ? Number(payload.som_bmu_row)
        : null;
  const somCol = Number.isFinite(Number(payload.somCol))
    ? Number(payload.somCol)
    : Number.isFinite(Number(payload.som_col))
      ? Number(payload.som_col)
      : Number.isFinite(Number(payload.som_bmu_col))
        ? Number(payload.som_bmu_col)
        : null;
  const directSomCluster = firstPresent(payload.som_cluster, payload.somCluster, payload.cluster_id, payload.clusterId, payload.gpu_cluster, payload.gpuCluster);
  const centroidId = firstPresent(payload.centroid_id, payload.centroidId);
  const qdrantPointId = firstPresent(point.id, payload.qdrant_point_id, payload.qdrantPointId);

  return {
    pointId: qdrantPointId ?? `${point.id}`,
    sourceRef,
    sourceRefs,
    featureId,
    featureIds,
    somRow,
    somCol,
    somCluster: normalizeClusterValue(directSomCluster),
    centroidId,
    hasCoords: Number.isFinite(somRow) && Number.isFinite(somCol),
    payloadKeys: sampleTopLevelKeys(payload),
    rawPayload: payload,
  };
}

async function scrollQdrant(limit) {
  const points = [];
  let offset = null;
  let scanned = 0;

  while (scanned < limit) {
    const batchLimit = Math.min(BATCH_SIZE, limit - scanned);
    const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: batchLimit,
        offset,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Qdrant scroll failed ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const batch = Array.isArray(data?.result?.points) ? data.result.points : [];
    if (batch.length === 0) break;

    for (const point of batch) {
      points.push(point);
      scanned += 1;
      if (scanned >= limit) break;
    }

    offset = data?.result?.next_page_offset ?? null;
    if (offset === null || offset === undefined) break;
  }

  return points;
}

async function queryPgEvidence(rows) {
  const pool = new Pool({ connectionString: DB_URL });

  const sourceRefs = uniqueSorted(rows.flatMap((row) => row.sourceRefs ?? []).concat(rows.map((row) => row.sourceRef).filter(Boolean)));
  const featureIds = uniqueSorted(rows.flatMap((row) => row.featureIds ?? []).concat(rows.map((row) => row.featureId).filter(Boolean)));
  const qdrantPointIds = uniqueSorted(rows.map((row) => row.pointId).filter(Boolean));
  const centroidIds = uniqueSorted(rows.map((row) => row.centroidId).filter(Boolean));

  const tables = ['atlas_feature_map', 'atlas_feature_map_synthesized', 'parent_atlas_documents'];
  const tableRows = [];

  try {
    for (const table of tables) {
      const columnQuery = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
      `;
      const { rows: columnRows } = await pool.query(columnQuery, [table]);
      const columns = new Set(columnRows.map((row) => row.column_name));

      const selectColumns = [
        columns.has('source_ref') ? 'source_ref' : `NULL::text AS source_ref`,
        columns.has('feature_id') ? 'feature_id' : `NULL::text AS feature_id`,
        columns.has('som_cluster') ? 'som_cluster' : `NULL::text AS som_cluster`,
        columns.has('centroid_id') ? 'centroid_id' : `NULL::text AS centroid_id`,
        columns.has('qdrant_point_id') ? 'qdrant_point_id' : `NULL::text AS qdrant_point_id`,
      ];

      const whereParts = [];
      if (columns.has('source_ref')) whereParts.push(`(cardinality($1::text[]) > 0 AND source_ref = ANY($1::text[]))`);
      if (columns.has('feature_id')) whereParts.push(`(cardinality($2::text[]) > 0 AND feature_id = ANY($2::text[]))`);
      if (columns.has('qdrant_point_id')) whereParts.push(`(cardinality($3::text[]) > 0 AND qdrant_point_id = ANY($3::text[]))`);
      if (columns.has('centroid_id')) whereParts.push(`(cardinality($4::text[]) > 0 AND centroid_id = ANY($4::text[]))`);
      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' OR ')}` : '';

      if (whereParts.length === 0) continue;

      const query = `
        SELECT
          '${table}' AS table,
          ${selectColumns.join(',\n          ')}
        FROM ${quoteIdentifier(table)}
        ${whereClause}
      `;
      const { rows: resultRows } = await pool.query(query, [sourceRefs, featureIds, qdrantPointIds, centroidIds]);
      for (const row of resultRows) {
        tableRows.push({
          table: row.table,
          sourceRef: normalizePathLike(row.source_ref),
          featureId: normalizePathLike(row.feature_id),
          somCluster: normalizeClusterValue(row.som_cluster),
          centroidId: normalizeClusterValue(row.centroid_id),
          qdrantPointId: normalizeClusterValue(row.qdrant_point_id),
        });
      }
    }

    return {
      ok: true,
      rows: tableRows,
      sourceRefs,
      featureIds,
      qdrantPointIds,
      centroidIds,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      rows: [],
      sourceRefs,
      featureIds,
      qdrantPointIds,
      centroidIds,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

function classifyMissingPoint(point, pgRows, somClusterToCoords, centroidToCoords, pgAvailable) {
  const evidenceRows = pgRows.filter((row) => {
    if (row.qdrantPointId && normalizeClusterValue(row.qdrantPointId) === normalizeClusterValue(point.pointId)) return true;
    if (row.sourceRef && point.sourceRefs.some((value) => normalizePathLike(value) === row.sourceRef)) return true;
    if (row.featureId && point.featureIds.some((value) => normalizePathLike(value) === row.featureId)) return true;
    return false;
  });

  const pointSomCluster = point.somCluster;
  const pointCentroidId = point.centroidId;
  const directSomMatch = pointSomCluster ? somClusterToCoords.get(normalizeClusterValue(pointSomCluster)) ?? null : null;
  const directCentroidMatch = pointCentroidId ? centroidToCoords.get(normalizeClusterValue(pointCentroidId)) ?? null : null;
  const evidenceSomCluster = evidenceRows.find((row) => row.somCluster && somClusterToCoords.has(normalizeClusterValue(row.somCluster))) ?? null;
  const evidenceCentroid = evidenceRows.find((row) => row.centroidId && centroidToCoords.has(normalizeClusterValue(row.centroidId))) ?? null;

  const derived =
    directSomMatch ??
    directCentroidMatch ??
    (evidenceSomCluster?.somCluster ? somClusterToCoords.get(normalizeClusterValue(evidenceSomCluster.somCluster)) ?? null : null) ??
    (evidenceCentroid?.centroidId ? centroidToCoords.get(normalizeClusterValue(evidenceCentroid.centroidId)) ?? null : null);

  const hasLineageAnchor = point.sourceRefs.length > 0 || point.featureIds.length > 0 || evidenceRows.length > 0;
  const hasAnyTopologyMarker = Boolean(pointSomCluster || pointCentroidId || evidenceSomCluster?.somCluster || evidenceCentroid?.centroidId);

  if (derived) {
    if (directSomMatch || evidenceSomCluster) {
      return {
        classification: 'RECOVERABLE_FROM_SOM_CLUSTER',
        derived,
        evidenceRows,
        note: 'SOM cluster evidence resolves to known row/col coordinates.',
      };
    }
    return {
      classification: 'RECOVERABLE_FROM_CENTROID_MAP',
      derived,
      evidenceRows,
      note: 'Centroid evidence resolves to known row/col coordinates.',
    };
  }

  if (!hasLineageAnchor && !hasAnyTopologyMarker) {
    return {
      classification: 'LEGACY_POINT_NO_TOPOLOGY',
      derived: null,
      evidenceRows,
      note: 'Legacy point has no source_ref, feature_id, som_cluster, or centroid_id anchor.',
    };
  }

  if (!pgAvailable && hasLineageAnchor) {
    return {
      classification: 'SOURCE_UNAVAILABLE',
      derived: null,
      evidenceRows,
      note: 'Postgres evidence unavailable for final recovery check.',
    };
  }

  return {
    classification: 'NEEDS_SOM_RECOMPUTE',
    derived: null,
    evidenceRows,
    note: 'No known SOM row/col recovery path is available from cluster or centroid evidence.',
  };
}

function writeMarkdown(report) {
  const summary = report.summary;
  const classEntries = Object.entries(summary.classificationCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `- ${label}: ${count}`);

  const sampleRows = report.details.slice(0, 25).map((row) => {
    const sourceRef = row.sourceRef ?? 'n/a';
    const featureId = row.featureId ?? 'n/a';
    const somCluster = row.somCluster ?? 'n/a';
    const centroidId = row.centroidId ?? 'n/a';
    const derived = row.derivedCoords ? `${row.derivedCoords.somRow},${row.derivedCoords.somCol}` : 'n/a';
    return `| \`${String(row.pointId)}\` | ${row.classification} | ${sourceRef} | ${featureId} | ${somCluster} | ${centroidId} | ${derived} | ${row.note} |`;
  });

  return [
    '# SOM Coordinate Coverage Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Limit: ${report.limit}`,
    '',
    '## Service Status',
    '',
    `- Qdrant: ${report.services.qdrant.ok ? 'READY' : 'SOURCE_UNAVAILABLE'}${report.services.qdrant.message ? ` (${report.services.qdrant.message})` : ''}`,
    `- Postgres: ${report.services.postgres.ok ? 'READY' : 'SOURCE_UNAVAILABLE'}${report.services.postgres.message ? ` (${report.services.postgres.message})` : ''}`,
    `- SOM topology file: ${report.services.topology.ok ? 'READY' : 'SOURCE_UNAVAILABLE'}${report.services.topology.path ? ` (${report.services.topology.path})` : ''}`,
    '',
    '## Summary',
    '',
    `- Scanned points: ${summary.scannedPoints}`,
    `- Missing somRow/somCol: ${summary.missingCoordinatePoints}`,
    `- With direct coordinates: ${summary.directCoordinatePoints}`,
    `- Missing somRow: ${summary.missingSomRow}`,
    `- Missing somCol: ${summary.missingSomCol}`,
    `- sourceRef coverage among missing: ${summary.sourceRefCoveragePct}`,
    `- featureId coverage among missing: ${summary.featureIdCoveragePct}`,
    `- somCluster anchors among missing: ${summary.somClusterCoveragePct}`,
    `- centroidId anchors among missing: ${summary.centroidCoveragePct}`,
    '',
    '## Recoverability',
    '',
    ...classEntries,
    '',
    '## Samples',
    '',
    '| point_id | classification | source_ref | feature_id | som_cluster | centroid_id | derived_coords | note |',
    '|---|---|---|---|---|---|---|---|',
    ...sampleRows,
    '',
    '## Evidence',
    '',
    `- cluster-topology entries: ${summary.clusterTopologyCount}`,
    `- centroid map entries: ${summary.centroidMapCount}`,
    `- pg evidence rows: ${summary.pgEvidenceRows}`,
    `- points with sourceRef/featureId but missing coords: ${summary.anchorBearingMissingPoints}`,
    `- points with no topology anchors at all: ${summary.legacyNoTopologyPoints}`,
    '',
  ].join('\n');
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  loadAtlasEnv(REPO_ROOT);

  await ensureDir(REPORT_JSON);

  const topologyPath = await resolveFirstExisting(CLUSTER_TOPOLOGY_CANDIDATES);
  const topologyReport = topologyPath
    ? JSON.parse(await fs.readFile(topologyPath, 'utf8'))
    : null;
  const somClusterToCoords = topologyPath ? buildClusterMap(topologyReport) : new Map();

  let qdrantStatus = { ok: false, message: 'not attempted' };
  let qdrantPoints = [];
  try {
    qdrantPoints = await scrollQdrant(limit);
    qdrantStatus = { ok: true, message: `scanned ${qdrantPoints.length} points` };
  } catch (error) {
    qdrantStatus = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  const scannedRows = qdrantPoints.map(scrollPointPayload);
  const missingRows = scannedRows.filter((row) => !row.hasCoords);

  const centroidToCoords = new Map();
  const sourceRefToSomCluster = new Map();
  const featureIdToSomCluster = new Map();

  for (const row of scannedRows) {
    if (row.hasCoords) {
      if (row.centroidId) centroidToCoords.set(normalizeClusterValue(row.centroidId), { somRow: row.somRow, somCol: row.somCol });
      if (row.somCluster) {
        const clusterCoords = somClusterToCoords.get(normalizeClusterValue(row.somCluster));
        if (clusterCoords) {
          if (row.sourceRef) addToSetMap(sourceRefToSomCluster, row.sourceRef, row.somCluster);
          for (const featureId of row.featureIds) addToSetMap(featureIdToSomCluster, featureId, row.somCluster);
        }
      }
    }
  }

  let pgEvidence = {
    ok: false,
    error: 'not attempted',
    rows: [],
    sourceRefs: [],
    featureIds: [],
    qdrantPointIds: [],
    centroidIds: [],
  };
  try {
    pgEvidence = await queryPgEvidence(missingRows);
  } catch (error) {
    pgEvidence = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      rows: [],
      sourceRefs: [],
      featureIds: [],
      qdrantPointIds: [],
      centroidIds: [],
    };
  }

  for (const row of pgEvidence.rows) {
    if (row.somCluster) {
      const coords = somClusterToCoords.get(normalizeClusterValue(row.somCluster));
      if (coords) {
        if (row.sourceRef) addToSetMap(sourceRefToSomCluster, row.sourceRef, row.somCluster);
        if (row.featureId) addToSetMap(featureIdToSomCluster, row.featureId, row.somCluster);
      }
    }
    if (row.centroidId) {
      const coords = row.somCluster ? somClusterToCoords.get(normalizeClusterValue(row.somCluster)) : null;
      if (coords) centroidToCoords.set(normalizeClusterValue(row.centroidId), coords);
    }
  }

  const details = missingRows.map((row) => {
    const matchedPgRows = pgEvidence.rows.filter((evidenceRow) => {
      if (evidenceRow.qdrantPointId && normalizeClusterValue(evidenceRow.qdrantPointId) === normalizeClusterValue(row.pointId)) return true;
      if (evidenceRow.sourceRef && row.sourceRefs.some((value) => normalizePathLike(value) === evidenceRow.sourceRef)) return true;
      if (evidenceRow.featureId && row.featureIds.some((value) => normalizePathLike(value) === evidenceRow.featureId)) return true;
      return false;
    });

    const directSomClusterCoords = row.somCluster ? somClusterToCoords.get(normalizeClusterValue(row.somCluster)) ?? null : null;
    const directCentroidCoords = row.centroidId ? centroidToCoords.get(normalizeClusterValue(row.centroidId)) ?? null : null;

    let derivedCoords = directSomClusterCoords ?? directCentroidCoords;
    let derivedFrom = directSomClusterCoords ? 'som_cluster' : (directCentroidCoords ? 'centroid_map' : null);

    if (!derivedCoords) {
      const evidenceSomCluster = matchedPgRows.find((entry) => entry.somCluster && somClusterToCoords.has(normalizeClusterValue(entry.somCluster)));
      const evidenceCentroid = matchedPgRows.find((entry) => entry.centroidId && centroidToCoords.has(normalizeClusterValue(entry.centroidId)));
      if (evidenceSomCluster?.somCluster) {
        derivedCoords = somClusterToCoords.get(normalizeClusterValue(evidenceSomCluster.somCluster)) ?? null;
        derivedFrom = derivedCoords ? 'som_cluster' : null;
      } else if (evidenceCentroid?.centroidId) {
        derivedCoords = centroidToCoords.get(normalizeClusterValue(evidenceCentroid.centroidId)) ?? null;
        derivedFrom = derivedCoords ? 'centroid_map' : null;
      }
    }

    const classificationResult = classifyMissingPoint(
      row,
      pgEvidence.rows,
      somClusterToCoords,
      centroidToCoords,
      pgEvidence.ok,
    );

    return {
      pointId: row.pointId,
      sourceRef: row.sourceRef,
      sourceRefs: row.sourceRefs,
      featureId: row.featureId,
      featureIds: row.featureIds,
      somRow: row.somRow,
      somCol: row.somCol,
      somCluster: row.somCluster,
      centroidId: row.centroidId,
      qdrantPayloadKeys: row.payloadKeys,
      matchedPgRows: summarizeEvidenceRows(matchedPgRows),
      derivedCoords,
      derivedFrom,
      classification: classificationResult.classification,
      note: classificationResult.note,
    };
  });

  const classificationCounts = details.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});

  const missingSomRow = details.filter((row) => row.somRow === null).length;
  const missingSomCol = details.filter((row) => row.somCol === null).length;
  const sourceRefCoverage = details.filter((row) => row.sourceRefs.length > 0 || row.sourceRef).length;
  const featureIdCoverage = details.filter((row) => row.featureIds.length > 0 || row.featureId).length;
  const somClusterCoverage = details.filter((row) => row.somCluster).length;
  const centroidCoverage = details.filter((row) => row.centroidId).length;

  const report = {
    generatedAt: new Date().toISOString(),
    limit,
    services: {
      qdrant: qdrantStatus,
      postgres: { ok: pgEvidence.ok, message: pgEvidence.ok ? `matched ${pgEvidence.rows.length} rows` : pgEvidence.error },
      topology: { ok: Boolean(topologyPath), path: topologyPath ?? null },
    },
    summary: {
      scannedPoints: scannedRows.length,
      directCoordinatePoints: scannedRows.filter((row) => row.hasCoords).length,
      missingCoordinatePoints: details.length,
      missingSomRow,
      missingSomCol,
      sourceRefCoveragePct: details.length > 0 ? `${((sourceRefCoverage / details.length) * 100).toFixed(1)}%` : '0.0%',
      featureIdCoveragePct: details.length > 0 ? `${((featureIdCoverage / details.length) * 100).toFixed(1)}%` : '0.0%',
      somClusterCoveragePct: details.length > 0 ? `${((somClusterCoverage / details.length) * 100).toFixed(1)}%` : '0.0%',
      centroidCoveragePct: details.length > 0 ? `${((centroidCoverage / details.length) * 100).toFixed(1)}%` : '0.0%',
      classificationCounts,
      clusterTopologyCount: somClusterToCoords.size,
      centroidMapCount: centroidToCoords.size,
      pgEvidenceRows: pgEvidence.rows.length,
      anchorBearingMissingPoints: details.filter((row) => row.sourceRefs.length > 0 || row.sourceRef || row.featureIds.length > 0 || row.featureId).length,
      legacyNoTopologyPoints: details.filter((row) => !row.sourceRef && row.sourceRefs.length === 0 && !row.featureId && row.featureIds.length === 0 && !row.somCluster && !row.centroidId).length,
      derivedFromSomCluster: details.filter((row) => row.derivedFrom === 'som_cluster').length,
      derivedFromCentroidMap: details.filter((row) => row.derivedFrom === 'centroid_map').length,
    },
    details,
  };

  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${writeMarkdown(report)}`, 'utf8');

  console.log(`SOM coordinate coverage audit complete (limit=${limit})`);
  console.log(`Scanned points: ${report.summary.scannedPoints}`);
  console.log(`Missing somRow/somCol: ${report.summary.missingCoordinatePoints}`);
  console.log(`Recoverable from som_cluster: ${report.summary.derivedFromSomCluster}`);
  console.log(`Recoverable from centroid map: ${report.summary.derivedFromCentroidMap}`);
  console.log(`Needs SOM recompute: ${report.summary.classificationCounts.NEEDS_SOM_RECOMPUTE ?? 0}`);
  console.log(`Legacy no-topology points: ${report.summary.classificationCounts.LEGACY_POINT_NO_TOPOLOGY ?? 0}`);
  console.log(`Source unavailable: ${report.summary.classificationCounts.SOURCE_UNAVAILABLE ?? 0}`);
  console.log(`Reports written to:\n- ${REPORT_MD}\n- ${REPORT_JSON}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
