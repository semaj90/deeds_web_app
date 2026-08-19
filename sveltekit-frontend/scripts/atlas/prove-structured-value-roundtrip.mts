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
  deriveStructuredValueProofStatus,
  structuredValueCrossRuntimeReceiptSchema,
  type SyntaxNodeLike,
} from '../../../packages/parent-atlas/src/index.ts';
import {
  parseStructuredValueAtByteRange,
  probeNodeTreeSitterRuntime,
} from '../../src/lib/server/atlas/language/node-tree-sitter-structured-value.ts';
import {
  TsMorphStructuredValueEnricher,
  utf16OffsetToUtf8ByteOffset,
  utf8ByteOffsetToUtf16Offset,
} from '../../src/lib/server/atlas/language/ts-morph-structured-value-enricher.ts';
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

function packageVersion(name: string): string {
  return (require(`${name}/package.json`) as { version: string }).version;
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

type TreeNode = SyntaxNodeLike & { namedChildren?: TreeNode[] };

type NodeRuntime = {
  Parser: new () => { setLanguage(language: unknown): void; parse(source: string): { rootNode: TreeNode } };
  grammar: unknown;
};

function loadNodeRuntime(): NodeRuntime {
  const parserModule = require('tree-sitter') as any;
  const grammarModule = require('tree-sitter-typescript') as { typescript: unknown };
  return { Parser: parserModule.default ?? parserModule, grammar: grammarModule.typescript };
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

function nodeText(sourceBytes: Buffer, node: TreeNode): string {
  return sourceBytes.subarray(node.startIndex, node.endIndex).toString('utf8');
}

function buildPermitNodes(root: TreeNode, sourceBytes: Buffer): TreeNode[] {
  return allNamedNodes(root).filter((node) =>
    ['function_declaration', 'export_statement'].includes(node.type) && /\bbuildPermitPatch\b/.test(nodeText(sourceBytes, node)));
}

function runChunkerProbe(output: string): any {
  const python = process.env.PYTHON_BIN ?? process.env.PYTHON ?? 'python';
  const result = spawnSync(python, [
    path.resolve(REPO_ROOT, 'python/prove_structured_value_chunker_fixture.py'),
    '--file', FIXTURE,
    '--language', 'typescript',
    '--output', output,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return {
      status: 'BLOCKED_TREE_SITTER_CHUNKER',
      package_revision: null,
      chunks: [],
      diagnostics: [`TREE_SITTER_CHUNKER_PROBE_PROCESS_FAILED:${result.status}:${(result.stderr || result.stdout).trim()}`],
    };
  }
}

function chooseBuildPermitChunk(chunks: any[]): any | null {
  const candidates = chunks.filter((chunk) => chunk?.name === 'buildPermitPatch' || /\bbuildPermitPatch\b/.test(String(chunk?.content ?? '')));
  candidates.sort((a, b) => Number(a.byte_end - a.byte_start) - Number(b.byte_end - b.byte_start));
  return candidates[0] ?? null;
}

function semanticNodeKindMatches(chunkNodeType: unknown, exactNode: TreeNode | null): boolean {
  if (!exactNode) return false;
  const chunk = String(chunkNodeType ?? '').toLowerCase();
  if (chunk === exactNode.type) return true;
  if (chunk.includes('function')) {
    if (exactNode.type === 'function_declaration') return true;
    if (exactNode.type === 'export_statement') {
      for (let index = 0; index < exactNode.namedChildCount; index += 1) {
        if (exactNode.namedChild(index)?.type === 'function_declaration') return true;
      }
    }
  }
  return false;
}

async function pyArrowProof(input: {
  arrowPath: string;
  rootOrdinal: number;
  rowIdentityChecksum: string;
  structureChecksum: string;
}): Promise<{ passed: boolean; version: string | null; rowIdentityChecksum: string | null; structureChecksum: string | null; receiptChecksum: string | null; diagnostics: string[] }> {
  const python = process.env.PYTHON_BIN ?? process.env.PYTHON ?? 'python';
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.resolve(REPO_ROOT, 'python'))})
import pyarrow
from atlas_structured_value_arrow import read_structured_value_arrow_mmap
_, receipt = read_structured_value_arrow_mmap(
    ${JSON.stringify(input.arrowPath)},
    root_value_ordinal=${input.rootOrdinal},
    expected_row_identity_checksum=${JSON.stringify(input.rowIdentityChecksum)},
    expected_structure_checksum=${JSON.stringify(input.structureChecksum)},
)
print(json.dumps({"version": pyarrow.__version__, "receipt": receipt.to_dict()}, sort_keys=True))
`;
  const result = spawnSync(python, ['-c', code], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    return {
      passed: false,
      version: null,
      rowIdentityChecksum: null,
      structureChecksum: null,
      receiptChecksum: null,
      diagnostics: [`PYARROW_MMAP_FAILED:${(result.stderr || result.stdout).trim()}`],
    };
  }
  const parsed = JSON.parse(result.stdout.trim());
  return {
    passed: true,
    version: String(parsed.version),
    rowIdentityChecksum: parsed.receipt.row_identity_checksum,
    structureChecksum: parsed.receipt.structure_checksum,
    receiptChecksum: sha256(JSON.stringify(parsed.receipt)),
    diagnostics: [],
  };
}

function blockedReceipt(input: {
  sourceChecksum: string;
  runtimeProbe: ReturnType<typeof probeNodeTreeSitterRuntime>;
  chunkerProbe: any;
  status: 'BLOCKED_NODE_TREE_SITTER' | 'BLOCKED_TREE_SITTER_CHUNKER';
}) {
  return buildStructuredValueCrossRuntimeReceipt({
    receipt_id: `sv-proof:${input.sourceChecksum.slice(0, 24)}`,
    fixture_source_ref: SOURCE_REF,
    fixture_source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    node_tree_sitter_revision: input.runtimeProbe.parser_revision,
    node_grammar_revision: input.runtimeProbe.grammar_revision,
    treesitter_chunker_revision: input.chunkerProbe.package_revision ?? null,
    ts_morph_revision: null,
    typescript_revision: null,
    arrow_js_revision: null,
    pyarrow_revision: null,
    node_tree_sitter_available: input.runtimeProbe.available,
    treesitter_chunker_available: input.chunkerProbe.status === 'READY',
    compared_chunk_count: 0,
    span_match_count: 0,
    node_type_match_count: 0,
    source_span_checksum_match_count: 0,
    upstream_id_match_count: 0,
    object_value_extracted: false,
    object_value_entry_count: 0,
    computed_entry_count: 0,
    spread_entry_count: 0,
    object_span_only_identity: false,
    ts_morph_exact_span_match: false,
    ts_morph_resolved_signature: false,
    unicode_offset_roundtrip_observed: false,
    arrow_row_count: 0,
    arrow_row_identity_checksum: null,
    arrow_structure_checksum: null,
    arrow_ipc_checksum: null,
    pyarrow_mmap_row_identity_checksum: null,
    pyarrow_mmap_structure_checksum: null,
    pyarrow_reconstruction_checksum: null,
    status: input.status,
    diagnostics: [...input.runtimeProbe.diagnostics, ...(input.chunkerProbe.diagnostics ?? [])],
    producer_revision: PRODUCER_REVISION,
  });
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const source = await fs.readFile(FIXTURE, 'utf8');
  const sourceBytes = Buffer.from(source, 'utf8');
  const sourceChecksum = sha256(sourceBytes);
  const runtimeProbe = probeNodeTreeSitterRuntime('typescript');
  const chunkerProbe = runChunkerProbe(path.join(OUT_DIR, 'treesitter-chunker.json'));

  if (!runtimeProbe.available) {
    const receipt = blockedReceipt({ sourceChecksum, runtimeProbe, chunkerProbe, status: 'BLOCKED_NODE_TREE_SITTER' });
    await fs.writeFile(path.join(OUT_DIR, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
    process.exitCode = 3;
    return;
  }
  if (chunkerProbe.status !== 'READY') {
    const receipt = blockedReceipt({ sourceChecksum, runtimeProbe, chunkerProbe, status: 'BLOCKED_TREE_SITTER_CHUNKER' });
    await fs.writeFile(path.join(OUT_DIR, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt, null, 2));
    process.exitCode = 3;
    return;
  }

  const diagnostics: string[] = [];
  const runtime = loadNodeRuntime();
  const parser = new runtime.Parser();
  parser.setLanguage(runtime.grammar);
  const root = parser.parse(source).rootNode;
  const chunk = chooseBuildPermitChunk(chunkerProbe.chunks ?? []);
  const candidateNodes = buildPermitNodes(root, sourceBytes);
  const chunkStart = Number(chunk?.byte_start ?? -1);
  const chunkEnd = Number(chunk?.byte_end ?? -1);
  const exactChunkNode = candidateNodes.find((node) => node.startIndex === chunkStart && node.endIndex === chunkEnd) ?? null;
  const spanMatch = exactChunkNode !== null;
  const nodeTypeMatch = semanticNodeKindMatches(chunk?.node_type, exactChunkNode);
  const chunkChecksum = chunk && chunkStart >= 0 && chunkEnd >= chunkStart ? sha256(sourceBytes.subarray(chunkStart, chunkEnd)) : null;
  const nodeChecksum = exactChunkNode ? sha256(sourceBytes.subarray(exactChunkNode.startIndex, exactChunkNode.endIndex)) : null;
  const sourceSpanChecksumMatch = spanMatch && chunkChecksum === nodeChecksum && chunk?.byte_slice_matches_content !== false;

  let upstreamIdentityAttached = false;
  if (exactChunkNode && chunk?.upstream_node_id) {
    const functionStructured = parseStructuredValueAtByteRange({
      source_text: source,
      source_ref: SOURCE_REF,
      source_revision: SOURCE_REVISION,
      workspace_revision: WORKSPACE_REVISION,
      language: 'typescript',
      start_byte: exactChunkNode.startIndex,
      end_byte: exactChunkNode.endIndex,
      resolve_native_identity: (node) => {
        if (node.startIndex !== exactChunkNode.startIndex || node.endIndex !== exactChunkNode.endIndex) return null;
        return {
          upstream_node_id: chunk.upstream_node_id,
          upstream_chunk_id: chunk.upstream_chunk_id ?? chunk.chunk_id ?? null,
          start_byte: exactChunkNode.startIndex,
          end_byte: exactChunkNode.endIndex,
          source_span_checksum: sha256(sourceBytes.subarray(exactChunkNode.startIndex, exactChunkNode.endIndex)),
          parity_proven: false,
        };
      },
    });
    upstreamIdentityAttached =
      functionStructured.value.provenance.identity_status === 'NATIVE_UPSTREAM' &&
      functionStructured.value.provenance.upstream_node_id === chunk.upstream_node_id;
  }

  const objectRange = utf16RangeToUtf8(source, utf16RangeBetweenMarkers(source, '/* ATLAS_STRUCTURED_VALUE_START */', '/* ATLAS_STRUCTURED_VALUE_END */'));
  const parsedObject = parseStructuredValueAtByteRange({
    source_text: source,
    source_ref: SOURCE_REF,
    source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    language: 'typescript',
    start_byte: objectRange.start_byte,
    end_byte: objectRange.end_byte,
  });
  const objectEntries = parsedObject.value.kind === 'OBJECT' ? parsedObject.value.entries : [];

  const callRange = utf16RangeToUtf8(source, utf16RangeBetweenMarkers(source, '/* ATLAS_RESOLVED_CALL_START */', '/* ATLAS_RESOLVED_CALL_END */'));
  const parsedCall = parseStructuredValueAtByteRange({
    source_text: source,
    source_ref: SOURCE_REF,
    source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    language: 'typescript',
    start_byte: callRange.start_byte,
    end_byte: callRange.end_byte,
  });

  const tsMorphVersion = packageVersion('ts-morph');
  const typescriptVersion = packageVersion('typescript');
  const project = new Project({ compilerOptions: { strict: true, noEmit: true } });
  project.addSourceFileAtPath(FIXTURE);
  const enricher = new TsMorphStructuredValueEnricher({
    project,
    project_revision: sourceChecksum,
    ts_morph_revision: tsMorphVersion,
    typescript_revision: typescriptVersion,
    tsconfig_ref: null,
  });
  const objectSemantic = enricher.enrich({ provenance: parsedObject.value.provenance, source_text: source });
  const callSemantic = enricher.enrich({ provenance: parsedCall.value.provenance, source_text: source });
  const unicodeOffsetRoundtrip = [objectRange.start_byte, objectRange.end_byte, callRange.start_byte, callRange.end_byte].every((byteOffset) => {
    const utf16 = utf8ByteOffsetToUtf16Offset(source, byteOffset);
    return utf16OffsetToUtf8ByteOffset(source, utf16) === byteOffset;
  });

  const arrowVersion = packageVersion('apache-arrow');
  const { snapshot, rows } = buildStructuredValueArrowSnapshot({
    snapshot_id: `structured-value:${sourceChecksum.slice(0, 32)}`,
    snapshot_revision: SOURCE_REVISION,
    source_snapshot_revision: SOURCE_REVISION,
    arrow_js_revision: arrowVersion,
    arrow_schema_revision: 'atlas.structured-value-arrow.v1',
    root: parsedObject.value,
    producer_revision: PRODUCER_REVISION,
  });
  const serialized = serializeStructuredValueArrowFile(rows);
  const arrowPath = path.join(OUT_DIR, 'structured-value.arrow');
  await fs.writeFile(arrowPath, serialized.bytes);
  const pyarrow = await pyArrowProof({
    arrowPath,
    rootOrdinal: snapshot.root_value_ordinal,
    rowIdentityChecksum: snapshot.row_identity_checksum,
    structureChecksum: snapshot.structure_checksum,
  });
  diagnostics.push(...pyarrow.diagnostics);

  const chunkBoundaryPassed = Boolean(chunk) && spanMatch && nodeTypeMatch && sourceSpanChecksumMatch && upstreamIdentityAttached;
  const structuredValuePassed = parsedObject.value.kind === 'OBJECT' && objectEntries.some((entry) => entry.computed) && objectEntries.some((entry) => entry.spread) && parsedObject.value.provenance.identity_status === 'SPAN_ONLY';
  const tsMorphPassed = objectSemantic?.exact_span_match === true && callSemantic?.exact_span_match === true && Boolean(callSemantic.resolved_signature) && unicodeOffsetRoundtrip;
  const arrowNested = serialized.receipt.physical_schema.nested_columns;
  const arrowPassed = Boolean(serialized.receipt.ipc_file_checksum) && arrowNested.provenance_struct && arrowNested.members_list_struct && arrowNested.entries_list_struct;
  const status = deriveStructuredValueProofStatus({
    node_tree_sitter_available: true,
    treesitter_chunker_available: true,
    target_chunk_found: Boolean(chunk),
    chunk_boundary_passed: chunkBoundaryPassed,
    structured_value_passed: structuredValuePassed,
    ts_morph_passed: tsMorphPassed,
    arrow_ipc_passed: arrowPassed,
    pyarrow_mmap_passed: pyarrow.passed,
  });

  const receipt = buildStructuredValueCrossRuntimeReceipt({
    receipt_id: `sv-proof:${sourceChecksum.slice(0, 24)}`,
    fixture_source_ref: SOURCE_REF,
    fixture_source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    node_tree_sitter_revision: runtimeProbe.parser_revision,
    node_grammar_revision: runtimeProbe.grammar_revision,
    treesitter_chunker_revision: chunkerProbe.package_revision ?? 'unknown',
    ts_morph_revision: tsMorphVersion,
    typescript_revision: typescriptVersion,
    arrow_js_revision: arrowVersion,
    pyarrow_revision: pyarrow.version,
    node_tree_sitter_available: true,
    treesitter_chunker_available: true,
    compared_chunk_count: chunk ? 1 : 0,
    span_match_count: spanMatch ? 1 : 0,
    node_type_match_count: nodeTypeMatch ? 1 : 0,
    source_span_checksum_match_count: sourceSpanChecksumMatch ? 1 : 0,
    upstream_id_match_count: upstreamIdentityAttached ? 1 : 0,
    object_value_extracted: parsedObject.value.kind === 'OBJECT',
    object_value_root_kind: parsedObject.value.kind,
    object_value_entry_count: objectEntries.length,
    computed_entry_count: objectEntries.filter((entry) => entry.computed).length,
    spread_entry_count: objectEntries.filter((entry) => entry.spread).length,
    object_span_only_identity: parsedObject.value.provenance.identity_status === 'SPAN_ONLY',
    ts_morph_exact_span_match: objectSemantic?.exact_span_match === true && callSemantic?.exact_span_match === true,
    ts_morph_resolved_signature: Boolean(callSemantic?.resolved_signature),
    unicode_offset_roundtrip_observed: unicodeOffsetRoundtrip,
    arrow_row_count: rows.length,
    arrow_row_identity_checksum: snapshot.row_identity_checksum,
    arrow_structure_checksum: snapshot.structure_checksum,
    arrow_ipc_checksum: serialized.receipt.ipc_file_checksum,
    arrow_nested_provenance_struct: arrowNested.provenance_struct,
    arrow_nested_members_list_struct: arrowNested.members_list_struct,
    arrow_nested_entries_list_struct: arrowNested.entries_list_struct,
    pyarrow_mmap_row_identity_checksum: pyarrow.rowIdentityChecksum,
    pyarrow_mmap_structure_checksum: pyarrow.structureChecksum,
    pyarrow_reconstruction_checksum: pyarrow.receiptChecksum,
    status,
    diagnostics,
    producer_revision: PRODUCER_REVISION,
  });
  structuredValueCrossRuntimeReceiptSchema.parse(receipt);

  await fs.writeFile(path.join(OUT_DIR, 'snapshot.json'), JSON.stringify({ snapshot, rows }, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'ts-morph-object.json'), JSON.stringify(objectSemantic, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'ts-morph-call.json'), JSON.stringify(callSemantic, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.proof_status !== 'FIXTURE_ROUNDTRIP_PROVEN') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
