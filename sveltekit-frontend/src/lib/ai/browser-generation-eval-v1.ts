import type { EdgeEngine, EdgeModelIdentity } from './edge/phase23-edge-model-harness.js';

export interface BrowserGenerationFixtureV1 {
	schema: 'atlas.browser-generation-fixture.v1';
	fixtureId: string;
	prompt: string;
	maxNewTokens: number;
}

export interface BrowserGenerationPortV1 {
	identity: EdgeModelIdentity;
	isAvailable(): boolean | Promise<boolean>;
	generate(prompt: string, maxNewTokens: number, signal: AbortSignal): Promise<{ text: string; tokenCount: number }>;
}

export interface TransformersGenerationOwnerV1 {
	isReady(): boolean;
	generate(prompt: string, options: { maxNewTokens: number; signal: AbortSignal }): Promise<{ text: string; tokensGenerated: number }>;
}

export interface BrowserGenerationRunV1 {
	runtimeId: string;
	fixtureId: string;
	status: 'PASS' | 'UNAVAILABLE' | 'TIMEOUT' | 'OUTPUT_REJECTED' | 'ERROR';
	model: EdgeModelIdentity;
	fixtureSha256: string;
	outputSha256: string | null;
	outputTokenCount: number;
	outputByteLength: number;
	errorCode: string | null;
	receiptSha256: string;
}

export interface BrowserGenerationEvaluationReceiptV1 {
	schema: 'atlas.browser-generation-evaluation-receipt.v1';
	mode: 'INJECTED_CONTRACT_ONLY';
	canonicalAuthority: false;
	writesPerformed: false;
	fixtures: Array<{ fixtureId: string; sha256: string }>;
	runs: BrowserGenerationRunV1[];
	receiptSha256: string;
}

