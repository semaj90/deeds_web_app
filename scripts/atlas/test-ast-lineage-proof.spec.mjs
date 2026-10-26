import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

test('AST-LINEAGE-PROOF-01: Rejects ambiguous 1-to-many AST node joins for a single chunk', () => {
  function bindChunkToAstSpan(chunkId, candidateAstNodes) {
    if (!candidateAstNodes || candidateAstNodes.length === 0) {
      throw new Error('NO_AST_CANDIDATE');
    }
    if (candidateAstNodes.length > 1) {
      // Ambiguous multiple AST nodes (e.g. fields, functions) cannot be arbitrarily picked for a chunk
      throw new Error(`AMBIGUOUS_AST_JOIN: chunk ${chunkId} matched ${candidateAstNodes.length} candidate AST nodes without packet span boundary`);
    }
    return candidateAstNodes[0];
  }

  // 1. Multiple microscopic AST nodes must throw AMBIGUOUS_AST_JOIN
  assert.throws(() => {
    bindChunkToAstSpan('f81ba260-d161-4e07-89d0-145472061a70', [
      { tree_node_id: 'node-1', qualified_symbol: 'generated_at', start_byte: 4, end_byte: 30 },
      { tree_node_id: 'node-2', qualified_symbol: 'canonical_concepts_total', start_byte: 50, end_byte: 52 },
      { tree_node_id: 'node-3', qualified_symbol: 'concepts_found', start_byte: 84, end_byte: 85 }
    ]);
  }, /AMBIGUOUS_AST_JOIN/);

  // 2. Single unambiguous node succeeds
  const single = bindChunkToAstSpan('035b367e-40d3-45a1-8ff7-fa986646b31c', [
    { tree_node_id: 'node-single', qualified_symbol: 'Phase 10B', start_byte: 0, end_byte: 38 }
  ]);
  assert.equal(single.tree_node_id, 'node-single');
});

test('AST-LINEAGE-PROOF-01: Null packet byte spans cannot authorize AST span equivalence', () => {
  function verifySpanEquivalence(packet, astNode) {
    if (packet.byte_start === null || packet.byte_end === null) {
      throw new Error('MISSING_PACKET_BYTE_SPAN: packet byte_start/byte_end are null; cannot prove AST node corresponds to embedded chunk text');
    }
    if (Number(packet.byte_start) !== Number(astNode.start_byte) || Number(packet.byte_end) !== Number(astNode.end_byte)) {
      throw new Error(`SPAN_MISMATCH: packet [${packet.byte_start}, ${packet.byte_end}] != AST [${astNode.start_byte}, ${astNode.end_byte}]`);
    }
    return true;
  }

  // Historical packets with null byte spans fail closed
  assert.throws(() => {
    verifySpanEquivalence(
      { packet_key: 'packet:539e9674de60', byte_start: null, byte_end: null },
      { start_byte: 0, end_byte: 38 }
    );
  }, /MISSING_PACKET_BYTE_SPAN/);
});

test('AST-LINEAGE-PROOF-01: Batch tag qdrant-backfill-v1 is rejected as model revision digest', () => {
  function validateModelRevisionDigest(versionLabel) {
    if (!versionLabel) throw new Error('MISSING_MODEL_VERSION');
    if (versionLabel === 'qdrant-backfill-v1') {
      throw new Error('INGESTION_BATCH_TAG_NOT_MODEL_DIGEST: qdrant-backfill-v1 is an ingestion batch label, not an immutable model digest');
    }
    const isSha256 = /^[0-9a-f]{64}$/i.test(versionLabel.replace(/^sha256:/i, ''));
    if (!isSha256) {
      throw new Error(`INVALID_MODEL_DIGEST: ${versionLabel} is not an immutable SHA-256 model digest`);
    }
    return true;
  }

  assert.throws(() => {
    validateModelRevisionDigest('qdrant-backfill-v1');
  }, /INGESTION_BATCH_TAG_NOT_MODEL_DIGEST/);

  assert.throws(() => {
    validateModelRevisionDigest('embeddinggemma:latest');
  }, /INVALID_MODEL_DIGEST/);

  assert.equal(validateModelRevisionDigest('82f094e4c0e19bc4208c692996d4f1ecf14e82a8dee579ee1d2ca1175260058e'), true);
});

