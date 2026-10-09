import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNodeTreeSitterSource } from '../../sveltekit-frontend/src/lib/server/atlas/language/node-tree-sitter-structured-value.js';
import { extractAstGrepStructuralCandidates } from '../../sveltekit-frontend/src/lib/server/atlas/language/ast-grep-structural-topk.js';
import { utf16OffsetToUtf8Byte } from './lib/tree-sitter-coordinate-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratchRoot = path.join(root, '.tmp', 'atlas');
const inputPath = path.resolve(root, process.argv[2] ?? '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
const outputPath = path.resolve(root, process.argv[3] ?? `.tmp/atlas/current-ast-nomination-span-sample-v1-${timestamp}.json`);
const underScratch = (candidate: string) => {
  const relative = path.relative(scratchRoot, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
if (!underScratch(inputPath) || !underScratch(outputPath)) throw new Error('INPUT_AND_OUTPUT_MUST_BE_UNDER_TMP_ATLAS');

const sha256 = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const inputBytes = fs.readFileSync(inputPath);
const nominationRows = inputBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const targetKinds = new Map([
  ['function', 'FUNCTION'], ['method', 'METHOD'], ['class', 'CLASS'], ['interface', 'INTERFACE'],
  ['type', 'TYPE_ALIAS'], ['enum', 'ENUM'], ['variable', 'VARIABLE'],
]);
const extensions = new Map([
  ['ts', 'TYPESCRIPT'], ['mts', 'TYPESCRIPT'], ['cts', 'TYPESCRIPT'],
  ['tsx', 'TSX'], ['js', 'JAVASCRIPT'], ['mjs', 'JAVASCRIPT'], ['cjs', 'JAVASCRIPT'], ['jsx', 'JSX'],
]);
const parsedSources = new Map<string, { sourceBytes: Buffer; sourceText: string; currentSourceRevision: string | null; candidates: Awaited<ReturnType<typeof extractAstGrepStructuralCandidates>>; status: string }>();
const rows: Array<Record<string, any>> = [];
for (const row of nominationRows as Array<Record<string, any>>) {
  const sourceRef = String(row.source_ref ?? '').replaceAll('\\', '/');
  const sourceRevision = String(row.source_revision ?? '');
  const absolutePath = path.resolve(root, sourceRef);
  const relativePath = path.relative(root, absolutePath);
  const ext = path.extname(sourceRef).slice(1).toLowerCase();
  const language = extensions.get(ext);
  const expectedKind = targetKinds.get(String(row.kind ?? '').toLowerCase());
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath) || !language || !expectedKind) {
    rows.push({ nominationId: row.nomination_id ?? null, sourceRef, kind: row.kind ?? null, status: 'UNSUPPORTED_OR_UNSAFE_INPUT' });
    continue;
  }
  const key = `${sourceRef}\0${sourceRevision}`;
  let parsed = parsedSources.get(key);
  if (!parsed) {
    if (!fs.existsSync(absolutePath)) {
      parsed = { sourceBytes: Buffer.alloc(0), sourceText: '', currentSourceRevision: null, candidates: [], status: 'SOURCE_MISSING' };
    } else {
      const sourceBytes = fs.readFileSync(absolutePath);
      const sourceText = sourceBytes.toString('utf8');
      const currentSourceRevision = sha256(sourceBytes);
      if (currentSourceRevision !== sourceRevision) {
        parsed = { sourceBytes, sourceText, currentSourceRevision, candidates: [], status: 'SOURCE_REVISION_MISMATCH' };
      } else {
        try {
          const candidates = await extractAstGrepStructuralCandidates({
            schema: 'atlas.ast-grep-structural-extraction-input.v1',
            code: sourceText,
            filePath: sourceRef,
            sourceRef,
            language,
            workspaceRevision: String(row.workspace_revision ?? ''),
            sourceRevision,
            producerRevision: 'atlas.current-ast-nomination-span-sample.v1',
          });
          parsed = { sourceBytes, sourceText, currentSourceRevision, candidates, status: 'SOURCE_REVISION_MATCH' };
        } catch {
          parsed = { sourceBytes, sourceText, currentSourceRevision, candidates: [], status: 'EXTRACTION_FAILED' };
        }
      }
    }
    parsedSources.set(key, parsed);
  }
  if (parsed.status !== 'SOURCE_REVISION_MATCH') {
    rows.push({
      nominationId: row.nomination_id ?? null,
      sourceRef,
      kind: row.kind ?? null,
      inputSourceRevision: sourceRevision || null,
      currentSourceRevision: parsed.currentSourceRevision,
      sourceRevisionMatches: parsed.currentSourceRevision !== null && parsed.currentSourceRevision === sourceRevision,
      sourceByteLength: parsed.sourceBytes.length,
      status: parsed.status,
    });
    continue;
  }
  const requestedName = String(row.name ?? row.qualified_name ?? '').split('.').at(-1);
  const namedCandidates = parsed.candidates.filter((candidate) =>
    candidate.name === requestedName || candidate.name.endsWith(`.${requestedName}`));
  const matches = namedCandidates.filter((candidate) => candidate.entityKind === expectedKind);
  const startByte = Number(row.byte_start);
  const endByte = Number(row.byte_end);
  const exact = matches.find((candidate) => candidate.startByte === startByte && candidate.endByte === endByte);
  const exactSpanCandidates = parsed.candidates.filter((candidate) => candidate.startByte === startByte && candidate.endByte === endByte);
  const exactWrongKind = namedCandidates.find((candidate) => candidate.entityKind !== expectedKind
    && candidate.startByte === startByte && candidate.endByte === endByte);
  const exactKindWrongName = exactSpanCandidates.find((candidate) => candidate.entityKind === expectedKind && candidate.name !== requestedName);
  const selected = exact ?? exactWrongKind ?? matches[0] ?? namedCandidates[0] ?? null;
  const prefix = parsed.sourceText.slice(0, Math.max(0, startByte));
  const nonAsciiPrefix = /[^\x00-\x7f]/.test(prefix);
  rows.push({
    nominationId: row.nomination_id ?? null,
    sourceRef,
    sourceRevision,
    inputSourceRevision: sourceRevision,
    currentSourceRevision: parsed.currentSourceRevision,
    sourceRevisionMatches: true,
    sourceByteLength: parsed.sourceBytes.length,
    workspaceRevision: row.workspace_revision ?? null,
    kind: row.kind,
    name: requestedName,
    extractorRevision: row.extractor_revision ?? null,
    storedSpan: { startByte, endByte },
    matchedCandidateSpan: selected ? { startByte: selected.startByte, endByte: selected.endByte } : null,
    exactSpanMatch: Boolean(exact),
    matchingCandidateCount: matches.length,
    sameNameCandidates: namedCandidates.slice(0, 8).map((candidate) => ({
      entityKind: candidate.entityKind,
      nodeKind: candidate.nodeKind,
      declarationForm: candidate.declarationForm,
      startByte: candidate.startByte,
      endByte: candidate.endByte,
      exactSpanMatch: candidate.startByte === startByte && candidate.endByte === endByte,
    })),
    exactSpanCandidates: exactSpanCandidates.slice(0, 8).map((candidate) => ({
      entityKind: candidate.entityKind,
      name: candidate.name,
      nodeKind: candidate.nodeKind,
      declarationForm: candidate.declarationForm,
    })),
    unicodeBeforeStoredSpan: nonAsciiPrefix,
    unicodeAnywhereInSource: /[^\x00-\x7f]/.test(parsed.sourceText),
    storedSliceSha256: Number.isInteger(startByte) && Number.isInteger(endByte) && startByte >= 0 && endByte > startByte && endByte <= parsed.sourceBytes.length
      ? createHash('sha256').update(parsed.sourceBytes.subarray(startByte, endByte)).digest('hex') : null,
    status: exact ? 'EXACT_SPAN_MATCH'
      : exactWrongKind ? 'AST_KIND_CROSSWALK_MISMATCH'
        : exactKindWrongName ? 'AST_NAME_CROSSWALK_MISMATCH'
        : matches.length ? 'SAME_NAME_KIND_SPAN_DIFFERENCE'
          : namedCandidates.length ? 'AST_NAME_SPAN_DIFFERENCE' : 'NO_AST_NAME_KIND_MATCH',
  });
}

const byStratum = new Map<string, typeof rows>();
for (const row of rows) {
  if (!('status' in row) || !('kind' in row) || !('unicodeBeforeStoredSpan' in row)) continue;
  const key = `${row.kind}:${row.unicodeBeforeStoredSpan ? 'UNICODE_PREFIX' : 'ASCII_PREFIX'}`;
  const group = byStratum.get(key) ?? [];
  group.push(row);
  byStratum.set(key, group);
}
const sample = [...byStratum.entries()].sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([stratum, group]) => group.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)
    || a.storedSpan.startByte - b.storedSpan.startByte || a.nominationId.localeCompare(b.nominationId))
    .slice(0, 4).map((row) => ({ stratum, ...row })));
