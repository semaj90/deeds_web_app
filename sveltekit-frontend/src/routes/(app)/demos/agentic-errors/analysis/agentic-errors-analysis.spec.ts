// @vitest-environment node
import { render } from 'svelte/server';
import { describe, it, expect } from 'vitest';
import AnalysisPage from './+page.svelte';

/**
 * Behavioral regression tests for the agentic-errors analysis demo.
 *
 * Root cause fixed in commit 361dcedaabe: the page previously rendered the raw
 * API response envelope (e.g. { success, analysis, timestamp }) as the report
 * payload, so the summary cards read undefined. The load now unwraps the
 * envelope (parsed.analysis when present) and validates it with isAnalysisReport
 * before rendering; an invalid shape surfaces as data.loadError instead.
 *
 * These tests assert the observable contract: a well-formed analysis report
 * renders its summary cards and collection list, while a malformed payload
 * surfaces the load-error message rather than crashing.
 */

const validAnalysis = {
	metadata: { totalCollections: 3, totalPoints: 120, uniqueTags: 42 },
	clusterHealth: { totalClusters: 5, errorEvents: 2, codebaseChunksInQdrant: 100, phase89ChunksInQdrant: 30, phase90CardsInQdrant: 8 },
	recommendations: [{ priority: 'HIGH', title: 'Reindex', detail: 'Qdrant empty', action: 'POST /api/phase89/reindex', estimatedImpact: 'medium' }],
	analysis: { rawAnalysis: 'RAG+KAG analysis complete.' },
	knowledge: { collections: [{ name: 'Fiduciary', points: 40, segments: 12, status: 'green' }] },
};

describe('agentic-errors analysis page', () => {
	it('renders summary cards and collection list for a valid analysis report', () => {
		const { body } = render(AnalysisPage, { props: { data: { analysis: validAnalysis, timestamp: '2024-01-01T00:00:00Z', hasGeminiKey: false, loadError: null } } });
		expect(body).toContain('Collections');
		expect(body).toContain('Total Points');
		expect(body).toContain('Unique Tags');
		expect(body).toContain('Last Updated');
		expect(body).toContain('Fiduciary');
		expect(body).toContain('Points:');
		expect(body).toContain('Recommendations');
		expect(body).not.toContain('No Analysis Generated Yet');
	});

	it('surfaces the load-error message for a malformed payload', () => {
		const { body } = render(AnalysisPage, { props: { data: { analysis: { not: 'an analysis' }, timestamp: null, hasGeminiKey: false, loadError: 'Analysis report has an unexpected format' } } });
		expect(body).toContain('No Analysis Generated Yet');
		expect(body).toContain('unexpected format');
	});

	it('shows the empty-state banner when there is no analysis', () => {
		const { body } = render(AnalysisPage, { props: { data: { analysis: null, timestamp: null, hasGeminiKey: false, loadError: 'Analysis report not generated yet' } } });
		expect(body).toContain('No Analysis Generated Yet');
		expect(body).toContain('Analysis report not generated yet');
	});

	it('renders the agentic controller toggle', () => {
		const { body } = render(AnalysisPage, { props: { data: { analysis: validAnalysis, timestamp: '2024-01-01T00:00:00Z', hasGeminiKey: false, loadError: null } } });
		expect(body).toContain('Agentic Error Controller');
	});
});
