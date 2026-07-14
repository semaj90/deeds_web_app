#!/usr/bin/env node
/**
 * Qdrant component-level parity audit.
 *
 * Checks a sampled set of canonical packets against Qdrant and reports:
 * - packet point exists
 * - payload identity matches Postgres
 * - payload version matches when both sides declare one
 * - content_384 / summary_384 / signature_384 exist
 * - sparse BM42/BM25 exists
 *
 * Read-only. No repairs.
 */

import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QdrantClient } from '@qdrant/js-client-rest';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-component-parity.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-component-parity.md');

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DEFAULT_COLLECTION = 'codebase_chunks_384';
const COLLECTION_CONTRACTS = {
  codebase_chunks_384: {
    collection: 'codebase_chunks_384',
    contract_version: 'atlas-qdrant-384-v1',
    legacy: false,
    vectors: {
      content_384: 384,
      summary_384: 384,
      signature_384: 384,
      latent64: 64,
    },
    sparseVectors: ['bm42'],
    payloadFields: ['packet_key', 'source_ref', 'qdrant_point_id', 'aggregate_version'],
    distance: 'Cosine',
  },
  codebase_chunks_768: {
    collection: 'codebase_chunks_768',
    contract_version: 'atlas-qdrant-768-legacy-v1',
    legacy: true,
    vectors: {
      content: 768,
      signature: 768,
      error: 768,
    },
    sparseVectors: ['bm25'],
    payloadFields: ['packet_key', 'source_ref', 'qdrant_point_id', 'aggregate_version'],
    distance: 'Cosine',
  },
};

export function resolveSampleConfiguration(argv = process.argv, env = process.env) {
  const index = argv.findIndex((arg) => arg === '--sample' || arg.startsWith('--sample='));
  if (index >= 0) {
    const raw = argv[index].includes('=')
      ? argv[index].split('=', 2)[1]
      : argv[index + 1];
    const value = Number(raw);
    return {
      requested: Number.isFinite(value) && value > 0 ? value : 50,
      source: 'cli',
    };
  }

  const envValue = env.ATLAS_QDRANT_PARITY_SAMPLE ?? env.QDRANT_COMPONENT_PARITY_SAMPLE;
  if (envValue !== undefined && String(envValue).trim() !== '') {
    const value = Number(envValue);
    return {
      requested: Number.isFinite(value) && value > 0 ? value : 50,
      source: 'environment',
    };
  }

  if (env.npm_config_sample !== undefined && String(env.npm_config_sample).trim() !== '') {
    const value = Number(env.npm_config_sample);
    return {
      requested: Number.isFinite(value) && value > 0 ? value : 50,
      source: 'npm_config',
    };
  }

  return { requested: 50, source: 'default' };
}

export function resolveCollectionConfiguration(argv = process.argv, env = process.env) {
  const index = argv.findIndex((arg) => arg === '--collection' || arg.startsWith('--collection='));
  const requested = index >= 0
    ? (argv[index].includes('=') ? argv[index].split('=', 2)[1] : argv[index + 1])
    : env.QDRANT_CANONICAL_COLLECTION || env.CODEBASE_QDRANT_COLLECTION || DEFAULT_COLLECTION;
  const collection = String(requested || DEFAULT_COLLECTION).trim();
  const contract = COLLECTION_CONTRACTS[collection] ?? null;
  return {
    requested: collection,
    contract,
    source: index >= 0 ? 'cli' : (env.QDRANT_CANONICAL_COLLECTION || env.CODEBASE_QDRANT_COLLECTION ? 'environment' : 'default'),
  };
}

function resolvePreflightOnly(argv = process.argv) {
  return argv.includes('--preflight');
}

function normalizeCollectionConfig(collectionInfo) {
  const root = collectionInfo?.result ?? collectionInfo ?? {};
  const params = root?.config?.params ?? root?.config ?? {};
  return {
    raw: root,
    params,
    vectors: params?.vectors ?? {},
    sparseVectors: params?.sparse_vectors ?? params?.sparseVectors ?? {},
    payloadSchema: root?.payload_schema ?? params?.payload_schema ?? {},
    pointsCount: Number(root?.points_count ?? root?.vectors_count ?? 0),
  };
}