const statusCounts = rows.reduce((counts: Record<string, number>, row: any) => {
  counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}, {});
const sourceKindCounts = rows.reduce((counts: Record<string, number>, row: any) => {
  const key = `${row.kind ?? 'UNKNOWN'}:${row.status}`;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
const sourceRevisionGroups = new Map<string, Record<string, any>>();
for (const row of rows) {
  const key = `${row.sourceRef}\0${row.inputSourceRevision ?? ''}`;
  const group = sourceRevisionGroups.get(key) ?? {
    sourceRef: row.sourceRef,
    inputSourceRevision: row.inputSourceRevision ?? null,
    currentSourceRevision: row.currentSourceRevision ?? null,
    sourceByteLength: row.sourceByteLength ?? null,
    sourceRevisionMatches: row.sourceRevisionMatches === true,
    nominationCount: 0,
    statusCounts: {},
    kindCounts: {},
  };
  group.nominationCount += 1;
  group.statusCounts[row.status] = (group.statusCounts[row.status] ?? 0) + 1;
  const kind = String(row.kind ?? 'UNKNOWN');
  group.kindCounts[kind] = (group.kindCounts[kind] ?? 0) + 1;
  sourceRevisionGroups.set(key, group);
}
const currentRowsNeedingCrosswalkReview = rows.filter((row: any) => row.sourceRevisionMatches === true && row.status !== 'EXACT_SPAN_MATCH').map((row: any) => {
  const parsed = parsedSources.get(`${row.sourceRef}\0${row.sourceRevision}`);
  if (!parsed) return { nominationId: row.nominationId, sourceRef: row.sourceRef, status: 'SOURCE_NOT_CACHED', exactTreeSitterNodes: [] };
  const language = extensions.get(path.extname(row.sourceRef).slice(1).toLowerCase());
  if (!language) return { nominationId: row.nominationId, sourceRef: row.sourceRef, status: 'LANGUAGE_UNSUPPORTED', exactTreeSitterNodes: [] };
  try {
    const syntax = parseNodeTreeSitterSource({
      source: parsed.sourceText,
      language: language === 'TYPESCRIPT' || language === 'TSX' ? 'typescript' : 'javascript',
    });
    const exactTreeSitterNodes: Array<Record<string, unknown>> = [];
    const stack = [syntax.rootNode];
    while (stack.length) {
      const node = stack.pop()!;
      const startByte = utf16OffsetToUtf8Byte(parsed.sourceText, node.startIndex);
      const endByte = utf16OffsetToUtf8Byte(parsed.sourceText, node.endIndex);
      if (startByte === row.storedSpan.startByte && endByte === row.storedSpan.endByte) {
        const nameNode = node.childForFieldName?.('name') ?? null;
        const nameStart = nameNode ? utf16OffsetToUtf8Byte(parsed.sourceText, nameNode.startIndex) : null;
        const nameEnd = nameNode ? utf16OffsetToUtf8Byte(parsed.sourceText, nameNode.endIndex) : null;
        exactTreeSitterNodes.push({
          nodeKind: node.type,
          name: nameNode && nameStart !== null && nameEnd !== null
            ? parsed.sourceBytes.subarray(nameStart, nameEnd).toString('utf8') : null,
          grammarRevision: syntax.grammar_revision,
          parserRevision: syntax.parser_revision,
        });
      }
      for (let index = node.childCount - 1; index >= 0; index -= 1) {
        const child = node.child(index);
        if (child) stack.push(child);
      }
    }
    return { ...row, exactTreeSitterNodes };
  } catch (error) {
    return {
      nominationId: row.nominationId,
      sourceRef: row.sourceRef,
      status: `TREE_SITTER_PARSE_FAILED:${error instanceof Error ? error.message : String(error)}`,
      exactTreeSitterNodes: [],
    };
  }
});
const body = {
  schema: 'atlas.current-ast-nomination-span-sample.v1',
  status: 'DIAGNOSTIC_ONLY_NOT_ADMISSION',
  input: {
    path: path.relative(root, inputPath).replaceAll('\\', '/'),
    checksum: sha256(inputBytes),
    rowCount: nominationRows.length,
    authority: 'SCRATCH_DIAGNOSTIC_ONLY',
  },
  scan: {
    rowCount: rows.length,
    sourceFileRevisionSets: parsedSources.size,
    sourceRevisionMatchCount: rows.filter((row: any) => row.sourceRevisionMatches === true).length,
    sourceRevisionMismatchCount: rows.filter((row: any) => row.status === 'SOURCE_REVISION_MISMATCH').length,
    exactSpanMatchCount: rows.filter((row: any) => row.status === 'EXACT_SPAN_MATCH').length,
  },
  statusCounts,
  sourceKindCounts,
  sourceRevisionGroups: [...sourceRevisionGroups.values()].sort((left, right) =>
    String(left.sourceRef).localeCompare(String(right.sourceRef))
    || String(left.inputSourceRevision).localeCompare(String(right.inputSourceRevision))),
  currentRowsNeedingCrosswalkReview,
  sample,
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  networkRequestsPerformed: false,
};
const receipt = { ...body, checksum: sha256(Buffer.from(JSON.stringify(body), 'utf8')) };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const { checksum, ...readbackBody } = readback;
if (sha256(Buffer.from(JSON.stringify(readbackBody), 'utf8')) !== checksum) throw new Error('SPAN_SAMPLE_READBACK_CHECKSUM_MISMATCH');
console.log(JSON.stringify({
  status: readback.status,
  inputRows: readback.scan.rowCount,
  sourceFileRevisionSets: readback.scan.sourceFileRevisionSets,
  exactSpanMatchCount: readback.scan.exactSpanMatchCount,
  sourceRevisionMatchCount: readback.scan.sourceRevisionMatchCount,
  sourceRevisionMismatchCount: readback.scan.sourceRevisionMismatchCount,
  currentRowsNeedingCrosswalkReviewCount: readback.currentRowsNeedingCrosswalkReview.length,
  treeSitterExactNodeCount: readback.currentRowsNeedingCrosswalkReview.filter((row: any) => row.exactTreeSitterNodes.length > 0).length,
  statusCounts: readback.statusCounts,
  sourceKindCounts: readback.sourceKindCounts,
  sampleCount: readback.sample.length,
  readback: 'MATCH',
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  reportPath: path.relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2));