test('AST-LINEAGE-PROOF-01: Table-specific column separation between atlas_ast_nodes and phase89_ast_signatures', () => {
  const SCHEMA_COLUMNS = {
    atlas_ast_nodes: ['relative_path', 'source_ref_key', 'tree_node_id', 'start_byte', 'end_byte', 'source_revision', 'source_content_hash', 'workspace_id', 'superseded_by'],
    phase89_ast_signatures: ['file_path', 'signature', 'node_type'],
    codebase_chunk_index: ['source_ref', 'chunk_id', 'repo_id', 'content_embedding_768', 'content_embedding', 'latent_128', 'latent_256', 'latent_64']
  };

  function validateTableColumnAccess(tableName, requestedColumn) {
    const cols = SCHEMA_COLUMNS[tableName];
    if (!cols) throw new Error(`UNKNOWN_TABLE: ${tableName}`);
    if (!cols.includes(requestedColumn)) {
      throw new Error(`SCHEMA_COLUMN_MISMATCH: Column '${requestedColumn}' does not exist on table '${tableName}'. Did you mean one of: ${cols.slice(0, 3).join(', ')}?`);
    }
    return true;
  }

  // atlas_ast_nodes uses relative_path, NOT file_path
  assert.equal(validateTableColumnAccess('atlas_ast_nodes', 'relative_path'), true);
  assert.throws(() => {
    validateTableColumnAccess('atlas_ast_nodes', 'file_path');
  }, /SCHEMA_COLUMN_MISMATCH.*atlas_ast_nodes/);

  // phase89_ast_signatures uses file_path, NOT relative_path
  assert.equal(validateTableColumnAccess('phase89_ast_signatures', 'file_path'), true);
  assert.throws(() => {
    validateTableColumnAccess('phase89_ast_signatures', 'relative_path');
  }, /SCHEMA_COLUMN_MISMATCH.*phase89_ast_signatures/);

  // codebase_chunk_index uses source_ref, NOT file_path or relative_path
  assert.equal(validateTableColumnAccess('codebase_chunk_index', 'source_ref'), true);
  assert.throws(() => {
    validateTableColumnAccess('codebase_chunk_index', 'file_path');
  }, /SCHEMA_COLUMN_MISMATCH.*codebase_chunk_index/);
});

test('AST-LINEAGE-PROOF-01: Rejection of superseded AST nodes', () => {
  function filterEligibleAstCandidates(nodes) {
    return nodes.filter(node => {
      if (node.superseded_by !== null && node.superseded_by !== undefined) {
        return false;
      }
      if (node.start_byte < 0 || node.end_byte <= node.start_byte) {
        return false;
      }
      if (!node.source_revision || !node.source_content_hash) {
        return false;
      }
      return true;
    });
  }

  const nodes = [
    { id: 1, superseded_by: null, start_byte: 10, end_byte: 50, source_revision: 'rev-1', source_content_hash: 'hash-1' },
    { id: 2, superseded_by: 'node-replacement-99', start_byte: 10, end_byte: 50, source_revision: 'rev-1', source_content_hash: 'hash-1' },
    { id: 3, superseded_by: null, start_byte: 60, end_byte: 40, source_revision: 'rev-1', source_content_hash: 'hash-1' }, // invalid span
    { id: 4, superseded_by: null, start_byte: 70, end_byte: 90, source_revision: '', source_content_hash: 'hash-1' } // missing rev
  ];

  const eligible = filterEligibleAstCandidates(nodes);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 1);
});

test('AST-LINEAGE-PROOF-01: Checkpoint revision label vs digest mismatch detection', () => {
  function verifyCheckpointRevisionBinding(label, actualDigest) {
    if (!label) throw new Error('MISSING_CHECKPOINT_REVISION');
    if (!actualDigest) throw new Error('MISSING_ACTUAL_DIGEST');

    // Reject informal labels without digest proof
    if (['v1', 'v2', 'v3', 'test', 'dev', 'latest'].includes(label.toLowerCase())) {
      throw new Error(`INFORMAL_REVISION_LABEL_REJECTED: '${label}' is a non-reproducible label, not a cryptographic checkpoint digest`);
    }

    const cleanLabel = label.replace(/^sha256:/i, '').toLowerCase();
    const cleanDigest = actualDigest.replace(/^sha256:/i, '').toLowerCase();

    if (cleanLabel !== cleanDigest) {
      throw new Error(`CHECKPOINT_DIGEST_MISMATCH: label '${label}' != actual checkpoint digest '${actualDigest}'`);
    }
    return true;
  }

  // Informal labels rejected
  assert.throws(() => verifyCheckpointRevisionBinding('v3', 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259'), /INFORMAL_REVISION_LABEL_REJECTED/);

  // Mismatch rejected
  assert.throws(() => verifyCheckpointRevisionBinding('d6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259', 'ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5'), /CHECKPOINT_DIGEST_MISMATCH/);

  // Matching sha256 succeeds
  assert.equal(
    verifyCheckpointRevisionBinding('d6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259', 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259'),
    true
  );
});

test('AST-LINEAGE-PROOF-01: Unsafe latent apply writers are blocked and exit 78', () => {
  const res128 = spawnSync(
    process.execPath,
    ['scripts/atlas/backfill-latent-128-slice.mjs', '--apply'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(res128.status, 78, `backfill-latent-128-slice must exit 78, got ${res128.status}`);
  assert.match(res128.stderr, /LATENT_128_APPLY_BLOCKED/);

  const res64 = spawnSync(
    process.execPath,
    ['scripts/atlas/latent64-sample-backfill.mjs', '--apply'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(res64.status, 78, `latent64-sample-backfill must exit 78, got ${res64.status}`);
  assert.match(res64.stderr, /LATENT64_APPLY_BLOCKED/);
});

