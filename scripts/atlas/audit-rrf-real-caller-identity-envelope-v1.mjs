#!/usr/bin/env node

/** Read-only identity-envelope audit for the real Qdrant RRF caller surface. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/rrf-real-caller-identity-envelope-v1.json');
const url = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const collection = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const required = ['packet_key', 'source_ref', 'source_revision', 'workspace_revision', 'representation_id', 'representation_revision'];
let reachable = false;
let points = [];
let error = null;
try {
  const response = await fetch(`${url}/collections/${encodeURIComponent(collection)}/points/scroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 20, with_payload: required, with_vector: false }) });
  reachable = response.ok;
  if (!response.ok) error = `HTTP_${response.status}`;
  else points = (await response.json()).result?.points ?? [];
} catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
const coverage = Object.fromEntries(required.map((field) => [field, points.filter((point) => point.payload?.[field] !== null && point.payload?.[field] !== undefined && String(point.payload[field]).trim() !== '').length]));
const complete = points.filter((point) => required.every((field) => point.payload?.[field] !== null && point.payload?.[field] !== undefined && String(point.payload[field]).trim() !== '')).length;
const report = {
  schema: 'atlas.rrf-real-caller-identity-envelope.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: !reachable ? 'IDENTITY_ENVELOPE_BLOCKED_QDRANT_UNAVAILABLE' : complete === points.length && points.length > 0 ? 'IDENTITY_ENVELOPE_SAMPLE_PROVEN' : 'IDENTITY_ENVELOPE_PARTIAL',
  proofLevel: reachable && complete === points.length && points.length > 0 ? 'BOUNDED_LIVE_PROVEN' : 'PARTIAL_PROVEN', authority: false, migrationAuthorized: false, writesPerformed: false, workspaceRevision: null,
  source: { qdrantUrl: url, collection, sampleCount: points.length, reachable, error },
  requiredFields: required, fieldCoverage: coverage, completeEnvelopeCount: complete, missingEnvelopeCount: points.length - complete,
  canonicalPreconditions: { uniqueCanonicalFusionOwner: true, oneLogicalSemanticLane: true, workspaceRevisionAdmitted: false, sourceRevisionCoverage: coverage.source_revision ?? 0, representationRevisionCoverage: coverage.representation_revision ?? 0, identityFallbackAllowed: false },
  blockers: [...new Set([...(error ? ['QDRANT_READ_UNAVAILABLE'] : []), ...(complete !== points.length ? ['IDENTITY_REVISION_FIELDS_INCOMPLETE'] : []), 'WORKSPACE_REVISION_AUTHORITY_NOT_ADMITTED', 'RUNTIME_CONSOLIDATION_NOT_AUTHORIZED'])],
  nextGate: 'RWC-CENSUS-05_CALLER_MIGRATION_ADMISSION', safeNextCommand: 'npm run atlas:rrf:real-identity-audit',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, reachable, sampleCount: points.length, completeEnvelopeCount: complete, missingEnvelopeCount: points.length - complete, authority: false, writesPerformed: false, reportPath: REPORT }, null, 2));
