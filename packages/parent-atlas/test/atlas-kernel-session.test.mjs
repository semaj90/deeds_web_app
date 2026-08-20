import test from 'node:test';
import assert from 'node:assert/strict';

import {
  atlasKernelHostRequestSchema,
  atlasKernelSessionSchema,
  buildDefaultAtlasAnalyzerCapabilities,
} from '../dist/core/atlas-kernel-session.js';

const sha = 'a'.repeat(64);

function session(overrides = {}) {
  return atlasKernelSessionSchema.parse({
    session_id: 'kernel:1',
    session_revision: 'kernel-r1',
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'source-r1',
    ace_graph_id: 'graph:1',
    ace_graph_revision: 'graph-r1',
    state: 'READY',
    host_authority: 'TYPESCRIPT',
    kernel_language: 'PYTHON',
    persistent_namespace: true,
    canonical_writes_allowed: false,
    allow_gil_reenable: false,
    python_runtime: {
      executable: '/usr/bin/python',
      version: '3.14.0',
      implementation: 'CPython',
      abi_flags: '',
      python_abi: 'cpython-314-x86_64-linux-gnu',
      free_threaded_build: false,
      gil_enabled: true,
      ipykernel_version: '7.0.0',
    },
    transport: {
      protocol: 'JUPYTER_ZMQ',
      signature_scheme: 'HMAC_SHA256',
      channels: ['shell', 'iopub', 'control'],
      execute_serialized: true,
      connection_secret_host_owned: true,
    },
    capabilities: buildDefaultAtlasAnalyzerCapabilities('cap-r1'),
    artifacts: [{
      artifact_id: 'semantic:1',
      artifact_revision: 'semantic-r1',
      role: 'SEMANTIC_SNAPSHOT',
      content_format: 'ARROW_IPC_FILE',
      access_mode: 'MMAP_READONLY',
      storage_ref: '/snapshots/semantic.arrow',
      byte_length: 4096,
      content_checksum_sha256: sha,
      row_identity_checksum: sha,
      source_snapshot_revision: 'source-r1',
      canonical_authority: false,
      metadata: {},
    }],
    producer_revision: 'parent-atlas-test-r1',
    ...overrides,
  });
}

test('default analyzer ownership keeps ts-morph in TypeScript and proof engines out of process', () => {
  const capabilities = buildDefaultAtlasAnalyzerCapabilities('cap-r1');
  const byId = new Map(capabilities.map((item) => [item.analyzer_id, item]));

  assert.equal(byId.get('TS_MORPH').owner_runtime, 'TYPESCRIPT_HOST');
  assert.deepEqual(byId.get('TS_MORPH').implementation_languages, ['TYPESCRIPT']);
  assert.equal(byId.get('AST_GREP').implementation_languages.includes('RUST'), true);
  assert.equal(byId.get('TREESITTER_CHUNKER').invocation_surfaces.includes('PYTHON_IMPORT'), true);
  assert.equal(byId.get('CODEQL').owner_runtime, 'EXTERNAL_PROCESS');
  assert.equal(byId.get('SOUFFLE').owner_runtime, 'EXTERNAL_PROCESS');
  assert.equal(byId.get('CUSPARSE').owner_runtime, 'NATIVE_LIBRARY');
  assert.ok(capabilities.every((item) => item.canonical_authority === false));
});

test('kernel session never receives canonical write authority', () => {
  const parsed = session();
  assert.equal(parsed.host_authority, 'TYPESCRIPT');
  assert.equal(parsed.kernel_language, 'PYTHON');
  assert.equal(parsed.persistent_namespace, true);
  assert.equal(parsed.canonical_writes_allowed, false);
});

test('patch proposal requires verified claim receipts and remains proposal-only', () => {
  assert.throws(() => atlasKernelHostRequestSchema.parse({
    request_id: 'request:patch',
    session_id: 'kernel:1',
    session_revision: 'kernel-r1',
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'source-r1',
    ace_graph_id: 'graph:1',
    ace_graph_revision: 'graph-r1',
    kind: 'PROPOSE_PATCH',
    analyzer_id: null,
    input_artifact_ids: ['semantic:1'],
    canonical_ids: ['symbol:a'],
    evidence_refs: ['evidence:ast'],
    claim_verification_receipt_ids: [],
    deterministic_required: true,
    mutation_intent: 'PROPOSE_ONLY',
    payload: {},
    producer_revision: 'parent-atlas-test-r1',
  }), /verified-claim/);

  const request = atlasKernelHostRequestSchema.parse({
    request_id: 'request:patch',
    session_id: 'kernel:1',
    session_revision: 'kernel-r1',
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'source-r1',
    ace_graph_id: 'graph:1',
    ace_graph_revision: 'graph-r1',
    kind: 'PROPOSE_PATCH',
    analyzer_id: null,
    input_artifact_ids: ['semantic:1'],
    canonical_ids: ['symbol:a'],
    evidence_refs: ['evidence:ast'],
    claim_verification_receipt_ids: ['claim-receipt:1'],
    deterministic_required: true,
    mutation_intent: 'PROPOSE_ONLY',
    payload: {},
    producer_revision: 'parent-atlas-test-r1',
  });
  assert.equal(request.mutation_intent, 'PROPOSE_ONLY');
});

test('free-threaded session rejects an available extension known to re-enable the GIL unless explicitly admitted', () => {
  const capabilities = buildDefaultAtlasAnalyzerCapabilities('cap-r1');
  capabilities[0] = { ...capabilities[0], availability: 'AVAILABLE', free_threading_status: 'MAY_REENABLE_GIL' };

  assert.throws(() => session({
    python_runtime: {
      executable: '/usr/bin/python3.14t',
      version: '3.14.0',
      implementation: 'CPython',
      abi_flags: 't',
      python_abi: 'cpython-314t-x86_64-linux-gnu',
      free_threaded_build: true,
      gil_enabled: false,
      ipykernel_version: '7.0.0',
    },
    capabilities,
  }), /may re-enable the GIL/);
});
