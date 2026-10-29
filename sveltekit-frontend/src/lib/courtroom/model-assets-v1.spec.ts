import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALICE_MODEL_URLS, resolveCourtroomFallbackModelUrl, resolveCourtroomModelUrl } from './model-assets-v1.js';

describe('courtroom model asset defaults', () => {
	const allAliceAssets = new Set(Object.values(ALICE_MODEL_URLS));
	const fileExists = (url: string) => allAliceAssets.has(url as (typeof ALICE_MODEL_URLS)[keyof typeof ALICE_MODEL_URLS]);

	it('selects N64 Alice as the default when the export exists', () => {
		expect(resolveCourtroomFallbackModelUrl(fileExists)).toBe(ALICE_MODEL_URLS.n64);
		expect(resolveCourtroomModelUrl(ALICE_MODEL_URLS.original, fileExists)).toBe(ALICE_MODEL_URLS.n64);
		expect(resolveCourtroomModelUrl(ALICE_MODEL_URLS.skinned, fileExists)).toBe(ALICE_MODEL_URLS.n64);
	});

	it('keeps the full and SNES exports explicitly selectable', () => {
		expect(resolveCourtroomModelUrl(ALICE_MODEL_URLS.full, fileExists)).toBe(ALICE_MODEL_URLS.full);
		expect(resolveCourtroomModelUrl(ALICE_MODEL_URLS.snes, fileExists)).toBe(ALICE_MODEL_URLS.snes);
	});

	it('packages all three generated variants and keeps the N64 default lightweight', () => {
		for (const url of [ALICE_MODEL_URLS.full, ALICE_MODEL_URLS.n64, ALICE_MODEL_URLS.snes]) {
			const path = join(process.cwd(), 'static', url);
			expect(existsSync(path), url).toBe(true);
		}
		expect(statSync(join(process.cwd(), 'static', ALICE_MODEL_URLS.n64)).size).toBeLessThan(1024 * 1024);
	});

	it('falls back to the skinned or original file when N64 is unavailable', () => {
		expect(resolveCourtroomFallbackModelUrl((url) => url === ALICE_MODEL_URLS.skinned)).toBe(ALICE_MODEL_URLS.skinned);
		expect(resolveCourtroomFallbackModelUrl((url) => url === ALICE_MODEL_URLS.original)).toBe(ALICE_MODEL_URLS.original);
	});

	it('uses an available default for missing registered assets and preserves non-model URLs', () => {
		expect(resolveCourtroomModelUrl('/models/courtroom/missing_default.glb', fileExists)).toBe(ALICE_MODEL_URLS.n64);
		expect(resolveCourtroomModelUrl('https://assets.example/model.glb', fileExists)).toBe('https://assets.example/model.glb');
		expect(resolveCourtroomModelUrl(null, fileExists)).toBe(ALICE_MODEL_URLS.n64);
	});
});
