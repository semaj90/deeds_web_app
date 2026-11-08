import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ExhibitInspectorPanel from './ExhibitInspectorPanel.svelte';

describe('ExhibitInspectorPanel Verification Contract', () => {
	const VALID_HASH = '9cf64920ea705f6f96aec83305e0224d0a94ab9ddb39d63b2472dda6ed37fd5b';

	it('renders DEMONSTRATIVE · UNCALIBRATED badge when hash is missing', () => {
		render(ExhibitInspectorPanel, {
			props: { sourceSha256: null }
		});

		const badge = screen.getByTestId('verified-badge');
		expect(badge).toHaveClass('is-unverified');
		expect(badge).not.toHaveClass('is-verified');
		expect(badge.textContent?.trim()).toBe('DEMONSTRATIVE · UNCALIBRATED');
	});

	it('renders DEMONSTRATIVE · UNCALIBRATED badge when hash is malformed', () => {
		render(ExhibitInspectorPanel, {
			props: { sourceSha256: 'deadbeef123-not-64-hex' }
		});

		const badge = screen.getByTestId('verified-badge');
		expect(badge).toHaveClass('is-unverified');
		expect(badge).not.toHaveClass('is-verified');
		expect(badge.textContent?.trim()).toBe('DEMONSTRATIVE · UNCALIBRATED');
	});

	it('distinguishes syntax validity from server verification (unverified when server receipt missing)', () => {
		render(ExhibitInspectorPanel, {
			props: {
				sourceSha256: VALID_HASH,
				serverVerified: false,
				sourceRevision: null
			}
		});

		const badge = screen.getByTestId('verified-badge');
		expect(badge).toHaveClass('is-unverified');
		expect(badge).not.toHaveClass('is-verified');
		expect(badge.textContent?.trim()).toBe('UNVERIFIED · NO RECEIPT');
		expect(screen.getByText(/VALID 64-HEX/i)).toBeInTheDocument();
		expect(screen.getByText(/UNAUTHENTICATED/i)).toBeInTheDocument();
	});

	it('never marks synthetic scene data as verified even if syntax and server flags are present', () => {
		render(ExhibitInspectorPanel, {
			props: {
				sourceSha256: VALID_HASH,
				serverVerified: true,
				sourceRevision: 'rev-20261106-pg18',
				isSynthetic: true
			}
		});

		const badge = screen.getByTestId('verified-badge');
		expect(badge).toHaveClass('is-unverified');
		expect(badge).not.toHaveClass('is-verified');
		expect(badge.textContent?.trim()).toBe('DEMONSTRATIVE · SYNTHETIC');
	});

	it('marks evidence as is-verified (mint green) only with valid hash + server receipt + revision', () => {
		render(ExhibitInspectorPanel, {
			props: {
				sourceSha256: VALID_HASH,
				serverVerified: true,
				sourceRevision: 'rev-20261106-pg18',
				isSynthetic: false,
				provenanceLabel: 'VERIFIED · AUTHENTICATED'
			}
		});

		const badge = screen.getByTestId('verified-badge');
		expect(badge).toHaveClass('is-verified');
		expect(badge).not.toHaveClass('is-unverified');
		expect(badge.textContent?.trim()).toBe('VERIFIED · AUTHENTICATED');
		expect(screen.getByText(/ADMITTED \(rev-20261106-pg18\)/i)).toBeInTheDocument();
	});
});
