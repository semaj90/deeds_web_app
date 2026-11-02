import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import AgenticWorkflowProposalBoard from './AgenticWorkflowProposalBoard.svelte';
import { AgenticWorkflowProposalBoardV1Schema, agenticWorkflowProposalBoardV1 } from '$lib/atlas/agentic-workflow-proposals-v1.js';

afterEach(cleanup);

describe('AgenticWorkflowProposalBoard', () => {
	it('renders all four lanes and visibly labels missing receipts and gates', () => {
		render(AgenticWorkflowProposalBoard);

		expect(screen.getByRole('heading', { name: 'Four cooperating workflows' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Evidence synthesis' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Taxonomy and timeline' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Low-rank recommendations' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Recursive verification' })).toBeTruthy();
		expect(screen.getByRole('article', { name: 'Evidence synthesis' })).toBeTruthy();
		expect(screen.getAllByText('None recorded')).toHaveLength(4);
		expect(screen.getAllByText('BLOCKED')).toHaveLength(3);
		expect(screen.getByText('UNVERIFIED')).toBeTruthy();
		expect(screen.getAllByText('Implementation maturity: PARTIAL')).toHaveLength(2);
		expect(screen.getByText(/does not query services, dispatch agents/)).toBeTruthy();
	 });

	it('accepts and renders an explicit conflicted evidence state', () => {
		const board = {
			...agenticWorkflowProposalBoardV1,
			lanes: agenticWorkflowProposalBoardV1.lanes.map((lane, index) => index === 0
				? { ...lane, status: 'CONFLICTED' as const }
				: lane)
		};
		const { container } = render(AgenticWorkflowProposalBoard, { props: { board } });

		expect(screen.getByText('CONFLICTED')).toBeTruthy();
		expect(container.querySelector('[data-status="CONFLICTED"]')).toBeTruthy();
	});

	it('fails closed when supplied board data violates the Zod contract', () => {
		render(AgenticWorkflowProposalBoard, {
			props: { board: { ...agenticWorkflowProposalBoardV1, canonicalAuthority: true } }
		});

		expect(screen.getByRole('alert', { name: 'Proposal board unavailable' })).toBeTruthy();
		expect(screen.getByText(/hidden because its data did not pass validation/)).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Evidence synthesis' })).toBeNull();
	});

	it('renders an explicit empty-source state without implying missing evidence is verified', () => {
		const board = {
			...agenticWorkflowProposalBoardV1,
			lanes: agenticWorkflowProposalBoardV1.lanes.map((lane) => ({ ...lane, sourceRefs: [] }))
		};
		render(AgenticWorkflowProposalBoard, { props: { board } });

		expect(screen.getAllByText('No source references recorded.')).toHaveLength(4);
		expect(screen.getByText('PROPOSAL ONLY · NO LIVE STATUS')).toBeTruthy();
	});

	it('exposes a navigable heading, named cards, status announcements, and source disclosures', async () => {
		const { container } = render(AgenticWorkflowProposalBoard);
		const region = screen.getByRole('region', { name: 'Four cooperating workflows' });
		expect(region).toBeTruthy();
		expect(screen.getAllByRole('article')).toHaveLength(4);
		expect(screen.getByRole('status', { name: 'Evidence status: UNVERIFIED' })).toBeTruthy();
		expect(screen.getAllByRole('status')).toHaveLength(4);

		const sourceDisclosure = screen.getAllByText('Evidence references (2)')[0];
		expect(sourceDisclosure).toBeDefined();
		await fireEvent.click(sourceDisclosure);
		expect(sourceDisclosure.closest('details')?.hasAttribute('open')).toBe(true);
		expect(container.querySelectorAll('h2, h3, h4').length).toBeGreaterThan(4);
	});

	it('declares the narrow-viewport single-column layout rule', async () => {
		const styleText = await readFile(resolve(process.cwd(), 'src/lib/components/atlas/AgenticWorkflowProposalBoard.svelte'), 'utf8');
		expect(styleText).toContain('@media (max-width: 760px)');
		expect(styleText).toContain('grid-template-columns: minmax(0, 1fr)');
	});

	it('rejects authority claims and duplicate or missing lanes', () => {
		expect(AgenticWorkflowProposalBoardV1Schema.safeParse({
			...agenticWorkflowProposalBoardV1,
			canonicalAuthority: true,
		}).success).toBe(false);
		expect(AgenticWorkflowProposalBoardV1Schema.safeParse({
			...agenticWorkflowProposalBoardV1,
			lanes: agenticWorkflowProposalBoardV1.lanes.slice(0, 3),
		}).success).toBe(false);
		expect(AgenticWorkflowProposalBoardV1Schema.safeParse({
			...agenticWorkflowProposalBoardV1,
			lanes: agenticWorkflowProposalBoardV1.lanes.map((lane, index) => index === 3
				? { ...lane, id: 'evidence-synthesis' }
				: lane),
		}).success).toBe(false);
	});
});
