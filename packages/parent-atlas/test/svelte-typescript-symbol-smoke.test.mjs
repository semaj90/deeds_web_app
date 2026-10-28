import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse } from 'svelte/compiler';
import { lspRangeToUtf8ByteRange } from '../dist/core/lsp-semantic-observation.js';
import { enrichLspTargetIdentityV1 } from '../dist/core/lsp-target-identity-enrichment-v1.js';
import { buildLabelFeatureV1, buildLabelProposalsV1 } from '../dist/core/label-feature-v1.js';
import { buildHydrationManifest, buildInstructionAtom, buildPrefillCacheEntry, compileInstructionSet, contextualFabricChecksum } from '../dist/core/contextual-prefill-fabric.js';
import { buildPrefillRuntimeIdentity, buildValkeyPrefillCacheRecord, verifyPrefillRecord } from '../dist/core/prefill-cache-runtime.js';
import { fixtureComponent, fixtureModuleSource } from './svelte-typescript-symbol-fixture.mjs';

const digest = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

test('Svelte script reference resolves to a revision-bound TypeScript symbol', () => {
  const component = fixtureComponent;
  const moduleSource = fixtureModuleSource;
  const componentPath = '/atlas-fixture/Component.svelte.ts';
  const modulePath = '/atlas-fixture/feature.ts';
  const svelteAst = parse(component, { modern: true });
  assert.ok(svelteAst.instance);
  const scriptStart = svelteAst.instance.content.start;
  const scriptEnd = svelteAst.instance.content.end;
  const virtualScript = component.slice(0, scriptStart).replace(/[^\r\n]/g, ' ') + component.slice(scriptStart, scriptEnd);
  const files = { [componentPath]: virtualScript, [modulePath]: moduleSource };
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10, noLib: true };
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => '1',
    getScriptSnapshot: (file) => files[file] === undefined ? undefined : ts.ScriptSnapshot.fromString(files[file]),
    getCurrentDirectory: () => '/atlas-fixture',
    getDefaultLibFileName: () => '',
    fileExists: (file) => file in files,
    readFile: (file) => files[file],
    readDirectory: () => [],
    directoryExists: () => true,
    getDirectories: () => [],
  };
  const service = ts.createLanguageService(host);
  try {
    const program = service.getProgram();
    const componentFile = program.getSourceFile(componentPath);
    const moduleFile = program.getSourceFile(modulePath);
    let call;
    function findCall(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'rank') call = node;
      ts.forEachChild(node, findCall);
    }
    findCall(componentFile);
    assert.ok(call);
    const callStart = call.expression.getStart(componentFile);
    const callEnd = call.expression.getEnd();
    const sourceRange = {
      start: ts.getLineAndCharacterOfPosition(componentFile, callStart),
      end: ts.getLineAndCharacterOfPosition(componentFile, callEnd),
    };
    const sourceBytes = Buffer.from(component, 'utf8');
    const sourceSpan = lspRangeToUtf8ByteRange(component, sourceRange, 'utf-16');
    assert.equal(sourceBytes.subarray(sourceSpan.byte_start, sourceSpan.byte_end).toString('utf8'), 'rank');

    const definitions = service.getDefinitionAtPosition(componentPath, callStart);
    assert.equal(definitions?.length, 1);
    const definition = definitions[0];
    assert.equal(definition.fileName, modulePath);
    assert.equal(definition.name, 'rank');
    const targetStart = ts.getLineAndCharacterOfPosition(moduleFile, definition.textSpan.start);
    const targetEnd = ts.getLineAndCharacterOfPosition(moduleFile, definition.textSpan.start + definition.textSpan.length);
    const expectedStartByte = Buffer.byteLength(moduleSource.slice(0, definition.textSpan.start), 'utf8');
    const expectedEndByte = expectedStartByte + Buffer.byteLength('rank', 'utf8');
    const targetRevision = digest(moduleSource);
    const workspaceRevision = digest(component + moduleSource);
    const result = enrichLspTargetIdentityV1({
      featureId: 'fixture:feature:rank', packetKey: 'fixture:packet:component', workspaceRevision,
      source: { sourceRef: 'src/Component.svelte', sourceRevision: digest(component) },
      target: { uri: 'file:///atlas-fixture/feature.ts', range: { startLine: targetStart.line, startCharacter: targetStart.character, endLine: targetEnd.line, endCharacter: targetEnd.character } },
      producer: { lspServerRevision: `typescript-compiler-api:${ts.version}`, projectRevision: 'fixture:project', resolverRevision: 'fixture:resolver', positionEncoding: 'utf-16' },
    }, {
      resolveSourceRef: () => 'src/feature.ts',
      lookupSourceRevision: () => ({ sourceRef: 'src/feature.ts', sourceRevision: targetRevision, sourceInventoryRevision: 'fixture:inventory', contentDigest: targetRevision, sourceText: moduleSource }),
      lookupSymbols: ({ startByte, endByte }) => {
        assert.equal(startByte, expectedStartByte);
        assert.equal(endByte, expectedEndByte);
        return [{ stableSymbolId: 'fixture:symbol:rank', symbolVersionId: 'fixture:symbol-version:rank', startByte, endByte, symbolRegistryRevision: 'fixture:registry' }];
      },
    });
    assert.equal(result.status, 'ENRICHED');
    assert.equal(result.resolution.canonicalAuthority, false);
    assert.equal(result.targetIdentity.targetSourceRevision, targetRevision);
    assert.deepEqual(result.targetIdentity.targetRange, { startByte: expectedStartByte, endByte: expectedEndByte });

    const featureInput = {
      sourceRef: result.targetIdentity.targetSourceRef,
      sourceRevision: result.targetIdentity.targetSourceRevision,
      workspaceRevision,
      sourceRole: 'code', language: 'typescript', keywordCounts: { rank: 1 },
      symbolCount: moduleFile.statements.filter(ts.isFunctionDeclaration).length,
      importCount: moduleFile.statements.filter(ts.isImportDeclaration).length,
      exportCount: moduleFile.statements.filter((statement) => (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0).length,
      taxonomyRevision: 'fixture:taxonomy', producerRevision: 'fixture:rank-rule', allowedDomains: ['retrieval'],
      evidence: [{ kind: 'RULE', label: 'retrieval', confidence: 1, sourceRevision: targetRevision, workspaceRevision,
        taxonomyRevision: 'fixture:taxonomy', producerRevision: 'fixture:rank-rule', evidenceRefs: [`fixture:resolution:${result.resolution.resolutionChecksum}`] }],
    };
    const feature = buildLabelFeatureV1(featureInput);
    assert.deepEqual(buildLabelFeatureV1(featureInput), feature);
    const proposals = buildLabelProposalsV1({ feature, allowedDomains: featureInput.allowedDomains });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].status, 'REVIEW_REQUIRED');
    assert.equal(proposals[0].canonicalAuthority, false);
    assert.equal(proposals[0].sourceRevision, targetRevision);
    assert.throws(() => buildLabelFeatureV1({ ...featureInput, sourceRevision: digest('changed') }), /LABEL_FEATURE_EVIDENCE_LINEAGE_OR_TAXONOMY_MISMATCH/);

    const hydration = buildHydrationManifest({
      hydration_revision: `fixture:hydration:${targetRevision}`,
      request_id: 'fixture:request:rank',
      workspace_revision: workspaceRevision,
      source_snapshot_revision: workspaceRevision,
      refs: [{
        hydration_id: `fixture:hydration-ref:${result.resolution.resolutionChecksum}`,
        artifact_id: result.targetIdentity.stableSymbolId,
        artifact_revision: result.targetIdentity.symbolVersionId,
        artifact_checksum: contextualFabricChecksum({ sourceRevision: targetRevision, startByte: expectedStartByte, endByte: expectedEndByte }),
        kind: 'SOURCE_SPAN',
        canonical_id: result.targetIdentity.stableSymbolId,
        source_ref: result.targetIdentity.targetSourceRef,
        source_revision: targetRevision,
        tree_node_id: null,
        byte_start: expectedStartByte,
        byte_end: expectedEndByte,
      }],
      total_bytes: expectedEndByte - expectedStartByte,
      producer_revision: `typescript-compiler-api:${ts.version}`,
    });
    const instructionSet = compileInstructionSet([buildInstructionAtom({
      instruction_id: 'fixture:instruction:rank-evidence',
      instruction_revision: 'fixture:instruction-revision:1',
      category: 'EVIDENCE_POLICY',
      text: `Use symbol ${result.targetIdentity.stableSymbolId} only at its verified source span.`,
      priority: 1,
      repeat_policy: 'ONCE_PER_PREFILL',
      dependency_checksums: [feature.checksum, result.resolution.resolutionChecksum],
      source_ref: result.targetIdentity.targetSourceRef,
      source_revision: targetRevision,
    })], 'fixture:prefill-compiler:1');
    const contextManifestChecksum = contextualFabricChecksum({
      sourceRef: result.targetIdentity.targetSourceRef,
      sourceRevision: targetRevision,
      workspaceRevision,
      symbolId: result.targetIdentity.stableSymbolId,
      featureChecksum: feature.checksum,
      proposalChecksum: proposals[0].proposalChecksum,
    });
    const runtimeIdentity = buildPrefillRuntimeIdentity({
      prefill_identity_checksum: contextualFabricChecksum({ requestId: 'fixture:request:rank', contextManifestChecksum }),
      instruction_set_checksum: instructionSet.instruction_set_checksum,
      hydration_manifest_checksum: hydration.manifest_checksum,
      feature_alignment_checksum: feature.checksum,
      context_manifest_checksum: contextManifestChecksum,
      compiler_revision: instructionSet.compiler_revision,
      model_revision: 'fixture:model:not-executed',
      adapter_revision: null,
      tokenizer_revision: 'fixture:tokenizer:not-executed',
      chat_template_revision: 'fixture:template:not-executed',
      inference_runtime_id: 'fixture:no-inference',
      inference_runtime_revision: 'fixture:no-inference',
    });
    const cacheRecord = buildValkeyPrefillCacheRecord({
      identity: runtimeIdentity,
      entry: buildPrefillCacheEntry({
        prefill_identity_checksum: runtimeIdentity.prefill_identity_checksum,
        instruction_set_checksum: runtimeIdentity.instruction_set_checksum,
        hydration_manifest_checksum: runtimeIdentity.hydration_manifest_checksum,
        feature_alignment_checksum: runtimeIdentity.feature_alignment_checksum,
        context_manifest_checksum: runtimeIdentity.context_manifest_checksum,
        compiler_revision: runtimeIdentity.compiler_revision,
        compiled_prefill_artifact_id: 'fixture:prefill:rank',
        compiled_prefill_checksum: contextualFabricChecksum({ hydration, instructionSet, contextManifestChecksum }),
        status: 'VALID',
      }),
      ttl_seconds: 60,
    });
    const coldArtifactRegistry = new Map([[cacheRecord.storage_key, JSON.stringify(cacheRecord)]]);
    const hotPrefill = new Map([[cacheRecord.storage_key, cacheRecord]]);
    hotPrefill.clear();
    const reloadedRecord = JSON.parse(coldArtifactRegistry.get(cacheRecord.storage_key));
    assert.equal(verifyPrefillRecord(reloadedRecord, runtimeIdentity).status, 'HIT');
    assert.equal(reloadedRecord.entry.compiled_prefill_checksum, cacheRecord.entry.compiled_prefill_checksum);
    assert.equal(reloadedRecord.identity.cache_key, runtimeIdentity.cache_key);
  } finally {
    service.dispose();
  }
});

