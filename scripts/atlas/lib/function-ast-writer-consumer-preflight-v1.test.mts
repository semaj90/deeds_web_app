import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { probeFunctionAstWriterConsumerV1 } from './function-ast-writer-consumer-preflight-v1.mts';

function fixture(sourceRef = 'src/resolve.ts') {
  const sourceBytes = Buffer.from('export function resolve() { return true; }');
  const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  const symbol = {
    symbolVersionId: 'symbol-version:fixture', stableSymbolId: 'stable-symbol:fixture',
    sourceRef, sourceRevision, workspaceRevision: `sha256:${'a'.repeat(64)}`,
    qualifiedName: 'resolve', upstreamNodeId: 'native-node', signatureNormalized: null,
    producerRevision: 'fixture', packetKey: 'packet:fixture', byteStart: 0, byteEnd: sourceBytes.byteLength,
  };
  return {
    sourceBytes, symbol,
    binding: { repoId: 'deeds-web-app', astRepoId: '01a13137-1378-7df9-9968-53738dbf0e48',
      canonicalSourceRef: sourceRef, sourceRevision, workspaceRevision: symbol.workspaceRevision, contentDigest: sourceRevision },
    writerInput: { sourceRef, parserLanguage: 'typescript', parserName: 'tree-sitter', parserVersion: 'fixture',
      workspaceId: 'fixture-workspace', sourceRevision,
      nodes: [{ kind: 'function', qualifiedSymbol: 'resolve', startByte: 0, endByte: sourceBytes.byteLength,
        startLine: 1, endLine: 1, sourceContentDigest: sourceRevision, parentIndex: null }] },
  };
}

test('captures actual writer and reader contracts without a database connection or inserted row', async () => {
  const result = await probeFunctionAstWriterConsumerV1(fixture());
  assert.equal(result.lookupCompatible, true);
  assert.equal(result.signaturePresent, false);
  assert.equal(result.signatureCompatible, false);
  assert.equal(result.statementsCaptured, 1);
  assert.equal(result.rowsInserted, 0);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.eligibleForApply, false);
  assert.equal(result.contextManifestAdmitted, false);
  assert.equal(JSON.stringify(result).includes('return true'), false);
});

test('matches the existing stored paths without changing writer identity or stripping the frontend root', async () => {
  for (const sourceRef of ['sveltekit-frontend/src/resolve.ts', 'src/Resolve.ts']) {
    const result = await probeFunctionAstWriterConsumerV1(fixture(sourceRef));
    assert.equal(result.lookupFields.relative_path, true);
    assert.equal(result.lookupCompatible, true);
    assert.equal(result.storedRelativePath, sourceRef.toLowerCase());
    assert.equal(result.lookupFields.source_content_hash, true);
    assert.equal(result.lookupFields.repo_id, true);
  }
});

test('rejects altered source, missing repository identity, and unrelated declarations', async () => {
  const changed = fixture();
  changed.sourceBytes[0] = 120;
  await assert.rejects(probeFunctionAstWriterConsumerV1(changed), /AST_PREFLIGHT_SOURCE_BINDING_MISMATCH/);
  const missingRepo = fixture();
  missingRepo.binding.astRepoId = '';
  await assert.rejects(probeFunctionAstWriterConsumerV1(missingRepo), /REPOSITORY_IDENTITY_INVALID/);
  const wrongSpan = fixture();
  wrongSpan.writerInput.nodes[0].endByte--;
  await assert.rejects(probeFunctionAstWriterConsumerV1(wrongSpan), /AST_PREFLIGHT_DECLARATION_MISMATCH/);
});

test('rejects stale workspace bindings and more than one declaration', async () => {
  const stale = fixture();
  stale.binding.workspaceRevision = `sha256:${'b'.repeat(64)}`;
  await assert.rejects(probeFunctionAstWriterConsumerV1(stale), /AST_PREFLIGHT_SOURCE_BINDING_MISMATCH/);
  const ambiguous = fixture();
  ambiguous.writerInput.nodes.push({ ...ambiguous.writerInput.nodes[0] });
  await assert.rejects(probeFunctionAstWriterConsumerV1(ambiguous), /AST_PREFLIGHT_EXPECTED_ONE_DECLARATION/);
});
