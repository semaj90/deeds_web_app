#!/usr/bin/env node
/**
 * Read-only Qdrant packet fan-out identity census.
 *
 * A packet_key may legitimately map to multiple chunk points. This audit
 * distinguishes valid chunk fan-out from conflicting source/revision data,
 * missing chunk coordinates, and duplicate projections.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');
// This audit is specifically for the codebase packet projection. Do not let a
// generic QDRANT_COLLECTION environment variable redirect it to an unrelated
// collection such as legal_documents; callers must opt in with the Atlas-
// namespaced override when auditing another codebase projection.
const COLLECTION = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const REPORT_PATH = resolve(ROOT, 'docs/reports/qdrant-packet-fanout-v1.json');
const BATCH_SIZE = 500;
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length))) : Infinity;

const requestedPayload = [
  'packet_key', 'source_ref', 'workspace_revision', 'source_revision',
  'representation_id', 'representation_revision', 'chunk_id',
  'chunk_ordinal', 'content_hash', 'tree_node_id', 'symbol_version_id',
];

const value = (payload, ...keys) => {
  for (const key of keys) {
    const raw = payload?.[key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') return String(raw);
  }
  return null;
};

async function scrollPoints() {
  const points = [];
  let offset = null;
  while (points.length < LIMIT) {
    const body = { limit: Math.min(BATCH_SIZE, LIMIT - points.length), with_payload: requestedPayload, with_vector: false };
    if (offset !== null) body.offset = offset;
    const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Qdrant scroll failed: ${response.status} ${await response.text()}`);
    const result = await response.json();
    const batch = result.result?.points ?? [];
    points.push(...batch);
    if (!batch.length || !result.result?.next_page_offset) break;
    offset = result.result.next_page_offset;
  }
  return points.slice(0, LIMIT);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function classify(points) {
  const packetGroups = new Map();
  const unresolved = [];
  for (const point of points) {
    const payload = point.payload ?? {};
    const packetKey = value(payload, 'packet_key', 'packetKey');
    const normalized = {
      pointId: String(point.id),
      packetKey,
      sourceRef: value(payload, 'source_ref', 'sourceRef'),
      workspaceRevision: value(payload, 'workspace_revision', 'workspaceRevision'),
      sourceRevision: value(payload, 'source_revision', 'sourceRevision'),
      representationRevision: value(payload, 'representation_revision', 'representationRevision'),
      representationId: value(payload, 'representation_id', 'representationId'),
      chunkIdentity: value(payload, 'chunk_id', 'chunkId', 'chunk_ordinal', 'chunkOrdinal', 'content_hash'),
      chunkId: value(payload, 'chunk_id', 'chunkId'),
      chunkOrdinal: value(payload, 'chunk_ordinal', 'chunkOrdinal'),
      contentHash: value(payload, 'content_hash', 'contentHash'),
    };
    if (!packetKey) {
      unresolved.push(normalized);
      continue;
    }
    if (!packetGroups.has(packetKey)) packetGroups.set(packetKey, []);
    packetGroups.get(packetKey).push(normalized);
  }

  const classificationCounts = {
    VALID_REVISIONED_CHUNK_FANOUT: 0,
    STALE_REVISION_FANOUT: 0,
    MULTI_REPRESENTATION_FANOUT: 0,
    EXACT_DUPLICATE_PROJECTION: 0,
    CONFLICTING_SOURCE: 0,
    CHUNK_IDENTITY_MISSING: 0,
    REVISION_UNPROVEN: 0,
    UNRESOLVED: unresolved.length,
  };
  const fanouts = [];

  for (const [packetKey, group] of packetGroups) {
    const sourceRefs = new Set(group.map((row) => row.sourceRef).filter(Boolean));
    const sourceRevisions = new Set(group.map((row) => row.sourceRevision).filter(Boolean));
    const representationRevisions = new Set(group.map((row) => row.representationRevision).filter(Boolean));
    const chunkIdentities = group.map((row) => row.chunkIdentity).filter(Boolean);
    const signatures = group.map((row) => [
      row.sourceRef, row.sourceRevision, row.representationRevision, row.chunkIdentity,
    ].join('\u0000'));
    const duplicateSignatures = signatures.length - new Set(signatures).size;

    let classification;
    if (sourceRefs.size > 1) classification = 'CONFLICTING_SOURCE';
    else if (representationRevisions.size > 1) classification = 'MULTI_REPRESENTATION_FANOUT';
    else if (sourceRevisions.size > 1) classification = 'STALE_REVISION_FANOUT';
    else if (chunkIdentities.length !== group.length) classification = 'CHUNK_IDENTITY_MISSING';
    // A duplicate projection is only meaningful after chunk identity exists;
    // repeated null identity is an identity gap, not a proven duplicate.
    else if (duplicateSignatures > 0) classification = 'EXACT_DUPLICATE_PROJECTION';
    else if (!sourceRevisions.size || group.some((row) => !row.workspaceRevision || !row.representationRevision)) classification = 'REVISION_UNPROVEN';
    else classification = 'VALID_REVISIONED_CHUNK_FANOUT';

    classificationCounts[classification] += 1;
    fanouts.push({ packetKey, pointCount: group.length, classification, sourceRefs: [...sourceRefs], sourceRevisions: [...sourceRevisions], representationRevisions: [...representationRevisions] });
  }

  const fanoutSizes = fanouts.map((row) => row.pointCount);
  return {
    totalPoints: points.length,
    uniquePacketKeys: packetGroups.size,
    singlePointPacketKeys: fanouts.filter((row) => row.pointCount === 1).length,
    multiPointPacketKeys: fanouts.filter((row) => row.pointCount > 1).length,
    pointsInFanoutGroups: fanouts.filter((row) => row.pointCount > 1).reduce((sum, row) => sum + row.pointCount, 0),
    fanoutP50: percentile(fanoutSizes, 0.5),
    fanoutP95: percentile(fanoutSizes, 0.95),
    fanoutP99: percentile(fanoutSizes, 0.99),
    maxFanout: fanoutSizes.length ? Math.max(...fanoutSizes) : 0,
    pointsWithChunkId: points.filter((point) => value(point.payload, 'chunk_id', 'chunkId')).length,
    pointsWithChunkOrdinal: points.filter((point) => value(point.payload, 'chunk_ordinal', 'chunkOrdinal')).length,
    pointsWithContentHash: points.filter((point) => value(point.payload, 'content_hash', 'contentHash')).length,
    pointsWithSourceRevision: points.filter((point) => value(point.payload, 'source_revision', 'sourceRevision')).length,
    pointsWithWorkspaceRevision: points.filter((point) => value(point.payload, 'workspace_revision', 'workspaceRevision')).length,
    pointsWithRepresentationRevision: points.filter((point) => value(point.payload, 'representation_revision', 'representationRevision')).length,
    classificationCounts,
    samePacketDifferentSourceRefConflicts: classificationCounts.CONFLICTING_SOURCE,
    exactDuplicateProjectionGroups: classificationCounts.EXACT_DUPLICATE_PROJECTION,
    // An empty collection is absence of evidence, not a passing census.
    promotionEligible: points.length > 0 && packetGroups.size > 0 && classificationCounts.CONFLICTING_SOURCE === 0 && classificationCounts.EXACT_DUPLICATE_PROJECTION === 0 && classificationCounts.CHUNK_IDENTITY_MISSING === 0 && classificationCounts.REVISION_UNPROVEN === 0 && classificationCounts.UNRESOLVED === 0,
    sampleGroups: fanouts.filter((row) => row.classification !== 'VALID_REVISIONED_CHUNK_FANOUT').slice(0, 25),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const points = await scrollPoints();
  const census = classify(points);
  const report = {
    schema: 'atlas.qdrant-packet-fanout-v1',
    startedAt,
    completedAt: new Date().toISOString(),
    readOnly: true,
    qdrantWrites: false,
    postgresWrites: false,
    payloadIndexWrites: false,
    collection: COLLECTION,
    qdrantUrl: QDRANT_URL,
    limit: Number.isFinite(LIMIT) ? LIMIT : null,
    ...census,
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.promotionEligible ? 'PROMOTION_ELIGIBLE_CENSUS' : 'IDENTITY_OR_REVISION_GAPS', ...census, report: REPORT_PATH }, null, 2));
  if (!report.promotionEligible) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[qdrant-packet-fanout] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
