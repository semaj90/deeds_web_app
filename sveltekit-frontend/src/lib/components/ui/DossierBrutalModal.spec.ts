import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DossierBrutalModal from './DossierBrutalModal.svelte';

afterEach(() => cleanup());

describe('DossierBrutalModal', () => {
	it('renders an accessible dialog with its title and a close control when open', () => {
		render(DossierBrutalModal, { props: { open: true, title: 'Exhibit E-004', description: 'Hash verified' } });
		const dialog = document.querySelector('[data-testid="dossier-brutal-modal"]');
		expect(dialog).not.toBeNull();
		expect(dialog?.getAttribute('role')).toBe('dialog');
		expect(document.body.textContent).toContain('Exhibit E-004');
		expect(document.body.textContent).toContain('Hash verified');
		expect(document.querySelector('button[aria-label="Close"]')).not.toBeNull();
	});

	it('renders nothing for the dialog when closed', () => {
		render(DossierBrutalModal, { props: { open: false, title: 'Hidden' } });
		expect(document.querySelector('[data-testid="dossier-brutal-modal"]')).toBeNull();
	});
});
