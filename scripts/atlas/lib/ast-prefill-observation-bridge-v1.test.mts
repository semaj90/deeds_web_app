import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceByteRevisionV1 } from './source-byte-revision-v1.mjs';
import { projectAstPrefillRowToObservationV1 } from './ast-prefill-observation-bridge-v1.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = `const label = 'π';\nexport function score(value: number) { return value; }`;
const sourceBytes = Buffer.from(source, 'utf8');
const startByte = sourceBytes.indexOf(Buffer.from('export function score'));
const endByte = sourceBytes.indexOf(Buffer.from('\n'), startByte) < 0
  ? sourceBytes.length
  : sourceBytes.indexOf(Buffer.from('\n'), startByte);

function row(overrides: Record<string, unknown> = {}) {
  return {
    packet_key: 'packet:fixture-1',
    source_ref: 'src/fixture.ts',
    source_revision: sourceByteRevisionV1(sourceBytes),
    workspace_revision: 'workspace:fixture-1',
    resolved_path: 'src/fixture.ts',
    start_byte: startByte,
    end_byte: endByte,
    name: 'score',
    symbol_kind: 'function',
    ast_kind: 'function_declaration',
    extractor_revision: 'ast-grep-napi-graphify-yaml-v2',
    ...overrides,
  };
}

test('bridges exact UTF-8 source spans through the canonical observation adapter', async () => {
  const result = await projectAstPrefillRowToObservationV1({
    row: row(),
    repoRoot,
    readBytes: async () => sourceBytes,
  });
  assert.ok('row' in result);
  assert.equal(result.row.observation.schema, 'atlas.ast-grep-observation.v1');
  assert.equal(result.row.observation.observation_kind, 'FUNCTION_DECL');
  assert.equal(result.row.observation.byte_start, startByte);
  assert.equal(result.row.observation.byte_end, endByte);
  assert.equal(result.row.observation.source_revision, sourceByteRevisionV1(sourceBytes));
  assert.equal(result.row.observation.extractor_revision, 'ast-grep-napi-graphify-yaml-v2');
  assert.equal(result.row.observation.canonical_authority, false);
  assert.equal(result.row.admissionStatus, 'PROPOSAL_ONLY');
  assert.equal(result.row.workspaceRevision, 'workspace:fixture-1');
});

test('maps generator function declarations to the reviewed function feature proposal', async () => {
  const generatorBytes = Buffer.from('export function* stream() { yield 1; }', 'utf8');
  const start = generatorBytes.indexOf(Buffer.from('export function* stream'));
  const end = generatorBytes.length;
  const projected = await projectAstPrefillRowToObservationV1({
    row: row({
      source_ref: 'src/generator.ts',
      source_revision: sourceByteRevisionV1(generatorBytes),
      start_byte: start,
      end_byte: end,
      name: 'stream',
      symbol_kind: 'function',
      ast_kind: 'generator_function_declaration',
    }),
    repoRoot,
    readBytes: async () => generatorBytes,
  });
  assert.ok('row' in projected);
  assert.equal(projected.row.observation.observation_kind, 'FUNCTION_DECL');
  assert.equal(projected.row.observation.byte_start, start);
  assert.equal(projected.row.observation.byte_end, end);
  assert.equal(projected.row.admissionStatus, 'PROPOSAL_ONLY');
});

test('rejects stale source bytes and does not substitute another revision', async () => {
  const result = await projectAstPrefillRowToObservationV1({
    row: row({ source_revision: `sha256:${'0'.repeat(64)}` }),
    repoRoot,
    readBytes: async () => sourceBytes,
  });
  assert.ok('rejection' in result);
  assert.equal(result.rejection.reason, 'SOURCE_REVISION_MISMATCH');
});

test('allows revision-qualified source-only observations without minting packet or symbol identity', async () => {
  const sourceOnlyRow = row({
    packet_key: null,
    identity_status: 'SOURCE_ONLY_UNBOUND',
    canonical_symbol_id: null,
    symbol_version_id: null,
  });
  const projected = await projectAstPrefillRowToObservationV1({
    row: sourceOnlyRow,
    repoRoot,
    readBytes: async () => sourceBytes,
  });
  assert.ok('row' in projected);
  assert.equal(projected.row.packetKey, null);
  assert.equal(projected.row.identityStatus, 'SOURCE_ONLY_UNBOUND');
  assert.equal(projected.row.observation.source_ref, 'src/fixture.ts');
  assert.equal(projected.row.observation.source_revision, sourceByteRevisionV1(sourceBytes));
  assert.equal(projected.row.canonicalAuthority, false);

  const conflict = await projectAstPrefillRowToObservationV1({
    row: { ...sourceOnlyRow, packet_key: 'packet:must-not-be-minted' },
    repoRoot,
    readBytes: async () => sourceBytes,
  });
  assert.ok('rejection' in conflict);
  assert.equal(conflict.rejection.reason, 'SOURCE_ONLY_IDENTITY_CONFLICT');
});

