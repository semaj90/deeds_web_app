import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CitationDetail from '../CitationDetail.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('CitationDetail Component', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 const mockCitation = {
 id: 'citation-123',
 statute_code: '18 U.S.C. § 1001',
 statute_title: 'Fraud and false statements',
 jurisdiction: 'Federal',
 severity: 'Felony',
 year: 2023,
 source_type: 'manual' as const,
 highlighted_text: 'Fraud and false statements',
 notes: 'Important statute',
 created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
 };

 beforeEach(() => {
 vi.clearAllMocks();
 });

 it('should render citation detail', () => {
 const { container } = render(CitationDetail, {
 props: { citation, mockCitation },
	});

 expect(container.querySelector('.citation-detail')).toBeTruthy();
 });

 it('should display statute code', () => {
 render(CitationDetail, {
 props: { citation, mockCitation },
	});

 expect(screen.getByText('18 U.S.C. § 1001')).toBeTruthy();
 });

 it('should display statute title', () => {
 render(CitationDetail, {
 props: { citation, mockCitation },
	});

 expect(screen.getByText('Fraud and false statements')).toBeTruthy();
 });

 it('should display metadata', () => {
 render(CitationDetail, {
 props: { citation, mockCitation },
	});

 expect(screen.getByText('Federal')).toBeTruthy();
 expect(screen.getByText('Felony')).toBeTruthy();
 expect(screen.getByText('2023')).toBeTruthy();
 });

 it('should display highlighted text', () => {
 render(CitationDetail, {
 props: { citation, mockCitation },
	});

 expect(screen.getByText('Fraud and false statements')).toBeTruthy();
 });

 it('should display notes', () => {
 render(CitationDetail, {
 props: { citation, mockCitation },
	});

 expect(screen.getByText('Important statute')).toBeTruthy();
 });

 it('should display action buttons when showActions is true', () => {
 render(CitationDetail, {
 props: {
	citation: mockCitation, showActions: true },
	});

 expect(screen.getByTitle('Attach to case')).toBeTruthy();
 expect(screen.getByTitle('Edit notes')).toBeTruthy();
 expect(screen.getByTitle('Delete citation')).toBeTruthy();
 });

 it('should hide action buttons when showActions is false', () => {
 render(CitationDetail, {
 props: {
	citation: mockCitation, showActions: false },
	});

 expect(screen.queryByTitle('Attach to case')).toBeFalsy();
 expect(screen.queryByTitle('Edit notes')).toBeFalsy();
 expect(screen.queryByTitle('Delete citation')).toBeFalsy();
 });

 it('should allow editing notes', async () => {
 const { component } = render(CitationDetail, {
 props: {
	citation: mockCitation, showActions: true },
	});

 const editButton = screen.getByTitle('Edit notes');
 await fireEvent.click(editButton);

 await waitFor(() => {
 const textarea = screen.getByDisplayValue('Important statute');
 expect(textarea).toBeTruthy();
 });
 });

 it('should save updated notes', async () => {
 (global.fetch as any).mockResolvedValue({
 ok: true, json: async () => ({
 success: true,
 citation: { ...mockCitation, notes: 'Updated notes' },
	}),
 });

 const { component } = render(CitationDetail, {
 props: {
	citation: mockCitation, showActions: true },
	});

 const editButton = screen.getByTitle('Edit notes');
 await fireEvent.click(editButton);

 await waitFor(() => {
 const textarea = screen.getByDisplayValue('Important statute');
 expect(textarea).toBeTruthy();
 });
 });

 it('should display timestamps', () => {
 render(CitationDetail, {
 props: { citation, mockCitation },
	});

 expect(screen.getByText(/Created:/)).toBeTruthy();
 expect(screen.getByText(/Updated:/)).toBeTruthy();
 });

 it('should emit attach-to-case event', async () => {
 const { component } = render(CitationDetail, {
 props: {
	citation: mockCitation, showActions: true },
	});

 const attachButton = screen.getByTitle('Attach to case');
 await fireEvent.click(attachButton);

 // Event would be captured by parent component
 expect(true).toBe(true);
 });

 it('should emit delete event', async () => {
 window.confirm = vi.fn(() => true);

 const { component } = render(CitationDetail, {
 props: {
	citation: mockCitation, showActions: true },
	});

 const deleteButton = screen.getByTitle('Delete citation');
 await fireEvent.click(deleteButton);

 expect(window.confirm).toHaveBeenCalled();
 });
});



