import { describe, expect, it } from 'vitest';
import { countCaseStatuteLinksByType, normalizeCaseStatuteLinks } from './case-statute-link-adapter.js';

describe('case statute link API adapter', () => {
	it('normalizes the current camelCase API response', () => {
		const links = normalizeCaseStatuteLinks({
			success: true,
			data: [{
				id: 'link-1',
				linkType: 'CHARGED_UNDER',
				statuteId: 'statute-1',
				statuteSection: 'Cal. Code § 1',
				statuteTitle: 'Example statute',
				createdAt: '2026-11-02T07:00:00.000Z',
				notes: 'Grounded note',
			}],
		}, 'case-1');

		expect(links).toEqual([{
			id: 'link-1',
			case_id: 'case-1',
			statute_code: 'Cal. Code § 1',
			link_type: 'CHARGED_UNDER',
			notes: 'Grounded note',
			created_at: '2026-11-02T07:00:00.000Z',
			updated_at: '2026-11-02T07:00:00.000Z',
		}]);
	});

	it('supports the legacy links shape and counts normalized link types', () => {
		const links = normalizeCaseStatuteLinks({
			links: [
				{ id: 'a', statute_code: 'A', link_type: 'CITED_IN' },
				{ id: 'b', statuteCode: 'B', linkType: 'CITED_IN' },
			],
		}, 'case-2');

		expect(countCaseStatuteLinksByType(links)).toEqual({ CITED_IN: 2 });
	});
});