export function validateVectorContract(collectionInfo, contract) {
  const normalized = normalizeCollectionConfig(collectionInfo);
  const vectorEntries = normalized.vectors && typeof normalized.vectors === 'object' && !Array.isArray(normalized.vectors)
    ? Object.entries(normalized.vectors)
    : [];
  const actualVectorNames = vectorEntries.map(([name]) => name);
  const issues = [];

  if (!normalized.raw) {
    issues.push('collection_missing');
  }

  const expectedVectorNames = Object.keys(contract?.vectors ?? {});
  const missingVectors = expectedVectorNames.filter((name) => !actualVectorNames.includes(name));
  const extraVectors = actualVectorNames.filter((name) => !expectedVectorNames.includes(name));

  for (const [name, expectedSize] of Object.entries(contract?.vectors ?? {})) {
    const actual = normalized.vectors?.[name];
    const actualSize = Number(actual?.size ?? actual?.vector_size ?? actual?.dim ?? actual?.dimensions ?? actual?.length ?? NaN);
    if (!actual) {
      issues.push(`missing_vector:${name}`);
      continue;
    }
    if (Number.isFinite(actualSize) && actualSize !== expectedSize) {
      issues.push(`dimension_mismatch:${name}:${actualSize}->${expectedSize}`);
    }
    const distance = String(actual?.distance ?? actual?.metric ?? '').toLowerCase();
    if (distance && contract?.distance && distance !== String(contract.distance).toLowerCase()) {
      issues.push(`distance_mismatch:${name}:${distance}->${contract.distance}`);
    }
  }

  const sparseNames = Object.keys(normalized.sparseVectors ?? {});
  const missingSparseVectors = (contract?.sparseVectors ?? []).filter((name) => !sparseNames.includes(name));

  const payloadFields = normalized.payloadSchema?.fields
    ? Object.keys(normalized.payloadSchema.fields)
    : Object.keys(normalized.payloadSchema ?? {});
  const missingPayloadFields = (contract?.payloadFields ?? []).filter((name) => !payloadFields.includes(name));

  const status = issues.length > 0
    || missingSparseVectors.length > 0
    || missingPayloadFields.length > 0
    || extraVectors.length > 0
    || missingVectors.length > 0
      ? 'FAIL'
      : 'PASS';

  return {
    collection_exists: Boolean(normalized.raw),
    contract_version: contract?.contract_version ?? null,
    legacy_collection: Boolean(contract?.legacy),
    collection: contract?.collection ?? null,
    actual_vector_names: actualVectorNames,
    expected_vector_names: expectedVectorNames,
    missing_vectors: missingVectors,
    extra_vectors: extraVectors,
    missing_sparse_vectors: missingSparseVectors,
    missing_payload_fields: missingPayloadFields,
    issues,
    status,
  };
}

