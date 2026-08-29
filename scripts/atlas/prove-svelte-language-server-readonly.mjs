import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const frontend = resolve(root, 'sveltekit-frontend');
const sourcePath = resolve(root, 'sveltekit-frontend/src/lib/client/ui/POIPhotoModal.svelte');
const sourceBuffer = await readFile(sourcePath);
const sourceText = sourceBuffer.toString('utf8');
const sourceRef = relative(root, sourcePath).replaceAll('\\', '/');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBuffer).digest('hex')}`;
const reportPath = resolve(root, 'docs/reports/svelte-language-server-readonly-proof-v1.json');

const probeSymbol = 'POIPhotoModalImpl';
const byteOffset = sourceBuffer.indexOf(probeSymbol, 0, 'utf8');
if (byteOffset < 0) throw new Error(`SVELTE_LSP_PROBE_SYMBOL_MISSING:${probeSymbol}`);

const resolver = createCompilerSemanticResolver({ workspaceRoot: frontend, clientName: 'parent-atlas-svelte-lsp-proof' });
let resolution;
let error = null;
try {
  resolution = await resolver.resolveDefinition({
    requestId: 'prove-svelte-language-server-readonly',
    sourceRef,
    sourceRevision,
    sourceAbsolutePath: sourcePath,
    sourceText,
    sourceBuffer,
    byteOffset,
    language: 'svelte',
    timeoutMs: 60000,
  });
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await resolver.dispose();
}

const status = error ? 'FAILED' : resolution.result.status === 'RESOLVED_IN_REPO' ? 'PROVEN_LIVE_READ_ONLY' : 'DEGRADED_LSP_RESPONSE';
const report = {
  schema: 'atlas.svelte-language-server-readonly-proof.v1',
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
