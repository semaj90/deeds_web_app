import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
	for (const name of ['simdJsonParse', 'simdJsonBackend', 'simdJsonToCSR', 'simdJsonExtractNumbers', 'batchCosineTopK']) {
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

	const extracted = addon.simdJsonExtractNumbers('{"embedding":[0.25,-1,3.5]}', '/embedding');
	assert.ok(extracted instanceof Float64Array);
	assert.deepEqual(Array.from(extracted), [0.25, -1, 3.5]);
	const torchInput = Float32Array.from(extracted);
	assert.equal(torchInput.byteLength, 3 * Float32Array.BYTES_PER_ELEMENT);
	assert.deepEqual(Array.from(new Float32Array(torchInput.buffer)), [0.25, -1, 3.5]);
	const payloadBytes = Buffer.from(torchInput.buffer, torchInput.byteOffset, torchInput.byteLength);
	const sourceRevision = `sha256:${createHash('sha256').update('fixture source bytes').digest('hex')}`;
	const workspaceRevision = `sha256:${createHash('sha256').update('fixture workspace').digest('hex')}`;
	const ordinalMap = [{
		candidateOrdinal: 0,
		canonicalId: 'fixture:chunk:0',
		packetKey: 'fixture:packet:0',
		sourceRef: 'src/fixture.ts',
		sourceRevision,
		workspaceRevision,
	}];
	const descriptor = {
		schema: 'atlas.typed-tensor-payload-descriptor.fixture.v1',
		artifactId: 'fixture:semantic-tensor:0',
		candidateSnapshotRevision: 'fixture:snapshot:r1',
		ordinalMap,
		ordinalMapChecksum: createHash('sha256').update(JSON.stringify(ordinalMap)).digest('hex'),
		candidateOrdinal: 0,
		representationRevision: 'fixture:semantic-3:r1',
		dtype: 'float32-le',
		shape: [1, 3],
		payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
	};
	assert.equal(JSON.parse(JSON.stringify(descriptor)).ordinalMap[0].sourceRevision, sourceRevision);
	assert.equal(new DataView(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength).getFloat32(0, true), 0.25);
	if (process.platform === 'win32') {
		const payloadHex = payloadBytes.toString('hex');
		const python = [
			'import hashlib, json, sys, torch',
			'meta = json.loads(sys.argv[1])',
			'raw = bytes.fromhex(sys.argv[2])',
			'assert meta["dtype"] == "float32-le" and meta["shape"] == [1, 3]',
			'assert len(raw) == meta["shape"][0] * meta["shape"][1] * 4',
			'assert hashlib.sha256(raw).hexdigest() == meta["payloadSha256"]',
			'assert hashlib.sha256(json.dumps(meta["ordinalMap"], separators=(",", ":"), ensure_ascii=False).encode()).hexdigest() == meta["ordinalMapChecksum"]',
			'row = meta["ordinalMap"][meta["candidateOrdinal"]]',
			'assert row["sourceRevision"].startswith("sha256:") and row["workspaceRevision"].startswith("sha256:")',
			'values = torch.frombuffer(raw, dtype=torch.float32)',
			'print(json.dumps({"descriptor": meta, "values": values.tolist()}, separators=(",", ":")))',
		].join('; ');
		const stdout = execFileSync('wsl.exe', ['-d', 'Ubuntu', '--', wslPython, '-c', python, JSON.stringify(descriptor), payloadHex], {
			cwd: repoRoot,
			encoding: 'utf8',
			timeout: 90_000,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const roundTrip = JSON.parse(stdout.trim());
		assert.deepEqual(roundTrip.descriptor, descriptor);
		assert.deepEqual(roundTrip.values, [0.25, -1, 3.5]);
	}
	assert.throws(
		() => addon.simdJsonExtractNumbers('{"embedding":[0.25,"missing"]}', '/embedding'),
		/array contains non-numeric value/
	);
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
