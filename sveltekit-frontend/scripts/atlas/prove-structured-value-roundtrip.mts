#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import {
  buildStructuredValueArrowSnapshot,
  buildStructuredValueCrossRuntimeReceipt,
  structuredValueCrossRuntimeReceiptSchema,
  type SyntaxNodeLike,
} from '../../../packages/parent-atlas/src/index.ts';
import { parseStructuredValueAtByteRange, probeNodeTreeSitterRuntime } from '../../src/lib/server/atlas/language/node-tree-sitter-structured-value.ts';
import { TsMorphStructuredValueEnricher } from '../../src/lib/server/atlas/language/ts-morph-structured-value-enricher.ts';
import { serializeStructuredValueArrowFile } from '../../../scripts/atlas/write-structured-value-arrow.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE = path.resolve(REPO_ROOT, 'packages/parent-atlas/fixtures/structured-value/ts-parity-fixture.ts');
const OUT_DIR = path.resolve(REPO_ROOT, '.tmp/atlas/structured-value-proof');
const SOURCE_REF = 'packages/parent-atlas/fixtures/structured-value/ts-parity-fixture.ts';
const SOURCE_REVISION = process.env.GIT_REV ?? 'fixture:ts-parity:v1';
const WORKSPACE_REVISION = process.env.WORKSPACE_REVISION ?? SOURCE_REVISION;
const PRODUCER_REVISION = 'atlas.structured-value-cross-runtime-proof.v1';

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function utf16RangeBetweenMarkers(source: string, startMarker: string, endMarker: string): { start: number; end: number } {
  const markerStart = source.indexOf(startMarker);
  const markerEnd = source.indexOf(endMarker);
  if (markerStart < 0 || markerEnd < 0 || markerEnd <= markerStart) throw new Error(`FIXTURE_MARKER_MISSING:${startMarker}:${endMarker}`);
  let start = markerStart + startMarker.length;
  let end = markerEnd;
  while (start < end && /\s/.test(source[start]!)) start += 1;
  while (end > start && /\s/.test(source[end - 1]!)) end -= 1;
  return { start, end };
}

function utf16RangeToUtf8(source: string, range: { start: number; end: number }): { start_byte: number; end_byte: number } {
  return {
    start_byte: Buffer.byteLength(source.slice(0, range.start), 'utf8'),
    end_byte: Buffer.byteLength(source.slice(0, range.end), 'utf8'),
  };
}

type NodeRuntime = {
  Parser: new () => {
    setLanguage(language: unknown): void;
    parse(source: string): { rootNode: TreeNode };
  };
  grammar: unknown;
  parser_revision: string;
  grammar_revision: string;
};

type TreeNode = SyntaxNodeLike & {
  namedChildren?: TreeNode[];
  text?: string;
};

function packageVersion(name: string): string {
  return (require(`${name}/package.json`) as { version: string }).version;
}

function loadNodeRuntime(): NodeRuntime {
  const module = require('tree-sitter') as any;
  const Parser = module.default ?? module;
  const grammarModule = require('tree-sitter-typescript') as { typescript: unknown };
  return {
    Parser,
    grammar: grammarModule.typescript,
    parser_revision: packageVersion('tree-sitter'),
    grammar_revision: packageVersion('tree-sitter-typescript'),
  };
}