test('rejects conflicting or unmapped AST kinds rather than coercing them', async () => {
  const conflict = await projectAstPrefillRowToObservationV1({
    row: row({ ast_kind: 'class_declaration' }), repoRoot, readBytes: async () => sourceBytes,
  });
  assert.ok('rejection' in conflict);
  assert.equal(conflict.rejection.reason, 'AST_KIND_CROSSWALK_CONFLICT');

  const unknown = await projectAstPrefillRowToObservationV1({
    row: row({ symbol_kind: 'call_expression', ast_kind: 'call_expression' }), repoRoot, readBytes: async () => sourceBytes,
  });
  assert.ok('rejection' in unknown);
  assert.equal(unknown.rejection.reason, 'AST_KIND_UNMAPPED');

  const enumDeclaration = await projectAstPrefillRowToObservationV1({
    row: row({ symbol_kind: 'enum', ast_kind: 'enum_declaration' }), repoRoot, readBytes: async () => sourceBytes,
  });
  assert.ok('rejection' in enumDeclaration);
  assert.equal(enumDeclaration.rejection.reason, 'AST_KIND_UNMAPPED');
});

test('uses syntax kind for AST features while retaining a function-valued variable symbol hint', async () => {
  const functionValueSource = `const label = 'π';\nconst dfs = (value) => value;\n`;
  const functionValueBytes = Buffer.from(functionValueSource, 'utf8');
  const start = functionValueBytes.indexOf(Buffer.from('const dfs'));
  const end = functionValueBytes.indexOf(0x0a, start);
  const projected = await projectAstPrefillRowToObservationV1({
    row: row({
      source_ref: 'src/function-value.ts',
      source_revision: sourceByteRevisionV1(functionValueBytes),
      resolved_path: 'src/function-value.ts',
      start_byte: start,
      end_byte: end,
      name: 'dfs',
      symbol_kind: 'function',
      ast_kind: 'variable_declarator',
    }),
    repoRoot,
    readBytes: async () => functionValueBytes,
  });
  assert.ok('row' in projected);
  assert.equal(projected.row.observation.observation_kind, 'VARIABLE_DECL');
  assert.equal(projected.row.symbolKind, 'function');
  assert.equal(projected.row.observation.captures.syntax_kind, 'variable_declarator');
});

test('maps a byte-grounded type alias to TYPE_ALIAS and rejects enum cross-labeling', async () => {
  const typeAliasSource = `export type AccountId = string;\n`;
  const typeAliasBytes = Buffer.from(typeAliasSource, 'utf8');
  const start = typeAliasBytes.indexOf(Buffer.from('export type AccountId'));
  const end = typeAliasBytes.indexOf(Buffer.from('\n'), start);
  const typeAliasRow = row({
    source_ref: 'src/type-alias.ts',
    source_revision: sourceByteRevisionV1(typeAliasBytes),
    resolved_path: 'src/type-alias.ts',
    start_byte: start,
    end_byte: end,
    name: 'AccountId',
    symbol_kind: 'type',
    ast_kind: 'type_alias_declaration',
  });
  const projected = await projectAstPrefillRowToObservationV1({
    row: typeAliasRow,
    repoRoot,
    readBytes: async () => typeAliasBytes,
  });
  assert.ok('row' in projected);
  assert.equal(projected.row.observation.observation_kind, 'TYPE_ALIAS');
  assert.equal(projected.row.observation.byte_start, start);
  assert.equal(projected.row.observation.byte_end, end);

  const conflicting = await projectAstPrefillRowToObservationV1({
    row: { ...typeAliasRow, symbol_kind: 'enum' },
    repoRoot,
    readBytes: async () => typeAliasBytes,
  });
  assert.ok('rejection' in conflicting);
  assert.equal(conflicting.rejection.reason, 'AST_KIND_UNMAPPED');
});

test('rejects missing extractor lineage and spans that do not contain the declared symbol', async () => {
  const missingExtractor = await projectAstPrefillRowToObservationV1({
    row: row({ extractor_revision: '' }), repoRoot, readBytes: async () => sourceBytes,
  });
  assert.ok('rejection' in missingExtractor);
  assert.equal(missingExtractor.rejection.reason, 'EXTRACTOR_REVISION_MISSING');

  const badSpan = await projectAstPrefillRowToObservationV1({
    row: row({ start_byte: 0, end_byte: 4 }), repoRoot, readBytes: async () => sourceBytes,
  });
  assert.ok('rejection' in badSpan);
  assert.equal(badSpan.rejection.reason, 'SPAN_CONTENT_MISMATCH');
});

