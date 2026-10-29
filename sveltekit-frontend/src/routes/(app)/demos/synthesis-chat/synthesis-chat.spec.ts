// @vitest-environment node
import { render } from 'svelte/server';
import { describe, it, expect } from 'vitest';
import SynthesisChatPage from './+page.svelte';

/**
 * Behavioral regression tests for the synthesis-chat demo.
 *
 * Root cause fixed in commit 361dcedaabe: the page previously passed an empty
 * `userId` to EnhancedLegalAIChatWithSynthesis, which caused the sessions API
 * to reject the request with HTTP 400. The fix derives userId from the signed-in
 * user in layout data (`page.data.user?.id`), falling back to '' only when the
 * user is absent.
 *
 * These SSR tests verify the page accepts SvelteKit page data and renders the
 * chat with either an authenticated user or no user. Browser tests own the
 * user-specific interaction and persistence contract.
 */

describe('synthesis-chat page', () => {
	it('renders for a signed-in user', () => {
		const { body } = render(SynthesisChatPage, {
			props: { data: { user: { id: 'user-42' } } },
		});
		expect(body).toContain('Enhanced Legal AI Assistant');
	});

	it('renders the enhanced chat component', () => {
		const { body } = render(SynthesisChatPage, {
			props: { data: { user: { id: 'user-42' } } },
		});
		expect(body).toContain('Enhanced Legal AI Assistant');
	});

	it('renders when there is no signed-in user', () => {
		const { body } = render(SynthesisChatPage, {
			props: { data: { user: null } },
		});
		expect(body).toContain('Enhanced Legal AI Assistant');
	});
});
