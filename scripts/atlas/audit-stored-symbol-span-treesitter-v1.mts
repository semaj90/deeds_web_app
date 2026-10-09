import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNodeTreeSitterSource } from '../../sveltekit-frontend/src/lib/server/atlas/language/node-tree-sitter-structured-value.js';
import { utf16OffsetToUtf8Byte } from './lib/tree-sitter-coordinate-v1.mjs';
import { reconstructAstGrepNominationIdV1 } from './lib/nomination-id-reconstruction-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratchRoot = path.join(root, '.tmp', 'atlas') + path.sep;
const inputPath = path.resolve(root, process.argv[2] ?? '.tmp/atlas/live-packet-symbol-ast-observation-v1-continuation.json');
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
const outputPath = path.resolve(root, process.argv[3] ?? `.tmp/atlas/stored-symbol-span-treesitter-v1-${timestamp}.json`);
if (!inputPath.startsWith(scratchRoot) || !outputPath.startsWith(scratchRoot)) throw new Error('INPUT_AND_OUTPUT_MUST_BE_UNDER_TMP_ATLAS');

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const declarationTypes = new Set([
  'class_declaration', 'abstract_class_declaration', 'function_declaration', 'method_definition',
  'interface_declaration', 'type_alias_declaration', 'enum_declaration', 'variable_declarator',
]);
function spanRelation(span: { start: number; end: number }, node: { startByte: number; endByte: number }) {
  if (span.start === node.startByte && span.end === node.endByte) return 'EXACT';
  if (span.start <= node.startByte && span.end >= node.endByte) return 'STORED_OR_OBSERVED_ENCLOSES_NODE';
  if (span.start >= node.startByte && span.end <= node.endByte) return 'SPAN_IS_SUBRANGE_OF_NODE';
  if (span.start < node.endByte && span.end > node.startByte) return 'OVERLAPS_NODE';
  return 'DISJOINT_FROM_NODE';
}
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as Record<string, any>;
const { checksum: inputChecksum, ...inputBody } = input;
if (sha256(Buffer.from(JSON.stringify(inputBody), 'utf8')) !== inputChecksum) throw new Error('INPUT_PROOF_CHECKSUM_MISMATCH');
if (input.schema !== 'atlas.live-packet-symbol-ast-observation-proof.v1'
  || input.databaseTransaction !== 'REPEATABLE_READ_READ_ONLY_ROLLED_BACK'
  || input.persistentStoreWritesPerformed !== false) throw new Error('READ_ONLY_LIVE_PROOF_REQUIRED');

const currentNominationArtifact = input.currentNominationArtifact ?? {};
const nominationArtifactPath = path.resolve(root, String(currentNominationArtifact.path ?? ''));
const nominationArtifactRelative = path.relative(scratchRoot, nominationArtifactPath);
if (!nominationArtifactRelative || nominationArtifactRelative.startsWith('..') || path.isAbsolute(nominationArtifactRelative)) {
  throw new Error('CURRENT_NOMINATION_ARTIFACT_MUST_BE_UNDER_TMP_ATLAS');
}
const nominationArtifactBytes = fs.readFileSync(nominationArtifactPath);
const nominationArtifactChecksum = `sha256:${sha256(nominationArtifactBytes)}`;
if (nominationArtifactChecksum !== currentNominationArtifact.checksum) throw new Error('CURRENT_NOMINATION_ARTIFACT_CHECKSUM_MISMATCH');
const currentNominationRows = nominationArtifactBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line: string) => JSON.parse(line));
const currentNominationIds = new Set(currentNominationRows.map((row: Record<string, any>) => String(row.nomination_id ?? '')));

const mismatches = (input.spanDiagnosticSamples as Array<Record<string, any>>)
  .filter((item) => item.verdict !== 'EXACT_MATCH');
