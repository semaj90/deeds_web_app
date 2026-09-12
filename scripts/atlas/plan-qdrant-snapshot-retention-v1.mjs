#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { classifyCollection } from './lib/qdrant-storage-consolidation-v1.mjs';
import {
  planCollectionSnapshotRetention,
  planFullStorageSnapshotRetention,
  summarizeSnapshotRetention,
} from './lib/qdrant-snapshot-retention-v1.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT_PATH = path.join(ROOT, 'docs/reports/qdrant-snapshot-retention-plan-v1.json');
const QDRANT_URL = (process.env.QDRANT_URL || process.env.QDRANT_REST_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const noReport = process.argv.includes('--no-report');
const timeoutMs = Math.max(1000, Number(process.env.QDRANT_AUDIT_TIMEOUT_MS || 10000));
const keepArg = process.argv.find((arg) => arg.startsWith('--keep-rollback-count='));
const keepRollbackCount = Math.max(1, Number(keepArg?.slice('--keep-rollback-count='.length) || 1));

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function getJson(url, { optional404 = false } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  if (optional404 && response.status === 404) return { ok: false, unsupported: true, status: response.status, body };
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}:${text.slice(0, 300)}`);
  return { ok: true, unsupported: false, status: response.status, body };
}

async function main() {
  const [root, collectionList, fullSnapshots] = await Promise.all([
    getJson(`${QDRANT_URL}/`),
    getJson(`${QDRANT_URL}/collections`),
    getJson(`${QDRANT_URL}/snapshots`, { optional404: true }),
  ]);

  const names = (collectionList.body?.result?.collections ?? [])
    .map((row) => row?.name)
    .filter(Boolean)
    .sort();

  const collectionPlans = [];
  const errors = [];
  for (const collectionName of names) {
    try {
      const [infoResponse, snapshotResponse] = await Promise.all([
        getJson(`${QDRANT_URL}/collections/${encodeURIComponent(collectionName)}`),
        getJson(`${QDRANT_URL}/collections/${encodeURIComponent(collectionName)}/snapshots`),
      ]);
      const info = infoResponse.body;
      const classification = classifyCollection(collectionName, info);
      const collectionHealthy = String(info?.result?.status ?? '').toLowerCase() === 'green';
      collectionPlans.push(planCollectionSnapshotRetention({
        collectionName,
        classification,
        snapshots: snapshotResponse.body?.result ?? [],
        keepRollbackCount,
        collectionHealthy,
      }));
    } catch (error) {
      errors.push({ collectionName, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const fullStoragePlan = planFullStorageSnapshotRetention(fullSnapshots.ok ? fullSnapshots.body?.result ?? [] : []);
  const summary = summarizeSnapshotRetention(collectionPlans, fullStoragePlan);

  const deterministic = {
    schema: 'atlas.qdrant-snapshot-retention-plan.v1',
    gate: 'QDRANT-SNAPSHOT-RETENTION-PLAN-01',
    mode: 'READ_ONLY',
    qdrantUrl: QDRANT_URL,
    qdrantVersion: root.body?.version ?? null,
    keepRollbackCount,
    collectionPlans,
    fullStoragePlan,
    summary,
    errors,
    policy: {
      currentOwner: 'KEEP_ALL',
      migrationRollback: `KEEP_NEWEST_${keepRollbackCount}_MARK_OLDER_ARCHIVE_THEN_RECLAIM_CANDIDATE`,
      routingOrChallenger: 'KEEP_NEWEST_REVIEW_OLDER_AFTER_EVAL',
      fullStorageSnapshots: 'REVIEW_ALL',
      unknown: 'FAIL_CLOSED_REVIEW_ALL',
    },
    authorization: {
      deleteSnapshots: false,
      deleteCollections: false,
      archiveSnapshots: false,
      mutateQdrant: false,
    },
    writes: {
      qdrant: false,
      postgres: false,
      neo4j: false,
      valkey: false,
      filesystemReportOnly: !noReport,
    },
  };

  const report = {
    ...deterministic,
    generatedAt: new Date().toISOString(),
    reportChecksum: `sha256:${sha256(JSON.stringify(deterministic))}`,
  };

  if (!noReport) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  const status = errors.length === 0
    ? 'QDRANT_SNAPSHOT_RETENTION_PLAN_READY'
    : collectionPlans.length > 0
      ? 'QDRANT_SNAPSHOT_RETENTION_PLAN_PARTIAL'
      : 'QDRANT_SNAPSHOT_RETENTION_PLAN_BLOCKED';

  console.log(JSON.stringify({
    status,
    qdrantVersion: deterministic.qdrantVersion,
    collectionCount: collectionPlans.length,
    fullStorageSnapshotsSupported: fullSnapshots.ok,
    summary,
    errors,
    reportPath: noReport ? null : path.relative(ROOT, REPORT_PATH),
    writesPerformed: false,
  }, null, 2));

  if (collectionPlans.length === 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'QDRANT_SNAPSHOT_RETENTION_PLAN_BLOCKED',
    error: error instanceof Error ? error.message : String(error),
    writesPerformed: false,
  }, null, 2));
  process.exitCode = 2;
});
