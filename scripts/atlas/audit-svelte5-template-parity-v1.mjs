import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractSvelteTemplateChunks } from './lib/svelte-template-chunks-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendRoot = path.join(repoRoot, 'sveltekit-frontend');
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const compiler = requireFrontend('svelte/compiler');
const compilerVersion = JSON.parse(await fs.readFile(path.join(frontendRoot, 'node_modules/svelte/package.json'), 'utf8')).version;
const inputPath = path.join(repoRoot, '.tmp/atlas/svelte5-real-component-comparison-db653528-155d-4f98-83d5-e9997ac387d6.json');
const admissionPath = path.join(repoRoot, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const outputRoot = path.join(repoRoot, '.tmp/atlas');
const nodeTypes = Object.freeze({ IfBlock: 'if_block', EachBlock: 'each_block', AwaitBlock: 'await_block', KeyBlock: 'key_block', SnippetBlock: 'snippet_block', RenderTag: 'render_tag' });
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

function collectCompilerExtents(ast, source) {
  const extents = [];
  const counts = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if (nodeTypes[node.type]) {
      const startByte = Buffer.byteLength(source.slice(0, node.start), 'utf8');
      const endByte = Buffer.byteLength(source.slice(0, node.end), 'utf8');
      extents.push([nodeTypes[node.type], startByte, endByte]);
      counts.set(nodeTypes[node.type], (counts.get(nodeTypes[node.type]) ?? 0) + 1);
    }
    for (const key of Object.keys(node)) if (key !== 'parent' && key !== 'metadata') visit(node[key]);
  };
  visit(ast.fragment);
  extents.sort((left, right) => left[1] - right[1] || left[2] - right[2] || left[0].localeCompare(right[0]));
  return { extents, counts: Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right))) };
}

function summarizeFile(filePath, sourceBytes, source, prior, pass) {
  const result = extractSvelteTemplateChunks(source);
  const compilerAst = compiler.parse(source, { modern: true });
  const expected = collectCompilerExtents(compilerAst, source);
  const actualExtents = result.chunks.map((chunk) => [chunk.chunkType, chunk.startByte, chunk.endByte])
    .sort((left, right) => left[1] - right[1] || left[2] - right[2] || left[0].localeCompare(right[0]));
  const spanItems = [...result.chunks, ...result.observations];
  const invalidByteSpans = spanItems.filter((item) => !item.spanVerified ||
    sourceBytes.subarray(item.startByte, item.endByte).toString('utf8') !== item.sourceText).length;
  const missingConstructs = Object.entries(expected.counts)
    .filter(([type, count]) => (result.chunks.filter((chunk) => chunk.chunkType === type).length) !== count)
    .map(([type, expectedCount]) => ({ type, expectedCount, observedCount: result.chunks.filter((chunk) => chunk.chunkType === type).length }));
  const summary = {
    sourceRef: filePath,
    sourceRevision: prior.sourceSha256,
    utf8ByteLength: sourceBytes.length,
    compilerAstNodeCount: Object.values(result.nodeTypeCounts).reduce((total, count) => total + count, 0),
    compilerTargetCounts: expected.counts,
    emittedChunkCount: result.chunks.length,
    emittedChunkTypes: result.chunks.reduce((counts, chunk) => ({ ...counts, [chunk.chunkType]: (counts[chunk.chunkType] ?? 0) + 1 }), {}),
    observationCount: result.observations.length,
    observationTypes: result.observations.reduce((counts, item) => ({ ...counts, [item.observationType]: (counts[item.observationType] ?? 0) + 1 }), {}),
    missingConstructs,
    unlocatedConstructs: result.unlocatedConstructs,
    unrepresentedAstNodeTypes: result.unsupportedNodeTypes,
    byteSliceVerdict: invalidByteSpans === 0 ? 'BYTE_SLICE_VALID' : 'BYTE_SLICE_MISMATCH',
    checkedSpanCount: spanItems.length,
    invalidByteSpans,
    semanticExtentVerdict: JSON.stringify(actualExtents) === JSON.stringify(expected.extents) ? 'SEMANTIC_EXTENT_MATCH' : 'SEMANTIC_EXTENT_MISMATCH',
    extractionCoverage: missingConstructs.length === 0 && result.unlocatedConstructs.length === 0 ? 'TARGETED_CONSTRUCTS_COVERED' : 'PARTIAL',
    parseOutcome: result.outcome,
    proposalOnly: result.proposalOnly,
    canonicalAuthority: result.canonicalAuthority,
    pass,
  };
  const logicalResult = structuredClone(result);
  for (const item of [...logicalResult.chunks, ...logicalResult.observations]) delete item.sourceText;
  return { summary, logicalDigest: sha256(JSON.stringify(logicalResult)) };
}