test('live 8095 declaration spans contain the same TypeScript fixture symbol', { skip: !process.env.ATLAS_8095_FIXTURE_URL }, async () => {
  const sourceRevision = digest(fixtureModuleSource);
  const workspaceRevision = digest(fixtureComponent + fixtureModuleSource);
  const sourceBytes = Buffer.from(fixtureModuleSource, 'utf8');
  const response = await fetch(new URL('/ast/chunk', process.env.ATLAS_8095_FIXTURE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ source: fixtureModuleSource, language: 'typescript', filePath: 'src/feature.ts', sourceRef: 'src/feature.ts', sourceRevision, workspaceRevision }),
  });
  assert.equal(response.status, 200);
  const evidence = await response.json();
  assert.equal(evidence.engine, 'treesitter-chunker');
  assert.equal(evidence.source_revision, sourceRevision);
  assert.equal(evidence.workspace_revision, workspaceRevision);
  assert.equal(evidence.scan_completeness, 'COMPLETE');
  assert.equal(evidence.syntax_status, 'CLEAN');
  assert.equal(evidence.parser_observation.source_sha256, sourceRevision.slice(7));
  assert.equal(evidence.parser_observation.utf8_byte_length, sourceBytes.length);
  assert.equal(evidence.parser_observation.root_has_error, false);
  assert.equal(evidence.parser_observation.error_node_count, 0);
  assert.equal(evidence.parser_observation.missing_node_count, 0);

  const sourceFile = ts.createSourceFile('src/feature.ts', fixtureModuleSource, ts.ScriptTarget.ES2022, true);
  const declaration = sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'rank');
  assert.ok(declaration?.name);
  const symbolStart = Buffer.byteLength(fixtureModuleSource.slice(0, declaration.name.getStart(sourceFile)), 'utf8');
  const symbolEnd = symbolStart + Buffer.byteLength(declaration.name.text, 'utf8');
  const chunks = evidence.chunks.filter((chunk) => chunk.name === declaration.name.text && chunk.node_type === 'function_declaration');
  assert.equal(chunks.length, 1);
  const chunk = chunks[0];
  assert.ok(Number.isSafeInteger(chunk.start_byte) && Number.isSafeInteger(chunk.end_byte));
  assert.ok(chunk.start_byte >= 0 && chunk.start_byte <= symbolStart && chunk.end_byte >= symbolEnd && chunk.end_byte <= sourceBytes.length);
  assert.equal(sourceBytes.subarray(symbolStart, symbolEnd).toString('utf8'), declaration.name.text);

  const mismatched = await fetch(new URL('/ast/chunk', process.env.ATLAS_8095_FIXTURE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ source: fixtureModuleSource, language: 'typescript', filePath: 'src/feature.ts', sourceRevision: `sha256:${'0'.repeat(64)}` }),
  });
  assert.equal(mismatched.status, 422);
  assert.equal((await mismatched.json()).detail, 'SOURCE_REVISION_MISMATCH');
});

