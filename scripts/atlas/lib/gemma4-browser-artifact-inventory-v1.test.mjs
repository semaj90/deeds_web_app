import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildGemma4BrowserArtifactInventoryV1 } from './gemma4-browser-artifact-inventory-v1.mjs';

test('inventory is deterministic and hashes every local file without claiming remote revisions', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'gemma4-artifacts-'));
	try {
		await mkdir(path.join(root, 'onnx'));
		await writeFile(path.join(root, 'onnx', 'weights.bin'), Buffer.from([1, 2, 3]));
		await writeFile(path.join(root, 'config.json'), '{}');
		const input = {
			root,
			transformersModelId: 'onnx-community/gemma-4-E2B-it-ONNX',
			litertModelId: 'litert-community/gemma-4-E2B-it-litert-lm'
		};
		const first = await buildGemma4BrowserArtifactInventoryV1(input);
		const second = await buildGemma4BrowserArtifactInventoryV1(input);
		assert.deepEqual(first.localOnnx.files.map(({ path: file }) => file), ['config.json', 'onnx/weights.bin']);
		assert.equal(first.localOnnx.totalBytes, 5);
		assert.equal(first.localOnnx.inventorySha256, second.localOnnx.inventorySha256);
		assert.equal(first.transformersJs.revisionStatus, 'UNPINNED');
		assert.equal(first.litert.revisionStatus, 'UNPINNED');
		assert.equal(first.writesPerformed, false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('rejects a symlink model root', async () => {
	const parent = await mkdtemp(path.join(os.tmpdir(), 'gemma4-artifacts-link-'));
	try {
		const actual = path.join(parent, 'actual');
		const link = path.join(parent, 'link');
		await mkdir(actual);
		await symlink(actual, link, 'junction');
		await assert.rejects(
			buildGemma4BrowserArtifactInventoryV1({
				root: link,
				transformersModelId: 'onnx-community/gemma-4-E2B-it-ONNX',
				litertModelId: 'litert-community/gemma-4-E2B-it-litert-lm'
			}),
			/MODEL_ROOT_NOT_DIRECTORY/
		);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});