const prior = JSON.parse(await fs.readFile(inputPath, 'utf8'));
if (prior.schema !== 'parent-atlas.svelte5-real-component-parser-comparison-readonly.v1' || prior.sourceCohort.files.length !== 10) {
  throw new Error('FROZEN_SVELTE_COHORT_RECEIPT_INVALID');
}
const admissionBytes = await fs.readFile(admissionPath);
const admission = JSON.parse(admissionBytes.toString('utf8'));
const memberPaths = prior.sourceCohort.files.map((item) => `'${item.filePath.replaceAll("'", "''")}'`).join(', ');
const membershipQuery = `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='10s'; SELECT repository_relative_path, code_source_revision FROM graphify_execution_file_membership_v2 WHERE execution_id='01a1763a-4355-71d7-9b81-2c7a1814a41f' AND repository_id='repo:root' AND repository_relative_path IN (${memberPaths}) ORDER BY repository_relative_path; ROLLBACK;`;
const membershipOutput = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-X', '-q', '-A', '-t', '-F', '\t', '-c', membershipQuery,
], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const authorityQuery = "BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='10s'; SELECT execution_id, status, canonical_authority FROM graphify_executions WHERE execution_id='01a1763a-4355-71d7-9b81-2c7a1814a41f'; ROLLBACK;";
const authorityOutput = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-X', '-q', '-A', '-t', '-F', '\t', '-c', authorityQuery,
], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
const [observedExecutionId, observedExecutionStatus, observedCanonicalAuthority] = authorityOutput.trim().split('\t');
if (observedExecutionId !== '01a1763a-4355-71d7-9b81-2c7a1814a41f' || observedCanonicalAuthority !== 'f') throw new Error('EXPECTED_NONCANONICAL_GRAPHIFY_EXECUTION_READBACK_MISMATCH');
const sourceMembershipRows = membershipOutput.trim().split(/\r?\n/).filter(Boolean).map((line) => {
  const [sourceRef, sourceRevision] = line.split('\t');
  return { sourceRef, sourceRevision };
}).sort((left, right) => left.sourceRef.localeCompare(right.sourceRef));
const sourceMembershipMatches = sourceMembershipRows.length === prior.sourceCohort.files.length && prior.sourceCohort.files.every((item) =>
  sourceMembershipRows.some((member) => member.sourceRef === item.filePath && member.sourceRevision === item.sourceSha256));
if (!sourceMembershipMatches) throw new Error('FROZEN_COHORT_DOES_NOT_MATCH_READ_ONLY_GRAPHIFY_MEMBERSHIP');

const runs = [[], []];
for (let pass = 1; pass <= 2; pass += 1) {
  for (const item of prior.sourceCohort.files) {
    const absolute = path.resolve(repoRoot, item.filePath);
    const relative = path.relative(repoRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`SOURCE_PATH_OUTSIDE_REPOSITORY:${item.filePath}`);
    const sourceBytes = await fs.readFile(absolute);
    if (sha256(sourceBytes) !== item.sourceSha256) throw new Error(`FROZEN_SOURCE_REVISION_MISMATCH:${item.filePath}`);
    const source = sourceBytes.toString('utf8');
    runs[pass - 1].push(summarizeFile(item.filePath, sourceBytes, source, item, pass));
  }
}

