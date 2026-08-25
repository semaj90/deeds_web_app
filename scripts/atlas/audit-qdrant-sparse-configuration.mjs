#!/usr/bin/env node
/**
 * Read-only audit of Qdrant sparse-vector configuration.
 *
 * This distinguishes collections created with Qdrant IDF modifiers from
 * older sparse collections. It never creates, updates, deletes, or scrolls
 * points, so it is safe to run before deciding whether a rebuild is needed.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const baseUrl = String(args.get('qdrant-url') || process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const timeoutMs = Number(process.env.QDRANT_TIMEOUT_MS || 8000);
const output = path.resolve(String(args.get('output') || 'docs/reports/qdrant-sparse-configuration-audit-v1.json'));

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSparseConfig(info) {
  const params = info?.result?.config?.params ?? {};
  return params.sparse_vectors ?? params.sparseVectors ?? {};
}

function classifySparse(sparse) {
  const entries = Object.entries(sparse && typeof sparse === 'object' ? sparse : {});
  if (!entries.length) return { classification: 'NO_SPARSE', idfVectors: [], legacyVectors: [] };

  const idfVectors = [];
  const legacyVectors = [];
  for (const [name, config] of entries) {
    const modifier = String(config?.modifier ?? '').toLowerCase();
    if (modifier === 'idf') idfVectors.push(name);
    else legacyVectors.push({ name, modifier: modifier || null });
  }
  return {
    classification: idfVectors.length && !legacyVectors.length
      ? 'IDF_ENABLED'
      : idfVectors.length
        ? 'MIXED_IDF_AND_LEGACY'
        : 'LEGACY_SPARSE_NO_IDF',
    idfVectors,
    legacyVectors,
  };
}

function summarize(info) {
  const result = info?.result ?? null;
  const sparse = normalizeSparseConfig(info);
  const sparseSummary = classifySparse(sparse);
  return {
    collection_status: result?.status ?? null,
    points_count: result?.points_count ?? null,
    indexed_vectors_count: result?.indexed_vectors_count ?? null,
    dense_vectors: result?.config?.params?.vectors ?? null,
    sparse_vectors: sparse,
    ...sparseSummary,
  };
}

async function main() {
  const report = {
    schema: 'atlas.qdrant-sparse-configuration-audit.v1',
    generated_at: new Date().toISOString(),
    mode: 'READ_ONLY',
    writes_performed: false,
    qdrant_url: baseUrl,
    status: 'UNKNOWN',
    collections: [],
    counts: {
      total: 0,
      idf_enabled: 0,
      mixed_idf_and_legacy: 0,
      legacy_sparse_no_idf: 0,
      no_sparse: 0,
      unavailable: 0,
    },
    promotion: {
      idf_rollout_proven: false,
      existing_collections_rebuilt: false,
      true_bm25_promotion_allowed: false,
    },
  };

  try {
    const listing = await getJson(`${baseUrl}/collections`);
    const names = (listing?.result?.collections ?? [])
      .map((entry) => typeof entry === 'string' ? entry : entry?.name)
      .filter(Boolean)
      .sort();
    report.status = 'READY';
    for (const name of names) {
      try {
        const info = await getJson(`${baseUrl}/collections/${encodeURIComponent(name)}`);
        report.collections.push({ name, ...summarize(info) });
      } catch (error) {
        report.collections.push({ name, classification: 'UNAVAILABLE', error: String(error.message || error) });
        report.counts.unavailable += 1;
      }
    }
  } catch (error) {
    report.status = 'UNAVAILABLE';
    report.error = String(error.message || error);
  }

  for (const item of report.collections) {
    report.counts.total += 1;
    if (item.classification === 'IDF_ENABLED') report.counts.idf_enabled += 1;
    else if (item.classification === 'MIXED_IDF_AND_LEGACY') report.counts.mixed_idf_and_legacy += 1;
    else if (item.classification === 'LEGACY_SPARSE_NO_IDF') report.counts.legacy_sparse_no_idf += 1;
    else if (item.classification === 'NO_SPARSE') report.counts.no_sparse += 1;
  }

  report.promotion.idf_rollout_proven = report.status === 'READY'
    && report.counts.total > 0
    && report.counts.mixed_idf_and_legacy === 0
    && report.counts.legacy_sparse_no_idf === 0;

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'READY' ? 0 : 2;
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
