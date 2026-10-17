import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  assertReadOnlySqlV1,
  buildPg18IndexedFileLineageQueriesV1,
  normalizeCanonicalPathV1,
  qualifyIndexedPg18PacketCohortV1,
  runAstGrepIndexedSubHelperV1,
  runLspIndexedSymbolCrosswalkSubHelperV1,
  runNlpIndexedExtractionSubHelperV1,
  runTreeSitterIndexedSubHelperV1,
} from './pg18-indexed-file-subhelpers-v1.mjs';

const sha = (s) => `sha256:${crypto.createHash('sha256').update(s).digest('hex')}`;

test('buildPg18IndexedFileLineageQueriesV1 joins atlas_ast_nodes on relative_path instead of fragment source_ref_key', () => {
  const queries = buildPg18IndexedFileLineageQueriesV1();
  assert.match(queries.astFileAndSpanJoin, /WHERE relative_path = ANY\(\$1::text\[\]\)/);
  assert.doesNotMatch(queries.astFileAndSpanJoin, /WHERE source_ref_key = ANY/);
  assert.match(queries.graphifySymbolSpanJoin, /FROM graphify_files gf[\s\S]*JOIN graphify_symbols gs/);
  assert.match(queries.representationRegistryJoin, /FROM atlas_representations/);
  assert.throws(() => assertReadOnlySqlV1('UPDATE atlas_packets SET latent_64 = NULL'), /PG18_SUBHELPER_MUTATION_BLOCKED/);
});

test('normalizeCanonicalPathV1 rejects fragment locators and path traversal', () => {
  assert.equal(normalizeCanonicalPathV1('./sveltekit-frontend\\src\\hooks.server.ts'), 'sveltekit-frontend/src/hooks.server.ts');
  assert.throws(() => normalizeCanonicalPathV1('src/foo.ts#bar@0:10'), /PG18_SUBHELPER_INVALID_FILE_PATH/);
  assert.throws(() => normalizeCanonicalPathV1('../secret.ts'), /PG18_SUBHELPER_INVALID_FILE_PATH/);
});

test('qualifyIndexedPg18PacketCohortV1 reconciles LAT_AUDIT6, LAT_AUDIT7, LAT_AUDIT8, and LAT_AUDIT10 joins', () => {
  const rev = sha('export function handle() { return 1; }');
  const wsRev = sha('workspace-head-v1');
  const latentBuf = Buffer.alloc(256, 1);

  const summary = qualifyIndexedPg18PacketCohortV1({
    packets: [
      {
        packet_id: 'pkt-1',
        packet_key: 'pkt:hooks',
        canonical_source_ref: 'sveltekit-frontend/src/hooks.server.ts',
        source_revision: rev,
        byte_start: 0,
        byte_end: 38,
        latent_64: latentBuf,
      },
    ],
    sourceBindings: [
      {
        canonical_source_ref: 'sveltekit-frontend/src/hooks.server.ts',
        source_revision: rev,
        workspace_revision: wsRev,
        file_id: 'file-1',
        parse_status: 'PROCESSED',
      },
    ],
    astNodes: [
      {
        relative_path: 'sveltekit-frontend/src/hooks.server.ts',
        source_ref_key: 'sveltekit-frontend/src/hooks.server.ts#handle@0:38',
        tree_node_id: 'ast-hash-1',
        node_kind: 'function',
        qualified_symbol: 'handle',
        source_revision: rev,
        start_byte: 0,
        end_byte: 38,
      },
    ],
    graphifySymbols: [
      {
        source_ref: 'sveltekit-frontend/src/hooks.server.ts',
        source_revision: rev,
        symbol_id: 'sym-1',
        file_id: 'file-1',
        stable_symbol_key: 'symkey-handle',
        name: 'handle',
        kind: 'function',
        start_byte: 0,
        end_byte: 38,
      },
    ],
    representations: [
      {
        representation_id: 'latent_64',
        verification_status: 'STATIC_VERIFIED',
        artifact_digest: sha('autoencoder-weights'),
      },
    ],
  });

  assert.equal(summary.canonicalAuthority, false);
  assert.equal(summary.writesPerformed, false);
  assert.equal(summary.sourceVersionJoinedCount, 1);
  assert.equal(summary.astSpanJoinedCount, 1);
  assert.equal(summary.symbolSpanJoinedCount, 1);
  assert.equal(summary.representationJoinedCount, 1);
  assert.equal(summary.results[0].status, 'QUALIFIED');
});

