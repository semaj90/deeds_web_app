import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extractAstGrepStructuralCandidates } from '../../sveltekit-frontend/src/lib/server/atlas/language/ast-grep-structural-topk.js';
import {
  makeAstHandlerV1,
  makeLexicalHandlerV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/workflow/context-dag-handlers-v1.js';
import {
  buildContextToolDagFromPreAgentStages,
  executeContextToolDagV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/workflow/context-tool-dag-contracts.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const realRoot = fs.realpathSync(root);
const scratchRoot = path.join(realRoot, '.tmp', 'atlas');
const inputPath = path.resolve(realRoot, process.argv[2] ?? '');
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
const outputPath = path.resolve(realRoot, process.argv[3] ?? `.tmp/atlas/live-ast-refinement-dag-shadow-v1-${timestamp}.json`);

function isUnder(parent: string, candidate: string): boolean {
  const relativePath = path.relative(parent, candidate);
  return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

if (!isUnder(scratchRoot, inputPath) || !isUnder(scratchRoot, outputPath)) {
  throw new Error('INPUT_AND_OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
}

function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function checksumJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function proofChecksumJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

const proof = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as Record<string, any>;
const { checksum: inputChecksum, ...inputPayload } = proof;
if (proof.schema !== 'atlas.live-packet-symbol-ast-observation-proof.v1'
  || proof.status !== 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH'
  || typeof inputChecksum !== 'string'
  || proofChecksumJson(inputPayload) !== inputChecksum
  || proof.spanMismatchCount !== 0
  || proof.canonicalAuthority !== false
  || proof.persistentStoreWritesPerformed !== false
  || proof.databaseTransaction !== 'REPEATABLE_READ_READ_ONLY_ROLLED_BACK') {
  throw new Error('LIVE_PACKET_AST_PROOF_NOT_VERIFIED');
}

const binding = proof.exactBinding;
if (!binding || binding.admissionStatus !== 'PROPOSAL_ONLY'
  || binding.canonicalAuthority !== false
  || !binding.packetKey || !binding.symbolVersionId || !binding.sourceRef
  || !binding.sourceRevision || !binding.workspaceRevision
  || !binding.qualifiedName || !binding.astObservation
  || binding.astObservation.source_ref !== binding.sourceRef
  || binding.astObservation.source_revision !== binding.sourceRevision
  || binding.astObservation.byte_start !== binding.byteStart
  || binding.astObservation.byte_end !== binding.byteEnd) {
  throw new Error('LIVE_PACKET_AST_BINDING_NOT_QUALIFIED');
}

const sourceRef = normalizeRelativePath(binding.sourceRef);
const sourcePath = path.resolve(realRoot, ...sourceRef.split('/'));
if (!isUnder(realRoot, sourcePath)) throw new Error('SOURCE_PATH_ESCAPES_REPOSITORY');
const realSourcePath = fs.realpathSync(sourcePath);
if (!isUnder(realRoot, realSourcePath) || normalizeRelativePath(path.relative(realRoot, realSourcePath)) !== sourceRef) {
  throw new Error('SOURCE_PATH_NOT_CANONICAL_REPOSITORY_RELATIVE');
}
const sourceBytes = fs.readFileSync(realSourcePath);
const sourceRevision = sha256(sourceBytes);
if (sourceRevision !== binding.sourceRevision || sourceRevision !== binding.sourceBytesChecksum) {
  throw new Error('LIVE_SOURCE_BYTES_REVISION_MISMATCH');
}
const sourceText = sourceBytes.toString('utf8');
if (!Buffer.from(sourceText, 'utf8').equals(sourceBytes)) throw new Error('SOURCE_NOT_VALID_UTF8');

const frontendRequire = createRequire(path.join(realRoot, 'sveltekit-frontend', 'package.json'));
const astGrepPackage = frontendRequire('@ast-grep/napi/package.json') as { version: string };
const extractorRevision = `@ast-grep/napi@${astGrepPackage.version}`;
if (extractorRevision !== binding.astGrepExtractorRevision) throw new Error('AST_GREP_EXTRACTOR_REVISION_MISMATCH');

const producerFiles = [
  'scripts/atlas/run-live-ast-refinement-dag-shadow-v1.mts',
  'sveltekit-frontend/src/lib/server/atlas/workflow/context-dag-handlers-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/workflow/context-tool-dag-contracts.ts',
  'sveltekit-frontend/src/lib/server/atlas/language/ast-grep-structural-topk.ts',
];
const producerRevision = sha256(Buffer.concat(producerFiles.map((file) => fs.readFileSync(path.join(realRoot, file)))));
const requestId = `ast-refinement-shadow:${binding.packetKey}:${binding.symbolVersionId}`;
const dag = buildContextToolDagFromPreAgentStages({
  workflowId: 'atlas-live-ast-refinement-shadow-v1',
  requestId,
  workspaceRevision: binding.workspaceRevision,
  graphRevision: null,
  producerRevision,
  stages: ['QUERY_ANALYSIS', 'LEXICAL', 'AST_STRUCTURAL_REFINE'],
});

const lexical = makeLexicalHandlerV1({
  symbols: [binding.qualifiedName],
  cwd: realRoot,
  search: async ({ pattern, maxResults }) => {
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync('rg', [
        '--fixed-strings', '--line-number', '--no-heading', '--with-filename', '--color', 'never',
        '--max-count', String(maxResults), pattern, sourceRef,
      ], { cwd: realRoot, maxBuffer: 1_000_000 }));
    } catch (error) {
      const result = error as NodeJS.ErrnoException & { stdout?: string; code?: number | string };
      if (result.code === 1) stdout = result.stdout ?? '';
      else throw error;
    }
    const rows = stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      const match = /^(.+?):(\d+):/.exec(line);
      return match ? [{ filePath: normalizeRelativePath(match[1]!), lineNumber: Number(match[2]) }] : [];
    });
    return { matches: rows, totalMatches: rows.length, truncated: rows.length >= maxResults };
  },
});