test('live 8095 AST bytes qualify the cross-file LSP symbol target', { skip: !process.env.ATLAS_8095_FIXTURE_URL }, async () => {
  const component = fixtureComponent;
  const moduleSource = fixtureModuleSource;
  const modulePath = '/atlas-fixture/feature.ts';
  const componentPath = '/atlas-fixture/Component.svelte.ts';
  const sourceRevision = digest(moduleSource);
  const workspaceRevision = digest(component + moduleSource);
  const sourceBytes = Buffer.from(moduleSource, 'utf8');
  const response = await fetch(new URL('/ast/chunk', process.env.ATLAS_8095_FIXTURE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ source: moduleSource, language: 'typescript', filePath: 'src/feature.ts', sourceRef: 'src/feature.ts', sourceRevision, workspaceRevision }),
  });
  assert.equal(response.status, 200);
  const observation = await response.json();
  assert.equal(observation.source_revision, sourceRevision);
  assert.equal(observation.workspace_revision, workspaceRevision);
  assert.equal(observation.scan_completeness, 'COMPLETE');
  assert.equal(observation.syntax_status, 'CLEAN');
  assert.equal(observation.parser_observation.utf8_byte_length, sourceBytes.length);

  const sourceFile = ts.createSourceFile('src/feature.ts', moduleSource, ts.ScriptTarget.ES2022, true);
  const declaration = sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'rank');
  assert.ok(declaration?.name);
  const symbolStart = Buffer.byteLength(moduleSource.slice(0, declaration.name.getStart(sourceFile)), 'utf8');
  const symbolEnd = symbolStart + Buffer.byteLength(declaration.name.text, 'utf8');
  const chunks = observation.chunks.filter((chunk) => chunk.name === 'rank' && chunk.node_type === 'function_declaration');
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].start_byte <= symbolStart && chunks[0].end_byte >= symbolEnd);
  assert.equal(sourceBytes.subarray(symbolStart, symbolEnd).toString('utf8'), 'rank');

  const virtualScript = component.slice(0, parse(component, { modern: true }).instance.content.start).replace(/[^\r\n]/g, ' ')
    + component.slice(parse(component, { modern: true }).instance.content.start, parse(component, { modern: true }).instance.content.end);
  const files = { [componentPath]: virtualScript, [modulePath]: moduleSource };
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10, noLib: true };
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => '1',
    getScriptSnapshot: (file) => files[file] === undefined ? undefined : ts.ScriptSnapshot.fromString(files[file]),
    getCurrentDirectory: () => '/atlas-fixture',
    getDefaultLibFileName: () => '',
    fileExists: (file) => file in files,
    readFile: (file) => files[file],
    readDirectory: () => [],
    directoryExists: () => true,
    getDirectories: () => [],
  };
  const service = ts.createLanguageService(host);
  try {
    const program = service.getProgram();
    const componentFile = program.getSourceFile(componentPath);
    const call = componentFile && (() => {
      let found;
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'rank') found = node;
        ts.forEachChild(node, visit);
      };
      visit(componentFile);
      return found;
    })();
    assert.ok(call);
    const definition = service.getDefinitionAtPosition(componentPath, call.expression.getStart(componentFile));
    assert.equal(definition?.length, 1);
    assert.equal(definition[0].fileName, modulePath);
    const targetStart = ts.getLineAndCharacterOfPosition(program.getSourceFile(modulePath), definition[0].textSpan.start);
    const targetEnd = ts.getLineAndCharacterOfPosition(program.getSourceFile(modulePath), definition[0].textSpan.start + definition[0].textSpan.length);
    const result = enrichLspTargetIdentityV1({
      featureId: 'fixture:feature:rank',
      packetKey: 'fixture:packet:component',
      workspaceRevision,
      source: { sourceRef: 'src/Component.svelte', sourceRevision: digest(component) },
      target: { uri: 'file:///atlas-fixture/feature.ts', range: { startLine: targetStart.line, startCharacter: targetStart.character, endLine: targetEnd.line, endCharacter: targetEnd.character } },
      producer: { lspServerRevision: `typescript-compiler-api:${ts.version}`, projectRevision: 'fixture:project', resolverRevision: 'fixture:resolver', positionEncoding: 'utf-16' },
    }, {
      resolveSourceRef: () => 'src/feature.ts',
      lookupSourceRevision: () => ({ sourceRef: 'src/feature.ts', sourceRevision, sourceInventoryRevision: 'fixture:inventory', contentDigest: sourceRevision, sourceText: moduleSource }),
      lookupSymbols: ({ startByte, endByte }) => {
        assert.equal(startByte, symbolStart);
        assert.equal(endByte, symbolEnd);
        assert.ok(chunks[0].start_byte <= startByte && chunks[0].end_byte >= endByte);
        return [{ stableSymbolId: 'fixture:symbol:rank', symbolVersionId: 'fixture:symbol-version:rank', startByte, endByte, symbolRegistryRevision: 'fixture:registry' }];
      },
    });
    assert.equal(result.status, 'ENRICHED');
    assert.equal(result.targetIdentity.targetSourceRevision, sourceRevision);
    assert.equal(result.resolution.canonicalAuthority, false);
  } finally {
    service.dispose();
  }
});

