import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';
import { resolveWorkspaceRevisionCoordinate } from './lib/workspace-revision-authority.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend');
const sourcePath = resolve(frontendRoot, 'src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts');
const sourceBuffer = await readFile(sourcePath);
const sourceText = sourceBuffer.toString('utf8');
const sourceRef = relative(frontendRoot, sourcePath).replaceAll('\\', '/');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBuffer).digest('hex')}`;
const reportPath = resolve(repoRoot, 'docs/reports/typescript-lsp-readonly-proof-v1.json');
const { alignLspTargetByteRanges } = await import(pathToFileURL(resolve(repoRoot, 'packages/parent-atlas/dist/core/lsp-semantic-observation.js')).href);
const workspaceCoordinate = resolveWorkspaceRevisionCoordinate({ repoRoot });
const workspaceRevision = workspaceCoordinate.coordinate.authority === 'PROVEN'
  ? workspaceCoordinate.coordinate.value
  : null;

const probeSymbol = 'createNodeTreeSitterAstProvider';
const byteOffset = sourceBuffer.indexOf(probeSymbol, 0, 'utf8');
if (byteOffset < 0) throw new Error(`LSP_PROBE_SYMBOL_MISSING:${probeSymbol}`);

const resolver = createCompilerSemanticResolver({ workspaceRoot: frontendRoot });
let resolution;
let error = null;
try {
  resolution = await resolver.resolveDefinition({
    requestId: 'prove-typescript-lsp-readonly',
    workspaceRevision,
    sourceRef,
    sourceRevision,
    sourceAbsolutePath: sourcePath,
    sourceText,
    sourceBuffer,
    byteOffset,
    language: 'typescript',
  });
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await resolver.dispose();
}

const status = error ? 'FAILED' : resolution.result.status === 'RESOLVED_IN_REPO' ? 'PROVEN_READ_ONLY' : 'DEGRADED_LSP_RESPONSE';
const target = resolution?.result?.targets?.[0] ?? null;
const negotiatedPositionEncoding = resolution?.resolver?.negotiatedPositionEncoding === 'utf-8' ? 'utf-8' : 'utf-16';
let targetByteAlignment = null;
let targetByteAlignmentError = null;
if (target?.targetUri && target.targetRange) {
  try {
    const targetPath = fileURLToPath(target.targetUri);
    const isSameFile = resolve(targetPath).toLowerCase() === resolve(sourcePath).toLowerCase();
    // Resolve the TARGET's own sourceRef/bytes/checksum independently of the source side — a
    // cross-file definition target must not be aligned against the source file's text (that
    // would silently produce a byte range into the wrong file's bytes). Only reuse the already-
    // loaded source buffer when the target genuinely IS the source file.
    const targetSourceRef = relative(frontendRoot, targetPath).replaceAll('\\', '/');
    const targetBuffer = isSameFile ? sourceBuffer : await readFile(targetPath);
    const targetText = isSameFile ? sourceText : targetBuffer.toString('utf8');
    const targetContentChecksum = isSameFile ? sourceRevision : `sha256:${createHash('sha256').update(targetBuffer).digest('hex')}`;
    targetByteAlignment = alignLspTargetByteRanges({
      target_source_ref: targetSourceRef,
      // Path-scoped source revision and raw content checksum coincide for this proof (this
      // repo's live sourceRevision IS a content sha256 today) — recorded as the same value under
      // two distinct field names deliberately, not because they're guaranteed interchangeable.
      target_source_revision: targetContentChecksum,
      source_text: targetText,
      position_encoding: negotiatedPositionEncoding,
      target_range: target.targetRange,
    });
    targetByteAlignment = {
      ...targetByteAlignment,
      target_content_checksum: targetContentChecksum,
      target_is_same_file_as_source: isSameFile,
    };
  } catch (caught) {
    targetByteAlignmentError = caught instanceof Error ? caught.message : String(caught);
    targetByteAlignment = null;
  }
}
const report = {
  schema: 'atlas.typescript-lsp-readonly-proof.v1',
  generatedAt: new Date().toISOString(),
  status,
  writes: false,
  coordinateAlignment: {
    // Three distinct axes — do not collapse into a single "wireProtocol" field:
    // jsonRpcContentEncoding: the JSON-RPC message CONTENT encoding (always UTF-8, non-negotiable).
    // lspPositionEncoding: the negotiated MEANING of Position.character (utf-8/utf-16/utf-32 per
    //   LSP 3.17's positionEncoding capability; utf-16 is the mandatory/default compatibility unit).
    // atlasCoordinateSpace: what THIS repo's identity/graph layer stores coordinates as (always
    //   UTF8_BYTES, independent of whatever the LSP server negotiated).
    jsonRpcContentEncoding: 'utf-8',
    lspPositionEncoding: negotiatedPositionEncoding,
    atlasCoordinateSpace: 'UTF8_BYTES',
    conversionValidation: 'LSP_POSITION_CODEC_FIXTURE_PROVEN',
    sourceRef,
    sourceRevision,
    // Distinct from sourceRevision on principle (see verifiedSourceByteSpanSchema in
    // lsp-semantic-observation.ts) — currently equal because this repo's sourceRevision IS a
    // content sha256 today, but a future path-scoped revision scheme (e.g.
    // gitsrc:v1:<hash(repoId, sourceRef, mode, blobOid)>) would NOT be, and must never be
    // substituted for the content checksum.
    sourceContentChecksum: sourceRevision,
    targetByteAlignment,
    targetByteAlignmentError,
    workspaceRevisionAuthority: {
      authority: workspaceCoordinate.coordinate.authority,
      value: workspaceRevision,
      reason: workspaceCoordinate.reason,
      ageMs: workspaceCoordinate.ageMs,
      evidenceRefs: workspaceCoordinate.coordinate.evidence_refs,
    },
  },
  probeSymbol,
  resolution: resolution ?? null,
  error,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status, sourceRef, resultStatus: resolution?.result?.status ?? null, targetCount: resolution?.result?.targets?.length ?? 0, report: reportPath }, null, 2));
if (status === 'FAILED') process.exitCode = 1;
