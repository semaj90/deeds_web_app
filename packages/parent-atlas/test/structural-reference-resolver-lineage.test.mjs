import test from 'node:test';
import assert from 'node:assert/strict';
import { createStructuralReferenceResolver } from '../dist/core/structural-reference-resolver.js';
import { structuralReferenceFactSchema } from '../dist/core/structural-symbol.js';

test('persists exact source/workspace and extractor lineage with structural references', async () => {
  const writes = [];
  const versionLookups = [];
  const pool = {
    async query(sql, values) {
      if (sql.includes('FROM atlas_symbol_versions')) {
        versionLookups.push({ sql, values });
        const lineageMatches = values[1] === `sha256:${'a'.repeat(64)}`
          && values[2] === `sha256:${'b'.repeat(64)}`
          && values[3] === 'src/route.ts';
        return {
          rows: lineageMatches
            ? [{ stable_symbol_id: values[0] === 'node-source' ? 'symbol-source' : 'symbol-target' }]
            : [],
        };
      }
      writes.push({ sql, values });
      return { rows: [] };
    },
  };
  const fact = {
    schema: 'atlas.structural-reference-fact.v1',
    reference_id: 'reference-call-1',
    reference_kind: 'call',
    source_ref: 'src/route.ts',
    source_revision: `sha256:${'a'.repeat(64)}`,
    workspace_revision: `sha256:${'b'.repeat(64)}`,
    upstream_source_node_id: 'node-source',
    upstream_target_node_id: 'node-target',
    upstream_chunk_id: 'chunk-source',
    target_text: 'authorizeCase',
    resolution_status: 'unresolved',
    captures: { call_name: 'authorizeCase' },
    evidence_refs: ['span:reference-call-1'],
    extractor: 'treesitter_chunker',
    extractor_revision: `sha256:${'c'.repeat(64)}`,
  };

  const resolved = await createStructuralReferenceResolver(pool).resolve({
    fact,
    producer_revision: `sha256:${'d'.repeat(64)}`,
    persist: true,
  });

  assert.equal(resolved.status, 'canonical');
  assert.equal(resolved.source_ref, fact.source_ref);
  assert.equal(resolved.workspace_revision, fact.workspace_revision);
  assert.equal(versionLookups.length, 2);
  for (const lookup of versionLookups) {
    assert.match(lookup.sql, /source_revision = \$2 AND workspace_revision = \$3 AND source_ref = \$4/);
    assert.equal(lookup.values[1], fact.source_revision);
    assert.equal(lookup.values[2], fact.workspace_revision);
    assert.equal(lookup.values[3], fact.source_ref);
  }
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /workspace_revision/);
  assert.equal(writes[0].values[1], fact.source_ref);
  assert.equal(writes[0].values[2], fact.workspace_revision);
  assert.equal(writes[0].values[14], fact.source_revision);
  assert.equal(writes[0].values[4], fact.source_revision);
  assert.deepEqual(JSON.parse(writes[0].values[17]), fact.captures);
  assert.equal(writes[0].values[18], fact.extractor);
  assert.equal(writes[0].values[19], fact.extractor_revision);
});

test('cross-file target resolution uses its own bound source path and revision', async () => {
  const lookups = [];
  const writes = [];
  const sourceRevision = `sha256:${'a'.repeat(64)}`;
  const targetRevision = `sha256:${'e'.repeat(64)}`;
  const workspaceRevision = `sha256:${'b'.repeat(64)}`;
  const pool = {
    async query(sql, values) {
      if (sql.includes('FROM atlas_symbol_versions')) {
        lookups.push({ sql, values });
        const sourceMatches = values[0] === 'node-source'
          && values[1] === sourceRevision
          && values[2] === workspaceRevision
          && values[3] === 'src/route.ts';
        const targetMatches = values[0] === 'node-target'
          && values[1] === targetRevision
          && values[2] === workspaceRevision
          && values[3] === 'src/auth.ts';
        return {
          rows: sourceMatches
            ? [{ stable_symbol_id: 'symbol-source' }]
            : targetMatches
              ? [{ stable_symbol_id: 'symbol-target' }]
              : [],
        };
      }
      writes.push({ sql, values });
      return { rows: [] };
    },
  };
  const fact = {
    schema: 'atlas.structural-reference-fact.v1',
    reference_id: 'reference-cross-file-call',
    reference_kind: 'call',
    source_ref: 'src/route.ts',
    source_revision: sourceRevision,
    target_source_ref: 'src/auth.ts',
    target_source_revision: targetRevision,
    workspace_revision: workspaceRevision,
    upstream_source_node_id: 'node-source',
    upstream_target_node_id: 'node-target',
    upstream_chunk_id: 'chunk-source',
    target_text: 'authorizeCase',
    resolution_status: 'unresolved',
    captures: {},
    evidence_refs: ['span:cross-file-call'],
    extractor: 'treesitter_chunker',
    extractor_revision: `sha256:${'c'.repeat(64)}`,
  };

  const resolved = await createStructuralReferenceResolver(pool).resolve({
    fact,
    producer_revision: `sha256:${'d'.repeat(64)}`,
    persist: true,
  });

  assert.equal(resolved.status, 'canonical');
  assert.deepEqual(lookups.map(({ values }) => values), [
    ['node-source', sourceRevision, workspaceRevision, 'src/route.ts'],
    ['node-target', targetRevision, workspaceRevision, 'src/auth.ts'],
  ]);
  assert.equal(writes[0].values[3], 'src/auth.ts');
  assert.equal(writes[0].values[4], targetRevision);
});

