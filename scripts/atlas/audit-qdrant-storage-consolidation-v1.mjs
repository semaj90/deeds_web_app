#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildCollectionAudit,
  summarizeAudits,
} from './lib/qdrant-storage-consolidation-v1.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT_PATH = path.join(ROOT, 'docs/reports/qdrant-storage-consolidation-v1.json');
const QDRANT_URL = (process.env.QDRANT_URL || process.env.QDRANT_REST_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const noReport = process.argv.includes('--no-report');
const collectionArg = process.argv.find((arg) => arg.startsWith('--collection='));
const onlyCollection = collectionArg ? collectionArg.slice('--collection='.length) : null;
const timeoutMs = Math.max(1000, Number(process.env.QDRANT_AUDIT_TIMEOUT_MS || 10000));

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
  const root = await getJson(`${QDRANT_URL}/`);
  const list = await getJson(`${QDRANT_URL}/collections`);
  const names = (list.body?.result?.collections ?? [])
    .map((row) => row?.name)
    .filter(Boolean)
    .filter((name) => !onlyCollection || name === onlyCollection)
    .sort();

  if (onlyCollection && !names.includes(onlyCollection)) {
    throw new Error(`COLLECTION_NOT_FOUND:${onlyCollection}`);
  }

  const collections = [];
  const errors = [];
  for (const name of names) {
    try {
      const [info, memory, snapshots] = await Promise.all([
        getJson(`${QDRANT_URL}/collections/${encodeURIComponent(name)}`),
        getJson(`${QDRANT_URL}/collections/${encodeURIComponent(name)}/memory`, { optional404: true }),
        getJson(`${QDRANT_URL}/collections/${encodeURIComponent(name)}/snapshots`),
      ]);
      collections.push(buildCollectionAudit({
        name,
        info: info.body,
        memory: memory.ok ? memory.body : null,
        snapshots: snapshots.body,
        memorySupported: memory.ok,
      }));
    } catch (error) {
      errors.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const summary = summarizeAudits(collections);
  const deterministic = {
    schema: 'atlas.qdrant-storage-consolidation.v1',
    gate: 'QDRANT-STORAGE-CONSOLIDATION-AUDIT-01',
    mode: 'READ_ONLY',
    qdrantUrl: QDRANT_URL,
    qdrantVersion: root.body?.version ?? null,
    collectionCountObserved: collections.length,
    requestedCollection: onlyCollection,
    collections,
    summary,
    errors,
    proposedActions: {
      deleteCollections: [],
      deleteSnapshots: [],
      mutateCollectionMetadata: [],
      note: 'This audit proposes classifications only. All collection deletion, snapshot deletion, metadata mutation, vector datatype migration, and caller cutover require separate authorization and proof.',
    },
    writes: {
      qdrant: false,
      postgres: false,
      neo4j: false,
      valkey: false,
      filesystemReportOnly: !noReport,
    },
    deletionAuthorized: false,
    snapshotDeletionAuthorized: false,
    metadataMutationAuthorized: false,
    datatypeMigrationAuthorized: false,
    callerCutoverAuthorized: false,
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
    ? 'QDRANT_STORAGE_CONSOLIDATION_AUDIT_COMPLETE'
    : collections.length > 0
      ? 'QDRANT_STORAGE_CONSOLIDATION_AUDIT_PARTIAL'
      : 'QDRANT_STORAGE_CONSOLIDATION_AUDIT_BLOCKED';

  console.log(JSON.stringify({
    status,
    qdrantVersion: deterministic.qdrantVersion,
    collectionCountObserved: collections.length,
    summary,
    errors,
    reportPath: noReport ? null : path.relative(ROOT, REPORT_PATH),
    writesPerformed: false,
  }, null, 2));

  if (collections.length === 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'QDRANT_STORAGE_CONSOLIDATION_AUDIT_BLOCKED',
    error: error instanceof Error ? error.message : String(error),
    writesPerformed: false,
  }, null, 2));
  process.exitCode = 2;
});
