import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isGroundedEntity } from './ast-langextract-bridge.js';
import type { ExtractedFeature } from './ast-langextract-bridge.js';

describe('LX0: isGroundedEntity', () => {
  it('accepts an entity with a valid, non-empty character span', () => {
    expect(isGroundedEntity({ start: 10, end: 20 })).toBe(true);
  });

  it('rejects an entity with no start/end at all (the LangExtract char_interval: None case)', () => {
    expect(isGroundedEntity({})).toBe(false);
  });

  it('rejects an entity with only one of start/end present', () => {
    expect(isGroundedEntity({ start: 10 })).toBe(false);
    expect(isGroundedEntity({ end: 20 })).toBe(false);
  });

  it('rejects a zero-width or inverted span', () => {
    expect(isGroundedEntity({ start: 10, end: 10 })).toBe(false);
    expect(isGroundedEntity({ start: 20, end: 10 })).toBe(false);
  });

  it('rejects non-finite offsets', () => {
    expect(isGroundedEntity({ start: NaN, end: 20 })).toBe(false);
    expect(isGroundedEntity({ start: 0, end: Infinity })).toBe(false);
  });
});

vi.mock('$lib/server/nlp/miniforge-nlp-sidecar.js', () => ({
  createMiniforgeNlpSidecarClient: () => null,
}));

vi.mock('./entity-extraction.js', () => ({
  extractEntities: vi.fn(),
}));

describe('LX0: extractAstAndEntities filters ungrounded entities end-to-end', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('drops an entity with no char span and keeps one that has it', async () => {
    const { extractEntities } = await import('./entity-extraction.js');
    vi.mocked(extractEntities).mockResolvedValue([
      { text: 'Acme Corp', label: 'ORG', score: 0.9, start: 5, end: 14 },
      { text: 'John Doe', label: 'PERSON', score: 0.9 }, // no start/end -> ungrounded
    ] as never);

    const { extractAstAndEntities } = await import('./ast-langextract-bridge.js');
    const features: ExtractedFeature[] = await extractAstAndEntities('Acme Corp hired John Doe.', false);

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({ name: 'Acme Corp', start: 5, end: 14 });
    expect(features.some((f) => f.name === 'John Doe')).toBe(false);
  });
});

describe('LX0: extractAstAndEntitiesWithDiagnostics reports explicit failure, not silent-empty-success', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reports entityExtractionStatus "ok" and no errors on a genuinely-empty, successful extraction', async () => {
    const { extractEntities } = await import('./entity-extraction.js');
    vi.mocked(extractEntities).mockResolvedValue([]);

    const { extractAstAndEntitiesWithDiagnostics } = await import('./ast-langextract-bridge.js');
    const { features, diagnostics } = await extractAstAndEntitiesWithDiagnostics('nothing to extract here', false);

    expect(features).toHaveLength(0);
    expect(diagnostics.entityExtractionStatus).toBe('ok');
    expect(diagnostics.errors).toHaveLength(0);
  });

  it('reports entityExtractionStatus "error" with a captured message when the path throws, distinguishing it from real-empty', async () => {
    const { extractEntities } = await import('./entity-extraction.js');
    vi.mocked(extractEntities).mockRejectedValue(new Error('sidecar connection reset'));

    const { extractAstAndEntitiesWithDiagnostics } = await import('./ast-langextract-bridge.js');
    const { features, diagnostics } = await extractAstAndEntitiesWithDiagnostics('some text', false);

    expect(features).toHaveLength(0);
    expect(diagnostics.entityExtractionStatus).toBe('error');
    expect(diagnostics.errors).toEqual([
      { path: 'entity-extraction', message: 'sidecar connection reset' },
    ]);
  });

  it('reports sidecarStatus "unavailable" (not "error") when the sidecar client factory returns null', async () => {
    const { extractEntities } = await import('./entity-extraction.js');
    vi.mocked(extractEntities).mockResolvedValue([]);

    const { extractAstAndEntitiesWithDiagnostics } = await import('./ast-langextract-bridge.js');
    const { diagnostics } = await extractAstAndEntitiesWithDiagnostics('some text', false);

    expect(diagnostics.sidecarStatus).toBe('unavailable');
  });

  it('reports astExtractionStatus "skipped" for non-code text (path never runs)', async () => {
    const { extractEntities } = await import('./entity-extraction.js');
    vi.mocked(extractEntities).mockResolvedValue([]);

    const { extractAstAndEntitiesWithDiagnostics } = await import('./ast-langextract-bridge.js');
    const { diagnostics } = await extractAstAndEntitiesWithDiagnostics('plain prose', false);

    expect(diagnostics.astExtractionStatus).toBe('skipped');
  });
});