export function classifyParity({
  row,
  point,
  contract,
}) {
  const rowPacketId = firstText(row.packet_id);
  const rowPacketKey = firstText(row.packet_key);
  const rowSourceRef = firstText(row.source_ref);
  const rowQdrantPointId = firstText(row.qdrant_point_id);
  const payload = point?.payload ?? {};
  const payloadPacketId = firstText(payload.packet_id, payload.packetId, payload.id);
  const payloadPacketKey = firstText(payload.packet_key, payload.packetKey);
  const payloadSourceRef = firstText(payload.source_ref, payload.sourceRef);
  const payloadQdrantPointId = firstText(payload.qdrant_point_id, payload.qdrantPointId, point?.id);
  const payloadFeatureId = firstText(payload.feature_id, payload.featureId);

  if (!point) {
    return {
      state: 'missing_point',
      reasons: ['missing_point'],
      repair_kind: 'full_projection',
      identity_contradiction: false,
      projection_contradiction: false,
      stale: false,
      payloadPacketId,
      payloadPacketKey,
      payloadSourceRef,
      payloadQdrantPointId,
      payloadFeatureId,
    };
  }

  const reasons = [];
  let identityContradiction = false;
  let projectionContradiction = false;
  let stale = false;
  let state = 'ok';

  if (rowPacketId && payloadPacketId && !equalValue(rowPacketId, payloadPacketId)) {
    reasons.push('packet_id_mismatch');
    identityContradiction = true;
  }
  if (rowPacketKey && payloadPacketKey && !equalValue(rowPacketKey, payloadPacketKey)) {
    reasons.push('packet_key_mismatch');
    identityContradiction = true;
  }
  if (rowSourceRef && payloadSourceRef && !equalValue(rowSourceRef, payloadSourceRef)) {
    reasons.push('source_ref_mismatch');
    identityContradiction = true;
  }
  if (rowQdrantPointId && payloadQdrantPointId && !equalValue(rowQdrantPointId, payloadQdrantPointId)) {
    reasons.push('qdrant_point_id_mismatch');
    identityContradiction = true;
  }

  const pgVersion = firstText(row.metadata?.qdrant_payload_version, row.metadata?.payload_version, row.metadata?.embedding_version);
  const qVersion = firstText(payload.qdrant_payload_version, payload.payload_version, payload.embedding_version);
  if (pgVersion || qVersion) {
    if (!pgVersion || !qVersion || pgVersion !== qVersion) {
      reasons.push('aggregate_version_mismatch');
      stale = true;
    }
  }

  const vectorData = point?.vector ?? point?.vectors ?? {};
  for (const [name, expectedSize] of Object.entries(contract?.vectors ?? {})) {
    const value = vectorData?.[name];
    if (!value) {
      reasons.push(`missing_vector:${name}`);
      if (state === 'ok') state = 'incomplete_point';
      continue;
    }
    const actualSize = Array.isArray(value)
      ? value.length
      : Number(value?.size ?? value?.vector_size ?? value?.dim ?? value?.dimensions ?? NaN);
    if (Number.isFinite(actualSize) && actualSize !== expectedSize) {
      reasons.push(`dimension_mismatch:${name}:${actualSize}->${expectedSize}`);
      projectionContradiction = true;
    }
  }

  const sparseVectors = point?.sparse_vectors ?? point?.sparseVectors ?? point?.sparse_vector ?? point?.sparseVector;
  for (const name of contract?.sparseVectors ?? []) {
    const value = sparseVectors?.[name];
    if (!value || (!Array.isArray(value.indices) && !Array.isArray(value.values) && !Array.isArray(value))) {
      reasons.push(`missing_sparse_vector:${name}`);
      if (state === 'ok') state = 'incomplete_point';
    }
  }

  if (identityContradiction) {
    state = 'identity_contradiction';
  } else if (projectionContradiction) {
    state = 'projection_contradiction';
  } else if (stale && state === 'ok') {
    state = 'stale_point';
  }

  return {
    state,
    reasons,
    repair_kind: state === 'identity_contradiction'
      ? 'quarantine'
      : state === 'projection_contradiction'
        ? 'quarantine'
        : state === 'missing_point'
          ? 'full_projection'
          : state === 'stale_point'
            ? 'payload_repair'
            : state === 'incomplete_point'
              ? 'projection_repair'
              : 'none',
    identity_contradiction: identityContradiction,
    projection_contradiction: projectionContradiction,
    stale,
    payloadPacketId,
    payloadPacketKey,
    payloadSourceRef,
    payloadQdrantPointId,
    payloadFeatureId,
    rowPacketId,
    rowPacketKey,
    rowSourceRef,
    rowQdrantPointId,
  };
}

