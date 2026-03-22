import { createActor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evidenceProcessingMachine,
  getCurrentStep,
  getProcessingProgress,
  getStepProgress,
} from '../src/lib/machines/evidence-processing-machine';

function buildTestFile() {
  return new File(['contract text'], 'contract.pdf', { type: 'application/pdf' });
}

describe('Legal evidence processing workflow integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          glyph_url: '/glyphs/generated.png',
          enhanced_artifact_url: '/artifacts/evidence-123.png',
          neural_sprite_results: {
            compression_ratio: 2.75,
            mode: 'lossless',
          },
        },
      }),
    } as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('completes the upload-to-artifact workflow and records portable metadata', async () => {
    const actor = createActor(evidenceProcessingMachine).start();

    actor.send({
      type: 'UPLOAD_FILE',
      file: buildTestFile(),
      evidenceId: '123',
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(actor.getSnapshot().value).toBe('analyzing');

    await vi.advanceTimersByTimeAsync(2500);
    expect(actor.getSnapshot().value).toBe('storingInMinIO');

    const midContext = actor.getSnapshot().context;
    expect(midContext.portableArtifact).toEqual(
      expect.objectContaining({
        enhancedPngUrl: '/artifacts/evidence-123.png',
        compressionRatio: 2.75,
      })
    );
    expect(midContext.portableArtifact?.metadata).toEqual(
      expect.objectContaining({
        evidence_id: '123',
        version: '2.0',
      })
    );
    expect(getStepProgress(midContext, 'png_embedding')).toBe(100);

    await vi.advanceTimersByTimeAsync(800);
    const snapshot = actor.getSnapshot();

    expect(snapshot.value).toBe('completed');
    expect(snapshot.context.minioStorage).toEqual(
      expect.objectContaining({
        indexed: true,
        storageUrl: '/artifacts/123',
      })
    );
    expect(getProcessingProgress(snapshot.context)).toBe(100);
    expect(getCurrentStep(snapshot.context)).toBe('idle');

    actor.stop();
  });

  it('accepts neural sprite configuration during analysis and updates progress helpers', async () => {
    const actor = createActor(evidenceProcessingMachine).start();

    actor.send({
      type: 'UPLOAD_FILE',
      file: buildTestFile(),
      evidenceId: '456',
    });

    await vi.advanceTimersByTimeAsync(1000);
    actor.send({
      type: 'CONFIGURE_NEURAL_SPRITE',
      config: {
        enable_compression: true,
        profile: 'legal-lossless',
      },
    });
    actor.send({
      type: 'ANALYSIS_PROGRESS',
      progress: 42,
      message: 'Finding entities and risk markers',
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('analyzing');
    expect(snapshot.context.glyphGeneration).toEqual(
      expect.objectContaining({
        neuralSpriteEnabled: true,
        request: expect.objectContaining({
          evidence_id: 456,
          style: 'legal',
        }),
      })
    );
    expect(getCurrentStep(snapshot.context)).toBe('analysis');
    expect(getStepProgress(snapshot.context, 'analysis')).toBe(42);

    actor.stop();
  });

  it('surfaces glyph-generation failures and can retry back into analysis', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: 'Glyph backend unavailable' }),
    } as Response);

    const actor = createActor(evidenceProcessingMachine).start();

    actor.send({
      type: 'UPLOAD_FILE',
      file: buildTestFile(),
      evidenceId: '789',
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2500);
    +(+(await Promise.resolve()));

    let snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('error');
    expect(snapshot.context.errors.at(-1)).toContain('Glyph generation failed');

    actor.send({ type: 'RETRY_CURRENT_STEP' });
    snapshot = actor.getSnapshot();

    expect(snapshot.value).toBe('analyzing');
    expect(snapshot.context.errors).toEqual([]);

    actor.stop();
  });
});