const sourceCache = new Map<string, { rootNode: any; parserRevision: string; grammarRevision: string; sourceBytes: Buffer; sourceText: string }>();
const rows = mismatches.map((item) => {
  const sourceRef = String(item.sourceRef ?? item.stored?.sourceRef ?? '');
  const sourcePath = path.resolve(root, sourceRef);
  const relative = path.relative(root, sourcePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('SOURCE_REF_OUTSIDE_REPOSITORY');
  let parsed = sourceCache.get(sourceRef);
  if (!parsed) {
    const sourceBytes = fs.readFileSync(sourcePath);
    if (`sha256:${sha256(sourceBytes)}` !== item.sourceDigest) throw new Error(`SOURCE_REVISION_MISMATCH:${sourceRef}`);
    const sourceText = sourceBytes.toString('utf8');
    const parsedSource = parseNodeTreeSitterSource({ source: sourceText, language: 'typescript' });
    parsed = { rootNode: parsedSource.rootNode, parserRevision: parsedSource.parser_revision, grammarRevision: parsedSource.grammar_revision, sourceBytes, sourceText };
    sourceCache.set(sourceRef, parsed);
  }

  const start = Number(item.stored?.start);
  const end = Number(item.stored?.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > parsed.sourceBytes.length) {
    throw new Error(`INVALID_STORED_SPAN:${sourceRef}`);
  }
  const nodes: Array<{ type: string; start: number; end: number; startUtf16: number; endUtf16: number; depth: number; declaredName: string | null; declaredNameRange: { startByte: number; endByte: number } | null }> = [];
  const stack = [{ node: parsed.rootNode, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    const startByte = utf16OffsetToUtf8Byte(parsed.sourceText, node.startIndex);
    const endByte = utf16OffsetToUtf8Byte(parsed.sourceText, node.endIndex);
    const declaredNameNode = node.childForFieldName?.('name') ?? null;
    const declaredNameStart = declaredNameNode ? utf16OffsetToUtf8Byte(parsed.sourceText, declaredNameNode.startIndex) : null;
    const declaredNameEnd = declaredNameNode ? utf16OffsetToUtf8Byte(parsed.sourceText, declaredNameNode.endIndex) : null;
    const declaredNameRange = declaredNameStart !== null && declaredNameEnd !== null
      ? { startByte: declaredNameStart, endByte: declaredNameEnd } : null;
    if (startByte !== null && endByte !== null) nodes.push({
      type: node.type, start: startByte, end: endByte, startUtf16: node.startIndex, endUtf16: node.endIndex, depth,
      declaredName: declaredNameRange ? parsed.sourceBytes.subarray(declaredNameRange.startByte, declaredNameRange.endByte).toString('utf8') : null,
      declaredNameRange,
    });
    for (let index = node.childCount - 1; index >= 0; index -= 1) {
      const child = node.child(index);
      if (child) stack.push({ node: child, depth: depth + 1 });
    }
  }
  const exactNodes = nodes.filter((node) => node.start === start && node.end === end).map((node) => node.type).sort();
  const enclosing = nodes.filter((node) => node.start <= start && node.end >= end)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start) || right.depth - left.depth)
    .slice(0, 5)
    .map(({ type, start: nodeStart, end: nodeEnd }) => ({ type, startByte: nodeStart, endByte: nodeEnd }));
  const startBoundary = nodes.filter((node) => node.start <= start && node.end > start)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start) || right.depth - left.depth)
    .slice(0, 3).map(({ type, start: nodeStart, end: nodeEnd }) => ({ type, startByte: nodeStart, endByte: nodeEnd }));
  const endBoundary = nodes.filter((node) => node.start < end && node.end >= end)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start) || right.depth - left.depth)
    .slice(0, 3).map(({ type, start: nodeStart, end: nodeEnd }) => ({ type, startByte: nodeStart, endByte: nodeEnd }));
  const symbolName = String(item.stored?.name ?? '').split('.').at(-1) ?? '';
  const nameTokens = symbolName ? nodes.filter((node) => /(?:identifier|name)$/.test(node.type)
    && parsed.sourceBytes.subarray(node.start, node.end).toString('utf8') === symbolName)
    .map(({ type, start: nodeStart, end: nodeEnd }) => ({ type, startByte: nodeStart, endByte: nodeEnd })) : [];
  const declarationNodes = nodes.filter((node) => declarationTypes.has(node.type) && node.declaredName === symbolName)
    .map(({ type, start: nodeStart, end: nodeEnd, declaredNameRange }) => ({ type, startByte: nodeStart, endByte: nodeEnd, nameSpan: declaredNameRange }))
    .sort((left, right) => (left.endByte - left.startByte) - (right.endByte - right.startByte) || left.startByte - right.startByte);
  const observedStart = Number(item.observed?.startByte);
  const observedEnd = Number(item.observed?.endByte);
  const utf16Start = utf16OffsetToUtf8Byte(parsed.sourceText, start);
  const utf16End = utf16OffsetToUtf8Byte(parsed.sourceText, end);
  const utf16ConversionMatchesObserved = utf16Start !== null && utf16End !== null
    && utf16Start === observedStart && utf16End === observedEnd;
  const storedNominationId = String(item.stored?.nominationId ?? '');
  const spanNominationRevisionCandidates = ['workspace:0', item.sourceDigest, String(item.sourceDigest ?? '').replace(/^sha256:/, ''), ''];
  const reconstructedNomination = spanNominationRevisionCandidates.map((sourceRevision) => ({
    sourceRevision,
    nominationId: reconstructAstGrepNominationIdV1({
      sourceRef,
      sourceRevision,
      kind: item.stored?.sourceKind ?? item.stored?.kind ?? '',
      name: symbolName,
      startByte: start,
      endByte: end,
    }),
  })).find((candidate) => candidate.nominationId === storedNominationId) ?? null;
  return {
    packetKey: item.packetKey,
    symbolVersionId: item.symbolVersionId,
    qualifiedName: item.stored?.name ?? null,
    sourceRef,
    sourceRevision: item.sourceDigest,
    storedSpan: { startByte: start, endByte: end },
    observedAstGrepSpan: { startByte: item.observed?.startByte, endByte: item.observed?.endByte },
    exactTreeSitterNodeTypes: exactNodes,
    observedExactTreeSitterNodeTypes: nodes.filter((node) => node.start === observedStart && node.end === observedEnd).map((node) => node.type).sort(),
    symbolNameTokenRanges: nameTokens.slice(0, 12),
    symbolDeclarationNodeRanges: declarationNodes.slice(0, 12),
    storedNominationId,
    storedNominationIdentityReconstruction: {
      status: reconstructedNomination ? 'MATCHED_STORED_SPAN_MATERIAL' : 'NOT_REPRODUCED_FROM_TESTED_REVISIONS',
      sourceRevision: reconstructedNomination?.sourceRevision ?? null,
      sourceRevisionCandidatesTested: spanNominationRevisionCandidates,
      identityMaterialMatchesStoredSpan: Boolean(reconstructedNomination),
      presentInChecksummedCurrentNominationArtifact: currentNominationIds.has(storedNominationId),
    },
    storedSpanContainsSymbolToken: nameTokens.some((token) => token.startByte >= start && token.endByte <= end),
    observedSpanContainsSymbolToken: nameTokens.some((token) => token.startByte >= observedStart && token.endByte <= observedEnd),
    declarationBoundaryComparison: declarationNodes.slice(0, 5).map((node) => ({
      node,
      storedRelation: spanRelation({ start, end }, node),
      observedRelation: spanRelation({ start: observedStart, end: observedEnd }, node),
    })),
    coordinateHypothesis: {
      storedInterpretedAs: 'UTF8_BYTE_OFFSET',
      alternateInterpretation: 'UTF16_CODE_UNIT_OFFSET_FROM_FILE_START',
      utf16ConvertedSpan: utf16Start !== null && utf16End !== null ? { startByte: utf16Start, endByte: utf16End } : null,
      matchesObservedAstGrepSpan: utf16ConversionMatchesObserved,
      verdict: utf16ConversionMatchesObserved ? 'UTF16_CONVERSION_EXPLAINS_SPAN' : 'UTF16_CONVERSION_DOES_NOT_EXPLAIN_SPAN',
    },
    smallestEnclosingTreeSitterNodes: enclosing,
    startBoundaryNodes: startBoundary,
    endBoundaryNodes: endBoundary,
    storedSliceChecksum: sha256(parsed.sourceBytes.subarray(start, end)),
    parserRevision: parsed.parserRevision,
    grammarRevision: parsed.grammarRevision,
    coordinateUnit: 'UTF8_BYTE_OFFSET',
    treeSitterCoordinateUnit: 'UTF16_CODE_UNIT_OFFSET_CONVERTED_TO_UTF8_BYTES',
    semanticConclusion: exactNodes.length ? 'EXACT_TREE_SITTER_RANGE_FOUND' : 'NO_EXACT_TREE_SITTER_RANGE; BOUNDARY_SEMANTICS_UNRESOLVED',
  };
});

