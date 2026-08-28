import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte2tsx } from '../..//sveltekit-frontend/node_modules/svelte2tsx/index.js';
import { TraceMap, originalPositionFor } from '../..//sveltekit-frontend/node_modules/@jridgewell/trace-mapping/dist/trace-mapping.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const frontend = resolve(root, 'sveltekit-frontend');
const sourcePath = resolve(root, 'src/routes/admin/cache/+page.svelte');
const sourceRef = relative(root, sourcePath).replaceAll('\\', '/');
const reportPath = resolve(root, 'docs/reports/svelte-virtual-source-binding-proof-v1.json');
const observation = JSON.parse(await readFile(resolve(root, 'docs/reports/workspace-source-binding-observation.json'), 'utf8'));
const source = await readFile(sourcePath, 'utf8');
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourceDigest = digest(source);
const binding = (observation.bindings ?? []).find((row) => row.sourceRef === sourceRef);
const transformed = svelte2tsx(source, { filename: sourcePath, isTsFile: true, emitOnTemplateError: true });
const mapText = typeof transformed.map?.toString === 'function' ? transformed.map.toString() : JSON.stringify(transformed.map);
const generatedOffset = transformed.code.indexOf('gpuStats');
const generatedBefore = generatedOffset >= 0 ? transformed.code.slice(0, generatedOffset) : '';
const generatedPosition = generatedOffset >= 0 ? { line: generatedBefore.split('\n').length, column: generatedBefore.slice(generatedBefore.lastIndexOf('\n') + 1).length } : null;
const originalMapping = generatedPosition ? originalPositionFor(new TraceMap(JSON.parse(mapText)), generatedPosition) : null;
const report = {
  schema: 'atlas.svelte-virtual-source-binding-proof.v1',
  status: binding?.contentDigest === sourceDigest.slice('sha256:'.length) && transformed.code.length > 0 && Boolean(originalMapping?.source) ? 'PROVEN_LIVE_READ_ONLY' : 'DEGRADED_OBSERVATION',
  writes: false,
  sourceRef,
  sourceRevision: binding?.sourceRevision ?? null,
  sourceContentDigest: sourceDigest,
  workspaceRevision: observation.record?.workspaceRevision ?? null,
  observationBindingFound: Boolean(binding),
  observationContentDigestMatches: binding?.contentDigest === sourceDigest.slice('sha256:'.length),
  virtualDocument: {
    transform: 'svelte2tsx',
    transformRevision: 'package-local',
    virtualContentDigest: digest(transformed.code),
    sourceMapChecksum: digest(mapText),
    virtualByteLength: Buffer.byteLength(transformed.code, 'utf8'),
    generatedPosition,
    originalMapping,
  },
  remaining: ['exact source-map range to Tree-sitter node proof', 'Svelte Language Server semantic request proof'],
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, sourceRef, observationBindingFound: report.observationBindingFound, report: reportPath }, null, 2));
if (report.status !== 'PROVEN_LIVE_READ_ONLY') process.exitCode = 1;
