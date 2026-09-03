#!/usr/bin/env node
/**
 * LSP-CROSS-FILE-TARGET-PROOF-01 — read-only proof that the cross-file target-byte-alignment
 * path (added to `prove-typescript-lsp-readonly.mjs` under LSP-SOURCE-BYTE-SPAN-VERIFY-01) is
 * not merely IMPLEMENTED but actually PROVEN against a genuine cross-file "go to definition".
 *
 * `prove-typescript-lsp-readonly.mjs`'s probe (`createNodeTreeSitterAstProvider`) happens to
 * resolve back into its own source file, so it never exercises the branch that reads a
 * DIFFERENT file's bytes and computes ITS OWN content checksum. This probe deliberately picks a
 * source/target pair that cannot resolve same-file:
 *
 *   sourceRef: scripts/atlas/lib/compiler-semantic-resolver-v1.mjs
 *   probeSymbol: spawnLspServer (called there, imported from lsp-jsonrpc-client.mjs)
 *   targetSourceRef: scripts/atlas/lib/lsp-jsonrpc-client.mjs (where spawnLspServer is defined)
 *
 * This exercises the real resolver, real URI→path conversion, real Windows path handling, a
 * real target-file read (independent of the source buffer already in memory), a real target
 * content checksum, and the real UTF-16→UTF-8 inverse conversion — deliberately NOT a synthetic
 * fixture, per the review that requested this gate.
 *
 * Read-only: no writes, no canonical graph admission. `canonical_authority`/`writesPerformed`
 * are always false on every receipt this script touches.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptsRoot = resolve(repoRoot, 'scripts'); // has its own tsconfig.json (allowJs, includes scripts/**/*.mjs)
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend'); // has a real node_modules for the LSP binary
const sourcePath = resolve(repoRoot, 'scripts/atlas/lib/compiler-semantic-resolver-v1.mjs');
const expectedTargetPath = resolve(repoRoot, 'scripts/atlas/lib/lsp-jsonrpc-client.mjs');
const sourceBuffer = await readFile(sourcePath);
const sourceText = sourceBuffer.toString('utf8');
const sourceRef = relative(repoRoot, sourcePath).replaceAll('\\', '/');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBuffer).digest('hex')}`;
const reportPath = resolve(repoRoot, 'docs/reports/lsp-cross-file-target-alignment-proof-v1.json');
const { alignLspTargetByteRanges } = await import(
  pathToFileURL(resolve(repoRoot, 'packages/parent-atlas/dist/core/lsp-semantic-observation.js')).href
);

const probeSymbol = 'spawnLspServer';
// Verified live (first pass of this probe): querying `textDocument/definition` from the CALL
// SITE resolves to the local import binding — same file, same as clicking "Go to Definition"
// once on a usage in an editor. The cross-file jump happens when the query originates FROM the
// import specifier itself (a second "Go to Definition", now on the import, follows it into the
// exporting module) — so probe from the import list, not the call site.
const importSiteNeedle = "import { spawnLspServer";
const needleByteOffset = sourceBuffer.indexOf(importSiteNeedle, 0, 'utf8');
if (needleByteOffset < 0) throw new Error(`LSP_PROBE_SYMBOL_MISSING:${importSiteNeedle}`);
const byteOffset = needleByteOffset + Buffer.byteLength('import { ', 'utf8');
// Sanity check the byte offset actually lands on the symbol text before spending an LSP round trip.
const sliceCheck = sourceBuffer.subarray(byteOffset, byteOffset + Buffer.byteLength(probeSymbol, 'utf8')).toString('utf8');
if (sliceCheck !== probeSymbol) {
  throw new Error(`LSP_PROBE_BYTE_OFFSET_MISALIGNED: expected "${probeSymbol}", found "${sliceCheck}"`);
}

const resolver = createCompilerSemanticResolver({ workspaceRoot: scriptsRoot, serverBinaryRoot: frontendRoot });
let resolution;
let error = null;
try {
  resolution = await resolver.resolveDefinition({
    requestId: 'prove-lsp-cross-file-target-alignment-readonly',
    sourceRef,
    sourceRevision,
    sourceAbsolutePath: sourcePath,
    sourceText,
    sourceBuffer,
    byteOffset,
    language: 'javascript',
  });
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await resolver.dispose();
}

const status = error
  ? 'FAILED'
  : resolution.result.status === 'RESOLVED_IN_REPO'
    ? 'PROVEN_READ_ONLY'
    : 'DEGRADED_LSP_RESPONSE';

const target = resolution?.result?.targets?.[0] ?? null;
const negotiatedPositionEncoding = resolution?.resolver?.negotiatedPositionEncoding === 'utf-8' ? 'utf-8' : 'utf-16';

let targetPath = null;
let targetIsSameFileAsSource = null;
let targetIsExpectedFile = null;
let targetByteAlignment = null;
let targetByteAlignmentError = null;
let targetTextMatchesByteSlice = null;

if (target?.targetUri && target.targetRange) {
  try {
    targetPath = fileURLToPath(target.targetUri);
    targetIsSameFileAsSource = resolve(targetPath).toLowerCase() === resolve(sourcePath).toLowerCase();
    targetIsExpectedFile = resolve(targetPath).toLowerCase() === resolve(expectedTargetPath).toLowerCase();

    const targetSourceRef = relative(repoRoot, targetPath).replaceAll('\\', '/');
    // Deliberately independent read — this is the exact branch LSP-SOURCE-BYTE-SPAN-VERIFY-01's
    // live probe never exercised, since its target happened to be the same file already in memory.
    const targetBuffer = targetIsSameFileAsSource ? sourceBuffer : await readFile(targetPath);
    const targetText = targetIsSameFileAsSource ? sourceText : targetBuffer.toString('utf8');
    const targetContentChecksum = `sha256:${createHash('sha256').update(targetBuffer).digest('hex')}`;

    targetByteAlignment = alignLspTargetByteRanges({
      target_source_ref: targetSourceRef,
      target_source_revision: targetContentChecksum,
      source_text: targetText,
      position_encoding: negotiatedPositionEncoding,
      target_range: target.targetRange,
    });
    targetByteAlignment = { ...targetByteAlignment, target_content_checksum: targetContentChecksum };

    const spanBytes = targetBuffer.subarray(
      targetByteAlignment.target_byte_range.byte_start,
      targetByteAlignment.target_byte_range.byte_end,
    );
    const spanText = new TextDecoder('utf-8', { fatal: true }).decode(spanBytes);
    targetTextMatchesByteSlice = spanText === probeSymbol;
    targetByteAlignment = { ...targetByteAlignment, target_text: spanText };
  } catch (caught) {
    targetByteAlignmentError = caught instanceof Error ? caught.message : String(caught);
    targetByteAlignment = null;
  }
}

const gatePassed =
  status === 'PROVEN_READ_ONLY' &&
  targetIsSameFileAsSource === false &&
  targetIsExpectedFile === true &&
  targetByteAlignment !== null &&
  targetByteAlignmentError === null &&
  targetTextMatchesByteSlice === true;

const report = {
  schema: 'atlas.lsp-cross-file-target-alignment-proof.v1',
  gate: 'LSP-CROSS-FILE-TARGET-PROOF-01',
  generatedAt: new Date().toISOString(),
  status: gatePassed ? 'CROSS_FILE_TARGET_PROVEN' : 'NOT_PROVEN',
  writes: false,
  canonicalAuthority: false,
  sourceRef,
  sourceRevision,
  probeSymbol,
  sourcePosition: resolution?.sourcePosition ?? null,
  resolutionStatus: resolution?.result?.status ?? null,
  targetUri: target?.targetUri ?? null,
  targetRange: target?.targetRange ?? null,
  targetIsSameFileAsSource,
  targetIsExpectedFile,
  expectedTargetSourceRef: relative(repoRoot, expectedTargetPath).replaceAll('\\', '/'),
  targetByteAlignment,
  targetByteAlignmentError,
  targetTextMatchesByteSlice,
  jsonRpcContentEncoding: 'utf-8',
  lspPositionEncoding: negotiatedPositionEncoding,
  atlasCoordinateSpace: 'UTF8_BYTES',
  error,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  gate: 'LSP-CROSS-FILE-TARGET-PROOF-01',
  status: report.status,
  targetIsSameFileAsSource,
  targetIsExpectedFile,
  targetTextMatchesByteSlice,
  report: reportPath,
}, null, 2));
if (report.status !== 'CROSS_FILE_TARGET_PROVEN') process.exitCode = 1;