const payload = {
  schema: 'atlas.stored-symbol-span-treesitter-audit.v1',
  status: 'DIAGNOSTIC_ONLY_NOT_ADMISSION',
  inputProofChecksum: inputChecksum,
  inputProofPath: path.relative(root, inputPath).replaceAll('\\', '/'),
  currentNominationArtifact: {
    path: currentNominationArtifact.path,
    expectedChecksum: currentNominationArtifact.checksum,
    observedChecksum: nominationArtifactChecksum,
    rowCount: currentNominationRows.length,
    checksumStatus: 'MATCH',
    authority: currentNominationArtifact.authority ?? 'UNSPECIFIED',
  },
  inspectedMismatchCount: rows.length,
  rows,
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  networkRequestsPerformed: false,
};
const receipt = { ...payload, checksum: sha256(Buffer.from(JSON.stringify(payload), 'utf8')) };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const { checksum, ...readbackBody } = readback;
if (sha256(Buffer.from(JSON.stringify(readbackBody), 'utf8')) !== checksum) throw new Error('OUTPUT_READBACK_CHECKSUM_MISMATCH');
console.log(JSON.stringify({
  status: readback.status,
  inspectedMismatchCount: readback.inspectedMismatchCount,
  exactTreeSitterNodeCount: readback.rows.filter((row: Record<string, any>) => row.exactTreeSitterNodeTypes.length > 0).length,
  observedExactTreeSitterNodeCount: readback.rows.filter((row: Record<string, any>) => row.observedExactTreeSitterNodeTypes.length > 0).length,
  storedNominationIdsReconstructed: readback.rows.filter((row: Record<string, any>) => row.storedNominationIdentityReconstruction.status === 'MATCHED_STORED_SPAN_MATERIAL').length,
  storedNominationIdsAbsentFromCurrentArtifact: readback.rows.filter((row: Record<string, any>) => !row.storedNominationIdentityReconstruction.presentInChecksummedCurrentNominationArtifact).length,
  readback: 'MATCH',
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  reportPath: path.relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2));
