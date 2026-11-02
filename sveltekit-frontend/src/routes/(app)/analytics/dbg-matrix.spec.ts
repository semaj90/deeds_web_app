import { it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('$app/environment', () => ({ browser: true, dev: true }));

it('debug: what happens on the matrix tab', async () => {
	const calls: string[] = [];
	vi.stubGlobal('EventSource', class { addEventListener() {} close() {} });
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		calls.push(String(url));
		if (String(url).includes('mapreduce-matrix')) {
			return new Response(JSON.stringify({ matrix: [], topChunks: [], pipelineCoverage: { semantic: 3 }, synthesis: null, meta: { userId: 'u1', days: 7, rowCount: 0, computeMs: 1 } }), { status: 200 });
		}
		return new Response('{}', { status: 200 });
	}));
	const errs: string[] = [];
	window.addEventListener('error', (e) => errs.push(String(e.error ?? e.message).slice(0, 140)));
	const summary = { totalQueries: 0, avgLatencyMs: 0, cacheHitRate: 0, topIntents: [], mostUsedTools: [] };
	const { default: Analytics } = await import('./+page.svelte');
	const { container } = render(Analytics, { props: { data: { userId: 'u1', summary, patterns: [] } } });
	for (let i = 0; i < 4; i++) await tick();
	await new Promise((r) => setTimeout(r, 100));
	window.dispatchEvent(new CustomEvent('yorha:nav-analytics', { detail: { tab: 'matrix' } }));
	for (let i = 0; i < 4; i++) await tick();
	await new Promise((r) => setTimeout(r, 400));
	const tabButtons = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 12);
	console.log('DBG tabs:', JSON.stringify(tabButtons));
	console.log('DBG fetch calls:', JSON.stringify(calls));
	console.log('DBG has semantic:', container.textContent?.includes('semantic'), ' has Matrix text:', /matrix/i.test(container.textContent ?? ''));
	console.log('DBG errors:', JSON.stringify(errs));
});
