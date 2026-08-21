#!/usr/bin/env node

/** EMB3A read-only Qdrant semantic_768 projection proof. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const base = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const collection = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768_v2';
const embeddingInput = path.resolve(root, process.env.EMB2_INPUT ?? 'docs/reports/emb2-semantic-card-embeddings.jsonl');

async function getJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function loadExpectedCards() {
  const raw = readFileSync(embeddingInput, 'utf8').trim();
  return raw ? raw.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
}

async function main() {
  const report = {
    schema: 'atlas.emb3a.qdrant-semantic-projection-proof.v1',
    status: 'DEGRADED',
    endpoint: base,
    collection,
    expectedInput: embeddingInput,
    expectedCards: 0,
    collectionInfo: null,
    sampleCount: 0,
    payloadCoverage: {},
    filterChecks: {},
    identityRoundTrip: { status: 'NOT_RUN', matched: 0, missing: 0, details: [] },
    gates: {
      QDRANT_REACHABLE: false,
      SEMANTIC_768_SCHEMA: false,
      COSINE_SCHEMA: false,
      IDENTITY_PAYLOAD_OBSERVED: false,
      REVISION_PAYLOAD_OBSERVED: false,
      REVISION_FILTER_READABLE: false,
      EMB2_IDENTITY_ROUND_TRIP: false,
      SYSTEM_SENTINEL_EXCLUDED: false,
      MUTATION_GUARD: true,
    },
    writes: { qdrant: false, canonical: false },
  };

  try {
    const expected = loadExpectedCards();
    report.expectedCards = expected.length;
    const infoResult = await getJson(`${base}/collections/${encodeURIComponent(collection)}`);
    if (!infoResult.response.ok) throw new Error(`QDRANT_COLLECTION_HTTP_${infoResult.response.status}`);
    report.gates.QDRANT_REACHABLE = true;
    report.collectionInfo = infoResult.payload.result ?? infoResult.payload;
    const vectors = report.collectionInfo?.config?.params?.vectors;
    const vectorConfig = vectors?.content ?? vectors;
    report.gates.SEMANTIC_768_SCHEMA = Number(vectorConfig?.size) === 768;
    report.gates.COSINE_SCHEMA = String(vectorConfig?.distance ?? '').toUpperCase() === 'COSINE';

    const scrollResult = await getJson(`${base}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 100, with_payload: true, with_vector: false }),
    });
    if (!scrollResult.response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${scrollResult.response.status}`);
    const points = Array.isArray(scrollResult.payload?.result?.points) ? scrollResult.payload.result.points : [];
    report.sampleCount = points.length;
    const payloads = points.map((point) => point.payload ?? {});
    const fields = ['packet_key', 'source_ref', 'tree_node_id', 'symbol_version_id', 'workspace_revision', 'source_revision', 'representation_id', 'representation_revision'];
    report.payloadCoverage = Object.fromEntries(fields.map((field) => [field, payloads.filter((payload) => payload[field] !== undefined && payload[field] !== null && payload[field] !== '').length]));
    report.payloadIndexes = Object.fromEntries(fields.map((field) => [field, Boolean(report.collectionInfo?.payload_schema?.[field])]));
    report.sentinel = {
      sampledSystemRecords: payloads.filter((payload) => payload._atlas_system_record === true).length,
      excludedQuery: { must_not: [{ key: '_atlas_system_record', match: { value: true } }] },
      status: 'NOT_PROVEN',
    };
    const sentinelExcluded = await getJson(`${base}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: false,
        filter: report.sentinel.excludedQuery,
      }),
    });
    const excludedPoints = Array.isArray(sentinelExcluded.payload?.result?.points) ? sentinelExcluded.payload.result.points : [];
    const excludedSentinels = excludedPoints.filter((point) => point.payload?._atlas_system_record === true).length;
    report.sentinel.status = sentinelExcluded.response.ok && excludedSentinels === 0 ? 'FILTER_PROVEN_SAMPLE_CLEAN' : 'FILTER_FAILED_OR_SENTINEL_RETURNED';
    report.sentinel.excludedSampleCount = excludedPoints.length;
    report.sentinel.excludedSentinels = excludedSentinels;
    report.gates.IDENTITY_PAYLOAD_OBSERVED = report.payloadCoverage.packet_key > 0 && report.payloadCoverage.source_ref > 0;
    report.gates.REVISION_PAYLOAD_OBSERVED = report.payloadCoverage.workspace_revision > 0 && report.payloadCoverage.source_revision > 0;

    for (const field of ['workspace_revision', 'source_revision', 'representation_revision']) {
      const value = payloads.find((payload) => payload[field] !== undefined && payload[field] !== null && payload[field] !== '')?.[field];
      if (!value) {
        report.filterChecks[field] = { status: 'NOT_PROVEN', reason: 'No sampled payload value', payloadIndexPresent: Boolean(report.payloadIndexes[field]) };
        continue;
      }
      const filtered = await getJson(`${base}/collections/${encodeURIComponent(collection)}/points/scroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 1, with_payload: true, with_vector: false, filter: { must: [{ key: field, match: { value } }] } }),
      });
       report.filterChecks[field] = { status: filtered.response.ok ? 'FUNCTIONALLY_READABLE' : 'FAILED', sampleValue: value, httpStatus: filtered.response.status, payloadIndexPresent: Boolean(report.payloadIndexes[field]) };
    }
    report.gates.REVISION_FILTER_READABLE = Object.values(report.filterChecks).some((check) => check.status === 'FUNCTIONALLY_READABLE');
    report.gates.SYSTEM_SENTINEL_EXCLUDED = report.sentinel.status === 'FILTER_PROVEN_SAMPLE_CLEAN';

    const sampleIdentity = new Set(payloads.map((payload) => `${payload.packet_key ?? ''}|${payload.source_ref ?? ''}`));
    const missing = expected.filter((card) => !sampleIdentity.has(`${card.cardId}|${card.sourceRef}`));
    report.identityRoundTrip = {
      status: missing.length === 0 && expected.length > 0 ? 'PROVEN' : 'NOT_PROVEN_FIXTURE_NOT_INDEXED',
      matched: expected.length - missing.length,
      missing: missing.length,
      details: missing.slice(0, 10).map((card) => ({ cardId: card.cardId, sourceRef: card.sourceRef })),
    };
    report.gates.EMB2_IDENTITY_ROUND_TRIP = report.identityRoundTrip.status === 'PROVEN';
    const indexedRevisionFields = ['workspace_revision', 'source_revision', 'representation_revision'].filter((field) => report.payloadIndexes[field]);
    report.revisionIndexStatus = {
      functional: report.gates.REVISION_FILTER_READABLE,
      indexedFields: indexedRevisionFields,
      missingIndexes: ['workspace_revision', 'source_revision', 'representation_revision'].filter((field) => !report.payloadIndexes[field]),
      status: report.gates.REVISION_FILTER_READABLE && indexedRevisionFields.length === 3 ? 'FUNCTIONALLY_PROVEN_INDEXED' : report.gates.REVISION_FILTER_READABLE ? 'FUNCTIONALLY_PROVEN_INDEXING_GAP' : 'NOT_PROVEN',
    };
    report.status = Object.values(report.gates).every(Boolean) ? 'PROVEN' : 'DEGRADED_FIXTURE_OR_PAYLOAD_GAP';
  } catch (error) {
    report.error = String(error?.message ?? error);
  }

  const reportDir = path.resolve(root, 'docs/reports');
  mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'emb3a-qdrant-semantic-projection-proof.json');
  const mdPath = path.join(reportDir, 'emb3a-qdrant-semantic-projection-proof.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, [
    '# EMB3A Qdrant semantic_768 Projection Proof',
    '',
    `- status: **${report.status}**`,
    `- collection: \`${collection}\``,
    `- sampled points: **${report.sampleCount}**`,
    `- semantic_768 schema: **${report.gates.SEMANTIC_768_SCHEMA ? 'PASS' : 'FAIL'}**`,
    `- cosine schema: **${report.gates.COSINE_SCHEMA ? 'PASS' : 'FAIL'}**`,
    `- identity round-trip: **${report.identityRoundTrip.status}**`,
    `- revision filters: **${report.gates.REVISION_FILTER_READABLE ? 'READABLE' : 'NOT_PROVEN'}**`,
    `- revision indexes: **${report.revisionIndexStatus?.status ?? 'NOT_RUN'}**`,
    `- system sentinel exclusion: **${report.gates.SYSTEM_SENTINEL_EXCLUDED ? 'PASS' : 'FAIL'}**`,
    `- mutation guard: **${report.gates.MUTATION_GUARD ? 'PASS' : 'FAIL'}**`,
    `- Qdrant writes: **${report.writes.qdrant}**`,
    '',
    'This is a read-only inspection. It does not create collections or modify points.',
    '',
  ].join('\n'));
  console.log(JSON.stringify({ status: report.status, gates: report.gates, identityRoundTrip: report.identityRoundTrip, jsonPath, mdPath }, null, 2));
  if (report.status !== 'PROVEN') process.exitCode = 2;
}

await main();
