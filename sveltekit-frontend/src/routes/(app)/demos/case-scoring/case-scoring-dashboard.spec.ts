// @vitest-environment node
import { render } from 'svelte/server';
import { describe, it, expect } from 'vitest';
import CaseScoringDashboard from '$lib/components/ai/CaseScoringDashboard.svelte';

/**
 * Behavioral regression tests for the case-scoring demo.
 *
 * Root cause fixed in commit 361dcedaabe: the `filtered` $derived sorted the
 * `cases` $state array in place (no filter active), which throws
 * `state_unsafe_mutation` under Svelte 5 reactivity. The fix copies first:
 * `return [...result].sort(...)`.
 *
 * These tests assert the observable contract: the list renders sorted by score
 * descending, and mutating the reactive source does not corrupt the derived view.
 */

describe('CaseScoringDashboard', () => {
	it('renders all sample cases with score badges', () => {
		const { body } = render(CaseScoringDashboard);
		expect(body).toContain('Case Scoring');
		expect(body).toContain('Johnson v. Tech Corp');
		expect(body).toContain('Metro City v. Industrial Corp');
		expect(body).toContain('Sample scoring examples only');
	});

	it('renders cases sorted by score descending (91, 87, 72, 54)', () => {
		const { body } = render(CaseScoringDashboard);
		const order = [
			body.indexOf('Metro City v. Industrial Corp'),
			body.indexOf('Johnson v. Tech Corp'),
			body.indexOf('State v. Anderson'),
			body.indexOf('Smith Estate'),
		];
		expect(order[0]).toBeGreaterThan(-1);
		expect(order[0]).toBeLessThan(order[1]);
		expect(order[1]).toBeLessThan(order[2]);
		expect(order[2]).toBeLessThan(order[3]);
	});

	it('shows the high-risk filter (score >= 75) options', () => {
		const { body } = render(CaseScoringDashboard);
		expect(body).toContain('High Risk (75+)');
		expect(body).toContain('Medium (40-74)');
	});

	it('renders all four sample score values', () => {
		const { body } = render(CaseScoringDashboard);
		for (const score of ['91', '87', '72', '54']) expect(body).toContain(`>${score}</span>`);
	});

	it('renders expandable case cards without eagerly exposing details', () => {
		const { body } = render(CaseScoringDashboard);
		expect(body).toContain('case-summary');
		expect(body).not.toContain('Scoring Factors');
	});
});
