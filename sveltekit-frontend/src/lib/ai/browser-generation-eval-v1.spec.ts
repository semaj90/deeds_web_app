import { describe, expect, it, vi } from 'vitest';
import {
	makeLiteRtGenerationPortV1,
	makeTransformersGenerationPortV1,
	runBrowserGenerationEvaluationV1,
	type BrowserGenerationFixtureV1,
	type BrowserGenerationPortV1,
} from './browser-generation-eval-v1.js';
import { makeLitertEngine } from './edge/phase23-litert-adapter.js';
import type { EdgeModelIdentity } from './edge/phase23-edge-model-harness.js';

const identity = (runtimeId: string): EdgeModelIdentity => ({
	modelId: 'local-test-model',
	modelRevision: 'sha256:' + 'a'.repeat(64),
	tokenizerDigest: 'sha256:' + 'b'.repeat(64),
	runtimeId,
	runtimeRevision: 'test-runtime-v1',
});

const fixture: BrowserGenerationFixtureV1 = {
	schema: 'atlas.browser-generation-fixture.v1',
	fixtureId: 'grounded-summary-short-v1',
	prompt: 'Summarize only this fact: the meeting is on Tuesday.',
	maxNewTokens: 32,
};

function port(runtimeId: string, overrides: Partial<BrowserGenerationPortV1> = {}): BrowserGenerationPortV1 {
	return {
		identity: identity(runtimeId),
		isAvailable: () => true,
		generate: async () => ({ text: 'The meeting is on Tuesday.', tokenCount: 6 }),
		...overrides,
	};
}

describe('browser generation evaluation contract (injected fakes only)', () => {
	it('delivers the identical frozen fixture to both runtimes and captures identities/checksums', async () => {
		const seen: string[] = [];
		const receipt = await runBrowserGenerationEvaluationV1({
			fixtures: [fixture],
			runtimes: [port('transformers-webgpu-test', { generate: async (prompt) => { seen.push(prompt); return { text: 'same fixture', tokenCount: 2 }; } }), port('litert-test', { generate: async (prompt) => { seen.push(prompt); return { text: 'same fixture', tokenCount: 2 }; } })],
		});
		expect(seen).toEqual([fixture.prompt, fixture.prompt]);
		expect(receipt.runs.map((run) => run.status)).toEqual(['PASS', 'PASS']);
		expect(receipt.runs[0].fixtureSha256).toBe(receipt.runs[1].fixtureSha256);
		expect(receipt.runs[0].model.runtimeId).toBe('transformers-webgpu-test');
		expect(receipt.runs.every((run) => /^[a-f0-9]{64}$/.test(run.receiptSha256))).toBe(true);
		expect(receipt.runs.every((run) => /^[a-f0-9]{64}$/.test(run.outputSha256 ?? ''))).toBe(true);
		expect(/^[a-f0-9]{64}$/.test(receipt.receiptSha256)).toBe(true);
		expect(receipt.mode).toBe('INJECTED_CONTRACT_ONLY');
		expect(receipt.canonicalAuthority).toBe(false);
		expect(receipt.writesPerformed).toBe(false);
	});

	it('reports an unavailable Transformers.js owner without invoking generation or loading', async () => {
		const generate = vi.fn(async () => ({ text: 'unexpected', tokensGenerated: 1 }));
		const transformers = makeTransformersGenerationPortV1(identity('transformers-webgpu-test'), { isReady: () => false, generate });
		const receipt = await runBrowserGenerationEvaluationV1({ fixtures: [fixture], runtimes: [transformers] });
		expect(receipt.runs[0].status).toBe('UNAVAILABLE');
		expect(generate).not.toHaveBeenCalled();
	});

	it('uses the existing LiteRT adapter through an injected engine without load/dispose', async () => {
		const load = vi.fn(async () => undefined);
		const generate = vi.fn(async () => ({ text: 'LiteRT fake output', tokenCount: 3 }));
		const dispose = vi.fn(async () => undefined);
		const engine = makeLitertEngine({ runtimeVersion: '0.17.1', load, generate, dispose }, {
			modelUrl: '/local-test.litertlm', pinnedRuntimeVersion: '0.17.1', pinnedModelRevision: 'sha256:test',
		});
		const receipt = await runBrowserGenerationEvaluationV1({ fixtures: [fixture], runtimes: [makeLiteRtGenerationPortV1(identity('litert-test'), engine, () => true)] });
		expect(receipt.runs[0].status).toBe('PASS');
		expect(load).not.toHaveBeenCalled();
		expect(dispose).not.toHaveBeenCalled();
		expect(generate).toHaveBeenCalledWith(fixture.prompt, expect.any(AbortSignal));
	});

	it('rejects outputs that exceed token or byte bounds', async () => {
		const tooManyTokens = await runBrowserGenerationEvaluationV1({ fixtures: [fixture], runtimes: [port('runtime', { generate: async () => ({ text: 'long', tokenCount: 33 }) })] });
		const tooManyBytes = await runBrowserGenerationEvaluationV1({ fixtures: [fixture], runtimes: [port('runtime', { generate: async () => ({ text: '12345', tokenCount: 2 }) })], maxOutputBytes: 4 });
		expect(tooManyTokens.runs[0].status).toBe('OUTPUT_REJECTED');
		expect(tooManyBytes.runs[0].status).toBe('OUTPUT_REJECTED');
		expect(tooManyBytes.runs[0].outputSha256).toBeNull();
	});

	it('times out, aborts the injected runtime, and emits a deterministic error code', async () => {
		const generate = vi.fn((_prompt: string, _max: number, signal: AbortSignal) => new Promise<{ text: string; tokenCount: number }>((_resolve, reject) => {
			signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
		}));
		const receipt = await runBrowserGenerationEvaluationV1({ fixtures: [fixture], runtimes: [port('slow-runtime', { generate })], timeoutMs: 5 });
		expect(receipt.runs[0].status).toBe('TIMEOUT');
		expect(receipt.runs[0].errorCode).toBe('EVALUATION_TIMEOUT');
		expect(generate).toHaveBeenCalled();
	});

	it('replays to the same receipt checksum for identical fake inputs', async () => {
		const input = { fixtures: [fixture], runtimes: [port('stable-runtime')] };
		const first = await runBrowserGenerationEvaluationV1(input);
		const second = await runBrowserGenerationEvaluationV1(input);
		expect(second.receiptSha256).toBe(first.receiptSha256);
		expect(second.runs[0].receiptSha256).toBe(first.runs[0].receiptSha256);
	});

	it('rejects duplicate fixture identities and invalid output bounds', async () => {
		await expect(runBrowserGenerationEvaluationV1({ fixtures: [fixture, fixture], runtimes: [port('runtime')] })).rejects.toThrow('DUPLICATE_FIXTURE_ID');
		await expect(runBrowserGenerationEvaluationV1({ fixtures: [fixture], runtimes: [port('runtime')], timeoutMs: 0 })).rejects.toThrow('INVALID_TIMEOUT_BOUND');
	});
});