const ast = makeAstHandlerV1({
  symbols: [binding.qualifiedName],
  producerRevision,
  readFile: async (filePath) => {
    if (normalizeRelativePath(filePath) !== sourceRef) throw new Error('AST_READ_OUTSIDE_BOUND_SOURCE');
    return sourceText;
  },
  resolveSourceBinding: (filePath) => normalizeRelativePath(filePath) === sourceRef
    ? { sourceRef, workspaceRevision: binding.workspaceRevision, sourceRevision: binding.sourceRevision }
    : null,
  extract: extractAstGrepStructuralCandidates,
});

const execution = await executeContextToolDagV1(dag, {
  QUERY_ANALYSIS: async () => ({ query: binding.qualifiedName, mode: 'READ_ONLY_SHADOW' }),
  LEXICAL: lexical,
  AST_STRUCTURAL_REFINE: ast,
  EXACT_PROMOTION: async () => ({ status: 'NOT_PERFORMED_SHADOW_ONLY', canonicalAuthority: false }),
  ACE_PACKET_ASSEMBLY: async () => ({ status: 'UNAVAILABLE_NOT_ASSEMBLED', reason: 'NO_CONTEXT_MANIFEST_CALLER', canonicalAuthority: false }),
});
const astOutput = execution.outputs.AST_STRUCTURAL_REFINE as {
  declarations: Array<Record<string, any>>;
  producerRevision: string;
  canonicalAuthority: false;
};
const matchingDeclarations = astOutput.declarations.filter((candidate) =>
  candidate.name === binding.qualifiedName
  && candidate.sourceRef === sourceRef
  && candidate.sourceRevision === binding.sourceRevision
  && candidate.workspaceRevision === binding.workspaceRevision
  && candidate.startByte === binding.byteStart
  && candidate.endByte === binding.byteEnd);
if (!execution.ok || matchingDeclarations.length !== 1 || astOutput.canonicalAuthority !== false) {
  throw new Error(JSON.stringify({
    error: 'LIVE_AST_REFINEMENT_DAG_MATCH_NOT_PROVEN',
    executionOk: execution.ok,
    nodeStatuses: execution.nodes.map(({ nodeId, status, error }) => ({ nodeId, status, error })),
    lexicalOutput: execution.outputs.LEXICAL,
    astSkipped: (execution.outputs.AST_STRUCTURAL_REFINE as { skipped?: unknown[] }).skipped,
    matchingDeclarationCount: matchingDeclarations.length,
    declarations: astOutput.declarations.map(({ name, sourceRef: candidateSourceRef, sourceRevision: candidateSourceRevision, workspaceRevision: candidateWorkspaceRevision, startByte, endByte }) => ({
      name, sourceRef: candidateSourceRef, sourceRevision: candidateSourceRevision, workspaceRevision: candidateWorkspaceRevision, startByte, endByte,
    })),
  }));
}

