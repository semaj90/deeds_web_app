import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbExecute = vi.fn();
const mockPoolQuery = vi.fn();
const mockFetch = vi.fn();

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/db', () => ({
  default: {
    execute: mockDbExecute,
  },
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    execute: mockDbExecute,
  },
  pool: {
    query: mockPoolQuery,
  },
}));

vi.mock('$lib/server/rag/tag-extractor.js', () => ({
  extractLegalTags: () => ({ statutes: [], cases: [] }),
}));

vi.mock('$lib/server/analytics/event-logger.js', () => ({
  getTopQueryPatterns: vi.fn().mockResolvedValue([]),
  getWeeklySummary: vi.fn().mockResolvedValue(null),
}));

vi.mock('$lib/server/retrieval/web-search.js', () => ({
  webSearch: vi.fn().mockResolvedValue(null),
  formatWebResultsAsContext: vi.fn().mockReturnValue(''),
}));

vi.mock('$lib/server/retrieval/wikipedia-search.js', () => ({
  searchWikipedia: vi.fn().mockResolvedValue(null),
  formatWikipediaAsContext: vi.fn().mockReturnValue(''),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: () => {
    throw new Error('Neo4j unavailable in unit test');
  },
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: {
    client: {
      search: vi.fn().mockResolvedValue([]),
    },
    sectionFilteredSearch: vi.fn().mockResolvedValue({ results: [] }),
  },
}));

function getSqlText(query: unknown): string {
  try {
    return JSON.stringify(query).toLowerCase();
  } catch {
    return String(query).toLowerCase();
  }
}

describe('assembleACEContext glossary reuse', () => {
  const glossaryTerm = 'Probable Cause';
  const glossaryDefinition =
    'Reasonable grounds to believe that a crime has been committed and that the accused is responsible.';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);

    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    mockPoolQuery.mockImplementation(async (query: unknown) => {
      const sqlText = String(query).toLowerCase();

      if (sqlText.includes('from legal_glossary')) {
        return {
          rows: [
            {
              id: 'glossary-probable-cause',
              term: glossaryTerm,
              definition: glossaryDefinition,
              category: 'criminal_procedure',
              jurisdiction: 'California',
              confidence: 0.98,
            },
          ],
        };
      }

      return { rows: [] };
    });

    mockDbExecute.mockImplementation(async (query: unknown) => {
      const sqlText = getSqlText(query);

      if (sqlText.includes('from cases')) {
        return {
          rows: [
            {
              title: 'Case Chat Glossary Reuse',
              description: 'Seeded for saved glossary concept context reuse coverage.',
              jurisdiction: 'California',
              court: 'Superior Court',
              status: 'open',
              practice_area: 'criminal-defense',
            },
          ],
        };
      }

      if (sqlText.includes('from case_library_links')) {
        return {
          rows: [
            {
              citation_text: glossaryTerm,
              notes: `${glossaryDefinition}\nJurisdiction: California\nSource: legal_glossary\nConfidence: 0.97`,
            },
          ],
        };
      }

      return { rows: [] };
    });
  });

  it('folds saved glossary concepts into case context for later ACE turns', async () => {
    const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');

    const context = await assembleACEContext({
      query: 'Explain probable cause for this case.',
      caseId: '11111111-1111-1111-1111-111111111111',
      persona: 'neutral',
      enableWikipedia: false,
      enableWebSearch: false,
    });

    expect(context.caseContext).toBeTruthy();
    expect(context.caseContext).toContain('Saved concepts:');
    expect(context.caseContext).toContain(glossaryTerm);
    expect(context.caseContext).toContain(
      'Reasonable grounds to believe that a crime has been committed'
    );
    expect(mockDbExecute).toHaveBeenCalled();
  });

  it('includes saved concepts and glossary matches in the built ACE prompt', async () => {
    const { assembleACEContext, buildACEPrompt } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    const context = await assembleACEContext({
      query: 'Explain probable cause for this case.',
      caseId: '11111111-1111-1111-1111-111111111111',
      persona: 'neutral',
      enableWikipedia: false,
      enableWebSearch: false,
    });

    const prompt = buildACEPrompt(context, 'Explain probable cause for this case.');

    expect(prompt.systemPrompt).toContain('## Active Case Context');
    expect(prompt.systemPrompt).toContain('Saved concepts:');
    expect(prompt.systemPrompt).toContain(glossaryTerm);
    expect(prompt.systemPrompt).toContain(glossaryDefinition);
    expect(prompt.confidenceFactors.caseContext).toBe(0.95);
  });
});