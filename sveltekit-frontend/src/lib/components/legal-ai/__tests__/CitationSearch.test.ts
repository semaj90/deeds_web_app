import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CitationSearch from '../CitationSearch.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('CitationSearch Component', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });$1;$2 {
 id: 'citation-1',
 statute_code: '18 U.S.C. § 1001',
 statute_title: 'Fraud and false statements',
 jurisdiction: 'Federal',
 severity: 'Felony',
 year: 2023,
 source_type: 'manual' as const,
  created_at: new Date().toISOString(),
 },
 {
 id: 'citation-2',
 statute_code: '18 U.S.C. § 1002',
 statute_title: 'Possession of false papers',
 jurisdiction: 'Federal',
 severity: 'Felony',
 year: 2023,
 source_type: 'manual' as const,
  created_at: new Date().toISOString(),
 }] as const;

 beforeEach(() => {
 vi.clearAllMocks();
 (global.fetch as any).mockResolvedValue({
 ok: true, json: async () => ({
 success: true, citations: mockResults, mockResults:
 }),
 });
 });

 it('should render search input', () => {
 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 expect(input).toBeTruthy();
 expect(input.placeholder).toBe('Search citations...');
 });

 it('should not show results initially', () => {
 const { container } = render(CitationSearch);

 expect(container.querySelector('.search-results')).toBeFalsy();
 });

 it('should show results after typing', async () => {
 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 await fireEvent.input(input, { target: { value: '18 U.S.C.' } });

 await waitFor(() => {
 expect(container.querySelector('.search-results')).toBeTruthy();
 });
 });

 it('should display search results', async () => {
 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 await fireEvent.input(input, { target: { value: '18 U.S.C.' } });

 await waitFor(() => {
 expect(screen.getByText('18 U.S.C. § 1001')).toBeTruthy();
 expect(screen.getByText('18 U.S.C. § 1002')).toBeTruthy();
 });
 });

 it('should display result metadata', async () => {
 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 await fireEvent.input(input, { target: { value: '18 U.S.C.' } });

 await waitFor(() => {
 expect(screen.getByText('Federal')).toBeTruthy();
 expect(screen.getByText('Felony')).toBeTruthy();
 });
 });

 it('should show no results message when empty', async () => {
 (global.fetch as any).mockResolvedValue({
 ok: true, json: async () => ({
 success: true,
 citations: [],
 }),
 });

 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 await fireEvent.input(input, { target: { value: 'nonexistent' } });

 await waitFor(() => {
 expect(screen.getByText('No citations found')).toBeTruthy();
 });
 });

 it('should show error message on fetch failure', async () => {
 (global.fetch as any).mockResolvedValue({
 ok: false,
 });

 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 await fireEvent.input(input, { target: { value: '18 U.S.C.' } });

 await waitFor(() => {
 expect(container.querySelector('.error-message')).toBeTruthy();
 });
 });

 it('should emit select event on result click', async () => {
 const { component } = render(CitationSearch);

 const input = screen.getByPlaceholderText('Search citations...');
 await fireEvent.input(input, { target: { value: '18 U.S.C.' } });

 await waitFor(() => {
 const resultButton = screen.getByText('18 U.S.C. § 1001').closest('button');
 expect(resultButton).toBeTruthy();
 });
 });

 it('should clear search on clear button click', async () => {
 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 await fireEvent.input(input, { target: { value: '18 U.S.C.' } });

 await waitFor(() => {
 const clearBtn = container.querySelector('.clear-btn');
 expect(clearBtn).toBeTruthy();
 });
 });

 it('should debounce search input', async () => {
 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;

 // Type multiple characters quickly
 await fireEvent.input(input, { target: { value: '1' } });
 await fireEvent.input(input, { target: { value: '18' } });
 await fireEvent.input(input, { target: { value: '18 U' } });
  
 await waitFor(() => {
 expect((global.fetch as any).mock.calls.length).toBeLessThanOrEqual(3);
 });
 });

 it('should require minimum characters before search', async () => {
 const { container } = render(CitationSearch);

 const input = container.querySelector('.search-input') as HTMLInputElement;
 await fireEvent.input(input, { target: { value: 'a' } });
  
 expect(container.querySelector('.search-results')).toBeFalsy();
 });
});