const observedCandidate = matchingDeclarations[0]!;
const proofBody = {
  schema: 'atlas.live-ast-refinement-dag-shadow-proof.v1',
  status: 'LIVE_SOURCE_AST_DAG_SHADOW_PROVEN',
  inputProofPath: path.relative(realRoot, inputPath).replaceAll('\\', '/'),
  inputProofChecksum: inputChecksum,
  requestId,
  candidate: {
    packetKey: binding.packetKey,
    symbolVersionId: binding.symbolVersionId,
    sourceRef,
    sourceRevision: binding.sourceRevision,
    workspaceRevision: binding.workspaceRevision,
    symbol: binding.qualifiedName,
    startByte: binding.byteStart,
    endByte: binding.byteEnd,
    spanChecksum: binding.spanChecksum,
    astObservationId: binding.astObservation.observation_id,
  },
  dag: {
    levels: execution.levels,
    nodeStatuses: execution.nodes.map(({ nodeId, status, error }) => ({ nodeId, status, error })),
    graphRevision: dag.graphRevision,
    canonicalWritesAllowed: dag.canonicalWritesAllowed,
    producerRevision,
  },
  lexical: execution.outputs.LEXICAL,
  astOutputChecksum: checksumJson(astOutput),
  matchedDeclaration: {
    name: observedCandidate.name,
    entityKind: observedCandidate.entityKind,
    declarationForm: observedCandidate.declarationForm,
    sourceRef: observedCandidate.sourceRef,
    sourceRevision: observedCandidate.sourceRevision,
    workspaceRevision: observedCandidate.workspaceRevision,
    startByte: observedCandidate.startByte,
    endByte: observedCandidate.endByte,
    spanSha256: observedCandidate.spanSha256,
    treeNodeId: observedCandidate.treeNodeId,
    symbolVersionId: observedCandidate.symbolVersionId,
    requiresCanonicalTreeJoin: observedCandidate.requiresCanonicalTreeJoin,
    logicalLaneVoteAdded: observedCandidate.logicalLaneVoteAdded,
    canonicalWritesAllowed: observedCandidate.canonicalWritesAllowed,
  },
  promotion: 'NOT_PERFORMED',
  contextManifest: 'UNAVAILABLE_NOT_ASSEMBLED',
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
};
const receipt = { ...proofBody, checksum: checksumJson(proofBody) };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as typeof receipt;
const { checksum: readbackChecksum, ...readbackBody } = readback;
if (checksumJson(readbackBody) !== readbackChecksum
  || readback.inputProofChecksum !== inputChecksum
  || readback.matchedDeclaration.sourceRevision !== binding.sourceRevision
  || readback.matchedDeclaration.startByte !== binding.byteStart
  || readback.matchedDeclaration.endByte !== binding.byteEnd
  || readback.canonicalAuthority !== false
  || readback.persistentStoreWritesPerformed !== false) {
  throw new Error('LIVE_AST_REFINEMENT_DAG_READBACK_MISMATCH');
}

console.log(JSON.stringify({
  status: readback.status,
  packetKey: binding.packetKey,
  symbolVersionId: binding.symbolVersionId,
  sourceRef,
  sourceRevision,
  workspaceRevision: binding.workspaceRevision,
  graphRevision: null,
  matchedDeclarationCount: matchingDeclarations.length,
  lexicalNode: execution.nodes.find((node) => node.nodeId === 'LEXICAL')?.status,
  astNode: execution.nodes.find((node) => node.nodeId === 'AST_STRUCTURAL_REFINE')?.status,
  promotion: readback.promotion,
  contextManifest: readback.contextManifest,
  readback: 'MATCH',
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  reportPath: path.relative(realRoot, outputPath).replaceAll('\\', '/'),
  checksum: readback.checksum,
}, null, 2));
