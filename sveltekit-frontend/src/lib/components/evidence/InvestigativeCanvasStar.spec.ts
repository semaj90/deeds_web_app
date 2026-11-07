import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import InvestigativeCanvasStar from './InvestigativeCanvasStar.svelte';

describe('InvestigativeCanvasStar (Screenshot 1 Dossier Alignment)', () => {
	it('renders Docket banner and center hypothesis H-01', () => {
		render(InvestigativeCanvasStar, {
			props: {
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
		render(InvestigativeCanvasStar);

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
		render(InvestigativeCanvasStar);

		expect(screen.getByText(/EVIDENCE INSPECTOR/i)).toBeInTheDocument();
		expect(screen.getByText(/42\.23"/i)).toBeInTheDocument();
		expect(screen.getByText(/0\.287 m/i)).toBeInTheDocument();
		expect(screen.getByText(/Subject's footwear signature \(p = 0\.94\)/i)).toBeInTheDocument();
		expect(screen.getByText(/SUPPORTS H-01/i)).toBeInTheDocument();
		expect(screen.getByText(/Strongly corroborates subject presence at the scene\./i)).toBeInTheDocument();
	});

	it('updates selected exhibit when clicking a card', async () => {
		render(InvestigativeCanvasStar);

		const witnessNodes = screen.getAllByText(/Witness Statement/i);
		await fireEvent.click(witnessNodes[0]);

		// Inspector should reflect E-002
		expect(screen.getAllByText(/E-002/i).length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText(/Corroborates hallway arrival window/i)).toBeInTheDocument();
	});

	it('invokes onOpenUpload when ADD EVIDENCE button is clicked', async () => {
		const onOpenUpload = vi.fn();
		render(InvestigativeCanvasStar, {
			props: { onOpenUpload }
		});

		const addBtn = screen.getByText(/ADD EVIDENCE/i);
		await fireEvent.click(addBtn);

		expect(onOpenUpload).toHaveBeenCalledTimes(1);
	});
});
