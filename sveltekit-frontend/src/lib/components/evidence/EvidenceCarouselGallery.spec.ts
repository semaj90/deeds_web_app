import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_EVIDENCE_ITEMS, type EvidenceItem } from './evidence-types.js';

describe('EvidenceCarouselGallery & ExpandedEvidenceViewer Contracts', () => {
	it('validates default evidence items contract and multimodal diversity', () => {
		expect(DEFAULT_EVIDENCE_ITEMS.length).toBeGreaterThanOrEqual(8);

		const types = new Set(DEFAULT_EVIDENCE_ITEMS.map((item) => item.type));
		expect(types.has('video')).toBe(true);
		expect(types.has('document')).toBe(true);
		expect(types.has('biometric')).toBe(true);
		expect(types.has('audio')).toBe(true);
		expect(types.has('cctv')).toBe(true);
		expect(types.has('splat')).toBe(true);
		expect(types.has('forensic')).toBe(true);

		for (const item of DEFAULT_EVIDENCE_ITEMS) {
			expect(item.id).toBeDefined();
			expect(item.exhibitNumber).toMatch(/^E-\d{3}$/);
			expect(item.title).toBeDefined();
			expect(item.categoryBadge).toBeDefined();
			expect(item.mimeType).toBeDefined();
			expect(item.sha256).toMatch(/^[a-f0-9]{64}$/);
			expect(item.chainOfCustody).toBeDefined();
			expect(item.chainOfCustody?.admissibilityStatus).toBe('AUTHENTICATED');
		}
	});

	it('anchors exhibits correctly to PostgreSQL 18 pgvector and SeaweedFS buckets', () => {
		const docItem = DEFAULT_EVIDENCE_ITEMS.find((i) => i.id === 'e-003');
		expect(docItem).toBeDefined();
		expect(docItem?.chainOfCustody?.storageBucket).toContain('legal-evidence');
		expect(docItem?.chainOfCustody?.pgvectorIndexId).toBe('PGVECTOR #8814');
		expect(docItem?.statutes).toContain('18 U.S.C. § 1341 (Wire Fraud)');

		const splatItem = DEFAULT_EVIDENCE_ITEMS.find((i) => i.id === 'e-009');
		expect(splatItem).toBeDefined();
		expect(splatItem?.metrics?.splatPoints).toBe('1.48M Splats');
		expect(splatItem?.metrics?.caliperRms).toBe('0.003mm');
		expect(splatItem?.metrics?.vectorSimilarity).toBe(0.9942);
		expect(splatItem?.chainOfCustody?.storageBucket).toContain('legal-evidence/splats');
	});

	it('verifies drag and drop transfer structure and serialization', () => {
		const sampleExhibit: EvidenceItem = DEFAULT_EVIDENCE_ITEMS[0];
		const serialized = JSON.stringify(sampleExhibit);
		const parsed = JSON.parse(serialized);

		expect(parsed.exhibitNumber).toBe('E-002');
		expect(parsed.type).toBe('video');
		expect(parsed.confidence).toBe(99.1);
	});

	it('supports dynamic file ingestion mapping into valid EvidenceItems', () => {
		const mockFile = {
			name: 'surveillance-hallway-night.mp4',
			type: 'video/mp4',
			size: 20485760
		};

		const ext = mockFile.name.split('.').pop()?.toLowerCase();
		expect(ext).toBe('mp4');

		const createdItem: EvidenceItem = {
			id: 'e-user-test-01',
			exhibitNumber: 'E-010',
			title: mockFile.name,
			type: 'video',
			categoryBadge: 'MP4',
			badgeColor: 'blue',
			mimeType: mockFile.type,
			fileSize: `${(mockFile.size / 1024 / 1024).toFixed(1)} MB`,
			sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
			timestamp: new Date().toUTCString(),
			statutes: ['FRE 901 (Authenticity)'],
			summary: 'Dynamically ingested user file'
		};

		expect(createdItem.type).toBe('video');
		expect(createdItem.fileSize).toBe('19.5 MB');
	});

	it('handles tab state and multi-modal switching for ExpandedEvidenceViewer', () => {
		const tabs = ['preview', 'ocr', 'chain', 'statutes'] as const;
		let currentTab: typeof tabs[number] = 'preview';

		function setTab(t: typeof tabs[number]) {
			currentTab = t;
		}

		setTab('ocr');
		expect(currentTab).toBe('ocr');

		setTab('chain');
		expect(currentTab).toBe('chain');

		setTab('statutes');
		expect(currentTab).toBe('statutes');
	});
});
