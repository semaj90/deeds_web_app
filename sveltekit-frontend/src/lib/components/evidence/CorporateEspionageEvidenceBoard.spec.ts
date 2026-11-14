import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CorporateEspionageEvidenceBoard from './CorporateEspionageEvidenceBoard.svelte';

describe('CorporateEspionageEvidenceBoard (Canonical Forensic Canvas)', () => {
	it('renders header with case title, status badge, and analysis buttons', () => {
		render(CorporateEspionageEvidenceBoard, {
			props: {
				caseTitle: 'CORPORATE ESPIONAGE INV-2024'
			}
		});

		expect(screen.getByText(/EVIDENCE BOARD/i)).toBeInTheDocument();
		expect(screen.getByText(/CASE: CORPORATE ESPIONAGE INV-2024/i)).toBeInTheDocument();
		expect(screen.getByText(/Active Investigation/i)).toBeInTheDocument();
		expect(screen.getByText(/Library/i)).toBeInTheDocument();
		expect(screen.getByText(/Run Analysis/i)).toBeInTheDocument();
	});

	it('renders canvas toolbar indicators and left palette tools', () => {
		render(CorporateEspionageEvidenceBoard);

		expect(screen.getByText(/SCALE: 100%/i)).toBeInTheDocument();
		expect(screen.getByText(/LIVE SYNC/i)).toBeInTheDocument();
		expect(screen.getByText(/NEW EVIDENCE/i)).toBeInTheDocument();
	});

	it('renders the 3 canonical forensic cards: Video #042, Transaction $50k, and Witness Statement', () => {
		render(CorporateEspionageEvidenceBoard);

		// Card 1: Video #042
		expect(screen.getAllByText(/VIDEO EVIDENCE/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText(/ID: #042/i)).toBeInTheDocument();
		expect(screen.getByText(/Security Camera Feed/i)).toBeInTheDocument();
		expect(screen.getByText(/14:02:35/i)).toBeInTheDocument();
		expect(screen.getByText(/High Reliability/i)).toBeInTheDocument();

		// Card 2: Transaction
		expect(screen.getByText(/TRANSACTION/i)).toBeInTheDocument();
		expect(screen.getByText(/\$50,000\.00/i)).toBeInTheDocument();
		expect(screen.getByText(/Wire transfer to offshore account/i)).toBeInTheDocument();
		expect(screen.getByText(/Flagged/i)).toBeInTheDocument();

		// Card 3: Document
		expect(screen.getByText(/DOCUMENT/i)).toBeInTheDocument();
		expect(screen.getByText(/Witness Statement: J\. Doe/i)).toBeInTheDocument();
		expect(screen.getByText(/#witness/i)).toBeInTheDocument();
		expect(screen.getByText(/#keycard/i)).toBeInTheDocument();
	});

	it('renders right drawer with AI insight, metadata (Cam-N-04), and investigator note at 0:14 mark', () => {
		render(CorporateEspionageEvidenceBoard);

		expect(screen.getByText(/Selected Evidence/i)).toBeInTheDocument();
		expect(screen.getByText(/Video Evidence #042/i)).toBeInTheDocument();
		expect(screen.getByText(/PRIMARY/i)).toBeInTheDocument();

		// AI insight
		expect(screen.getByText(/AI Legal Insight/i)).toBeInTheDocument();
		expect(screen.getByText(/The timestamps in this footage align with the server logs found in/i)).toBeInTheDocument();
		expect(screen.getByText(/Evidence #012/i)).toBeInTheDocument();
		expect(screen.getByText(/Explore Related Case Law/i)).toBeInTheDocument();

		// Metadata
		expect(screen.getByText(/METADATA/i)).toBeInTheDocument();
		expect(screen.getByText(/2023-10-15/i)).toBeInTheDocument();
		expect(screen.getByText(/Cam-N-04/i)).toBeInTheDocument();
		expect(screen.getByText(/\.MP4 \(H\.264\)/i)).toBeInTheDocument();
		expect(screen.getByText(/Verified/i)).toBeInTheDocument();

		// Investigator Note
		expect(screen.getByText(/INVESTIGATOR NOTES/i)).toBeInTheDocument();
		expect(screen.getByText(/JD/i)).toBeInTheDocument();
		expect(screen.getByText(/0:14 mark/i)).toBeInTheDocument();
		expect(screen.getByText(/Is that a badge\?/i)).toBeInTheDocument();
	});

	it('triggers onOpenVideoModal with 14000ms when clicking the 0:14 mark in investigator notes', async () => {
		const onOpenVideoModal = vi.fn();
		render(CorporateEspionageEvidenceBoard, {
			props: { onOpenVideoModal }
		});

		const timestampBtn = screen.getByText(/0:14 mark/i);
		await fireEvent.click(timestampBtn);

		expect(onOpenVideoModal).toHaveBeenCalledTimes(1);
		expect(onOpenVideoModal).toHaveBeenCalledWith('ev-video-042', 14000);
	});

	it('renders bottom timeline with date range Oct 12 - Oct 16 and CAM FEED marker on Oct 15', async () => {
		render(CorporateEspionageEvidenceBoard);

		expect(screen.getByText(/TIMELINE VIEW/i)).toBeInTheDocument();
		expect(screen.getByText(/Oct 12/i)).toBeInTheDocument();
		expect(screen.getByText(/Oct 13/i)).toBeInTheDocument();
		expect(screen.getByText(/Oct 14/i)).toBeInTheDocument();
		expect(screen.getByText(/Oct 15/i)).toBeInTheDocument();
		expect(screen.getByText(/Oct 16/i)).toBeInTheDocument();
		expect(screen.getAllByText(/CAM/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/FEED/i).length).toBeGreaterThanOrEqual(1);
	});
});
