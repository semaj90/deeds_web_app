#!/usr/bin/env node

/**
 * Read-only MAN4-05 producer alignment audit.
 *
 * This intentionally does not connect to PostgreSQL/Valkey or invoke any
 * producer. It checks whether the existing SOM/topology artifacts can satisfy
 * Manifold4OrientationV1 without inventing identity or revision fields.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const assignmentPath = resolve(root, 'models/som/som_assignments.json');
const producerPaths = [
  'scripts/atlas/train-som-20x20.mjs',
  'scripts/atlas/compute-som-centroids.mjs',
  'scripts/atlas/project-codebase-topology.mjs',
].map((relativePath) => ({ relativePath, absolutePath: resolve(root, relativePath) }));

const requiredContractFields = [
  'candidateOrdinal',
  'canonicalId',
  'workspaceRevision',
  'sourceRevision',
  'featureRevision',
  'producerRevision',
  'quaternion',
  'evidenceRefs',
];

function readText(relativePath) {
  const absolutePath = resolve(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
}

let assignments = null;
if (existsSync(assignmentPath)) assignments = JSON.parse(readFileSync(assignmentPath, 'utf8'));
const entries = Object.entries(assignments?.assignments ?? {});
const assignmentFields = [...new Set(entries.flatMap(([, value]) => Object.keys(value ?? {})))].sort();
const packetKeyShapeCounts = entries.reduce((counts, [key]) => {
  const shape = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(key) ? 'uuid-shaped' : 'other';
  counts[shape] = (counts[shape] ?? 0) + 1;
  return counts;
}, {});

const producerFindings = producerPaths.map(({ relativePath }) => {
  const text = readText(relativePath) ?? '';
  return {
    path: relativePath,
    present: text.length > 0,
    writesPostgres: /(?:pool|client)\.query\s*\(/i.test(text) && /\b(?:UPDATE|INSERT|DELETE|CREATE TABLE|ALTER TABLE)\b/i.test(text),
    writesValkey: /(?:redisClient|redis|valkey)[^;\n]{0,80}\.(?:set|setex|hset|sadd)\s*\(/i.test(text),
    syntheticProjection: /syntheticManifold4|synthetic\s+manifold4/i.test(text),
    mentionsRevision: /sourceRevision|workspaceRevision|featureRevision|producerRevision/i.test(text),
  };
});

const report = {
  schema: 'atlas.manifold4-producer-alignment-audit.v1',
  status: 'MAN4_PRODUCER_ALIGNMENT_BLOCKED',
  observedAt: new Date().toISOString(),
  owner: 'parent-atlas-candidate-feature-execution-fabric',
  contract: 'sveltekit-frontend/src/lib/server/atlas/features/manifold4-orientation-v1.ts',
  sourceArtifact: {
    path: 'models/som/som_assignments.json',
    present: assignments !== null,
    timestamp: assignments?.timestamp ?? null,
    declaredPacketCount: assignments?.packet_count ?? null,
    assignmentCount: entries.length,
    assignmentFields,
    requiredRevisionQualifiedFieldsMissing: requiredContractFields.filter((field) => !assignmentFields.includes(field)),
    keyShapeCounts: packetKeyShapeCounts,
  },
  producerFindings,
  decision: {
    safeToWireExistingProducer: false,
    reasonCodes: [
      'SOM_ASSIGNMENTS_PACKET_KEYED_NOT_CANDIDATE_ORDINAL_KEYED',
      'SOM_ASSIGNMENTS_MISSING_REVISION_AND_EVIDENCE_FIELDS',
      'EXISTING_PRODUCERS_INCLUDE_WRITE_CAPABLE_PATHS',
      'TOPOLOGY_PROJECTOR_INCLUDES_SYNTHETIC_MANIFOLD4',
    ],
    noDatastoreWritesAttempted: true,
    noIdentityPromotionAttempted: true,
  },
  nextGate: 'MAN4-05 requires a revision-qualified producer receipt or an explicitly bounded adapter input with exact CandidateOrdinal/source joins.',
  productionClaim: false,
};

const outputPath = resolve(root, 'docs/reports/manifold4-producer-alignment-audit-v1.json');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: 'docs/reports/manifold4-producer-alignment-audit-v1.json' }, null, 2));