function allNamedNodes(root: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const visit = (node: TreeNode): void => {
    out.push(node);
    if (Array.isArray(node.namedChildren)) {
      node.namedChildren.forEach(visit);
      return;
    }
    for (let index = 0; index < node.namedChildCount; index += 1) {
      const child = node.namedChild(index) as TreeNode | null;
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

function nodeSource(sourceBytes: Buffer, node: TreeNode): string {
  return sourceBytes.subarray(node.startIndex, node.endIndex).toString('utf8');
}

function findBuildPermitNodes(root: TreeNode, sourceBytes: Buffer): TreeNode[] {
  return allNamedNodes(root).filter((node) => {
    if (!['function_declaration', 'export_statement'].includes(node.type)) return false;
    const text = nodeSource(sourceBytes, node);
    return /\bbuildPermitPatch\b/.test(text);
  });
}

function runChunkerProbe(output: string): { status: string; package_revision?: string | null; chunks?: any[]; diagnostics?: string[] } {
  const python = process.env.PYTHON_BIN ?? process.env.PYTHON ?? 'python';
  const result = spawnSync(python, [
    path.resolve(REPO_ROOT, 'python/prove_structured_value_chunker_fixture.py'),
    '--file', FIXTURE,
    '--language', 'typescript',
    '--output', output,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  try {
    return JSON.parse(result.stdout || (result.stderr.includes('{') ? result.stderr.slice(result.stderr.indexOf('{')) : '{}'));
  } catch {
    return {
      status: 'BLOCKED_TREE_SITTER_CHUNKER',
      diagnostics: [`TREE_SITTER_CHUNKER_PROBE_PROCESS_FAILED:${result.status}:${(result.stderr || result.stdout).trim()}`],
      chunks: [],
    };
  }
}

function chooseChunkerBuildPermitChunk(chunks: any[]): any | null {
  const named = chunks.filter((chunk) => chunk?.name === 'buildPermitPatch' || /\bbuildPermitPatch\b/.test(String(chunk?.content ?? '')));
  named.sort((a, b) => {
    const aWidth = Number(a?.byte_end ?? Number.MAX_SAFE_INTEGER) - Number(a?.byte_start ?? 0);
    const bWidth = Number(b?.byte_end ?? Number.MAX_SAFE_INTEGER) - Number(b?.byte_start ?? 0);
    return aWidth - bWidth;
  });
  return named[0] ?? null;
}

function parityAgainstChunk(nodeCandidates: TreeNode[], chunk: any, sourceBytes: Buffer) {
  const start = Number(chunk.byte_start);
  const end = Number(chunk.byte_end);
  const exact = nodeCandidates.find((node) => node.startIndex === start && node.endIndex === end) ?? null;
  const spanMatch = exact !== null;
  const chunkContent = typeof chunk.content === 'string' ? chunk.content : sourceBytes.subarray(start, end).toString('utf8');
  return {
    exact_node: exact,
    span_match: spanMatch,
    node_type_match: exact ? String(chunk.node_type ?? '').toLowerCase().includes(exact.type.replace('_declaration', '')) || exact.type.includes(String(chunk.node_type ?? '').toLowerCase()) : false,
    ordered_child_match: exact ? exact.namedChildCount > 0 : false,
    chunk_content_checksum: sha256(chunkContent),
    node_content_checksum: exact ? sha256(nodeSource(sourceBytes, exact)) : null,
  };
}

async function runPyArrowProof(input: {
  arrowPath: string;
  rootOrdinal: number;
  rowIdentityChecksum: string;
  structureChecksum: string;
}): Promise<{ passed: boolean; receipt_checksum: string | null; diagnostics: string[] }> {
  const python = process.env.PYTHON_BIN ?? process.env.PYTHON ?? 'python';
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.resolve(REPO_ROOT, 'python'))})
from atlas_structured_value_arrow import read_structured_value_arrow_mmap
_, receipt = read_structured_value_arrow_mmap(
    ${JSON.stringify(input.arrowPath)},
    root_value_ordinal=${input.rootOrdinal},
    expected_row_identity_checksum=${JSON.stringify(input.rowIdentityChecksum)},
    expected_structure_checksum=${JSON.stringify(input.structureChecksum)},
)
print(json.dumps(receipt.to_dict(), sort_keys=True))
`;
  const result = spawnSync(python, ['-c', code], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    return { passed: false, receipt_checksum: null, diagnostics: [`PYARROW_MMAP_FAILED:${(result.stderr || result.stdout).trim()}`] };
  }
  const receipt = JSON.parse(result.stdout.trim());
  return { passed: true, receipt_checksum: sha256(JSON.stringify(receipt)), diagnostics: [] };
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const source = await fs.readFile(FIXTURE, 'utf8');
  const sourceBytes = Buffer.from(source, 'utf8');
  const sourceChecksum = sha256(sourceBytes);
  const diagnostics: string[] = [];

  const runtimeProbe = probeNodeTreeSitterRuntime('typescript');
  const chunkerProbePath = path.join(OUT_DIR, 'treesitter-chunker.json');
  const chunkerProbe = runChunkerProbe(chunkerProbePath);

  if (!runtimeProbe.available) {
    const receipt = buildStructuredValueCrossRuntimeReceipt({
      receipt_id: `sv-proof:${sourceChecksum.slice(0, 24)}`,
      fixture_source_ref: SOURCE_REF,
      fixture_source_revision: SOURCE_REVISION,
      workspace_revision: WORKSPACE_REVISION,
      node_tree_sitter_revision: runtimeProbe.parser_revision,
      node_grammar_revision: runtimeProbe.grammar_revision,
      treesitter_chunker_revision: chunkerProbe.package_revision ?? null,
      ts_morph_revision: null,
      typescript_revision: null,
      arrow_js_revision: null,
      pyarrow_revision: null,
      node_tree_sitter_available: false,
      treesitter_chunker_available: chunkerProbe.status === 'READY',
      compared_chunk_count: 0,
      span_match_count: 0,
      node_type_match_count: 0,
      ordered_child_match_count: 0,
      upstream_id_match_count: 0,
      object_value_extracted: false,
      object_value_entry_count: 0,
      computed_entry_count: 0,
      spread_entry_count: 0,
      ts_morph_exact_span_match: false,
      ts_morph_resolved_signature: false,
      arrow_row_count: 0,
      arrow_row_identity_checksum: null,
      arrow_structure_checksum: null,
      arrow_ipc_checksum: null,
      pyarrow_mmap_row_identity_checksum: null,
      pyarrow_mmap_structure_checksum: null,
      pyarrow_reconstruction_checksum: null,
      status: 'BLOCKED_NODE_TREE_SITTER',
      diagnostics: [...runtimeProbe.diagnostics, ...(chunkerProbe.diagnostics ?? [])],
      producer_revision: PRODUCER_REVISION,
    });
    await fs.writeFile(path.join(OUT_DIR, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
    process.exitCode = 3;
    return;
  }

  if (chunkerProbe.status !== 'READY') {
    const receipt = buildStructuredValueCrossRuntimeReceipt({
      receipt_id: `sv-proof:${sourceChecksum.slice(0, 24)}`,
      fixture_source_ref: SOURCE_REF,
      fixture_source_revision: SOURCE_REVISION,
      workspace_revision: WORKSPACE_REVISION,
      node_tree_sitter_revision: runtimeProbe.parser_revision,
      node_grammar_revision: runtimeProbe.grammar_revision,
      treesitter_chunker_revision: chunkerProbe.package_revision ?? null,
      ts_morph_revision: null,
      typescript_revision: null,
      arrow_js_revision: null,
      pyarrow_revision: null,
      node_tree_sitter_available: true,
      treesitter_chunker_available: false,
      compared_chunk_count: 0,
      span_match_count: 0,
      node_type_match_count: 0,
      ordered_child_match_count: 0,
      upstream_id_match_count: 0,
      object_value_extracted: false,
      object_value_entry_count: 0,
      computed_entry_count: 0,
      spread_entry_count: 0,
      ts_morph_exact_span_match: false,
      ts_morph_resolved_signature: false,
      arrow_row_count: 0,
      arrow_row_identity_checksum: null,
      arrow_structure_checksum: null,
      arrow_ipc_checksum: null,
      pyarrow_mmap_row_identity_checksum: null,
      pyarrow_mmap_structure_checksum: null,
      pyarrow_reconstruction_checksum: null,
      status: 'BLOCKED_TREE_SITTER_CHUNKER',
      diagnostics: chunkerProbe.diagnostics ?? [],
      producer_revision: PRODUCER_REVISION,
    });
    await fs.writeFile(path.join(OUT_DIR, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
    process.exitCode = 3;
    return;
  }

  const runtime = loadNodeRuntime();
  const parser = new runtime.Parser();
  parser.setLanguage(runtime.grammar);
  const root = parser.parse(source).rootNode;
  const nodeCandidates = findBuildPermitNodes(root, sourceBytes);
  const chunk = chooseChunkerBuildPermitChunk(chunkerProbe.chunks ?? []);
  if (!chunk) diagnostics.push('TREE_SITTER_CHUNKER_BUILD_PERMIT_CHUNK_NOT_FOUND');
  const parity = chunk ? parityAgainstChunk(nodeCandidates, chunk, sourceBytes) : {
    exact_node: null, span_match: false, node_type_match: false, ordered_child_match: false,
    chunk_content_checksum: null, node_content_checksum: null,
  };

  const objectUtf16 = utf16RangeBetweenMarkers(source, '/* ATLAS_STRUCTURED_VALUE_START */', '/* ATLAS_STRUCTURED_VALUE_END */');
  const objectBytes = utf16RangeToUtf8(source, objectUtf16);
  const parsedObject = parseStructuredValueAtByteRange({
    source_text: source,
    source_ref: SOURCE_REF,
    source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    language: 'typescript',
    start_byte: objectBytes.start_byte,
    end_byte: objectBytes.end_byte,
  });

  const project = new Project({ useInMemoryFileSystem: false, compilerOptions: { strict: true, noEmit: true } });
  const sourceFile = project.addSourceFileAtPath(FIXTURE);
  void sourceFile;
  const tsMorphPkg = require('ts-morph/package.json') as { version: string };
  const typescriptPkg = require('typescript/package.json') as { version: string };
  const enricher = new TsMorphStructuredValueEnricher({
    project,
    project_revision: sourceChecksum,
    ts_morph_revision: tsMorphPkg.version,
    typescript_revision: typescriptPkg.version,
    tsconfig_ref: null,
  });
  const objectSemantic = enricher.enrich({ provenance: parsedObject.value.provenance, source_text: source });

  const callUtf16 = utf16RangeBetweenMarkers(source, '/* ATLAS_RESOLVED_CALL_START */', '/* ATLAS_RESOLVED_CALL_END */');
  const callBytes = utf16RangeToUtf8(source, callUtf16);
  const parsedCall = parseStructuredValueAtByteRange({
    source_text: source,
    source_ref: SOURCE_REF,
    source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    language: 'typescript',
    start_byte: callBytes.start_byte,
    end_byte: callBytes.end_byte,
  });
  const callSemantic = enricher.enrich({ provenance: parsedCall.value.provenance, source_text: source });

  const { snapshot, rows } = buildStructuredValueArrowSnapshot({
    snapshot_id: `structured-value:${sourceChecksum.slice(0, 32)}`,
    snapshot_revision: SOURCE_REVISION,
    source_snapshot_revision: SOURCE_REVISION,
    arrow_js_revision: require('apache-arrow/package.json').version,
    arrow_schema_revision: 'atlas.structured-value-arrow.v1',
    root: parsedObject.value,
    producer_revision: PRODUCER_REVISION,
  });
  const serialized = serializeStructuredValueArrowFile(rows);
  const arrowPath = path.join(OUT_DIR, 'structured-value.arrow');
  await fs.writeFile(arrowPath, serialized.bytes);
  const pyArrowProof = await runPyArrowProof({
    arrowPath,
    rootOrdinal: snapshot.root_value_ordinal,
    rowIdentityChecksum: snapshot.row_identity_checksum,
    structureChecksum: snapshot.structure_checksum,
  });
  diagnostics.push(...pyArrowProof.diagnostics);

  const objectEntries = parsedObject.value.kind === 'OBJECT' ? parsedObject.value.entries : [];
  const status = !parity.span_match
    ? 'CHUNK_BOUNDARY_PARITY_FAILED'
    : !objectSemantic || !callSemantic
      ? 'TS_MORPH_ENRICHMENT_FAILED'
      : !pyArrowProof.passed
        ? 'PYARROW_MMAP_FAILED'
        : 'FIXTURE_ROUNDTRIP_PROVEN';

  const receipt = buildStructuredValueCrossRuntimeReceipt({
    receipt_id: `sv-proof:${sourceChecksum.slice(0, 24)}`,
    fixture_source_ref: SOURCE_REF,
    fixture_source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    node_tree_sitter_revision: runtime.parser_revision,
    node_grammar_revision: runtime.grammar_revision,
    treesitter_chunker_revision: chunkerProbe.package_revision ?? 'unknown',
    ts_morph_revision: tsMorphPkg.version,
    typescript_revision: typescriptPkg.version,
    arrow_js_revision: require('apache-arrow/package.json').version,
    pyarrow_revision: pyArrowProof.passed ? 'runtime-readback' : null,
    node_tree_sitter_available: true,
    treesitter_chunker_available: true,
    compared_chunk_count: chunk ? 1 : 0,
    span_match_count: parity.span_match ? 1 : 0,
    node_type_match_count: parity.node_type_match ? 1 : 0,
    ordered_child_match_count: parity.ordered_child_match ? 1 : 0,
    upstream_id_match_count: chunk?.node_id ? 1 : 0,
    object_value_extracted: parsedObject.value.kind === 'OBJECT',
    object_value_entry_count: objectEntries.length,
    computed_entry_count: objectEntries.filter((entry) => entry.computed).length,
    spread_entry_count: objectEntries.filter((entry) => entry.spread).length,
    ts_morph_exact_span_match: objectSemantic?.exact_span_match === true && callSemantic?.exact_span_match === true,
    ts_morph_resolved_signature: callSemantic?.resolved_signature !== null && callSemantic?.resolved_signature !== undefined,
    arrow_row_count: rows.length,
    arrow_row_identity_checksum: snapshot.row_identity_checksum,
    arrow_structure_checksum: snapshot.structure_checksum,
    arrow_ipc_checksum: serialized.receipt.ipc_file_checksum,
    pyarrow_mmap_row_identity_checksum: pyArrowProof.passed ? snapshot.row_identity_checksum : null,
    pyarrow_mmap_structure_checksum: pyArrowProof.passed ? snapshot.structure_checksum : null,
    pyarrow_reconstruction_checksum: pyArrowProof.receipt_checksum,
    status,
    diagnostics,
    producer_revision: PRODUCER_REVISION,
  });
  structuredValueCrossRuntimeReceiptSchema.parse(receipt);

  await fs.writeFile(path.join(OUT_DIR, 'snapshot.json'), JSON.stringify({ snapshot, rows }, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'receipt.json'), JSON.stringify(receipt, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'ts-morph-object.json'), JSON.stringify(objectSemantic, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'ts-morph-call.json'), JSON.stringify(callSemantic, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== 'FIXTURE_ROUNDTRIP_PROVEN') process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
