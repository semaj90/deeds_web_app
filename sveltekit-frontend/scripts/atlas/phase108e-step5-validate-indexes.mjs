#!/usr/bin/env node
/**
 * Phase 108E Step 5 Validation.
 *
 * Verifies that the live v2 collection exposes the expected payload schema and
 * that exact-match filters include the known point while a negative filter excludes it.
 */

import { pathToFileURL } from 'node:url';
import { TARGET_COLLECTION, assertAllowedCollection } from '../../src/lib/server/atlas/phase108e-step5-payload-indexes.js';

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime');
  }
  return fetchImpl;
}

async function getCollectionInfo(fetchImpl, collectionName) {
  const response = await fetchImpl(`${QDRANT_URL}/collections/${collectionName}`);
  if (!response.ok) {
    throw new Error(`Cannot read collection ${collectionName}: HTTP ${response.status} ${await response.text()}`);
  }
  const json = await response.json();
  return json.result ?? {};
}

async function scrollFirstPointWithVector(fetchImpl, collectionName, predicate) {
  let offset = null;
  while (true) {
    const body = { limit: 100, with_payload: true, with_vector: true };
    if (offset !== null) body.offset = offset;

    const response = await fetchImpl(`${QDRANT_URL}/collections/${collectionName}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Scroll failed: HTTP ${response.status} ${await response.text()}`);
    }

    const json = await response.json();
    const points = json.result?.points ?? [];
    for (const point of points) {
      if (predicate(point)) return point;
    }
    offset = json.result?.next_page_offset ?? null;
    if (offset === null) break;
  }
  return null;
}

async function searchWithFilter(fetchImpl, collectionName, vector, filter) {
  const response = await fetchImpl(`${QDRANT_URL}/collections/${collectionName}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: 'content', vector },
      limit: 10,
      with_payload: true,
      filter,
    }),
  });

  if (!response.ok) {
    throw new Error(`Search failed: HTTP ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.result ?? [];
}

export async function main(fetchImpl = globalThis.fetch) {
  fetchImpl = requireFetch(fetchImpl);
  assertAllowedCollection(TARGET_COLLECTION);

  const info = await getCollectionInfo(fetchImpl, TARGET_COLLECTION);
  const schema = info.payload_schema ?? {};

  const requiredFields = [
    'postgres_id',
    'source_ref',
    'chunk_id',
    'content_hash',
    'representation_name',
    'embedding_model',
    'model_revision_state',
    'projection_revision',
    'qdrant_point_id',
  ];

  const summary = {
    collection: TARGET_COLLECTION,
    status: info.status ?? null,
    optimizer_status: info.optimizer_status ?? null,
    points_count: info.points_count ?? 0,
    payload_schema: {},
    filters: {},
  };

  for (const field of requiredFields) {
    const entry = schema[field] ?? null;
    summary.payload_schema[field] = entry
      ? { data_type: entry.data_type ?? null, points: entry.points ?? null }
      : null;
  }

  const sample = await scrollFirstPointWithVector(
    fetchImpl,
    TARGET_COLLECTION,
    (point) => Boolean(point?.payload?.postgres_id && point?.vector?.content)
  );

  if (!sample) {
    throw new Error('No sample point with vector content was found in codebase_chunks_768_v2');
  }

  const payload = sample.payload ?? {};
  const vector = sample.vector?.content;

  const filtersToCheck = [
    ['postgres_id', payload.postgres_id],
    ['source_ref', payload.source_ref],
    ['representation_name', payload.representation_name],
    ['embedding_model', payload.embedding_model],
  ];

  for (const [field, value] of filtersToCheck) {
    if (value === undefined || value === null) continue;
    const hits = await searchWithFilter(fetchImpl, TARGET_COLLECTION, vector, {
      must: [{ key: field, match: { value } }],
    });
    const included = hits.some((hit) => String(hit.id) === String(sample.id));
    summary.filters[field] = { value, hits: hits.length, included };
    if (!included) {
      throw new Error(`Expected point ${sample.id} to match filter ${field}=${String(value)}`);
    }
  }

  if (payload.source_ref) {
    const wrongHits = await searchWithFilter(fetchImpl, TARGET_COLLECTION, vector, {
      must: [{ key: 'source_ref', match: { value: `${payload.source_ref}.does-not-exist` } }],
    });
    summary.filters.source_ref_negative = {
      hits: wrongHits.length,
      excluded: !wrongHits.some((hit) => String(hit.id) === String(sample.id)),
    };
    if (wrongHits.some((hit) => String(hit.id) === String(sample.id))) {
      throw new Error('Negative filter unexpectedly returned the sample point');
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
