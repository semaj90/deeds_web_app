import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import CourtroomEvidentiaryBriefModal from './CourtroomEvidentiaryBriefModal.svelte';

describe('CourtroomEvidentiaryBriefModal — Fed. R. Evid. 902(11) Alignment', () => {
	it('renders Rule 902(11) self-authenticating header and SHA-256 integrity hash', () => {
		render(CourtroomEvidentiaryBriefModal, {
			props: {
				open: true,
				docketNumber: '1:26-CR-00892-RCL',
				sha256Hash: '7f81a8c9e54d2b09a781fa781e920d31e8471e891b012c8a245d8f619e07d9e3',
				timestampAnchor: 'NIST ACTS',
			},
		});

		// Header badges
		expect(screen.getByText(/PREVIEW: COURTROOM EVIDENTIARY BRIEF/i)).toBeTruthy();
		expect(screen.getByText(/ORNITH 1.5 VLM SYNTHESIS/i)).toBeTruthy();

		// Rule 902(11) certification
		expect(
			screen.getByText(/CERTIFIED UNDER FED\. R\. EVID\. 902\(11\) \/\/ SELF-AUTHENTICATING RECORD/i)
		).toBeTruthy();
		expect(screen.getByText(/NIST ACTS/i)).toBeTruthy();
		expect(screen.getByText(/7f81a8c\.\.\.d9e3/i)).toBeTruthy();
	});

	it('renders court caption, docket details, and statutory contradiction findings', () => {
		render(CourtroomEvidentiaryBriefModal, {
			props: {
				open: true,
				docketNumber: '1:26-CR-00892-RCL',
				judgeName: 'HON. ROYCE C. LAMBERTH',
			},
		});

		// Court & parties
		expect(screen.getByText(/UNITED STATES DISTRICT COURT FOR THE DISTRICT OF COLUMBIA/i)).toBeTruthy();
		expect(screen.getByText(/HON\. ROYCE C\. LAMBERTH/i)).toBeTruthy();
		expect(screen.getByText(/1:26-CR-00892-RCL/i)).toBeTruthy();

		// Section 1: Statutory Contradiction & Scienter
		expect(screen.getByText(/STATUTORY CONTRADICTION & SCIENTER FINDINGS/i)).toBeTruthy();
		expect(screen.getByText(/18 U\.S\.C\. § 1001/i)).toBeTruthy();
		expect(screen.getByText(/18 U\.S\.C\. § 1343/i)).toBeTruthy();
		expect(screen.getByText(/Bayesian Posterior: 99\.84%/i)).toBeTruthy();
	});

	it('renders Exhibit A spatial stills with timestamps and bounding box labels', () => {
		render(CourtroomEvidentiaryBriefModal, {
			props: {
				open: true,
			},
		});

		// Section 2: Exhibit A
		expect(screen.getByText(/EXHIBIT A: CCTV NODE 12 HIGH-RESOLUTION SPATIAL STILLS/i)).toBeTruthy();
		expect(screen.getByText(/VLM Precision Conf: 0\.998/i)).toBeTruthy();

		// Frame indicators and timestamps
		expect(screen.getByText(/FRAME: 104,228/i)).toBeTruthy();
		expect(screen.getByText(/14:02:18\.92 UTC/i)).toBeTruthy();
		expect(screen.getByText(/FRAME: 104,390/i)).toBeTruthy();
		expect(screen.getByText(/14:02:44\.17 UTC/i)).toBeTruthy();

		// Bounding box labels
		expect(screen.getByText(/SUBJECT: VANCE \(P=0\.994\)/i)).toBeTruthy();
		expect(screen.getByText(/ENCRYPTED RFID KEYCARD/i)).toBeTruthy();
	});

	it('renders bottom dock with LiDAR mesh, GNSS accuracy, and viewport tabs', async () => {
		const onDownloadPdf = vi.fn();
		render(CourtroomEvidentiaryBriefModal, {
			props: {
				open: true,
				onDownloadPdf,
			},
		});

		expect(screen.getByText(/LiDAR Mesh 1\.42 GB/i)).toBeTruthy();
		expect(screen.getByText(/GNSS Accuracy ±1\.4cm/i)).toBeTruthy();
		expect(screen.getByText(/⚙ RTX Tensor 92%/i)).toBeTruthy();

		// Viewport navigation
		const splatTab = screen.getByRole('button', { name: /3D Splat View/i });
		expect(splatTab).toBeTruthy();
		await fireEvent.click(splatTab);
		expect(splatTab.classList.contains('active')).toBe(true);

		// Export brief button
		const exportBtn = screen.getByRole('button', { name: /Export Brief/i });
		await fireEvent.click(exportBtn);
		expect(onDownloadPdf).toHaveBeenCalledTimes(1);
	});

	it('triggers print and close events', async () => {
		const onClose = vi.fn();
		const onPrint = vi.fn();
		render(CourtroomEvidentiaryBriefModal, {
			props: {
				open: true,
				onClose,
				onPrint,
			},
		});

		const printBtn = screen.getByRole('button', { name: /Print Evidentiary Brief/i });
		await fireEvent.click(printBtn);
		expect(onPrint).toHaveBeenCalledTimes(1);

		const closeBtn = screen.getByRole('button', { name: /Close Preview/i });
		await fireEvent.click(closeBtn);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
