#!/usr/bin/env node

/**
 * Read-only audit of the semantic vector snapshot's canonical identity join.
 * No ordinal map is created and no database row is changed.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = resolve(import.meta.dirname, '../..');
const keysPath = resolve(root, 'python/atlas_compute/gpu_mini_fabric/fixtures/semantic-768-real-frozen-node-keys.json');
const manifestPath = resolve(root, 'python/atlas_compute/gpu_mini_fabric/fixtures/semantic-768-real-frozen-manifest.json');
const outputPath = resolve(root, 'docs/reports/semantic-candidate-cohort-v1.json');
const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 30000 });

const param = '$' + '1';
const sql = `SELECT c.id::text, c.chunk_id, c.source_ref, c.repo_id::text, c.content_hash,
    c.content,
    c.metadata, c.output_meta, b.source_revision AS bound_source_revision,
    b.content_digest AS bound_content_digest,
    r.source_ref_key AS registry_source_ref_key,
    r.content_hash AS registry_content_hash,
    r.commit_sha AS registry_commit_sha
  FROM codebase_chunk_index c
  LEFT JOIN LATERAL (
    SELECT source_revision, content_digest
    FROM atlas_workspace_source_bindings
    WHERE repo_id = $2 AND canonical_source_ref = c.source_ref
    ORDER BY workspace_revision DESC
    LIMIT 1
  ) b ON true
  LEFT JOIN LATERAL (
    SELECT source_ref_key, content_hash, commit_sha
    FROM atlas_source_refs
    WHERE source_ref_key = c.source_ref
       OR relative_path = c.source_ref
    ORDER BY CASE WHEN source_ref_key = c.source_ref THEN 0 ELSE 1 END,
             source_ref_key
    LIMIT 1
  ) r ON true
  WHERE c.id = ANY(${param}::uuid[]) ORDER BY c.id`;
const result = await pool.query(sql, [keys, 'deeds-web-app']);
await pool.end();

const rows = result.rows;
const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;
const sourceRevision = (row) => row.bound_source_revision ?? row.metadata?.sourceRevision
  ?? row.metadata?.source_revision ?? row.output_meta?.sourceRevision ?? row.output_meta?.source_revision ?? null;
const counts = {
  requested: keys.length,
  resolved: rows.length,
  unresolvedIds: keys.length - rows.length,
  chunkIdPresent: rows.filter((row) => hasValue(row.chunk_id)).length,
  sourceRefPresent: rows.filter((row) => hasValue(row.source_ref)).length,
  repoIdPresent: rows.filter((row) => hasValue(row.repo_id)).length,
  contentHashPresent: rows.filter((row) => hasValue(row.content_hash)).length,
  contentPresent: rows.filter((row) => hasValue(row.content)).length,
  sourceRevisionPresent: rows.filter((row) => hasValue(sourceRevision(row))).length,
  authoritativeBindingPresent: rows.filter((row) => hasValue(row.bound_source_revision)
    && hasValue(row.bound_content_digest)
    && hasValue(row.content_hash)
    && row.bound_content_digest.toLowerCase() === row.content_hash.toLowerCase()).length,
  sourceRegistryRefPresent: rows.filter((row) => hasValue(row.registry_source_ref_key)).length,
  sourceRegistryContentHashMatch: rows.filter((row) => hasValue(row.registry_content_hash)
    && hasValue(row.content_hash)
    && row.registry_content_hash.toLowerCase() === row.content_hash.toLowerCase()).length,
  sourceRegistryCommitPresent: rows.filter((row) => hasValue(row.registry_commit_sha)).length,
};
const eligibleRows = rows.filter((row) => hasValue(row.chunk_id) && hasValue(row.source_ref)
  && hasValue(row.content_hash) && hasValue(row.bound_source_revision)
  && hasValue(row.bound_content_digest)
  && row.bound_content_digest.toLowerCase() === row.content_hash.toLowerCase());
const eligibleIds = eligibleRows.map((row) => row.id).sort();
const eligibleChecksum = createHash('sha256').update(JSON.stringify(eligibleIds)).digest('hex');

const report = {
  schema: 'atlas.semantic-candidate-cohort.v1',
  mode: 'READ_ONLY_AUDIT',
  semanticManifest: 'python/atlas_compute/gpu_mini_fabric/fixtures/semantic-768-real-frozen-manifest.json',
  semanticNodeKeys: 'python/atlas_compute/gpu_mini_fabric/fixtures/semantic-768-real-frozen-node-keys.json',
  semanticSnapshotRevision: manifest.vectors_checksum ? `semantic-snapshot:${manifest.vectors_checksum}` : null,
  representationId: 'semantic_768',
  cohortAuthority: {
    status: 'UNRESOLVED',
    classification: 'UNKNOWN',
    authorityStatus: 'BLOCKED_UNGROUNDED',
    cohortId: null,
    cohortOwner: null,
    populationDefinition: 'semantic fixture node-key population; authority not established by this audit',
    sourcePopulation: null,
    selectionRule: 'fixture manifest/node-key export only; no authoritative cohort-selection receipt found',
    workspaceRevision: null,
    sourceRevisionSetChecksum: null,
    representationRevision: 'semantic_768',
    populationCount: keys.length,
    populationChecksum: null,
    evidenceArtifact: null,
    requiredAuthorityFieldsProven: false,
    historicalLiteral: '15128/768',
    unsupportedLiteral: '151128',
  },
  counts,
  eligibilityPolicy: ['codebase_chunk_index.id', 'chunk_id', 'source_ref', 'content_hash', 'authoritative workspace source_revision binding', 'binding content_digest == content_hash'],
  sourceInputHydration: {
    exactSemanticRows: rows.length,
    nonEmptyContentRows: rows.filter((row) => hasValue(row.content)).length,
    contentHashRows: rows.filter((row) => hasValue(row.content_hash)).length,
    revisionQualifiedRows: counts.authoritativeBindingPresent,
    readyRows: eligibleRows.filter((row) => hasValue(row.content)).length,
    contentDigestAlgorithm: 'not inferred by this audit',
    readOnly: true,
  },
  registryCoverage: {
    owner: 'atlas_source_refs',
    joinCandidates: ['source_ref_key == codebase_chunk_index.source_ref', 'relative_path == codebase_chunk_index.source_ref'],
    diagnosticOnly: true,
    doesNotSubstituteForWorkspaceBinding: true,
  },
  eligibleCount: eligibleRows.length,
  rejectedCount: rows.length - eligibleRows.length,
  eligibleIdChecksum: `sha256:${eligibleChecksum}`,
  status: counts.unresolvedIds === 0 && eligibleRows.length === keys.length
    ? 'SEMANTIC_CANDIDATE_COHORT_READY_FOR_ORDINAL_ADMISSION'
    : 'SEMANTIC_CANDIDATE_COHORT_BLOCKED',
  blockers: [
    ...(counts.unresolvedIds ? ['SEMANTIC_KEY_NOT_FOUND_IN_POSTGRES'] : []),
    ...(counts.sourceRefPresent !== counts.resolved ? ['SOURCE_REF_MISSING'] : []),
    ...(counts.authoritativeBindingPresent !== counts.resolved ? ['AUTHORITATIVE_SOURCE_BINDING_MISSING'] : []),
    ...(counts.sourceRegistryRefPresent !== counts.resolved ? ['SOURCE_REGISTRY_COVERAGE_INCOMPLETE'] : []),
    ...(counts.sourceRegistryCommitPresent !== counts.resolved ? ['SOURCE_REGISTRY_COMMIT_REVISION_INCOMPLETE'] : []),
  ],
  writesPerformed: false,
  canonicalAuthority: false,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/semantic-candidate-cohort-v1.json', status: report.status, eligibleCount: report.eligibleCount, rejectedCount: report.rejectedCount }, null, 2));
