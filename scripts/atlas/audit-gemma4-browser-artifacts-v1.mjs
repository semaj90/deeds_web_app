#!/usr/bin/env node
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGemma4BrowserArtifactInventoryV1 } from './lib/gemma4-browser-artifact-inventory-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readArg = (name, fallback) => {
	const prefix = `--${name}=`;
	const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
};
const outputPath = path.resolve(repoRoot, readArg('output', '.tmp/atlas/gemma4-browser-artifact-inventory-v1.json'));
const allowedOutputRoot = path.resolve(repoRoot, '.tmp/atlas') + path.sep;
if (!outputPath.startsWith(allowedOutputRoot)) throw new Error('OUTPUT_MUST_REMAIN_UNDER_TMP_ATLAS');

const report = await buildGemma4BrowserArtifactInventoryV1({
	root: path.resolve(repoRoot, readArg('root', 'sveltekit-frontend/static/gemma4_e2b_onnx')),
	transformersModelId: 'onnx-community/gemma-4-E2B-it-ONNX',
	litertModelId: 'litert-community/gemma-4-E2B-it-litert-lm'
});
await mkdir(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
await rename(temporaryPath, outputPath);
process.stdout.write(`${JSON.stringify({ output: path.relative(repoRoot, outputPath), ...report.localOnnx, transformersRevision: report.transformersJs.revisionStatus, litertRevision: report.litert.revisionStatus }, null, 2)}\n`);
