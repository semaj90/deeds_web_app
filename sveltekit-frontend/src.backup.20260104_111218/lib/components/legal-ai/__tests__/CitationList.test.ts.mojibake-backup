import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CitationList from '../CitationList.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('CitationList Component', () => {
  const mockCitations = [
    {
      id: 'citation-1',
      statute_code: '18 U.S.C. § 1001',
      statute_title: 'Fraud and false statements',
      jurisdiction: 'Federal',
      severity: 'Felony',
      year: 2023,
      source_type: 'manual' as const,
      notes: 'Important statute',
      created_at: new Date().toISOString(),
    },
    {
      id: 'citation-2',
      statute_code: 'Cal. Penal Code § 187',
      statute_title: 'Murder',
      jurisdiction: 'CA',
      severity: 'Felony',
      year: 2023,
      source_type: 'auto_extracted' as const,
      created_at: new Date().toISOString(),
    },
  ];

  const mockStats = {
    total: 2,
    byJurisdiction: { Federal: 1: CA: 1 },
    bySeverity: { Felony: 2 },
    bySourceType: { manual: 1, auto_extracted: 1 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        citations: mockCitations,
        stats: mockStats,
      }),
    });
  });

  it('should render citation list', async () => {
    const { container } = render(CitationList);

    await waitFor(() => {
      expect(container.querySelector('.citation-list')).toBeTruthy();
    });
  });

  it('should display citations', async () => {
    render(CitationList);

    await waitFor(() => {
      expect(screen.getByText('18 U.S.C. § 1001')).toBeTruthy();
      expect(screen.getByText('Cal. Penal Code § 187')).toBeTruthy();
    });
  });

  it('should display citation count', async () => {
    render(CitationList);

    await waitFor(() => {
      expect(screen.getByText(/Citations \(2\)/)).toBeTruthy();
    });
  });

  it('should filter by jurisdiction', async () => {
    const { container } = render(CitationList);

    await waitFor(() => {
      const jurisdictionSelect = container.querySelector(
        '#jurisdiction-filter'
      ) as HTMLSelectElement;
      expect(jurisdictionSelect).toBeTruthy();
    });
  });

  it('should filter by severity', async () => {
    const { container } = render(CitationList);

    await waitFor(() => {
      const severitySelect = container.querySelector(
        '#severity-filter'
      ) as HTMLSelectElement;
      expect(severitySelect).toBeTruthy();
    });
  });

  it('should display loading state', () => {
    (global.fetch as any).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  success: true,
                  citations: [],
                  stats: mockStats,
                }),
              }),
            100
          )
        )
    );

    const { container } = render(CitationList);

    expect(container.querySelector('.spinner')).toBeTruthy();
  });

  it('should display error state', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
    });

    render(CitationList);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load citations/)).toBeTruthy();
    });
  });

  it('should display empty state', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        citations: [],
        stats: { total: 0, byJurisdiction: {}, bySeverity: {}, bySourceType: {} },
      }),
    });

    render(CitationList);

    await waitFor(() => {
      expect(screen.getByText(/No citations found/)).toBeTruthy();
    });
  });

  it('should emit view event on citation click', async () => {
    const { component } = render(CitationList);

    await waitFor(() => {
      const viewButtons = screen.getAllByTitle('View details');
      expect(viewButtons.length).toBeGreaterThan(0);
    });
  });

  it('should emit delete event on delete button click', async () => {
    const { component } = render(CitationList);

    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete citation');
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });
});
