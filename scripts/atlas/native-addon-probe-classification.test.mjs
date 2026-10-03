import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeProbeEvidenceClaims, classifyNativeAddonProbe, OUTCOME } from './native-addon-probe-classification.mjs';
import { bridgeCandidatePaths } from '../../sveltekit-frontend/src/lib/server/gpu/native-addon-paths.mjs';

const base = { exported: true, result: null, error: null, shapeValid: false };

test('does not promote shape-only results to backend liveness', () => {
	assert.equal(classifyNativeAddonProbe({ ...base, shapeValid: true }), OUTCOME.SHAPE_VALID);
	assert.notEqual(classifyNativeAddonProbe({ ...base, shapeValid: true }), OUTCOME.CUDA_LIVE);
});

test('requires metadata, branch counters, and parity for CUDA_LIVE', () => {
	const backendEvidence = { cudaExecutionCount: 1, backendInfoValid: true };
	assert.equal(classifyNativeAddonProbe({ ...base, shapeValid: true, backendEvidence }), OUTCOME.SHAPE_VALID);
	assert.equal(classifyNativeAddonProbe({ ...base, backendEvidence, parity: 'MATCH' }), OUTCOME.NOT_PROVEN);
	assert.equal(classifyNativeAddonProbe({ ...base, shapeValid: true, backendEvidence, parity: 'MATCH' }), OUTCOME.CUDA_LIVE);
});

test('preserves explicit missing, stub, unsupported, failure, fallback, and mismatch outcomes', () => {
	assert.equal(classifyNativeAddonProbe({ ...base, exported: false }), OUTCOME.MISSING_EXPORT);
	assert.equal(classifyNativeAddonProbe({ ...base, result: -99 }), OUTCOME.NO_LIBTORCH_STUB);
	assert.equal(classifyNativeAddonProbe({ ...base, result: 38 }), OUTCOME.NOT_IMPLEMENTED);
	assert.equal(classifyNativeAddonProbe({ ...base, error: new Error('failed') }), OUTCOME.CALL_FAILED);
	assert.equal(classifyNativeAddonProbe({ ...base, backendEvidence: { cpuFallbackCount: 1 } }), OUTCOME.CPU_FALLBACK);
	assert.equal(classifyNativeAddonProbe({ ...base, parity: 'MISMATCH' }), OUTCOME.NUMERICAL_MISMATCH);
	assert.equal(classifyNativeAddonProbe({ ...base, externalProof: true }), OUTCOME.SKIPPED_EXTERNAL_PROOF);
});

test('does not report LibTorch CPU without valid backend metadata', () => {
	assert.equal(classifyNativeAddonProbe({
		...base,
		backendEvidence: { libtorchCpuCount: 1, backendInfoValid: false },
	}), OUTCOME.NOT_PROVEN);
	assert.equal(classifyNativeAddonProbe({
		...base,
		shapeValid: true,
		backendEvidence: { libtorchCpuCount: 1, backendInfoValid: true },
	}), OUTCOME.LIBTORCH_CPU);
});

test('uses the shared application addon resolver and keeps its override first', () => {
	const previous = process.env.TENSORRT_BRIDGE_NODE_PATH;
	process.env.TENSORRT_BRIDGE_NODE_PATH = 'C:/fixture/tensorrt_bridge.node';
	try {
		const paths = bridgeCandidatePaths('C:/fixture/workspace');
		assert.equal(paths[0], 'C:/fixture/tensorrt_bridge.node');
		assert.ok(paths.some((candidate) => candidate.includes('build-x64-cuda/Release/tensorrt_bridge.node')));
		assert.equal(new Set(paths).size, paths.length);
	} finally {
		if (previous === undefined) delete process.env.TENSORRT_BRIDGE_NODE_PATH;
		else process.env.TENSORRT_BRIDGE_NODE_PATH = previous;
	}
});

test('keeps binary, implementation, symbol, and execution claims independent', () => {
	assert.deepEqual(buildNativeProbeEvidenceClaims({
		binaryPresent: true,
		implementationLinked: null,
		symbolLoaded: true,
		executionCounters: { cuda_execution: 0, cpu_fallback: 0 },
	}), {
		binaryPresent: true,
		implementationLinked: null,
		symbolLoaded: true,
		branchExecuted: false,
	});

	assert.deepEqual(buildNativeProbeEvidenceClaims({
		binaryPresent: true,
		implementationLinked: false,
		symbolLoaded: true,
		executionCounters: { cuda_execution: 1, cpu_fallback: 0 },
	}), {
		binaryPresent: true,
		implementationLinked: false,
		symbolLoaded: true,
		branchExecuted: true,
	});

	assert.equal(buildNativeProbeEvidenceClaims({
		binaryPresent: true,
		symbolLoaded: true,
		executionCounters: { cuda_execution: 0 },
	}).branchExecuted, null);
	assert.equal(buildNativeProbeEvidenceClaims({
		binaryPresent: true,
		symbolLoaded: true,
		executionCounters: { cuda_execution: 1, cpu_fallback: 0 },
		branchAttempted: false,
	}).branchExecuted, null);
});
