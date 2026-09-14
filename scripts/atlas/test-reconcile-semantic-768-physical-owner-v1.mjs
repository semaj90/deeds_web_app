#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSemanticPhysicalOwner } from './reconcile-semantic-768-physical-owner-v1.mjs';

const COMPLETE_WRITER_SOURCE = `
const canonicalChunkId = row.canonical_chunk_id;
const packetKey = row.packet_key;
const workspaceRevision = row.workspace_revision;
const sourceRevision = row.source_revision;
const modelRevision = upstreamRevision;
const representationRevision = bindingChecksum;
if (!APPLY) throw new Error('--apply required');
if (process.env.ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL !== '1') throw new Error('EXPLICIT_SEMANTIC_768_BACKFILL_AUTHORIZATION_REQUIRED');
if (vector.length !== 768) throw new Error('bad');
await client.query(
  "UPDATE public.codebase_chunk_index c SET content_embedding = $1::halfvec(768) WHERE c.id=$2 AND EXISTS (SELECT 1 FROM atlas_packet_chunk_lineage l JOIN atlas_workspace_source_bindings b ON b.canonical_source_ref=l.source_ref AND b.source_revision=l.source_revision AND b.workspace_revision=$9 WHERE l.chunk_row_id=c.id AND l.revision_status='PROVEN' AND l.canonical_chunk_id=$5 AND l.packet_key=$6 AND l.source_revision=$8) RETURNING c.id, c.embedding_version, vector_dims(c.content_embedding::vector) AS dimensions",
  []
);
const readback = await client.query(
  "SELECT l.canonical_chunk_id, l.packet_key, l.source_revision, b.workspace_revision, c.embedding_version, vector_dims(c.content_embedding::vector) AS dimensions FROM codebase_chunk_index c JOIN atlas_packet_chunk_lineage l ON l.chunk_row_id=c.id AND l.revision_status='PROVEN' JOIN atlas_workspace_source_bindings b ON b.canonical_source_ref=l.source_ref WHERE c.id=$1",
  []
);
`;

test('proves one complete canonical writer while legacy surfaces remain non-current', () => {
  const census = {
    writers: [
      {
        path: 'scripts/atlas/current-writer.mjs',
        surface: 'codebase_chunk_index.content_embedding',
        kind: 'MUTATION_WRITER',
        role: 'ACTIVE_CANONICAL_CANDIDATE',
        revisionQualified: true,
        guarded: true,
        canonicalLineageQualified: true,
        independentReadback: true,
        explicitApply: true,
      },
      {
        path: 'scripts/atlas/legacy-backfill.mjs',
        surface: 'codebase_chunk_index.content_embedding_768',
        kind: 'MUTATION_WRITER',
        role: 'LEGACY_OR_TRANSITIONAL',
        revisionQualified: true,
        guarded: true,
      },
    ],
  };
  const sources = new Map([
    ['scripts/atlas/current-writer.mjs', COMPLETE_WRITER_SOURCE],
    ['scripts/atlas/legacy-backfill.mjs', 'UPDATE codebase_chunk_index SET content_embedding_768=$1'],
  ]);
  const report = evaluateSemanticPhysicalOwner(census, (file) => sources.get(file) ?? '');

  assert.equal(report.status, 'SEMANTIC_768_PHYSICAL_OWNER_PROVEN');
  assert.equal(report.canonicalCurrentWriterCount, 1);
  assert.equal(report.unresolvedCurrentWriterCount, 0);
  assert.equal(report.canonicalCurrentWriter, 'scripts/atlas/current-writer.mjs');
});

test('blocks a physical-owner writer that lacks canonical chunk and packet lineage', () => {
  const census = {
    writers: [{
      path: 'scripts/atlas/incomplete-writer.mjs',
      surface: 'codebase_chunk_index.content_embedding',
      kind: 'MUTATION_WRITER',
      role: 'ACTIVE_CANONICAL_CANDIDATE',
      revisionQualified: true,
      guarded: true,
    }],
  };
  const source = `
const workspaceRevision = row.workspace_revision;
const sourceRevision = row.source_revision;
const representationRevision = bindingChecksum;
const modelRevision = upstreamRevision;
if (!APPLY) throw new Error('--apply required');
if (vector.length !== 768) throw new Error('bad');
await client.query('UPDATE codebase_chunk_index SET content_embedding=$1::halfvec(768) WHERE id=$2 AND source_revision=$3 AND workspace_revision=$4 RETURNING id', []);
`;
  const report = evaluateSemanticPhysicalOwner(census, () => source);

  assert.equal(report.status, 'SEMANTIC_768_PHYSICAL_OWNER_BLOCKED');
  assert.equal(report.canonicalCurrentWriterCount, 0);
  assert.equal(report.unresolvedCurrentWriterCount, 1);
  assert.ok(report.surfaces[0].missingRequiredEvidence.includes('canonicalChunkId'));
  assert.ok(report.surfaces[0].missingRequiredEvidence.includes('packetKey'));
  assert.ok(report.surfaces[0].missingRequiredEvidence.includes('provenLineageJoin'));
});

test('classifies the old content_embedding re-embed job as migration artifact, not current owner', () => {
  const census = {
    writers: [{
      path: 'scripts/atlas/reembed-corpus-document-prefix-v1.mjs',
      surface: 'codebase_chunk_index.content_embedding',
      kind: 'MUTATION_WRITER',
      role: 'ACTIVE_CANONICAL_CANDIDATE',
      revisionQualified: false,
      guarded: false,
    }],
  };
  const report = evaluateSemanticPhysicalOwner(census, () => `
UPDATE codebase_chunk_index SET content_embedding=$1::halfvec WHERE id=$2;
`);

  assert.equal(report.status, 'SEMANTIC_768_PHYSICAL_OWNER_BLOCKED');
  assert.equal(report.surfaces[0].classification, 'MIGRATION_ARTIFACT');
  assert.equal(report.unresolvedCurrentWriterCount, 0);
  assert.equal(report.canonicalCurrentWriterCount, 0);
});

test('does not treat atlas_packets embedding as current semantic writer', () => {
  const census = {
    writers: [{
      path: 'scripts/atlas/old-packet-writer.mjs',
      surface: 'atlas_packets.embedding',
      kind: 'MUTATION_WRITER',
      role: 'SECONDARY_768_SURFACE_UNRESOLVED',
      revisionQualified: false,
      guarded: false,
    }],
  };
  const report = evaluateSemanticPhysicalOwner(census, () => 'UPDATE atlas_packets SET embedding=$1');

  assert.equal(report.status, 'SEMANTIC_768_PHYSICAL_OWNER_BLOCKED');
  assert.equal(report.surfaces[0].classification, 'LEGACY_WRITER');
  assert.equal(report.canonicalCurrentWriterCount, 0);
});