test('live 8095 Svelte chunk spans match a real repository source file', { skip: !process.env.ATLAS_8095_FIXTURE_URL }, async () => {
  const filePath = 'sveltekit-frontend/src/routes/register/+page.svelte';
  const absolutePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../', filePath);
  const sourceBytes = readFileSync(absolutePath);
  const source = sourceBytes.toString('utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  const workspaceRevision = process.env.ATLAS_8095_WORKSPACE_REVISION;
  const response = await fetch(new URL('/ast/chunk', process.env.ATLAS_8095_FIXTURE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ source, language: 'svelte', filePath, sourceRef: filePath, sourceRevision, ...(workspaceRevision ? { workspaceRevision } : {}) }),
  });

  assert.equal(response.status, 200);
  const evidence = await response.json();
  assert.equal(evidence.engine, 'treesitter-chunker');
  assert.equal(evidence.source_revision, sourceRevision);
  if (workspaceRevision) assert.equal(evidence.workspace_revision, workspaceRevision);
  assert.equal(evidence.scan_completeness, 'COMPLETE');
  assert.equal(evidence.syntax_status, 'CLEAN');
  assert.equal(evidence.parser_observation.source_sha256, sourceRevision.slice(7));
  assert.equal(evidence.parser_observation.utf8_byte_length, sourceBytes.length);
  assert.equal(evidence.parser_observation.root_has_error, false);
  assert.equal(evidence.parser_observation.error_node_count, 0);
  assert.equal(evidence.parser_observation.missing_node_count, 0);
  assert.ok(evidence.chunks.length > 0);

  const svelteAst = parse(source, { modern: true });
  assert.ok(svelteAst.instance);
  const scriptStart = svelteAst.instance.content.start;
  const scriptEnd = svelteAst.instance.content.end;
  const scriptText = source.slice(scriptStart, scriptEnd);
  const scriptAst = ts.createSourceFile(filePath, scriptText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let declarationSpan = null;
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText(scriptAst) === 'onResult') {
      declarationSpan = { start: scriptStart + node.name.getStart(scriptAst), end: scriptStart + node.name.getEnd() };
    }
    ts.forEachChild(node, visit);
  };
  visit(scriptAst);
  assert.ok(declarationSpan, 'expected the Svelte compiler script to contain onResult');
  const declarationByteStart = Buffer.byteLength(source.slice(0, declarationSpan.start), 'utf8');
  const declarationByteEnd = Buffer.byteLength(source.slice(0, declarationSpan.end), 'utf8');
  assert.equal(sourceBytes.subarray(declarationByteStart, declarationByteEnd).toString('utf8'), 'onResult');
  assert.ok(evidence.chunks.some((chunk) => chunk.start_byte <= declarationByteStart && chunk.end_byte >= declarationByteEnd), 'Tree-sitter chunk must enclose the compiler/TypeScript declaration span');

  const lineStarts = [0];
  for (let index = 0; index < sourceBytes.length; index += 1) {
    if (sourceBytes[index] === 0x0a) lineStarts.push(index + 1);
  }
  const byteOffsetFor = (line, column) => {
    assert.ok(Number.isSafeInteger(line) && line >= 1 && line <= lineStarts.length);
    const lineStart = lineStarts[line - 1];
    let lineEnd = lineStarts[line] ?? sourceBytes.length;
    if (lineEnd > lineStart && sourceBytes[lineEnd - 1] === 0x0a) lineEnd -= 1;
    if (lineEnd > lineStart && sourceBytes[lineEnd - 1] === 0x0d) lineEnd -= 1;
    assert.ok(Number.isSafeInteger(column) && column >= 0 && column <= lineEnd - lineStart);
    return lineStart + column;
  };

  for (const chunk of evidence.chunks) {
    assert.ok(Number.isSafeInteger(chunk.start_byte) && Number.isSafeInteger(chunk.end_byte));
    assert.ok(chunk.start_byte >= 0 && chunk.start_byte <= chunk.end_byte && chunk.end_byte <= sourceBytes.length);
    assert.equal(byteOffsetFor(chunk.start_line, chunk.start_column), chunk.start_byte);
    assert.equal(byteOffsetFor(chunk.end_line, chunk.end_column), chunk.end_byte);
  }

  const knownNodeByte = sourceBytes.indexOf(Buffer.from('{#if $errors.firstName}', 'utf8'));
  assert.ok(knownNodeByte >= 0);
  assert.ok(evidence.chunks.some((chunk) => chunk.start_byte <= knownNodeByte && chunk.end_byte >= knownNodeByte + Buffer.byteLength('{#if $errors.firstName}', 'utf8')));
});
