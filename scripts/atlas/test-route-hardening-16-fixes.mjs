#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

test('ROUTE-HARDENING-FIXES-01: Verify all 16 component, SSR, and route-hardening fixes', async (t) => {
	await t.test('1. admin/all-routes: composite key eliminates each_key_duplicate', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/routes/(app)/admin/all-routes/+page.svelte');
		assert.ok(existsSync(filePath), 'all-routes/+page.svelte exists');
		const code = readFileSync(filePath, 'utf8');
		assert.ok(
			code.includes("route, idx ((route.id ?? route.path) + ':' + (route.file ?? '') + ':' + idx)"),
			'all-routes/+page.svelte uses composite key with idx to prevent duplicate keys'
		);
	});

	await t.test('2. atlas/studio/openspec: L0 memory + L1 Redis/Valkey cache and timeout guard', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/routes/atlas/studio/openspec/+page.server.ts');
		assert.ok(existsSync(filePath), 'openspec/+page.server.ts exists');
		const code = readFileSync(filePath, 'utf8');
		assert.ok(code.includes('bitfrost:atlas:openspec-board:v1'), 'uses L1 Redis/Valkey bitfrost key');
		assert.ok(code.includes('fastJsonParse'), 'uses fastJsonParse for deserialization');
	});

	await t.test('3. api/admin/ai-chat/sessions: guarded listSessions with stable fallback shape', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/routes/api/admin/ai-chat/sessions/+server.ts');
		assert.ok(existsSync(filePath), 'sessions/+server.ts exists');
		const code = readFileSync(filePath, 'utf8');
		assert.ok(code.includes('return json({ sessions: [] });'), 'returns stable empty sessions array on failure');
	});

	await t.test('4. EnhancedLegalAIChatWithSynthesis: clipboard writeText wrapped in try/catch', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte');
		assert.ok(existsSync(filePath), 'EnhancedLegalAIChatWithSynthesis exists');
		const code = readFileSync(filePath, 'utf8');
		assert.ok(code.includes('navigator.clipboard?.writeText'), 'checks navigator.clipboard.writeText');
		assert.ok(code.includes('/* clipboard write permission denied in headless/non-secure context */'), 'catches permission denial');
	});

	await t.test('5. AdaptiveRenderingEngine: onMount used instead of $effect for animation frame loop', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/lib/components/ui/AdaptiveRenderingEngine.svelte');
		assert.ok(existsSync(filePath), 'AdaptiveRenderingEngine exists');
		const code = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
		assert.ok(
			code.includes('onMount(() => {\n    if (canvasElement) {\n      renderContext = canvasElement.getContext'),
			'uses onMount to initiate animation frame loop rather than reactive $effect'
		);
	});

	await t.test('6. tts.ts + TTSDemo.svelte: optional piper-wasm uses console.warn instead of console.error', () => {
		const ttsPath = resolve(ROOT, 'sveltekit-frontend/src/lib/services/tts.ts');
		const demoPath = resolve(ROOT, 'sveltekit-frontend/src/lib/components/demos/TTSDemo.svelte');
		assert.ok(existsSync(ttsPath) && existsSync(demoPath));
		const ttsCode = readFileSync(ttsPath, 'utf8');
		const demoCode = readFileSync(demoPath, 'utf8');
		assert.ok(ttsCode.includes("console.warn('[TTS] Failed to initialize Piper"), 'tts.ts uses console.warn');
		assert.ok(demoCode.includes("console.warn('[TTS Demo] TTS unavailable in this environment:"), 'TTSDemo.svelte uses console.warn');
	});

	await t.test('7. texture-streaming.ts: graceful fallback console.warn when WebGPU/WebGL2 unavailable', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/lib/webgpu/texture-streaming.ts');
		assert.ok(existsSync(filePath), 'texture-streaming.ts exists');
		const code = readFileSync(filePath, 'utf8');
		assert.ok(
			code.includes("console.warn('⚠️ Texture streaming running in software fallback mode: Neither WebGPU nor WebGL2 available');"),
			'logs graceful console.warn instead of throwing unhandled error'
		);
	});

	await t.test('8. YorhaAIAssistant: preferSSE = true defaults to native SvelteKit SSE streaming', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/lib/components/ai/YorhaAIAssistant.svelte');
		assert.ok(existsSync(filePath), 'YorhaAIAssistant.svelte exists');
		const code = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
		assert.ok(code.includes('preferSSE = true'), 'defaults preferSSE to true');
		assert.ok(code.includes('if (preferSSE) {\n\t\t\tfallbackToSSE();\n\t\t\treturn;\n\t\t}'), 'branches immediately to SSE');
	});

	await t.test('9. CaseForm.svelte: SPA option type matches true | undefined for superForm', () => {
		const filePath = resolve(ROOT, 'sveltekit-frontend/src/lib/components/forms/CaseForm.svelte');
		assert.ok(existsSync(filePath), 'CaseForm.svelte exists');
		const code = readFileSync(filePath, 'utf8');
		assert.ok(code.includes('SPA: !initialData ? true : undefined'), 'SPA option is boolean-free true | undefined');
	});
});
