import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ImovieEvidenceTimeline from './ImovieEvidenceTimeline.svelte';

describe('ImovieEvidenceTimeline — Fast iMovie / Descript-Style Scrubber', () => {
  const sampleThumbnails = [
    { timestampMs: 0, dataUrl: 'data:image/jpeg;base64,111', motionDelta: 0.1 },
    { timestampMs: 5000, dataUrl: 'data:image/jpeg;base64,222', motionDelta: 0.8 },
    { timestampMs: 10000, dataUrl: 'data:image/jpeg;base64,333', motionDelta: 0.05 },
  ];

  const sampleCues = [
    { startMs: 0, endMs: 4000, text: 'Subject enters north door', speaker: 'Cam-1' },
    { startMs: 4500, endMs: 8000, text: 'Keycard access verified', speaker: 'Log-4' },
    { startMs: 8500, endMs: 12000, text: 'Vault open event', speaker: 'Alarm' },
  ];

  it('renders timecode, FilmCraft ticks, and multi-track rows (V1, A1)', () => {
    render(ImovieEvidenceTimeline, {
      props: {
        durationMs: 15_000,
        currentPlaybackTimeMs: 5000,
        thumbnails: sampleThumbnails,
        transcriptCues: sampleCues,
      },
    });

    expect(screen.getByText(/00:00:05:00/)).toBeInTheDocument();
    expect(screen.getByText(/FilmCraft ticks/i)).toBeInTheDocument();
    expect(screen.getByText('V1')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('Subject enters north door')).toBeInTheDocument();
    expect(screen.getByText('Keycard access verified')).toBeInTheDocument();
  });

  it('calls onSeek when transcript word chip is clicked', async () => {
    const onSeek = vi.fn();
    render(ImovieEvidenceTimeline, {
      props: {
        durationMs: 15_000,
        currentPlaybackTimeMs: 0,
        thumbnails: sampleThumbnails,
        transcriptCues: sampleCues,
        onSeek,
      },
    });

    const secondCue = screen.getByText('Keycard access verified');
    await fireEvent.click(secondCue);

    expect(onSeek).toHaveBeenCalledWith(4500);
  });
});