export function generateRepairEvents({
  collection,
  classifiedRows = [],
}) {
  const repairIndex = new Map();
  const repairRequests = [];

  const pushRepair = (row, kind, reason) => {
    const key = `${row.packet_id ?? row.packet_key ?? row.qdrant_point_id ?? 'n/a'}|${kind}`;
    const existing = repairIndex.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    const entry = {
      packet_id: row.packet_id ?? null,
      packet_key: row.packet_key ?? null,
      qdrant_point_id: row.qdrant_point_id ?? null,
      kind,
      action: kind === 'quarantine' ? 'quarantine' : 'repair',
      reasons: [reason],
      collection,
      event_type: 'qdrant.projection_repair_requested',
    };
    repairIndex.set(key, entry);
    repairRequests.push(entry);
  };

  for (const row of classifiedRows) {
    if (row.state === 'missing_point') {
      pushRepair(row, 'full_projection', 'missing_point');
      continue;
    }
    if (row.state === 'stale_point') {
      pushRepair(row, 'payload_repair', 'aggregate_version_mismatch');
      continue;
    }
    if (row.state === 'incomplete_point') {
      const reasons = row.reasons.length > 0 ? row.reasons : ['missing_projection'];
      const kind = reasons.includes('missing_sparse_vector:bm42')
        ? 'sparse_vector_repair'
        : reasons.some((item) => item.startsWith('missing_vector:summary_384'))
          ? 'summary_vector_repair'
          : reasons.some((item) => item.startsWith('missing_vector:signature_384'))
            ? 'signature_vector_repair'
            : 'projection_repair';
      pushRepair(row, kind, reasons[0]);
      continue;
    }
    if (row.state === 'identity_contradiction' || row.state === 'projection_contradiction') {
      pushRepair(row, 'quarantine', row.reasons[0] ?? row.state);
    }
  }

  return repairRequests;
}

export function applyPayloadRepair(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('payload repair request is required');
  }
  if (request.kind === 'quarantine') {
    throw new Error('quarantine events must not be applied as payload repairs');
  }
  if (request.kind === 'full_projection') {
    throw new Error('full_projection events must be handled by the projection consumer');
  }

  const allowedPatch = {
    packet_id: firstText(request.packet_id) || null,
    packet_key: firstText(request.packet_key) || null,
    source_ref: firstText(request.source_ref) || null,
    aggregate_version: request.aggregate_version ?? null,
    classifier_version: request.classifier_version ?? null,
    title_generator_version: request.title_generator_version ?? null,
    reranker_version: request.reranker_version ?? null,
    domain_metadata: request.domain_metadata ?? null,
    topology_metadata: request.topology_metadata ?? null,
  };

  return Object.fromEntries(Object.entries(allowedPatch).filter(([, value]) => value !== null && value !== undefined));
}

export function computeOverallStatus({
  preflightStatus = 'PASS',
  contradictions = [],
  missingPoints = [],
  stalePoints = [],
  incompletePoints = [],
}) {
  if (preflightStatus === 'FAIL') return 'FAIL';
  return contradictions.length > 0
    ? 'FAIL'
    : missingPoints.length > 0 || stalePoints.length > 0 || incompletePoints.length > 0
      ? 'WARN'
      : 'PASS';
}

function createCheck() {
  return { total: 0, pass: 0, missing: 0, mismatch: 0, skipped: 0 };
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function equalValue(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
  }
  return String(left) === String(right);
}

function hasNamedVector(point, names) {
  const vector = point?.vector;
  const vectors = point?.vectors;
  if (Array.isArray(vector) && vector.length > 0) return true;
  if (Array.isArray(vectors) && vectors.length > 0) return true;
  for (const name of names) {
    const fromVector = vector?.[name];
    const fromVectors = vectors?.[name];
    if (Array.isArray(fromVector) && fromVector.length > 0) return true;
    if (Array.isArray(fromVectors) && fromVectors.length > 0) return true;
  }
  return false;
}

function hasSparseVector(point, names) {
  const sparseVectors = point?.sparse_vectors ?? point?.sparseVectors ?? point?.sparse_vector ?? point?.sparseVector;
  if (!sparseVectors) return false;
  if (Array.isArray(sparseVectors)) return sparseVectors.length > 0;
  for (const name of names) {
    const value = sparseVectors?.[name];
    if (value && (Array.isArray(value.indices) || Array.isArray(value.values) || Array.isArray(value))) return true;
  }
  return false;
}

function resolvePointVectorId(row) {
  return firstText(row.qdrant_point_id, row.packet_id, row.packetId, row.id);
}

