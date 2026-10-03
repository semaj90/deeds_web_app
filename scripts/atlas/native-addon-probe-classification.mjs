export const OUTCOME = Object.freeze({
	MISSING_EXPORT: 'MISSING_EXPORT',
	NO_LIBTORCH_STUB: 'NO_LIBTORCH_STUB',
	NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
	CPU_FALLBACK: 'CPU_FALLBACK',
	LIBTORCH_CPU: 'LIBTORCH_CPU',
	CUDA_LIVE: 'CUDA_LIVE',
	CALL_FAILED: 'CALL_FAILED',
	NUMERICAL_MISMATCH: 'NUMERICAL_MISMATCH',
	SKIPPED_EXTERNAL_PROOF: 'SKIPPED_EXTERNAL_PROOF',
	SHAPE_VALID: 'SHAPE_VALID',
	NOT_PROVEN: 'NOT_PROVEN',
});

function booleanClaim(value) {
	return typeof value === 'boolean' ? value : null;
}

/**
 * Keep artifact, loader, implementation, and execution evidence independent.
 * `branchExecuted` means a CPU or CUDA compute branch ran; stubs and failed
 * attempts do not count. Missing or incomplete counters remain unknown.
 */
export function buildNativeProbeEvidenceClaims(input = {}) {
	const counters = input.executionCounters;
	let branchExecuted = null;
	if (input.branchAttempted === false) {
		branchExecuted = null;
	} else if (
		counters &&
		Number.isSafeInteger(counters.cuda_execution) && counters.cuda_execution >= 0 &&
		Number.isSafeInteger(counters.cpu_fallback) && counters.cpu_fallback >= 0
	) {
		branchExecuted = counters.cuda_execution > 0 || counters.cpu_fallback > 0;
	}

	return Object.freeze({
		binaryPresent: booleanClaim(input.binaryPresent),
		implementationLinked: booleanClaim(input.implementationLinked),
		symbolLoaded: booleanClaim(input.symbolLoaded),
		branchExecuted,
	});
}

/**
 * Classifies only evidence explicitly present in the receipt. A valid shape
 * is never promoted to CPU/GPU liveness without backend and execution proof.
 */
export function classifyNativeAddonProbe(input) {
	if (!input.exported) return OUTCOME.MISSING_EXPORT;
	if (input.externalProof) return OUTCOME.SKIPPED_EXTERNAL_PROOF;
	if (input.error) return OUTCOME.CALL_FAILED;

	const result = input.result;
	const returnCode = typeof result === 'number'
		? result
		: result && typeof result === 'object' && Number.isInteger(result.rc)
			? result.rc
			: null;
	if (returnCode === -99) return OUTCOME.NO_LIBTORCH_STUB;
	if (returnCode === 38 || returnCode === 95) return OUTCOME.NOT_IMPLEMENTED;
	if (input.parity === 'MISMATCH') return OUTCOME.NUMERICAL_MISMATCH;

	const evidence = input.backendEvidence;
	if (evidence?.cpuFallbackCount > 0) return OUTCOME.CPU_FALLBACK;
	if (input.shapeValid && evidence?.libtorchCpuCount > 0 && evidence?.backendInfoValid === true) {
		return OUTCOME.LIBTORCH_CPU;
	}
	if (
		input.shapeValid &&
		evidence?.cudaExecutionCount > 0 &&
		evidence?.backendInfoValid === true &&
		input.parity === 'MATCH'
	) {
		return OUTCOME.CUDA_LIVE;
	}

	return input.shapeValid ? OUTCOME.SHAPE_VALID : OUTCOME.NOT_PROVEN;
}
