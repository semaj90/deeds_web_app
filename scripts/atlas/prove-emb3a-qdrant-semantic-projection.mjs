#!/usr/bin/env node
/**
 * EMB3A — read-only Qdrant semantic projection proof.
 *
 * This proof MUST NOT create collections, create payload indexes, upsert points,
 * delete points, or mutate Postgres/Valkey. It only performs:
 *   GET  /collections/:collection
 *   POST /collections/:collection/points/scroll   (read-only retrieval)
 *
 * Target contract: native EmbeddingGemma semantic_768 with revision-qualified
 * Parent Atlas identity. The current main branch may still expose a legacy
 * semantic_512 projection; that collection is audited separately and NEVER
 * accepted as proof of the 768 target.
 */

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const EMB3A_SCHEMA = 'atlas.emb3a-qdrant-semantic-projection-proof.v1';
export const DEFAULT_QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
export const DEFAULT_TARGET_COLLECTION = process.env.ATLAS_QDRANT_SEMANTIC_768_COLLECTION || 'codebase_chunks_768';
export const DEFAULT_LEGACY_COLLECTION = process.env.ATLAS_QDRANT_LEGACY_SEMANTIC_COLLECTION || 'codebase_chunks_512';
export const DEFAULT_EXPECTED_DIMENSION = 768;
export const DEFAULT_EXPECTED_REPRESENTATION = 'semantic_768';
export const DEFAULT_EMB2_JSONL = path.join(REPO_ROOT, 'docs', 'reports', 'emb2-semantic-card-embeddings.jsonl');
export const DEFAULT_EMB2_PROOF = path.join(REPO_ROOT, 'docs', 'reports', 'emb2-semantic-card-embedding-proof.json');
export const DEFAULT_REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'emb3a-qdrant-semantic-projection-proof.json');
export const DEFAULT_REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'emb3a-qdrant-semantic-projection-proof.md');