test('partial target lineage is rejected by the shared fact contract', () => {
  const partial = {
    schema: 'atlas.structural-reference-fact.v1',
    reference_id: 'reference-partial-target-lineage',
    reference_kind: 'call',
    source_ref: 'src/route.ts',
    source_revision: `sha256:${'a'.repeat(64)}`,
    target_source_ref: 'src/auth.ts',
    workspace_revision: `sha256:${'b'.repeat(64)}`,
    upstream_source_node_id: 'node-source',
    upstream_chunk_id: 'chunk-source',
    target_text: 'authorizeCase',
    resolution_status: 'unresolved',
    captures: {},
    evidence_refs: [],
    extractor: 'treesitter_chunker',
    extractor_revision: `sha256:${'c'.repeat(64)}`,
  };

  const result = structuralReferenceFactSchema.safeParse(partial);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.message === 'TARGET_SOURCE_REF_AND_REVISION_MUST_BE_PROVIDED_TOGETHER'));
  }
});

test('stale source or workspace revision cannot resolve or persist canonical references', async () => {
  const lookups = [];
  const writes = [];
  const pool = {
    async query(sql, values) {
      if (sql.includes('FROM atlas_symbol_versions')) {
        lookups.push({ sql, values });
        return { rows: [] };
      }
      if (sql.includes('FROM atlas_symbol_aliases') || sql.includes('FROM atlas_symbol_registry')) {
        return { rows: [] };
      }
      writes.push({ sql, values });
      return { rows: [] };
    },
  };
  const fact = {
    schema: 'atlas.structural-reference-fact.v1',
    reference_id: 'reference-stale-lineage',
    reference_kind: 'call',
    source_ref: 'src/route.ts',
    source_revision: `sha256:${'a'.repeat(64)}`,
    workspace_revision: `sha256:${'b'.repeat(64)}`,
    upstream_source_node_id: 'node-source',
    upstream_target_node_id: 'node-target',
    upstream_chunk_id: 'chunk-source',
    target_text: 'authorizeCase',
    resolution_status: 'unresolved',
    captures: {},
    evidence_refs: [],
    extractor: 'treesitter_chunker',
    extractor_revision: `sha256:${'c'.repeat(64)}`,
  };

  const resolved = await createStructuralReferenceResolver(pool).resolve({
    fact: { ...fact, workspace_revision: `sha256:${'e'.repeat(64)}` },
    producer_revision: `sha256:${'d'.repeat(64)}`,
    persist: true,
  });

  assert.equal(lookups.length, 2);
  assert.ok(lookups.every(({ values }) => values[2] === `sha256:${'e'.repeat(64)}`));
  assert.equal(resolved.status, 'unresolved');
  assert.equal(resolved.source_stable_symbol_id, null);
  assert.equal(resolved.target_stable_symbol_id, null);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values[12], 'unresolved');
});

test('resolution is read-only by default', async () => {
  const writes = [];
  const pool = {
    async query(sql) {
      if (sql.includes('FROM atlas_symbol_versions') || sql.includes('FROM atlas_symbol_aliases') || sql.includes('FROM atlas_symbol_registry')) {
        return { rows: [] };
      }
      writes.push(sql);
      return { rows: [] };
    },
  };
  const fact = {
    schema: 'atlas.structural-reference-fact.v1',
    reference_id: 'reference-read-only-default',
    reference_kind: 'call',
    source_ref: 'src/route.ts',
    source_revision: `sha256:${'a'.repeat(64)}`,
    workspace_revision: `sha256:${'b'.repeat(64)}`,
    upstream_source_node_id: 'node-source',
    upstream_target_node_id: 'node-target',
    upstream_chunk_id: 'chunk-source',
    target_text: 'authorizeCase',
    resolution_status: 'unresolved',
    captures: {},
    evidence_refs: [],
    extractor: 'treesitter_chunker',
    extractor_revision: `sha256:${'c'.repeat(64)}`,
  };
  await createStructuralReferenceResolver(pool).resolve({ fact, producer_revision: `sha256:${'d'.repeat(64)}` });
  assert.deepEqual(writes, []);
});

test('alias-only target match stays degraded rather than becoming canonical', async () => {
  const pool = {
    async query(sql, values) {
      if (sql.includes('FROM atlas_symbol_versions')) {
        return { rows: values[0] === 'node-source' ? [{ stable_symbol_id: 'symbol-source' }] : [] };
      }
      if (sql.includes('FROM atlas_symbol_aliases')) return { rows: [{ stable_symbol_id: 'symbol-target' }] };
      if (sql.includes('FROM atlas_symbol_registry')) return { rows: [] };
      throw new Error(`UNEXPECTED_QUERY:${sql}`);
    },
  };
  const fact = {
    schema: 'atlas.structural-reference-fact.v1',
    reference_id: 'reference-call-alias-only',
    reference_kind: 'call',
    source_ref: 'src/route.ts',
    source_revision: `sha256:${'a'.repeat(64)}`,
    workspace_revision: `sha256:${'b'.repeat(64)}`,
    upstream_source_node_id: 'node-source',
    upstream_target_node_id: 'node-target-not-versioned',
    upstream_chunk_id: 'chunk-source',
    target_text: 'authorizeCase',
    resolution_status: 'unresolved',
    captures: {},
    evidence_refs: [],
    extractor: 'treesitter_chunker',
    extractor_revision: `sha256:${'c'.repeat(64)}`,
  };

  const resolved = await createStructuralReferenceResolver(pool).resolve({
    fact,
    producer_revision: `sha256:${'d'.repeat(64)}`,
    persist: false,
  });

  assert.equal(resolved.source_stable_symbol_id, 'symbol-source');
  assert.equal(resolved.target_stable_symbol_id, 'symbol-target');
  assert.equal(resolved.resolution_basis, 'qualified_name_alias');
  assert.equal(resolved.status, 'degraded');
});
