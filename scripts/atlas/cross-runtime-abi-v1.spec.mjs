import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const addonPath = process.env.ATLAS_TENSORRT_BRIDGE
	? path.resolve(repoRoot, process.env.ATLAS_TENSORRT_BRIDGE)
	: path.join(repoRoot, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node');
const wslPython = process.env.ATLAS_RAPIDS_PYTHON
	?? '/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python';
const neuralDecoderUrl = process.env.ATLAS_NEURAL_DECODER_URL ?? 'http://127.0.0.1:8121';

test('native N-API SIMDJSON parses a UTF-8 payload independently of RAPIDS ABI', (t) => {
	if (!existsSync(addonPath)) {
		t.skip(`native addon not found: ${addonPath}`);
		return;
	}

	const require = createRequire(import.meta.url);
	const addon = require(addonPath);
	for (const name of ['simdJsonParse', 'simdJsonBackend', 'simdJsonToCSR', 'batchCosineTopK']) {
		assert.equal(typeof addon[name], 'function', `missing native export ${name}`);
	}

	const input = JSON.stringify({ label: 'café 🧭', values: [1, 2, 3], present: true });
	const parsed = JSON.parse(addon.simdJsonParse(input));
	assert.deepEqual(parsed, JSON.parse(input));
	assert.match(addon.simdJsonBackend(), /.+/);
	const graph = addon.simdJsonToCSR(JSON.stringify({ numNodes: 3, edges: [[0, 1], [0, 2], [2, 1]] }));
	assert.equal(graph.numNodes, 3);
	assert.equal(graph.numEdges, 3);
	assert.ok(graph.rowPtr instanceof Int32Array);
	assert.ok(graph.colIndices instanceof Int32Array);
	assert.deepEqual(Array.from(graph.rowPtr), [0, 2, 2, 3]);
	assert.deepEqual(Array.from(graph.colIndices), [1, 2, 1]);
});

test('WSL RAPIDS and PyTorch versions are discoverable without invoking CUDA kernels', (t) => {
	if (process.platform !== 'win32') {
		t.skip('WSL RAPIDS probe is workstation-specific');
		return;
	}

	const pythonProbe = [
		'import importlib, importlib.metadata as m, json, torch',
		'names = {"cudf": "cudf", "cugraph": "cugraph", "cuvs": "cuvs", "torch": "torch"}',
		'[_ for _ in map(importlib.import_module, names)]',
		'out = {key: m.version(dist) for key, dist in names.items()}',
		'out["torch_cuda_runtime"] = torch.version.cuda',
		'out["torch_abi"] = "PyTorch Python runtime; separate from Node N-API and LibTorch"',
		'print(json.dumps(out, sort_keys=True))',
	].join('; ');
	let stdout;
	try {
		stdout = execFileSync('wsl.exe', ['-d', 'Ubuntu', '--', wslPython, '-c', pythonProbe], {
			cwd: repoRoot,
			encoding: 'utf8',
			timeout: 90_000,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	} catch (error) {
		const detail = error.stderr?.toString().trim() || error.message;
		assert.fail(`WSL RAPIDS capability probe failed: ${detail}`);
	}

	const capability = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
	for (const name of ['cudf', 'cugraph', 'cuvs', 'torch']) {
		assert.match(capability[name], /^\d+\.\d+/, `${name} version unavailable`);
	}
	assert.ok(capability.torch_cuda_runtime, 'PyTorch CUDA runtime metadata unavailable');
	assert.equal(capability.torch_abi, 'PyTorch Python runtime; separate from Node N-API and LibTorch');
	console.log(`WSL runtime versions: ${JSON.stringify(capability)}`);
});

test('neural decoder health keeps model availability separate from canonical authority', async (t) => {
	let response;
	try {
		response = await fetch(`${neuralDecoderUrl}/health`, { signal: AbortSignal.timeout(3000) });
	} catch (error) {
		if (process.env.ATLAS_NEURAL_DECODER_URL) assert.fail(`decoder health probe failed: ${error.message}`);
		t.skip(`neural decoder is not reachable at ${neuralDecoderUrl}`);
		return;
	}

	assert.equal(response.status, 200);
	const health = await response.json();
	assert.equal(health.schema, 'atlas.neural-decoder-service.v1');
	assert.equal(health.canonicalAuthority, false);
	assert.equal(health.writesPerformed, false);
	assert.deepEqual(health.representations, {
		input: 'semantic_768',
		physical: 'latent_256',
		derived: ['latent_128', 'latent_64'],
	});
	console.log(`Neural decoder status: ${health.status}; checkpoint loaded: ${health.checkpointSha256 !== null}`);
});
