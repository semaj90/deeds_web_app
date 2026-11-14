import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import InvestigativeCanvasStar from './InvestigativeCanvasStar.svelte';

describe('InvestigativeCanvasStar (Screenshot 1 Dossier Alignment)', () => {
	it('renders Docket banner and center hypothesis H-01', () => {
		render(InvestigativeCanvasStar, {
			props: {
				demoMode: true,
				docketNumber: '#986B5214',
				caseTitle: 'UNTITLED CASE DOSSIER'
			}
		});

		expect(screen.getByText(/DOCKET #986B5214/i)).toBeInTheDocument();
		expect(screen.getByText(/UNTITLED CASE DOSSIER/i)).toBeInTheDocument();
		expect(screen.getByText(/SUBJECT AT SCENE/i)).toBeInTheDocument();
		expect(screen.getAllByText(/H-01/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText(/PRIMARY HYPOTHESIS/i)).toBeInTheDocument();
	});

	it('renders all 6 canonical exhibits with their relationship pills', () => {
		render(InvestigativeCanvasStar, { props: { demoMode: true } });

		// Sidebar and canvas contain exhibits E-001 to E-006
		expect(screen.getAllByText(/Trace Residue \(Footprint\)/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/Witness Statement/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/Security Footage \(Lobby\)/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/Financial Transfer Map/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/3D Scene Reconstruction/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/Contract Excerpt \(Escrow\)/i).length).toBeGreaterThanOrEqual(1);

		// Edge relationship pills
		expect(screen.getAllByText(/PLACES SUBJECT/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/REPORTS PRESENCE/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/CORROBORATES/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/ESTABLISHES MOTIVE/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/SPATIAL MATCH/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(/LINKS ENTITY/i).length).toBeGreaterThanOrEqual(1);
	});

	it('renders Evidence Inspector with calipers and analysis checklist for E-001 by default', () => {
		render(InvestigativeCanvasStar, { props: { demoMode: true } });

		expect(screen.getByText(/EVIDENCE INSPECTOR/i)).toBeInTheDocument();
		expect(screen.getByText(/42\.23"/i)).toBeInTheDocument();
		expect(screen.getByText(/0\.287 m/i)).toBeInTheDocument();
		expect(screen.getByText(/Subject's footwear signature \(p = 0\.94\)/i)).toBeInTheDocument();
		expect(screen.getByText(/SUPPORTS H-01/i)).toBeInTheDocument();
		expect(screen.getByText(/Strongly corroborates subject presence at the scene\./i)).toBeInTheDocument();
	});

	it('updates selected exhibit when clicking a card', async () => {
		render(InvestigativeCanvasStar, { props: { demoMode: true } });

		const witnessNodes = screen.getAllByText(/Witness Statement/i);
		await fireEvent.click(witnessNodes[0]);

		// Inspector should reflect E-002
		expect(screen.getAllByText(/E-002/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText(/Corroborates hallway arrival window/i)).toBeInTheDocument();
	});

	it('supports keyboard selection and opening exhibit details', async () => {
		const onOpenModal = vi.fn();
		render(InvestigativeCanvasStar, { props: { demoMode: true, onOpenModal } });

		const witnessCard = screen.getAllByRole('button', { name: /Select Witness Statement/i })[0];
		await fireEvent.keyDown(witnessCard, { key: 'Enter' });

		expect(onOpenModal).toHaveBeenCalledTimes(1);
		expect(onOpenModal).toHaveBeenCalledWith(expect.objectContaining({ title: 'Witness Statement' }));
		expect(screen.getAllByText(/E-002/i).length).toBeGreaterThanOrEqual(1);

		const canvas = screen.getByRole('button', { name: /Interactive investigative canvas/i });
		await fireEvent.keyDown(canvas, { key: 'ArrowRight' });
		expect(document.querySelector('.canvas-transform-layer')?.getAttribute('style')).toContain('32px');
	});

	it('invokes onOpenUpload when ADD EVIDENCE button is clicked', async () => {
		const onOpenUpload = vi.fn();
		render(InvestigativeCanvasStar, {
			props: { demoMode: true, onOpenUpload }
		});

		const addBtn = screen.getByText(/ADD EVIDENCE/i);
		await fireEvent.click(addBtn);

		expect(onOpenUpload).toHaveBeenCalledTimes(1);
	});

	it('keeps empty case boards free of seeded exhibits and hypotheses', () => {
		render(InvestigativeCanvasStar, { props: { docketNumber: '#EMPTY', evidenceItems: [] } });

		expect(screen.getByText('NO CASE EVIDENCE LOADED')).toBeInTheDocument();
		expect(screen.getByText(/Select or add a case exhibit/i)).toBeInTheDocument();
		expect(screen.queryByText(/PRIMARY HYPOTHESIS/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Witness Statement/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Strongly corroborates subject presence/i)).not.toBeInTheDocument();
	});

	it('uses neutral placeholders for missing case evidence metadata', () => {
		render(InvestigativeCanvasStar, {
			props: {
				docketNumber: '#CASE-1',
				evidenceItems: [{ id: 'evidence-uuid-1', title: 'Lab photograph', mimeType: 'image/png' }]
			}
		});

		expect(screen.getAllByText('Lab photograph').length).toBeGreaterThan(0);
		expect(screen.getByText('Not recorded')).toBeInTheDocument();
		expect(screen.getByText('Not provided')).toBeInTheDocument();
		expect(screen.getByText('No reviewed conclusion recorded.')).toBeInTheDocument();
		expect(screen.queryByText(/PRIMARY HYPOTHESIS/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Linked to H-01/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Spatial alignment to E-005/i)).not.toBeInTheDocument();
	});

	it('renders uploaded images, documents, and videos with real thumbnails and dynamic relationship pills', () => {
		render(InvestigativeCanvasStar, {
			props: {
				docketNumber: '#FAFA-01',
				caseTitle: 'FAFA Evidentiary Corpus',
				evidenceItems: [
					{
						id: 'ev-img-1',
						title: 'Lobby Footprint',
						fileType: 'image/png',
						thumbnail: '/api/evidence/ev-img-1/download?inline=1',
						relation: 'PLACES SUBJECT'
					},
					{
						id: 'ev-vid-1',
						title: 'Security Feed',
						fileType: 'video/mp4',
						relation: 'CORROBORATES'
					},
					{
						id: 'ev-doc-1',
						title: 'Witness Statement',
						fileType: 'application/pdf',
						relation: 'REPORTS PRESENCE'
					}
				]
			}
		});

		expect(screen.getAllByText('FAFA Evidentiary Corpus').length).toBeGreaterThanOrEqual(2);
		expect(screen.getByText('CASE THEORY')).toBeInTheDocument();
		expect(screen.getAllByText('PLACES SUBJECT').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText('CORROBORATES').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText('REPORTS PRESENCE').length).toBeGreaterThanOrEqual(1);
		const thumbs = screen.getAllByAltText('Lobby Footprint');
		expect(thumbs.length).toBeGreaterThanOrEqual(2);
		expect(thumbs[0].getAttribute('src')).toBe('/api/evidence/ev-img-1/download?inline=1');
	});
});
