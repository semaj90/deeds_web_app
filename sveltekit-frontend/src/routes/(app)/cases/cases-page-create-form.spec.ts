// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CasesPage from './+page.svelte';

// Renders the REAL cases +page.svelte with realistic load data and different action results.
// Guards the create-case modal behavior that depends on the generated ActionData type:
// a failed create keeps the modal open with field errors and entered values; every other
// action result (bulk success/failure, no result) must not open it.

const emptySuperform = {
	id: 'create-case',
	valid: false,
	posted: false,
	errors: {},
	data: { title: '', description: '', priority: 'medium' },
	constraints: {},
};

function pageData() {
	return {
		user: { id: 1, role: 'user' },
		cases: [] as unknown[],
		pagination: { limit: 20, offset: 0, hasMore: false },
		filters: { status: 'all', priority: '', search: '' },
		databaseStatus: { available: true, error: null },
		form: emptySuperform,
	};
}

function renderPage(form: unknown) {
	return render(CasesPage, { props: { data: pageData(), form } as never }).body;
}

describe('cases page: create-case modal against action results', () => {
	it('opens the modal with field errors and the entered values after a failed create', () => {
		const body = renderPage({
			error: 'Please correct the highlighted case fields and try again.',
			form: {
				...emptySuperform,
				posted: true,
				data: {
					title: '',
					description: 'Brief overview of the matter',
					priority: 'high',
					caseNumber: '2026-CR-0042',
					practiceArea: 'Criminal Law',
					jurisdiction: 'Federal District Court',
				},
				errors: { title: ['Title is required'] },
			},
		});

		expect(body).toContain('cs-modal-form');
		expect(body).toContain('Please correct the highlighted case fields and try again.');
		expect(body).toContain('Title is required');
		expect(body).toContain('id="case-create-title-error"');
		expect(body).toContain('aria-invalid="true"');
		expect(body).toContain('aria-describedby="case-create-title-error"');
		// Entered values survive the failed submit.
		expect(body).toContain('Brief overview of the matter');
		expect(body).toContain('2026-CR-0042');
		expect(body).toContain('Criminal Law');
		expect(body).toContain('Federal District Court');
	});

	it('keeps the modal open for a server failure that still carries the form', () => {
		const body = renderPage({
			error: 'Failed to create case',
			form: { ...emptySuperform, valid: true, data: { title: 'State v. Smith', description: 'Desc', priority: 'medium' } },
		});
		expect(body).toContain('cs-modal-form');
		expect(body).toContain('Failed to create case');
		expect(body).toContain('State v. Smith');
	});

	it('does not open the modal for a bulk-action success result', () => {
		const body = renderPage({ success: true, message: '2 cases updated', count: 2 });
		expect(body).not.toContain('cs-modal-form');
		expect(body).toContain('2 cases updated');
	});

	it('shows a bulk-action failure outside the modal and leaves the modal closed', () => {
		const body = renderPage({ error: 'Failed to update cases' });
		expect(body).not.toContain('cs-modal-form');
		expect(body).toContain('Failed to update cases');
	});

	it('does not open the modal when there is no action result', () => {
		expect(renderPage(null)).not.toContain('cs-modal-form');
		expect(renderPage(undefined)).not.toContain('cs-modal-form');
	});

	it('ignores a malformed form object instead of trusting its shape', () => {
		const body = renderPage({ error: 'x', form: { valid: 'yes' } });
		expect(body).not.toContain('cs-modal-form');
	});
});
