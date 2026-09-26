#!/usr/bin/env node
/**
 * Zod <-> Pydantic parity gate, slice 1 (UnknownResolutionV1). Artifact-only.
 * Exports the JSON Schema (with schemaId/schemaVersion/schemaChecksum/producerRevision) and a fixture set whose accept/reject verdicts
 * are recorded FROM ZOD. The Python side (python/atlas_contract_parity/run_parity.py) must reach the identical verdict on every fixture.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UNKNOWN_RESOLUTION_SCHEMA_V1,
  unknownIdFromNaturalKeyV1,
  unknownResolutionV1JsonSchema,
  unknownResolutionV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/contracts/unknown-resolution-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}` : JSON.stringify(v);

const SNAP = 'sha256:' + 'a'.repeat(64);
const good: Record<string, unknown> = {
  schema: UNKNOWN_RESOLUTION_SCHEMA_V1, unknownId: unknownIdFromNaturalKeyV1(['FEATURE_EVIDENCE_GAP', SNAP, 'packet:1', 'legacy_summary_cosine_max']),
  subjectKind: 'FEATURE_EVIDENCE_GAP', subjectId: 'packet:1', snapshotRevision: SNAP, unknownKind: 'MISSING_FEATURE_VALUE',
  featureName: 'legacy_summary_cosine_max', reasonCode: 'NO_PROVEN_CHUNK_LINEAGE', requiredEvidenceKind: 'PROVEN_PACKET_CHUNK_LINEAGE',
  resolverKind: 'SOURCE_LINEAGE_REPAIR', status: 'OPEN', evidenceRefs: ['x'], resolutionRevision: null, canonicalAuthority: false,
};
const without = (k: string) => { const o = { ...good }; delete o[k]; return o; };
const cases: Array<[string, unknown]> = [
  ['valid feature gap', good],
  ['valid packet identity (null snapshot, null feature)', { ...good, subjectKind: 'PACKET_IDENTITY', snapshotRevision: null, featureName: null, resolverKind: 'PACKET_PROMOTION_PIPELINE' }],
  ['valid resolved with revision', { ...good, status: 'RESOLVED', resolutionRevision: 'rev-1' }],
  ['extra value field', { ...good, value: 0 }],
  ['extra rawCosine field', { ...good, rawCosine: 0.2 }],
  ['canonicalAuthority true', { ...good, canonicalAuthority: true }],
  ['unknown subjectKind', { ...good, subjectKind: 'GUESSED' }],
  ['unknown resolverKind', { ...good, resolverKind: 'MAGIC' }],
  ['unknown status', { ...good, status: 'DONE' }],
  ['non-uuid unknownId', { ...good, unknownId: 'not-a-uuid' }],
  ['uuid v4 not v5', { ...good, unknownId: '3f2b8c1e-5d4a-4b6f-9a1e-2c7d8e9f0a1b' }],
  ['wrong schema literal', { ...good, schema: 'atlas.unknown-resolution.v2' }],
  ['missing status', without('status')],
  ['missing evidenceRefs', without('evidenceRefs')],
  ['empty subjectId', { ...good, subjectId: '' }],
  ['numeric subjectId', { ...good, subjectId: 7 }],
  ['empty evidenceRef string', { ...good, evidenceRefs: [''] }],
  ['feature gap without snapshot', { ...good, snapshotRevision: null }],
  ['feature gap without featureName', { ...good, featureName: null }],
  ['resolved without revision', { ...good, status: 'RESOLVED' }],
  ['undefined-like null schema', { ...good, schema: null }],
];
const fixtures = cases.map(([name, value]) => ({ name, value, zodAccepts: unknownResolutionV1Schema.safeParse(value).success }));

const schema = unknownResolutionV1JsonSchema();
const schemaBody = JSON.stringify(schema);
const schemaMeta = { schemaId: UNKNOWN_RESOLUTION_SCHEMA_V1, schemaVersion: '1', schemaChecksum: sha(stable(schema)), producerRevision: sha(fs.readFileSync(fileURLToPath(import.meta.url))) };

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/contract-parity-v1/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'unknown-resolution-v1.schema.json'), schemaBody);
fs.writeFileSync(path.join(outDir, 'unknown-resolution-v1.meta.json'), JSON.stringify(schemaMeta, null, 2));
fs.writeFileSync(path.join(outDir, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
console.log(JSON.stringify({ dir: path.relative(ROOT, outDir), fixtures: fixtures.length, zodAccepts: fixtures.filter((f) => f.zodAccepts).length, zodRejects: fixtures.filter((f) => !f.zodAccepts).length, ...schemaMeta }, null, 2));
