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
  'UPDATE codebase_chunk_index SET content_embedding = $1::halfvec(768) WHERE id=$2 AND source_revision=$3 AND workspace_revision=$4 RETURNING id, content_embedding',
  [vector, row.id, sourceRevision, workspaceRevision]
);
`;

test('proves one complete canonical writer when legacy writers are migration artifacts', () => {
  const census = {
    writers: [
      {
        path: 'scripts/atlas/current-writer.mjs',
        surface: 'codebase_chunk_index.content_embedding',
        kind: 'MUTATION_WRITER',
        role: 'ACTIVE_CANONICAL_CANDIDATE',
        revisionQualified: true,
        guarded: true,
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