const REQUIRED_IDENTITY_FIELDS = ['packet_key', 'canonical_id', 'source_ref'];
const REQUIRED_REVISION_FIELDS = ['workspace_revision', 'source_revision'];
const REQUIRED_REPRESENTATION_FIELDS = ['representation_id', 'representation_revision'];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseArg(argv, name, fallback = null) {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1] ?? fallback;
  const prefix = `${name}=`;
  const inline = argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function parseIntArg(argv, name, fallback) {
  const raw = parseArg(argv, name, null);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function detectVectorTargets(vectors) {
  if (!isRecord(vectors)) return [];

  if (Number.isFinite(vectors.size)) {
    return [{
      mode: 'unnamed',
      name: null,
      size: Number(vectors.size),
      distance: typeof vectors.distance === 'string' ? vectors.distance : null,
      onDisk: typeof vectors.on_disk === 'boolean' ? vectors.on_disk : null,
    }];
  }

  return Object.entries(vectors)
    .filter(([, value]) => isRecord(value) && Number.isFinite(value.size))
    .map(([name, value]) => ({
      mode: 'named',
      name,
      size: Number(value.size),
      distance: typeof value.distance === 'string' ? value.distance : null,
      onDisk: typeof value.on_disk === 'boolean' ? value.on_disk : null,
    }));
}

export function selectExpectedVectorTarget(targets, expectedDimension, preferredName = 'semantic_768') {
  return targets.find((target) => target.name === preferredName && target.size === expectedDimension)
    ?? targets.find((target) => target.size === expectedDimension)
    ?? null;
}

export function pointVector(point, target) {
  const vector = point?.vector;
  if (Array.isArray(vector)) return vector;
  if (!isRecord(vector)) return null;
  if (target?.name && Array.isArray(vector[target.name])) return vector[target.name];
  for (const value of Object.values(vector)) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

export function l2Norm(values) {
  if (!Array.isArray(values) || !values.length) return null;
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return null;
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function fieldPresence(points, field) {
  const populated = points.filter((point) => point?.payload?.[field] !== undefined && point?.payload?.[field] !== null);
  return {
    field,
    presentCount: populated.length,
    sampleCount: points.length,
    presentOnAllSamples: points.length > 0 && populated.length === points.length,
    example: populated.length ? populated[0].payload[field] : null,
  };
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function optionalFile(pathname) {
  try {
    await access(pathname);
    const text = await readFile(pathname, 'utf8');
    return { exists: true, path: pathname, sha256: sha256Text(text), text };
  } catch {
    return { exists: false, path: pathname, sha256: null, text: null };
  }
}

function findFiniteVectorOfDimension(value, dimension, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    if (value.length === dimension && value.every(Number.isFinite)) return value;
    for (const item of value) {
      const found = findFiniteVectorOfDimension(item, dimension, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const item of Object.values(value)) {
    const found = findFiniteVectorOfDimension(item, dimension, depth + 1);
    if (found) return found;
  }
  return null;
}

export function inspectEmb2Jsonl(text, expectedDimension = 768) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  let parsed = 0;
  let vectors = 0;
  let normalized = 0;
  const errors = [];

  for (let index = 0; index < lines.length; index += 1) {
    try {
      const row = JSON.parse(lines[index]);
      parsed += 1;
      const vector = findFiniteVectorOfDimension(row, expectedDimension);
      if (!vector) continue;
      vectors += 1;
      const norm = l2Norm(vector);
      if (norm != null && Math.abs(norm - 1) <= 0.01) normalized += 1;
    } catch (error) {
      errors.push(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    lineCount: lines.length,
    parsedCount: parsed,
    vectorCount: vectors,
    normalizedVectorCount: normalized,
    allVectorsExpectedDimension: lines.length > 0 && vectors === lines.length,
    allVectorsNormalized: vectors > 0 && normalized === vectors,
    errors,
  };
}

class QdrantReadOnlyClient {
  constructor(baseUrl, apiKey = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.operations = [];
  }

  headers(json = false) {
    const headers = {};
    if (json) headers['content-type'] = 'application/json';
    if (this.apiKey) headers['api-key'] = this.apiKey;
    return headers;
  }

  async request(method, pathname, body = undefined) {
    if (method !== 'GET' && !(method === 'POST' && pathname.endsWith('/points/scroll'))) {
      throw new Error(`EMB3A_WRITE_OR_UNAPPROVED_OPERATION_REFUSED:${method}:${pathname}`);
    }
    this.operations.push({ method, pathname, readOnly: true });
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: this.headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!response.ok) {
      const error = new Error(`QDRANT_HTTP_${response.status}:${method}:${pathname}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  collection(name) {
    return this.request('GET', `/collections/${encodeURIComponent(name)}`);
  }

  scroll(name, body) {
    return this.request('POST', `/collections/${encodeURIComponent(name)}/points/scroll`, body);
  }
}

function collectionConfig(result) {
  return result?.result ?? null;
}

function pointsFromScroll(result) {
  const points = result?.result?.points;
  return Array.isArray(points) ? points : [];
}

function indexedPayloadFields(collection) {
  const schema = collection?.payload_schema;
  return isRecord(schema) ? Object.keys(schema).sort() : [];
}

function matchCondition(key, value) {
  return { key, match: { value } };
}

async function filterRoundTrip(client, collectionName, sample, field, extraConditions = []) {
  const value = sample?.payload?.[field];
  if (value === undefined || value === null) {
    return { field, attempted: false, passed: false, reason: 'FIELD_NOT_PRESENT', value: null, matchedPointIds: [] };
  }

  const response = await client.scroll(collectionName, {
    filter: { must: [matchCondition(field, value), ...extraConditions] },
    limit: 32,
    with_payload: true,
    with_vector: false,
  });
  const points = pointsFromScroll(response);
  const sampleId = String(sample.id);
  const matchedPointIds = points.map((point) => String(point.id));
  return {
    field,
    attempted: true,
    passed: matchedPointIds.includes(sampleId),
    reason: matchedPointIds.includes(sampleId) ? 'SAMPLE_POINT_ROUND_TRIPPED' : 'SAMPLE_POINT_NOT_RETURNED',
    value,
    matchedPointIds,
  };
}

async function auditCollection(client, options) {
  const { name, expectedDimension, expectedRepresentation, targetRole, sampleSize } = options;
  let response;
  try {
    response = await client.collection(name);
  } catch (error) {
    if (error?.status === 404) {
      return {
        name,
        role: targetRole,
        exists: false,
        status: 'COLLECTION_MISSING',
        blockers: ['COLLECTION_MISSING'],
      };
    }
    throw error;
  }

  const collection = collectionConfig(response);
  const targets = detectVectorTargets(collection?.config?.params?.vectors);
  const expectedTarget = selectExpectedVectorTarget(targets, expectedDimension, expectedRepresentation);
  const sampleResponse = await client.scroll(name, {
    limit: sampleSize,
    with_payload: true,
    with_vector: true,
  });
  const points = pointsFromScroll(sampleResponse);
  const payloadPresence = [
    ...REQUIRED_IDENTITY_FIELDS,
    ...REQUIRED_REVISION_FIELDS,
    ...REQUIRED_REPRESENTATION_FIELDS,
    'projection_revision',
    'native_model_dimension',
    'symbol_version_id',
    'tree_node_id',
  ].map((field) => fieldPresence(points, field));
  const presenceByField = Object.fromEntries(payloadPresence.map((item) => [item.field, item]));

  const vectorSamples = points.map((point) => {
    const vector = pointVector(point, expectedTarget);
    const norm = l2Norm(vector);
    return {
      id: String(point.id),
      dimension: Array.isArray(vector) ? vector.length : null,
      finite: Array.isArray(vector) && vector.every(Number.isFinite),
      l2Norm: norm,
      normalizedWithin001: norm != null && Math.abs(norm - 1) <= 0.01,
    };
  });

  const sample = points.find((point) => point?.payload?.packet_key && point?.payload?.workspace_revision != null)
    ?? points[0]
    ?? null;

  const identityCondition = sample?.payload?.packet_key != null
    ? [matchCondition('packet_key', sample.payload.packet_key)]
    : [];
  const workspaceFilter = sample
    ? await filterRoundTrip(client, name, sample, 'workspace_revision', identityCondition)
    : { field: 'workspace_revision', attempted: false, passed: false, reason: 'NO_SAMPLE', value: null, matchedPointIds: [] };
  const sourceFilter = sample
    ? await filterRoundTrip(client, name, sample, 'source_revision', identityCondition)
    : { field: 'source_revision', attempted: false, passed: false, reason: 'NO_SAMPLE', value: null, matchedPointIds: [] };

  let revisionIdentityFilter = { attempted: false, passed: false, reason: 'REQUIRED_FIELDS_NOT_PRESENT', matchedPointIds: [] };
  if (sample?.payload?.packet_key && sample?.payload?.workspace_revision != null && sample?.payload?.source_revision) {
    const response2 = await client.scroll(name, {
      filter: {
        must: [
          matchCondition('packet_key', sample.payload.packet_key),
          matchCondition('workspace_revision', sample.payload.workspace_revision),
          matchCondition('source_revision', sample.payload.source_revision),
        ],
      },
      limit: 32,
      with_payload: true,
      with_vector: false,
    });
    const points2 = pointsFromScroll(response2);
    const ids = points2.map((point) => String(point.id));
    revisionIdentityFilter = {
      attempted: true,
      passed: ids.includes(String(sample.id)),
      reason: ids.includes(String(sample.id)) ? 'IDENTITY_AND_REVISIONS_ROUND_TRIPPED' : 'SAMPLE_POINT_NOT_RETURNED',
      matchedPointIds: ids,
    };
  }

  const blockers = [];
  if (!expectedTarget) blockers.push('EXPECTED_VECTOR_DIMENSION_NOT_PRESENT');
  if (!points.length) blockers.push('COLLECTION_EMPTY_OR_NO_SCROLL_SAMPLE');
  for (const field of REQUIRED_IDENTITY_FIELDS) {
    if (!presenceByField[field]?.presentOnAllSamples) blockers.push(`IDENTITY_FIELD_INCOMPLETE:${field}`);
  }
  for (const field of REQUIRED_REVISION_FIELDS) {
    if (!presenceByField[field]?.presentOnAllSamples) blockers.push(`REVISION_FIELD_INCOMPLETE:${field}`);
  }
  if (!presenceByField.representation_id?.presentOnAllSamples) blockers.push('REPRESENTATION_ID_INCOMPLETE');
  if (!presenceByField.representation_revision?.presentOnAllSamples) blockers.push('REPRESENTATION_REVISION_INCOMPLETE');
  if (presenceByField.representation_id?.example != null && presenceByField.representation_id.example !== expectedRepresentation) {
    blockers.push(`REPRESENTATION_ID_MISMATCH:${presenceByField.representation_id.example}`);
  }
  if (presenceByField.native_model_dimension?.example != null && Number(presenceByField.native_model_dimension.example) !== expectedDimension) {
    blockers.push(`NATIVE_MODEL_DIMENSION_MISMATCH:${presenceByField.native_model_dimension.example}`);
  }
  if (vectorSamples.some((sampleVector) => sampleVector.dimension !== expectedDimension || !sampleVector.finite)) {
    blockers.push('POINT_VECTOR_DIMENSION_OR_FINITE_CHECK_FAILED');
  }
  if (vectorSamples.some((sampleVector) => !sampleVector.normalizedWithin001)) {
    blockers.push('POINT_VECTOR_NORMALIZATION_CHECK_FAILED');
  }
  if (!workspaceFilter.passed) blockers.push('WORKSPACE_REVISION_FILTER_ROUNDTRIP_FAILED');
  if (!sourceFilter.passed) blockers.push('SOURCE_REVISION_FILTER_ROUNDTRIP_FAILED');
  if (!revisionIdentityFilter.passed) blockers.push('REVISION_QUALIFIED_IDENTITY_ROUNDTRIP_FAILED');

  return {
    name,
    role: targetRole,
    exists: true,
    qdrantStatus: collection?.status ?? null,
    pointsCount: collection?.points_count ?? collection?.vectors_count ?? null,
    vectorTargets: targets,
    expectedVectorTarget: expectedTarget,
    expectedDimension,
    expectedRepresentation,
    indexedPayloadFields: indexedPayloadFields(collection),
    sampleCount: points.length,
    payloadPresence,
    vectorSamples,
    filterProofs: {
      workspaceRevision: workspaceFilter,
      sourceRevision: sourceFilter,
      identityWorkspaceSource: revisionIdentityFilter,
    },
    blockers,
    status: blockers.length ? 'BLOCKED' : 'PROVEN',
  };
}

function classifyTarget(audit) {
  if (!audit.exists) return 'BLOCKED_TARGET_COLLECTION_MISSING';
  if (audit.blockers.includes('EXPECTED_VECTOR_DIMENSION_NOT_PRESENT')) return 'BLOCKED_DIMENSION_MISMATCH';
  if (audit.blockers.some((value) => value.startsWith('IDENTITY_FIELD_INCOMPLETE'))) return 'BLOCKED_MISSING_IDENTITY_PAYLOAD';
  if (audit.blockers.some((value) => value.startsWith('REVISION_FIELD_INCOMPLETE'))) return 'BLOCKED_MISSING_REVISION_PAYLOAD';
  if (audit.blockers.some((value) => value.includes('FILTER_ROUNDTRIP') || value.includes('IDENTITY_ROUNDTRIP'))) return 'BLOCKED_REVISION_FILTER';
  if (audit.blockers.length) return 'BLOCKED_CONTRACT_MISMATCH';
  return 'PROVEN';
}

function markdownReport(report) {
  const target = report.targetAudit;
  const legacy = report.legacyAudit;
  const fieldRows = target?.payloadPresence?.map((item) => `| \`${item.field}\` | ${item.presentCount}/${item.sampleCount} | ${item.presentOnAllSamples ? 'yes' : 'no'} |`) ?? [];
  return `# EMB3A — Qdrant semantic projection read-only proof\n\n` +
    `- **Status:** \`${report.status}\`\n` +
    `- **Qdrant:** \`${report.qdrantUrl}\`\n` +
    `- **Target:** \`${report.targetCollection}\` → \`${report.expectedRepresentation}\` (${report.expectedDimension}d)\n` +
    `- **Legacy audit:** \`${report.legacyCollection}\`\n` +
    `- **Writes attempted:** \`false\`\n` +
    `- **Collection mutation:** \`false\`\n` +
    `- **Point mutation:** \`false\`\n\n` +
    `## Target result\n\n` +
    `Target audit: \`${target?.status ?? 'NOT_RUN'}\`\n\n` +
    `Blockers:\n${target?.blockers?.length ? target.blockers.map((value) => `- \`${value}\``).join('\n') : '- none'}\n\n` +
    `### Payload lineage\n\n| field | present | all samples |\n|---|---:|---|\n${fieldRows.join('\n')}\n\n` +
    `### Filter round-trip\n\n` +
    `- workspace_revision: \`${target?.filterProofs?.workspaceRevision?.passed ?? false}\`\n` +
    `- source_revision: \`${target?.filterProofs?.sourceRevision?.passed ?? false}\`\n` +
    `- packet_key + workspace_revision + source_revision: \`${target?.filterProofs?.identityWorkspaceSource?.passed ?? false}\`\n\n` +
    `## Legacy collection\n\n` +
    `Legacy audit status: \`${legacy?.status ?? 'NOT_RUN'}\`. A legacy projection is observational evidence only and cannot satisfy EMB3A for semantic_768.\n\n` +
    `## EMB2 artifact binding\n\n` +
    `- JSONL present: \`${report.emb2.jsonl.exists}\`\n` +
    `- proof JSON present: \`${report.emb2.proof.exists}\`\n` +
    `- JSONL SHA-256: \`${report.emb2.jsonl.sha256 ?? 'n/a'}\`\n` +
    `- parsed vectors: \`${report.emb2.jsonlInspection?.vectorCount ?? 0}\`\n\n` +
    `## Authority\n\nThis proof is read-only Qdrant evidence. It does not authorize a collection, point, Postgres, Valkey, embedding, or canonical projection write.\n`;
}

export async function runEmb3A(options = {}) {
  const qdrantUrl = options.qdrantUrl ?? DEFAULT_QDRANT_URL;
  const apiKey = options.apiKey ?? process.env.QDRANT_API_KEY ?? null;
  const targetCollection = options.targetCollection ?? DEFAULT_TARGET_COLLECTION;
  const legacyCollection = options.legacyCollection ?? DEFAULT_LEGACY_COLLECTION;
  const expectedDimension = options.expectedDimension ?? DEFAULT_EXPECTED_DIMENSION;
  const expectedRepresentation = options.expectedRepresentation ?? DEFAULT_EXPECTED_REPRESENTATION;
  const sampleSize = options.sampleSize ?? 24;
  const emb2JsonlPath = options.emb2JsonlPath ?? DEFAULT_EMB2_JSONL;
  const emb2ProofPath = options.emb2ProofPath ?? DEFAULT_EMB2_PROOF;

  const client = new QdrantReadOnlyClient(qdrantUrl, apiKey);
  const emb2Jsonl = await optionalFile(emb2JsonlPath);
  const emb2Proof = await optionalFile(emb2ProofPath);
  const emb2Inspection = emb2Jsonl.exists ? inspectEmb2Jsonl(emb2Jsonl.text, expectedDimension) : null;

  const targetAudit = await auditCollection(client, {
    name: targetCollection,
    expectedDimension,
    expectedRepresentation,
    targetRole: 'semantic-768-target',
    sampleSize,
  });

  let legacyAudit = null;
  if (legacyCollection && legacyCollection !== targetCollection) {
    legacyAudit = await auditCollection(client, {
      name: legacyCollection,
      expectedDimension: 512,
      expectedRepresentation: 'semantic_512',
      targetRole: 'legacy-observation-only',
      sampleSize: Math.min(sampleSize, 12),
    });
  }

  const status = classifyTarget(targetAudit);
  const report = {
    schema: EMB3A_SCHEMA,
    generatedAt: new Date().toISOString(),
    status,
    qdrantUrl,
    targetCollection,
    legacyCollection,
    expectedRepresentation,
    expectedDimension,
    targetAudit,
    legacyAudit,
    emb2: {
      jsonl: { exists: emb2Jsonl.exists, path: emb2Jsonl.path, sha256: emb2Jsonl.sha256 },
      proof: { exists: emb2Proof.exists, path: emb2Proof.path, sha256: emb2Proof.sha256 },
      jsonlInspection: emb2Inspection,
      localArtifactsAreProofInputsNotQdrantAuthority: true,
    },
    operations: client.operations,
    invariants: {
      qdrantGetOnlyExceptReadOnlyScrollPost: true,
      collectionMutationAttempted: false,
      pointMutationAttempted: false,
      postgresMutationAttempted: false,
      valkeyMutationAttempted: false,
      embeddingArtifactMutationAttempted: false,
      legacy512MayNotSatisfySemantic768Target: true,
      missingSourceRevisionMayNotBeReconstructedFromOtherRevisionFields: true,
      qdrantIsProjectionNotCanonicalAuthority: true,
      canonicalWritesAllowed: false,
    },
    producerRevision: 'prove-emb3a-qdrant-semantic-projection.v1',
  };
  return report;
}

async function main() {
  const argv = process.argv.slice(2);
  const options = {
    qdrantUrl: parseArg(argv, '--qdrant-url', DEFAULT_QDRANT_URL),
    apiKey: parseArg(argv, '--api-key', process.env.QDRANT_API_KEY ?? null),
    targetCollection: parseArg(argv, '--collection', DEFAULT_TARGET_COLLECTION),
    legacyCollection: parseArg(argv, '--legacy-collection', DEFAULT_LEGACY_COLLECTION),
    expectedDimension: parseIntArg(argv, '--expected-dimension', DEFAULT_EXPECTED_DIMENSION),
    expectedRepresentation: parseArg(argv, '--expected-representation', DEFAULT_EXPECTED_REPRESENTATION),
    sampleSize: parseIntArg(argv, '--sample-size', 24),
    emb2JsonlPath: path.resolve(parseArg(argv, '--emb2-jsonl', DEFAULT_EMB2_JSONL)),
    emb2ProofPath: path.resolve(parseArg(argv, '--emb2-proof', DEFAULT_EMB2_PROOF)),
  };
  const reportJson = path.resolve(parseArg(argv, '--report-json', DEFAULT_REPORT_JSON));
  const reportMd = path.resolve(parseArg(argv, '--report-md', DEFAULT_REPORT_MD));

  let report;
  try {
    report = await runEmb3A(options);
  } catch (error) {
    report = {
      schema: EMB3A_SCHEMA,
      generatedAt: new Date().toISOString(),
      status: 'ERROR',
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      qdrantUrl: options.qdrantUrl,
      targetCollection: options.targetCollection,
      invariants: {
        collectionMutationAttempted: false,
        pointMutationAttempted: false,
        postgresMutationAttempted: false,
        valkeyMutationAttempted: false,
        canonicalWritesAllowed: false,
      },
      producerRevision: 'prove-emb3a-qdrant-semantic-projection.v1',
    };
  }

  await mkdir(path.dirname(reportJson), { recursive: true });
  await mkdir(path.dirname(reportMd), { recursive: true });
  await writeFile(reportJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(reportMd, markdownReport(report), 'utf8');

  console.log(JSON.stringify({
    status: report.status,
    targetCollection: report.targetCollection,
    reportPath: reportJson,
    safeNextCommand: report.status === 'PROVEN'
      ? 'EMB3B: prove Drizzle/Postgres semantic_768 writer inside BEGIN/ROLLBACK'
      : 'Fix the reported Qdrant projection contract mismatch; do not mutate points during EMB3A',
  }, null, 2));

  if (report.status !== 'PROVEN') process.exitCode = 2;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
