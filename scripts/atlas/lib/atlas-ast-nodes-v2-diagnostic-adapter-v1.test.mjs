import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildAtlasAstNodesV2ProposalFromDiagnosticV1 } from './atlas-ast-nodes-v2-diagnostic-adapter-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const repoId = '01a13137-1378-7df9-9968-53738dbf0e48';

function diagnostic(sourceRef, text, structuralFacts, lspFacts) {
  const sourceBytes = Buffer.from(text, 'utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  return {
    sourceBytes,
    diagnosticReceipt: {
      schema: 'atlas.indexed-source-provider-diagnostic.v1',
      status: 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED',
      indexingOutcome: 'DRY_RUN_VALIDATED_NOT_INDEXED',
      source: { sourceRef, sourceRevision, workspaceRevision, byteLength: sourceBytes.length, exactByteSha256: sourceRevision },
      providers: {
        treeSitterAndAstGrep: { status: 'COMPLETED', result: { status: 'OBSERVED', facts: [] } },
        svelteCompilerAndEmbeddedTypeScript: { status: 'COMPLETED', result: { status: 'OBSERVED', symbolFacts: structuralFacts } },
        lsp: { status: 'COMPLETED', result: { status: 'OBSERVED', symbolFacts: lspFacts } },
      },
      canonicalAuthority: false,
      canonicalWritesAttempted: false,
      canonicalWritesCommitted: 0,
    },
    repoId,
    workspaceId: 'workspace-test',
    pathNamespace: 'FRONTEND_ROOT',
    relativePath: 'src/example.ts',
    parserName: 'diagnostic-adapter-test',
    parserVersion: '1',
    parserLanguage: sourceRef.endsWith('.svelte') ? 'svelte+typescript' : 'typescript',
    grammarVersion: 'test-grammar-1',
    extractionContractRevision: `sha256:${'e'.repeat(64)}`,
  };
}

test('converts exact TypeScript LSP spans into a dry-run V2 proposal', () => {
  const text = 'function run() {}';
  const startByte = Buffer.byteLength('');
  const input = diagnostic('src/example.ts', text, [], [{ name: 'run', kind: 12, parentName: null, byteStart: startByte, byteEnd: Buffer.byteLength(text) }]);
  const proposal = buildAtlasAstNodesV2ProposalFromDiagnosticV1(input);
  assert.equal(proposal.status, 'DRY_RUN_VALIDATED_NOT_INDEXED');
  assert.equal(proposal.nodes.length, 2);
  assert.equal(proposal.nodes[1].qualifiedSymbol, 'run');
  assert.equal(proposal.nodes[1].parentTreeNodeId, proposal.nodes[0].treeNodeId);
  assert.deepEqual(proposal.unresolved, { packetKey: true });
  assert.equal(proposal.writesPerformed, false);
});

test('maps supported Svelte script facts to original-file spans and excludes unsupported kinds', () => {
  const text = '<script lang="ts">\nfunction load() {}\n</script>';
  const start = Buffer.byteLength('<script lang="ts">\n');
  const end = Buffer.byteLength('<script lang="ts">\nfunction load() {}');
  const input = diagnostic('src/example.svelte', text, [
    { scriptContext: 'default', kind: 'FunctionDeclaration', symbol: 'load', byteStart: start, byteEnd: end },
    { scriptContext: 'default', kind: 'VariableStatement', symbol: 'state', byteStart: start, byteEnd: end },
  ], []);
  const proposal = buildAtlasAstNodesV2ProposalFromDiagnosticV1(input);
  assert.equal(proposal.nodes.length, 2);
  assert.equal(proposal.nodes[1].qualifiedSymbol, 'default:load');
  assert.equal(proposal.nodes[1].startByte, start);
  assert.deepEqual(proposal.unresolved, { packetKey: true });
  assert.equal(proposal.writesPerformed, false);
});

test('deduplicates repeated provider facts and assigns occurrences in span order', () => {
  const text = 'function run() {}\nfunction run() {}';
  const firstEnd = Buffer.byteLength('function run() {}');
  const secondStart = Buffer.byteLength('function run() {}\n');
  const input = diagnostic('src/example.ts', text, [], [
    { name: 'run', kind: 12, parentName: null, byteStart: secondStart, byteEnd: Buffer.byteLength(text) },
    { name: 'run', kind: 12, parentName: null, byteStart: 0, byteEnd: firstEnd },
    { name: 'run', kind: 12, parentName: null, byteStart: 0, byteEnd: firstEnd },
  ]);
  const proposal = buildAtlasAstNodesV2ProposalFromDiagnosticV1(input);
  assert.equal(proposal.nodes.length, 3);
  assert.deepEqual(proposal.nodes.slice(1).map(({ occurrence, startByte }) => [occurrence, startByte]), [[0, 0], [1, secondStart]]);
});

test('rejects partial providers and source-binding mismatches', () => {
  const text = 'function run() {}';
  const input = diagnostic('src/example.ts', text, [], []);
  input.diagnosticReceipt.providers.lsp.result.status = 'TIMEOUT';
  assert.throws(() => buildAtlasAstNodesV2ProposalFromDiagnosticV1(input), /PROVIDER_NOT_OBSERVED:lsp/);
  const stale = diagnostic('src/example.ts', text, [], []);
  stale.diagnosticReceipt.source.exactByteSha256 = `sha256:${'f'.repeat(64)}`;
  assert.throws(() => buildAtlasAstNodesV2ProposalFromDiagnosticV1(stale), /SOURCE_BINDING_INVALID/);
});