const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, item) => {
	if (item && typeof item === 'object' && !Array.isArray(item)) {
		return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
	}
	return item;
});
const sha256 = async (value: string): Promise<string> => {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

function validateFixture(fixture: BrowserGenerationFixtureV1): void {
	if (fixture.schema !== 'atlas.browser-generation-fixture.v1' || !fixture.fixtureId.trim()) throw new Error('INVALID_FIXTURE_IDENTITY');
	if (!fixture.prompt.trim() || new TextEncoder().encode(fixture.prompt).byteLength > 16_384) throw new Error('INVALID_FIXTURE_PROMPT');
	if (!Number.isSafeInteger(fixture.maxNewTokens) || fixture.maxNewTokens < 1 || fixture.maxNewTokens > 4096) throw new Error('INVALID_FIXTURE_TOKEN_BOUND');
}

function validateIdentity(identity: EdgeModelIdentity): void {
	for (const value of Object.values(identity)) if (typeof value !== 'string' || !value.trim()) throw new Error('INVALID_RUNTIME_IDENTITY');
}

/** Adapts the existing Transformers.js owner without initializing or loading it. */
export function makeTransformersGenerationPortV1(
	identity: EdgeModelIdentity,
	owner: TransformersGenerationOwnerV1,
): BrowserGenerationPortV1 {
	return {
		identity,
		isAvailable: () => owner.isReady(),
		generate: async (prompt, maxNewTokens, signal) => {
			const result = await owner.generate(prompt, { maxNewTokens, signal });
			return { text: result.text, tokenCount: result.tokensGenerated };
		},
	};
}

/** Adapts the existing pinned LiteRT EdgeEngine; the evaluator never calls load/dispose. */
export function makeLiteRtGenerationPortV1(
	identity: EdgeModelIdentity,
	engine: EdgeEngine,
	isAvailable: () => boolean | Promise<boolean>,
): BrowserGenerationPortV1 {
	return {
		identity,
		isAvailable,
		generate: (prompt, _maxNewTokens, signal) => engine.generate(prompt, signal),
	};
}

export async function runBrowserGenerationEvaluationV1(input: {
	fixtures: BrowserGenerationFixtureV1[];
	runtimes: BrowserGenerationPortV1[];
	timeoutMs?: number;
	maxOutputTokens?: number;
	maxOutputBytes?: number;
}): Promise<BrowserGenerationEvaluationReceiptV1> {
	const timeoutMs = input.timeoutMs ?? 5_000;
	const maxOutputTokens = input.maxOutputTokens ?? 1024;
	const maxOutputBytes = input.maxOutputBytes ?? 65_536;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('INVALID_TIMEOUT_BOUND');
	if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 4096) throw new Error('INVALID_OUTPUT_TOKEN_BOUND');
	if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 1_048_576) throw new Error('INVALID_OUTPUT_BYTE_BOUND');
	if (!input.fixtures.length || !input.runtimes.length) throw new Error('EMPTY_EVALUATION_INPUT');
	const fixtureIds = new Set<string>();
	for (const fixture of input.fixtures) {
		validateFixture(fixture);
		if (fixtureIds.has(fixture.fixtureId)) throw new Error('DUPLICATE_FIXTURE_ID');
		fixtureIds.add(fixture.fixtureId);
	}
	for (const runtime of input.runtimes) validateIdentity(runtime.identity);

	const fixtureEntries = await Promise.all(input.fixtures.map(async (fixture) => ({ fixtureId: fixture.fixtureId, sha256: await sha256(canonicalJson(fixture)) })));
	const runs: BrowserGenerationRunV1[] = [];
	for (const runtime of input.runtimes) {
		for (const fixture of input.fixtures) {
			const fixtureSha256 = await sha256(canonicalJson(fixture));
			let status: BrowserGenerationRunV1['status'] = 'ERROR';
			let outputSha256: string | null = null;
			let outputTokenCount = 0;
			let outputByteLength = 0;
			let errorCode: string | null = null;
			try {
				if (!(await runtime.isAvailable())) {
					status = 'UNAVAILABLE';
					errorCode = 'RUNTIME_UNAVAILABLE';
				} else {
					const controller = new AbortController();
					let timer: ReturnType<typeof setTimeout> | undefined;
					const timeout = new Promise<never>((_resolve, reject) => {
						timer = setTimeout(() => { reject(new Error('EVALUATION_TIMEOUT')); controller.abort(); }, timeoutMs);
					});
					try {
						const generated = await Promise.race([runtime.generate(fixture.prompt, fixture.maxNewTokens, controller.signal), timeout]);
						outputByteLength = new TextEncoder().encode(generated.text).byteLength;
						outputTokenCount = generated.tokenCount;
						if (!generated.text.trim() || !Number.isSafeInteger(generated.tokenCount) || generated.tokenCount < 1 || generated.tokenCount > Math.min(maxOutputTokens, fixture.maxNewTokens) || outputByteLength > maxOutputBytes) {
							status = 'OUTPUT_REJECTED';
							errorCode = 'OUTPUT_EXCEEDS_CONTRACT';
							outputTokenCount = 0;
							outputByteLength = 0;
						} else {
						status = 'PASS';
						outputSha256 = sha256(generated.text);
					}
					} finally {
					if (timer) clearTimeout(timer);
				}
			}
			} catch (error) {
				errorCode = error instanceof Error && error.message === 'EVALUATION_TIMEOUT' ? 'EVALUATION_TIMEOUT' : 'RUNTIME_ERROR';
				status = errorCode === 'EVALUATION_TIMEOUT' ? 'TIMEOUT' : 'ERROR';
			}
			const runBody = { runtimeId: runtime.identity.runtimeId, fixtureId: fixture.fixtureId, status, model: runtime.identity, fixtureSha256, outputSha256, outputTokenCount, outputByteLength, errorCode };
			runs.push({ ...runBody, receiptSha256: await sha256(canonicalJson(runBody)) });
		}
	}
	const receiptBody = { schema: 'atlas.browser-generation-evaluation-receipt.v1' as const, mode: 'INJECTED_CONTRACT_ONLY' as const, canonicalAuthority: false as const, writesPerformed: false as const, fixtures: fixtureEntries, runs };
	return { ...receiptBody, receiptSha256: await sha256(canonicalJson(receiptBody)) };
}