const replayStable = runs[0].every((item, index) => item.logicalDigest === runs[1][index].logicalDigest &&
  JSON.stringify({ ...item.summary, pass: 0 }) === JSON.stringify({ ...runs[1][index].summary, pass: 0 }));
const perFile = runs[0].map((item, index) => ({
  ...item.summary,
  replayDigest: item.logicalDigest,
  independentPassVerdict: item.logicalDigest === runs[1][index].logicalDigest ? 'IDENTICAL' : 'MISMATCH',
}));
const allSpansValid = perFile.every((item) => item.byteSliceVerdict === 'BYTE_SLICE_VALID');
const allExtentsMatch = perFile.every((item) => item.semanticExtentVerdict === 'SEMANTIC_EXTENT_MATCH');
const logicalPayload = {
  schema: 'parent-atlas.svelte5-template-parity-readonly.v1',
  sourceCohortReceipt: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
  sourceCohortReceiptSha256: sha256(await fs.readFile(inputPath)),
  admissionReceipt: path.relative(repoRoot, admissionPath).replaceAll('\\', '/'),
  admissionReceiptSha256: sha256(admissionBytes),
  executionId: '01a1763a-4355-71d7-9b81-2c7a1814a41f',
  workspaceRevision: admission.workspaceRevision,
  membershipScope: 'repo:root',
  membershipReadOnlyQuery: membershipQuery,
  sourceMembershipRows,
  sourceMembershipMatches,
  authorityReadOnlyQuery: authorityQuery,
  executionStatus: observedExecutionStatus,
  executionCanonicalAuthority: observedCanonicalAuthority === 't',
  compiler: { package: 'svelte/compiler', version: compilerVersion, astMode: 'modern:true' },
  extractor: 'scripts/atlas/lib/svelte-template-chunks-v1.mjs',
  independentPasses: 2,
  replayStable,
  verdicts: {
    byteSlices: allSpansValid ? 'BYTE_SLICE_VALID' : 'BYTE_SLICE_MISMATCH',
    semanticExtents: allExtentsMatch ? 'SEMANTIC_EXTENT_MATCH' : 'SEMANTIC_EXTENT_MISMATCH',
    extractionCoverage: perFile.every((item) => item.extractionCoverage === 'TARGETED_CONSTRUCTS_COVERED') ? 'TARGETED_CONSTRUCTS_COVERED' : 'PARTIAL',
    lspSemanticReferences: 'NOT_VERIFIED_TEMPLATE_DEFINITION_REQUEST_TIMED_OUT',
  },
  files: perFile,
  canonicalAuthority: false,
  writesPerformed: false,
};
const generatedAt = new Date().toISOString();
const receipt = { ...logicalPayload, generatedAt, logicalContentSha256: sha256(JSON.stringify(logicalPayload)) };
receipt.receiptSha256 = sha256(JSON.stringify(receipt));
await fs.mkdir(outputRoot, { recursive: true });
const outputPath = path.join(outputRoot, `svelte5-template-parity-${generatedAt.replaceAll(':', '-')}-${crypto.randomUUID()}.json`);
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
await fs.writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
await fs.rename(temporaryPath, outputPath);
console.log(JSON.stringify({ status: replayStable && allSpansValid && allExtentsMatch ? 'PARTIAL' : 'FAIL', replayStable, files: perFile.length, byteSlices: receipt.verdicts.byteSlices, semanticExtents: receipt.verdicts.semanticExtents, extractionCoverage: receipt.verdicts.extractionCoverage, lspSemanticReferences: receipt.verdicts.lspSemanticReferences, logicalContentSha256: receipt.logicalContentSha256, receiptSha256: receipt.receiptSha256, receiptPath: path.relative(repoRoot, outputPath).replaceAll('\\', '/') }, null, 2));
