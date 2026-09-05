#!/usr/bin/env node

/**
 * Build a reference-only BitFrost/Valkey residency descriptor.
 *
 * This is deliberately not a cache writer.  PostgreSQL remains authoritative;
 * this descriptor only proves the identity that a future residency adapter
 * would have to verify before accepting a hit.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contextPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ace-context-v1.json');
const synthesisPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-dry-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-residency-v1.json');

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const synthesis = JSON.parse(fs.readFileSync(synthesisPath, 'utf8'));

const identity = {
  schema: 'atlas.parent-atlas-workstation-residency-identity.v1',
  workboardChecksum: context.workboardChecksum,
  taskPopulationChecksum: context.taskPopulationChecksum,
  planChecksum: context.planChecksum,
  contextChecksum: context.contextChecksum,
  evidenceRefsChecksum: sha256(JSON.stringify(context.selectedEvidenceRefs ?? [])),
  evidenceRevisionSet: context.selectedEvidenceRefs ?? [],
  modelRevision: synthesis.loadedModel ?? null,
  promptRevision: synthesis.promptRevision ?? null,
  producerRevision: 'parent-atlas-workstation-residency:v1',
};

const identityChecksum = sha256(JSON.stringify(identity));
const report = {
  schema: 'atlas.parent-atlas-workstation-residency.v1',
  status: 'REFERENCE_ONLY',
  authority: 'BITFROST_VALKEY_RESIDENCY_ONLY',
  cacheKey: `bitfrost:workstation:context:v1:${identityChecksum.slice('sha256:'.length)}`,
  identity,
  identityChecksum,
  descriptor: {
    contextManifestRef: contextPath.replace(`${root}${path.sep}`, '').replaceAll(path.sep, '/'),
    synthesisReceiptRef: synthesisPath.replace(`${root}${path.sep}`, '').replaceAll(path.sep, '/'),
    selectedEvidenceRefs: context.selectedEvidenceRefs ?? [],
    residencyClass: 'WORKSTATION_CONTEXT_REFERENCE',
    canonicalAuthority: false,
  },
  cacheDecision: 'NOT_EXECUTED_REFERENCE_ONLY',
  writes: {
    valkey: 0,
    redis: 0,
    postgres: 0,
    qdrant: 0,
    neo4j: 0,
    sourceFiles: 0,
    modelCalls: 0,
  },
  notes: [
    'No Valkey/Redis connection is opened by this script.',
    'A future reader must compare the complete identity object, not TTL or key suffix alone.',
    'Any identity mismatch is a stale rejection and must not fall back to a latest key.',
  ],
};

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  cacheKey: report.cacheKey,
  identityChecksum: report.identityChecksum,
  cacheDecision: report.cacheDecision,
  writes: report.writes,
  out: outPath,
}, null, 2));