test('root runner streams a fixture proposal and independently verifies output readback', async () => {
  const atlasTmp = path.join(repoRoot, '.tmp', 'atlas');
  await mkdir(atlasTmp, { recursive: true });
  const scratch = await mkdtemp(path.join(atlasTmp, 'ast-prefill-observation-bridge-test-'));
  try {
    const sourceText = `const marker = '🧭';\nexport function grounded(value: number) { return value; }`;
    const sourceBytesForFixture = Buffer.from(sourceText, 'utf8');
    const start = sourceBytesForFixture.indexOf(Buffer.from('export function grounded'));
    const newline = sourceBytesForFixture.indexOf(Buffer.from('\n'), start);
    const sourceFile = path.join(scratch, 'fixture.ts');
    const inputFile = path.join(scratch, 'input.jsonl');
    const outputFile = path.join(scratch, 'observations.jsonl');
    const receiptFile = path.join(scratch, 'receipt.json');
    await writeFile(sourceFile, sourceBytesForFixture);
    const rowValue = {
      packet_key: 'packet:runner-fixture',
      source_ref: 'fixture:runner.ts',
      source_revision: sourceByteRevisionV1(sourceBytesForFixture),
      workspace_revision: 'workspace:fixture',
      resolved_path: path.relative(repoRoot, sourceFile).replaceAll('\\', '/'),
      start_byte: start,
      end_byte: newline < 0 ? sourceBytesForFixture.length : newline,
      name: 'grounded',
      symbol_kind: 'function',
      ast_kind: 'function_declaration',
      extractor_revision: 'fixture-extractor-v1',
    };
    await writeFile(inputFile, `${JSON.stringify(rowValue)}\n`);

    const tsxCli = path.join(repoRoot, 'sveltekit-frontend', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const runner = path.join(repoRoot, 'scripts', 'atlas', 'project-ast-prefill-observations-v1.mts');
    const stdout = execFileSync(process.execPath, [tsxCli, runner,
      `--input=${inputFile}`, `--output=${outputFile}`, `--receipt=${receiptFile}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
    const projected = JSON.parse((await readFile(outputFile, 'utf8')).trim());
    const outputChecksum = createHash('sha256').update(await readFile(outputFile)).digest('hex');
    assert.equal(receipt.projectedRows, 1);
    assert.equal(receipt.rejectedRows, 0);
    assert.equal(receipt.outputChecksum, outputChecksum);
    assert.equal(receipt.readbackChecksum, outputChecksum);
    assert.equal(receipt.readbackMatched, true);
    assert.equal(receipt.inputReadbackMatched, true);
    assert.equal(projected.observation.observation_kind, 'FUNCTION_DECL');
    assert.equal(projected.admissionStatus, 'PROPOSAL_ONLY');
    assert.equal(projected.canonicalAuthority, false);
    assert.equal(receipt.persistentStoreWritesPerformed, false);
    assert.match(stdout, /PROPOSAL_PROJECTION_COMPLETE/);

    const emptyInputFile = path.join(scratch, 'empty-input.jsonl');
    const emptyOutputFile = path.join(scratch, 'empty-observations.jsonl');
    const emptyReceiptFile = path.join(scratch, 'empty-receipt.json');
    await writeFile(emptyInputFile, '');
    const emptyStdout = execFileSync(process.execPath, [tsxCli, runner,
      `--input=${emptyInputFile}`, `--output=${emptyOutputFile}`, `--receipt=${emptyReceiptFile}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const emptyReceipt = JSON.parse(await readFile(emptyReceiptFile, 'utf8'));
    assert.equal(emptyReceipt.status, 'EMPTY_INPUT');
    assert.equal(emptyReceipt.inputRows, 0);
    assert.equal(emptyReceipt.projectedRows, 0);
    assert.equal(emptyReceipt.readbackMatched, true);
    assert.equal(emptyReceipt.persistentStoreWritesPerformed, false);
    assert.match(emptyStdout, /EMPTY_INPUT/);
  } finally {
    const relativeScratch = path.relative(atlasTmp, scratch);
    assert.ok(relativeScratch && !relativeScratch.startsWith('..') && !path.isAbsolute(relativeScratch));
    await rm(scratch, { recursive: true, force: true });
  }
});