async function retrieveBySourceRef(qdrant, collection, sourceRef, packetKey) {
  const candidateValues = [
    sourceRef,
    sourceRef.replace(/^sveltekit-frontend\//, ''),
    `sveltekit-frontend/${sourceRef}`,
    packetKey,
  ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  for (const value of candidateValues) {
    const result = await qdrant.scroll(collection, {
      limit: 1,
      with_payload: true,
      with_vector: true,
      filter: {
        should: [
          { key: 'source_ref', match: { value } },
          { key: 'sourceRef', match: { value } },
          { key: 'packet_key', match: { value } },
          { key: 'packetKey', match: { value } },
          { key: 'canonicalSourceRef', match: { value } },
        ],
      },
    }).catch(() => null);

    const points = Array.isArray(result) ? result : result?.result?.points ?? result?.points ?? [];
    if (Array.isArray(points) && points.length > 0) {
      return points[0] ?? null;
    }
  }

  return null;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const startedAt = new Date().toISOString();
  const sampleRequest = resolveSampleConfiguration();
  const preflightOnly = resolvePreflightOnly();
  const collectionDecision = resolveCollectionConfiguration();
  const sampleRows = [];

  try {
    if (!collectionDecision.contract) {
      throw new Error(`Unsupported Qdrant collection requested: ${collectionDecision.requested}`);
    }

    const collectionInfo = await qdrant.getCollection(collectionDecision.requested).catch(() => null);
    if (!collectionInfo) {
      throw new Error(`Qdrant collection not found: ${collectionDecision.requested}`);
    }
    const collectionValidation = validateVectorContract(collectionInfo, collectionDecision.contract);
    const collectionShape = normalizeCollectionConfig(collectionInfo);
    const collectionCatalog = [{
      name: collectionDecision.requested,
      pointsCount: collectionShape.pointsCount,
      vectors: collectionValidation.actual_vector_names,
      sparseVectors: Object.keys(collectionShape.sparseVectors ?? {}),
    }];

    if (preflightOnly) {
      const preflightStatus = collectionValidation.status;
      const report = {
        generatedAt: new Date().toISOString(),
        startedAt,
        collection_requested: collectionDecision.requested,
        collection_resolved: collectionDecision.requested,
        collection_source: collectionDecision.source,
        collection_contract: {
          collection: collectionDecision.contract.collection,
          contract_version: collectionDecision.contract.contract_version,
          legacy_collection: collectionDecision.contract.legacy,
        },
        qdrantUrl: QDRANT_URL,
        sample_requested: sampleRequest.requested,
        sample_resolved: 0,
        sample_source: sampleRequest.source,
        rowsScanned: 0,
        collectionCatalog,
        contradictions: [],
        missingPoints: [],
        stalePoints: [],
        incompletePoints: [],
        repairRequests: [],
        componentStatuses: {
          collection_contract: {
            total: 1,
            pass: preflightStatus === 'PASS' ? 1 : 0,
            missing: preflightStatus === 'PASS' ? 0 : 1,
            mismatch: preflightStatus === 'PASS' ? 0 : 1,
            skipped: 0,
            coverage: preflightStatus === 'PASS' ? 100 : 0,
            status: preflightStatus,
            issues: collectionValidation.issues,
          },
        },
        status: preflightStatus,
        qdrant: {
          sampled_packets: 0,
          points_present: 0,
          missing_points: 0,
          identity_contradictions: 0,
          stale_points: 0,
          incomplete_points: 0,
          content_384_present: 0,
          summary_384_present: 0,
          signature_384_present: 0,
          bm42_present: 0,
        },
      };

      await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
      await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      await fs.writeFile(
        REPORT_MD,
        [
          '# Qdrant Component Parity Audit',
          '',
          `Generated: ${report.generatedAt}`,
          `Collection requested: ${report.collection_requested}`,
          `Collection resolved: ${report.collection_resolved}`,
          `Contract version: ${report.collection_contract.contract_version}`,
          `Legacy collection: ${report.collection_contract.legacy_collection}`,
          `Sample requested: ${report.sample_requested}`,
          `Sample resolved: ${report.sample_resolved}`,
          `Status: ${report.status}`,
          '',
          '## Collection Contract',
          '',
          `- vectors: ${collectionValidation.actual_vector_names.join(', ') || 'none'}`,
          `- issues: ${collectionValidation.issues.length > 0 ? collectionValidation.issues.join(', ') : 'none'}`,
          '',
          '## Repair Requests',
          '',
          '- none',
          '',
          '## Contradictions',
          '',
          '- none',
        ].join('\n'),
        'utf8',
      );

      console.log(JSON.stringify(report, null, 2));
      if (report.status === 'FAIL') process.exit(1);
      return;
    }

    const { rows } = await pool.query(
      `
        SELECT packet_id, packet_key, source_ref, feature_id, title_id, domain_class, qdrant_point_id, metadata, updated_at
        FROM atlas_packets
        WHERE COALESCE(qdrant_point_id, '') <> ''
        ORDER BY updated_at DESC NULLS LAST, packet_id DESC
        LIMIT $1
      `,
      [sampleRequest.requested],
    );

    sampleRows.push(...rows);
    if (sampleRows.length === 0) {
      throw new Error('No atlas_packets rows with qdrant_point_id were found');
    }

    const checks = {
      point_present: createCheck(),
      packet_id_matches: createCheck(),
      packet_key_matches: createCheck(),
      source_ref_matches: createCheck(),
      qdrant_point_id_matches: createCheck(),
      aggregate_version_matches: createCheck(),
      content_384_present: createCheck(),
      summary_384_present: createCheck(),
      signature_384_present: createCheck(),
      bm42_present: createCheck(),
    };
    const contradictions = [];
    const missingPoints = [];
    const stalePoints = [];
    const incompletePoints = [];
    const classifiedRows = [];

    for (const row of sampleRows) {
      const pointId = resolvePointVectorId(row);
      const point = pointId
        ? await qdrant.retrieve(collectionDecision.requested, { ids: [pointId], with_payload: true, with_vector: true })
            .then((result) => (Array.isArray(result) ? result[0] : result?.result?.[0] ?? result?.points?.[0] ?? null))
            .catch(() => null)
        : null;
      const matchedPoint = point ?? await retrieveBySourceRef(
        qdrant,
        collectionDecision.requested,
        firstText(row.source_ref),
        firstText(row.packet_key),
      );
      const classification = classifyParity({
        row,
        point: matchedPoint,
        contract: collectionDecision.contract,
      });
      classifiedRows.push({
        ...classification,
        packet_id: firstText(row.packet_id) || null,
        packet_key: firstText(row.packet_key) || null,
        qdrant_point_id: firstText(row.qdrant_point_id) || null,
      });

      checks.point_present.total += 1;
      if (!matchedPoint) {
        checks.point_present.missing += 1;
        missingPoints.push({
          packet_id: row.packet_id,
          packet_key: row.packet_key,
          qdrant_point_id: row.qdrant_point_id ?? null,
          reason: classification.state,
        });
        continue;
      }
      checks.point_present.pass += 1;

      const payload = matchedPoint.payload ?? {};

      const rowPacketId = firstText(row.packet_id);
      const rowPacketKey = firstText(row.packet_key);
      const rowSourceRef = firstText(row.source_ref);
      const rowQdrantPointId = firstText(row.qdrant_point_id);
      const rowFeatureId = firstText(row.feature_id);

      const payloadPacketId = firstText(payload.packet_id, payload.packetId, payload.id);
      const payloadPacketKey = firstText(payload.packet_key, payload.packetKey);
      const payloadSourceRef = firstText(payload.source_ref, payload.sourceRef);
      const payloadQdrantPointId = firstText(payload.qdrant_point_id, payload.qdrantPointId, matchedPoint?.id);
      const payloadFeatureId = firstText(payload.feature_id, payload.featureId);

      const evaluateField = (check, expected, actual, options = {}) => {
        const { contradictionLabel = null, allowMissing = true } = options;
        if (!expected) {
          check.skipped += 1;
          return 'skipped';
        }
        check.total += 1;
        if (!actual) {
          check.missing += 1;
          if (allowMissing) incompletePoints.push({
            packet_id: rowPacketId || null,
            packet_key: rowPacketKey || null,
            qdrant_point_id: rowQdrantPointId || null,
            reason: contradictionLabel ?? 'missing_field',
          });
          return 'missing';
        }
        if (equalValue(expected, actual)) {
          check.pass += 1;
          return 'pass';
        }
        check.mismatch += 1;
        if (contradictionLabel) {
          contradictions.push({
            packet_id: rowPacketId || null,
            packet_key: rowPacketKey || null,
            qdrant_point_id: rowQdrantPointId || null,
            reason: contradictionLabel,
            postgres: expected,
            qdrant: actual,
          });
        }
        return 'mismatch';
      };

      evaluateField(checks.packet_id_matches, rowPacketId, payloadPacketId, { contradictionLabel: 'packet_id_mismatch' });
      evaluateField(checks.packet_key_matches, rowPacketKey, payloadPacketKey, { contradictionLabel: 'packet_key_mismatch' });
      evaluateField(checks.source_ref_matches, rowSourceRef, payloadSourceRef, { contradictionLabel: 'source_ref_mismatch' });
      evaluateField(checks.qdrant_point_id_matches, rowQdrantPointId, payloadQdrantPointId, { contradictionLabel: 'qdrant_point_id_mismatch' });

      checks.aggregate_version_matches.total += 1;
      const pgVersion = firstText(row.metadata?.qdrant_payload_version, row.metadata?.payload_version, row.metadata?.embedding_version);
      const qVersion = firstText(payload.qdrant_payload_version, payload.payload_version, payload.embedding_version);
      if (!pgVersion && !qVersion) {
        checks.aggregate_version_matches.skipped += 1;
      } else if (pgVersion && qVersion && pgVersion === qVersion) {
        checks.aggregate_version_matches.pass += 1;
      } else {
        checks.aggregate_version_matches.mismatch += 1;
        stalePoints.push({
          packet_id: rowPacketId || null,
          packet_key: rowPacketKey || null,
          qdrant_point_id: rowQdrantPointId || null,
          expected_aggregate_version: pgVersion || null,
          mirrored_aggregate_version: qVersion || null,
          reason: 'aggregate_version_mismatch',
        });
      }

      const vectorData = matchedPoint?.vector ?? matchedPoint?.vectors ?? {};
      const denseVectors = [
        { check: checks.content_384_present, canonical: 'content_384', alias: 'content' },
        { check: checks.summary_384_present, canonical: 'summary_384', alias: 'summary' },
        { check: checks.signature_384_present, canonical: 'signature_384', alias: 'signature' },
      ];

      for (const { check, canonical, alias } of denseVectors) {
        check.total += 1;
        const denseValue = vectorData?.[canonical] ?? vectorData?.[alias];
        const expectedDim = collectionDecision.contract.vectors[canonical] ?? collectionDecision.contract.vectors[alias];
        if (!denseValue || !Array.isArray(denseValue) || denseValue.length === 0) {
          check.missing += 1;
          incompletePoints.push({
            packet_id: rowPacketId || null,
            packet_key: rowPacketKey || null,
            qdrant_point_id: rowQdrantPointId || null,
            reason: `missing_${canonical}`,
          });
          continue;
        }
        if (Number.isFinite(expectedDim) && denseValue.length !== expectedDim) {
          check.mismatch += 1;
          contradictions.push({
            packet_id: rowPacketId || null,
            packet_key: rowPacketKey || null,
            qdrant_point_id: rowQdrantPointId || null,
            reason: 'projection_contradiction',
            postgres: expectedDim,
            qdrant: denseValue.length,
          });
          continue;
        }
        check.pass += 1;
      }

      checks.bm42_present.total += 1;
      if (hasSparseVector(matchedPoint, collectionDecision.contract.sparseVectors)) checks.bm42_present.pass += 1;
      else {
        checks.bm42_present.missing += 1;
        incompletePoints.push({
          packet_id: rowPacketId || null,
          packet_key: rowPacketKey || null,
          qdrant_point_id: rowQdrantPointId || null,
          reason: 'missing_bm42',
        });
      }
    }

    const componentStatuses = Object.fromEntries(Object.entries(checks).map(([key, value]) => {
      const coverage = value.total > 0 ? value.pass / value.total : 0;
      const status = key === 'point_present'
        ? (coverage >= 0.95 ? 'PASS' : 'WARN')
        : value.mismatch > 0
          ? 'FAIL'
          : (value.missing > 0 || value.skipped > 0 || coverage < 0.95)
            ? 'WARN'
            : 'PASS';
      return [key, { ...value, coverage: Number((coverage * 100).toFixed(2)), status }];
    }));
    componentStatuses.collection_contract = {
      total: 1,
      pass: collectionValidation.status === 'PASS' ? 1 : 0,
      missing: collectionValidation.status === 'PASS' ? 0 : 1,
      mismatch: collectionValidation.status === 'PASS' ? 0 : 1,
      skipped: 0,
      coverage: collectionValidation.status === 'PASS' ? 100 : 0,
      status: collectionValidation.status,
      issues: collectionValidation.issues,
    };

    const status = computeOverallStatus({ contradictions, missingPoints, stalePoints, incompletePoints });
    const repairRequests = generateRepairEvents({
      collection: collectionDecision.requested,
      classifiedRows,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      collection_requested: collectionDecision.requested,
      collection_resolved: collectionDecision.requested,
      collection_source: collectionDecision.source,
      collection_contract: {
        collection: collectionDecision.contract.collection,
        contract_version: collectionDecision.contract.contract_version,
        legacy_collection: collectionDecision.contract.legacy,
      },
      qdrantUrl: QDRANT_URL,
      sample_requested: sampleRequest.requested,
      sample_resolved: sampleRows.length,
      sample_source: sampleRequest.source,
      rowsScanned: sampleRows.length,
      collectionCatalog,
      contradictions,
      missingPoints,
      stalePoints,
      incompletePoints,
      repairRequests,
      componentStatuses,
      status,
      qdrant: {
        sampled_packets: sampleRows.length,
        points_present: checks.point_present.pass,
        missing_points: missingPoints.length,
        identity_contradictions: contradictions.length,
        stale_points: stalePoints.length,
        incomplete_points: incompletePoints.length,
        content_384_present: checks.content_384_present.pass,
        summary_384_present: checks.summary_384_present.pass,
        signature_384_present: checks.signature_384_present.pass,
        bm42_present: checks.bm42_present.pass,
      },
    };

    await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Qdrant Component Parity Audit',
        '',
        `Generated: ${report.generatedAt}`,
        `Collection requested: ${report.collection_requested}`,
        `Collection resolved: ${report.collection_resolved}`,
        `Sample requested: ${report.sample_requested}`,
        `Sample resolved: ${report.sample_resolved}`,
        `Status: ${report.status}`,
        '',
        '## Components',
        '',
        ...Object.entries(componentStatuses).map(([name, entry]) => `- ${name}: ${entry.status} (${entry.pass}/${entry.total}, ${entry.coverage}%)`),
        '',
        '## Qdrant',
        '',
        `- sampled_packets: ${report.qdrant.sampled_packets}`,
        `- points_present: ${report.qdrant.points_present}`,
        `- missing_points: ${report.qdrant.missing_points}`,
        `- identity_contradictions: ${report.qdrant.identity_contradictions}`,
        `- stale_points: ${report.qdrant.stale_points}`,
        `- incomplete_points: ${report.qdrant.incomplete_points}`,
        `- content_384_present: ${report.qdrant.content_384_present}`,
        `- summary_384_present: ${report.qdrant.summary_384_present}`,
        `- signature_384_present: ${report.qdrant.signature_384_present}`,
        `- bm42_present: ${report.qdrant.bm42_present}`,
        '',
        '## Repair Requests',
        '',
        ...(repairRequests.length > 0
          ? repairRequests.map((item) => `- ${item.packet_key ?? item.packet_id ?? 'n/a'}: ${item.kind} (${item.reasons.join(', ')})`)
          : ['- none']),
        '',
        '## Contradictions',
        '',
        ...(contradictions.length > 0
          ? contradictions.map((item) => `- ${item.packet_key ?? item.packet_id ?? 'n/a'}: ${item.reason}`)
          : ['- none']),
      ].join('\n'),
      'utf8',
    );

    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'FAIL') process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[atlas:qdrant:component-parity] Failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { COLLECTION_CONTRACTS };