test('Tree-sitter, ast-grep, LSP, and NLP sub-helpers enforce source revision and non-authoritative outputs', () => {
  const sourceText = 'export function verifyToken(token: string) { return token.length > 0; }\n';
  const sourceRev = sha(sourceText);
  const wsRev = sha('ws-rev');
  const fileRow = {
    file_id: 'file-ts-1',
    source_ref: 'sveltekit-frontend/src/lib/auth.ts',
    source_revision: sourceRev,
    workspace_revision: wsRev,
  };

  // 1. Tree-sitter CST sub-helper
  const tsObs = runTreeSitterIndexedSubHelperV1({
    fileRow,
    sidecarResponse: {
      schema: 'atlas.ast.evidence.v1',
      engine: 'treesitter-chunker',
      engine_version: '1.0.0',
      language: 'typescript',
      syntax_status: 'CLEAN',
      chunks: [
        {
          kind: 'function_declaration',
          name: 'verifyToken',
          start_byte: 0,
          end_byte: 71,
          start_line: 1,
          end_line: 1,
          calls: [],
          imports: [],
          exports: ['verifyToken'],
        },
      ],
      edges: [],
    },
  });
  assert.equal(tsObs.canonicalAuthority, false);
  assert.equal(tsObs.writesPerformed, false);
  assert.equal(tsObs.chunks.length, 1);
  assert.equal(tsObs.chunks[0].name, 'verifyToken');

  // 2. ast-grep sub-helper (plus .svelte skip invariant)
  const sgObs = runAstGrepIndexedSubHelperV1({
    fileRow,
    matches: [
      {
        ruleId: 'exported-fn',
        byteStart: 0,
        byteEnd: 71,
        text: sourceText.slice(0, 71),
        captures: { name: 'verifyToken', syntax_kind: 'function_declaration' },
      },
    ],
  });
  assert.equal(sgObs.status, 'OK');
  assert.equal(sgObs.observations.length, 1);
  assert.equal(sgObs.canonicalAuthority, false);

  const svelteSkip = runAstGrepIndexedSubHelperV1({
    fileRow: { ...fileRow, source_ref: 'sveltekit-frontend/src/routes/+page.svelte' },
    matches: [{ byteStart: 0, byteEnd: 10, text: '<script>' }],
  });
  assert.equal(svelteSkip.status, 'SKIPPED_SVELTE_DOM_SPLITTER_AUTHORITY');
  assert.equal(svelteSkip.observations.length, 0);

  // 3. LSP symbol crosswalk sub-helper
  const lspCrosswalk = runLspIndexedSymbolCrosswalkSubHelperV1({
    packetKey: 'pkt:auth',
    sourceRef: fileRow.source_ref,
    sourceRevision: sourceRev,
    workspaceRevision: wsRev,
    lspObservations: [{ observation: sgObs.observations[0] }],
    canonicalSymbols: [
      {
        packetKey: 'pkt:auth',
        sourceRef: fileRow.source_ref,
        sourceRevision: sourceRev,
        workspaceRevision: wsRev,
        symbolVersionId: 'symver-1',
        stableSymbolId: 'stablesym-1',
        qualifiedName: 'auth::verifyToken',
        registryStatus: 'active',
        byteStart: 0,
        byteEnd: 71,
      },
    ],
  });
  assert.equal(lspCrosswalk.exactCanonicalSymbolCoverage, true);
  assert.equal(lspCrosswalk.matches.length, 1);
  assert.equal(lspCrosswalk.canonicalAuthority, false);

  // 4. NLP grounded span extraction sub-helper
  const modDigest1 = sha('mod1');
  const modDigest2 = sha('mod2');
  const nlpObs = runNlpIndexedExtractionSubHelperV1({
    fileRow,
    sourceBytes: Buffer.from(sourceText, 'utf8'),
    sidecarHealth: {
      runtimeSourceBindings: {
        modules: {
          miniforge_nlp_sidecar_v2: modDigest1,
          miniforge_nlp_sidecar: modDigest2,
        },
        groundedExtractionAdapter: {
          acceptsSpanDiagnostics: true,
          acceptsExecutionReceipt: true,
        },
      },
    },
    expectedModuleDigests: {
      miniforge_nlp_sidecar_v2: modDigest1,
      miniforge_nlp_sidecar: modDigest2,
    },
    proposedSpans: [{ label: 'function_identifier', startByte: 16, endByte: 27 }],
  });
  assert.equal(nlpObs.status, 'GROUNDED_OK');
  assert.equal(nlpObs.groundedSpans.length, 1);
  assert.equal(nlpObs.groundedSpans[0].spanDigest, sha('verifyToken'));
  assert.equal(nlpObs.canonicalAuthority, false);
});
