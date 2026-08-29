import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend');
const sourcePath = resolve(frontendRoot, 'src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts');
const sourceBuffer = await readFile(sourcePath);
const sourceText = sourceBuffer.toString('utf8');
const sourceRef = relative(frontendRoot, sourcePath).replaceAll('\\', '/');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBuffer).digest('hex')}`;
const reportPath = resolve(repoRoot, 'docs/reports/typescript-lsp-readonly-proof-v1.json');

const probeSymbol = 'createNodeTreeSitterAstProvider';
const byteOffset = sourceBuffer.indexOf(probeSymbol, 0, 'utf8');
if (byteOffset < 0) throw new Error(`LSP_PROBE_SYMBOL_MISSING:${probeSymbol}`);

const resolver = createCompilerSemanticResolver({ workspaceRoot: frontendRoot });
let resolution;
let error = null;
try {
  resolution = await resolver.resolveDefinition({
    requestId: 'prove-typescript-lsp-readonly',
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
const report = {
  schema: 'atlas.typescript-lsp-readonly-proof.v1',
  status,
  writes: false,
  probeSymbol,
  resolution: resolution ?? null,
  error,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status, sourceRef, resultStatus: resolution?.result?.status ?? null, targetCount: resolution?.result?.targets?.length ?? 0, report: reportPath }, null, 2));
if (status === 'FAILED') process.exitCode = 1;
