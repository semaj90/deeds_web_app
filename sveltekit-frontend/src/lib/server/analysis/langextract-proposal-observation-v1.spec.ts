import { describe, expect, it, vi } from 'vitest';
import type { LangExtractAnalyzeResponse } from '../atlas/ai/langextract-transport.js';
import { runLangExtractProposalObservationV1 } from './langextract-proposal-observation-v1.js';

const response: LangExtractAnalyzeResponse = {
  document_id: 'proposal-fixture',
  source_type: 'general',
  extraction_mode: 'full',
  entities: [{ text: 'PostgreSQL', label: 'TECHNOLOGY' }],
  relationships: [],
  concepts: ['database'],
  chunks: [],
  features: [],
  metadata: {},
  processing_time_ms: 3,
};

describe('runLangExtractProposalObservationV1', () => {
  it('does not call the sidecar when disabled', async () => {
    const request = vi.fn();

    const result = await runLangExtractProposalObservationV1({ text: 'bounded input', enabled: false }, request as never);

    expect(result.status).toBe('DISABLED');
    expect(result.factCount).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('passes bounded text to the validated 8095 transport and reports its observations', async () => {
    const request = vi.fn(async () => response);

    const result = await runLangExtractProposalObservationV1({ text: 'an evidence sample', enabled: true }, request);

    expect(request).toHaveBeenCalledWith(
      { text: 'an evidence sample', source_type: 'general', extraction_mode: 'full', max_chars: 10_000 },
      { timeoutMs: 30_000 },
    );
    expect(result).toMatchObject({ status: 'OBSERVED', factCount: 2, facts: { entities: response.entities, concepts: ['database'] } });
  });

  it('reports an unavailable sidecar instead of substituting lexical facts', async () => {
    const request = vi.fn(async () => { throw new Error('connection refused'); });

    const result = await runLangExtractProposalObservationV1({ text: 'an evidence sample', enabled: true }, request);

    expect(result).toMatchObject({
      ok: false,
      status: 'UNAVAILABLE',
      factCount: 0,
      errorCode: 'LANGEXTRACT_REQUEST_FAILED',
    });
  });

  it('rejects empty and oversized requests before contacting the sidecar', async () => {
    const request = vi.fn();

    expect((await runLangExtractProposalObservationV1({ text: '', enabled: true }, request as never)).status).toBe('INVALID_INPUT');
    expect((await runLangExtractProposalObservationV1({ text: 'x'.repeat(10_001), enabled: true }, request as never)).status).toBe('INVALID_INPUT');
    expect(request).not.toHaveBeenCalled();
  });
});
