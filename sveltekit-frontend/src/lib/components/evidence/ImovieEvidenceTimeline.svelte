<!--
  ImovieEvidenceTimeline.svelte
  Fast, iMovie-style multi-track timeline & frame-analysis scrubber in SvelteKit 2.
  Features:
  - 4-bit SNES-quantized LOD thumbnail filmstrip (V1).
  - Descript-style synchronized audio transcript word markers (A1).
  - Exact integer FilmCraft tick counter (254,016,000 ticks/ms).
  - Sliding-window 8x8 tile motion delta activity graph.
  - Zero-lag CTI playhead scrubbing with keyboard shortcuts (J-K-L, Space, Left/Right).
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { FILMCRAFT_TICKS_PER_MILLISECOND_V1 } from '$lib/client/atlas-video-wasm-v1.js';

  interface TranscriptCue {
    startMs: number;
    endMs: number;
    text: string;
    speaker?: string;
  }

  interface FilmstripThumbnail {
    timestampMs: number;
    dataUrl?: string;
    motionDelta?: number; // 0.0 to 1.0 (from 8x8 sliding window bitset)
  }

  interface Props {
    durationMs?: number;
    currentPlaybackTimeMs?: number;
    thumbnails?: FilmstripThumbnail[];
    transcriptCues?: TranscriptCue[];
    onSeek?: (timestampMs: number) => void;
    onTogglePlay?: () => void;
    isPlaying?: boolean;
  }

  let {
    durationMs = 60_000,
    currentPlaybackTimeMs = 0,
    thumbnails = [],
    transcriptCues = [],
    onSeek,
    onTogglePlay,
    isPlaying = false
  }: Props = $props();

  let timelineContainerRef = $state<HTMLElement | null>(null);
  let isScrubbing = $state(false);

  // Exact integer FilmCraft ticks
  const currentTicks = $derived(
    BigInt(Math.max(0, Math.round(currentPlaybackTimeMs))) * FILMCRAFT_TICKS_PER_MILLISECOND_V1
  );

  // Playhead percentage (0% to 100%)
  const playheadPercent = $derived(
    durationMs > 0 ? Math.min(100, Math.max(0, (currentPlaybackTimeMs / durationMs) * 100)) : 0
  );

  // Format timecode HH:MM:SS:FF
  function formatTimecode(ms: number): string {
    const totalSeconds = Math.max(0, ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const frames = Math.floor((totalSeconds % 1) * 30);
    return `00:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }

  function handleScrub(e: MouseEvent) {
    if (!timelineContainerRef) return;
    const rect = timelineContainerRef.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = Math.round(ratio * durationMs);
    onSeek?.(targetMs);
  }

  function handleMouseDown(e: MouseEvent) {
    isScrubbing = true;
    handleScrub(e);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isScrubbing) return;
    handleScrub(e);
  }

  function handleMouseUp() {
    isScrubbing = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      onTogglePlay?.();
    } else if (e.key === 'ArrowLeft' || e.key === 'j') {
      e.preventDefault();
      onSeek?.(Math.max(0, currentPlaybackTimeMs - 1000));
    } else if (e.key === 'ArrowRight' || e.key === 'l') {
      e.preventDefault();
      onSeek?.(Math.min(durationMs, currentPlaybackTimeMs + 1000));
    }
  }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} onkeydown={handleKeydown} />

<div
  class="imovie-timeline-container"
  role="region"
  aria-label="Multi-track forensic video timeline scrubber"
>
  <!-- Control Header -->
  <header class="timeline-header">
    <div class="th-left">
      <button type="button" class="ctrl-btn play-btn" onclick={onTogglePlay} title="Play/Pause (Space)">
        <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
      </button>
      <div class="timecode-display font-mono">
        <span class="tc-val">{formatTimecode(currentPlaybackTimeMs)}</span>
        <span class="tc-ticks">· {currentTicks.toString()} FilmCraft ticks</span>
      </div>
    </div>
    <div class="th-right">
      <span class="badge hardware-badge">WebCodecs // Zero-Copy GPU</span>
      <span class="badge snes-badge">SNES 4-Bit Tile Delta</span>
    </div>
  </header>

  <!-- Multi-Track Canvas & Scrubber Surface -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="timeline-track-surface"
    bind:this={timelineContainerRef}
    onmousedown={handleMouseDown}
  >
    <!-- CTI Playhead Marker -->
    <div class="cti-playhead" style="left: {playheadPercent}%;">
      <div class="cti-head"></div>
      <div class="cti-line"></div>
    </div>

    <!-- TRACK V1: 4-Bit SNES Filmstrip -->
    <div class="track-row video-track" aria-label="Video Track V1 (4-Bit Filmstrip)">
      <div class="track-label">V1</div>
      <div class="track-clips-container">
        {#if thumbnails.length > 0}
          <div class="filmstrip-row">
            {#each thumbnails as thumb, idx (thumb.timestampMs || idx)}
              <div
                class="thumb-tile"
                class:active={Math.abs(thumb.timestampMs - currentPlaybackTimeMs) < 1000}
                style="background-image: url({thumb.dataUrl});"
              >
                {#if thumb.motionDelta !== undefined}
                  <div
                    class="motion-indicator"
                    style="height: {Math.round(thumb.motionDelta * 100)}%;"
                    title="8x8 Motion Delta: {(thumb.motionDelta * 100).toFixed(0)}%"
                  ></div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="clip-placeholder video-clip">
            <span>Video Track (Generating 4-bit SNES LOD Filmstrip...)</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- TRACK A1: Descript-Style Audio Transcript Track -->
    <div class="track-row audio-track" aria-label="Audio Track A1 (Synchronized Transcript)">
      <div class="track-label">A1</div>
      <div class="track-clips-container">
        {#if transcriptCues.length > 0}
          <div class="transcript-words-track">
            {#each transcriptCues as cue, i (i)}
              {@const cueStartPct = (cue.startMs / durationMs) * 100}
              {@const cueWidthPct = Math.max(1.5, ((cue.endMs - cue.startMs) / durationMs) * 100)}
              {@const isActive = currentPlaybackTimeMs >= cue.startMs && currentPlaybackTimeMs <= cue.endMs}
              <button
                type="button"
                class="transcript-word-chip"
                class:active={isActive}
                style="left: {cueStartPct}%; width: {cueWidthPct}%;"
                onclick={(e) => { e.stopPropagation(); onSeek?.(cue.startMs); }}
                title="{cue.speaker ? `[${cue.speaker}] ` : ''}{cue.text}"
              >
                <span class="chip-text">{cue.text}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="clip-placeholder audio-clip">
            <span>Audio Waveform & Synchronized Transcript Track</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .imovie-timeline-container {
    display: flex;
    flex-direction: column;
    background: #14171d;
    border: 1px solid #2a2f3d;
    border-radius: 8px;
    padding: 10px;
    color: #e2e8f0;
    user-select: none;
    outline: none;
  }
  .imovie-timeline-container:focus {
    border-color: #e5c158;
  }
  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid #222630;
    margin-bottom: 8px;
  }
  .th-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ctrl-btn {
    background: #252a36;
    border: 1px solid #3c4458;
    color: #e5c158;
    border-radius: 6px;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ctrl-btn:hover {
    background: #32394a;
  }
  .timecode-display {
    font-size: 13px;
    color: #f8fafc;
  }
  .tc-ticks {
    font-size: 11px;
    color: #7a8294;
    margin-left: 6px;
  }
  .badge {
    font-size: 10px;
    font-family: monospace;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 6px;
  }
  .hardware-badge {
    background: #0f2e22;
    color: #10b981;
    border: 1px solid #10b981/40;
  }
  .snes-badge {
    background: #2e260f;
    color: #e5c158;
    border: 1px solid #e5c158/40;
  }
  .timeline-track-surface {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #0c0e12;
    border-radius: 6px;
    padding: 6px;
    min-height: 120px;
    cursor: pointer;
    overflow: hidden;
  }
  .cti-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #e5c158;
    z-index: 20;
    pointer-events: none;
    transform: translateX(-50%);
  }
  .cti-head {
    position: absolute;
    top: 0;
    left: -5px;
    width: 12px;
    height: 10px;
    background: #e5c158;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
  }
  .cti-line {
    width: 100%;
    height: 100%;
  }
  .track-row {
    position: relative;
    display: flex;
    align-items: center;
    height: 48px;
    background: #171b22;
    border: 1px solid #282f3d;
    border-radius: 4px;
    overflow: hidden;
  }
  .track-label {
    width: 32px;
    text-align: center;
    font-size: 11px;
    font-family: monospace;
    font-weight: bold;
    color: #64748b;
    border-right: 1px solid #282f3d;
    background: #13161c;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .track-clips-container {
    position: relative;
    flex: 1;
    height: 100%;
    overflow: hidden;
  }
  .filmstrip-row {
    display: flex;
    height: 100%;
    width: 100%;
  }
  .thumb-tile {
    position: relative;
    flex: 1;
    height: 100%;
    background-size: cover;
    background-position: center;
    border-right: 1px solid #000;
  }
  .thumb-tile.active {
    outline: 2px solid #e5c158;
    outline-offset: -2px;
  }
  .motion-indicator {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(239, 68, 68, 0.45);
    pointer-events: none;
  }
  .transcript-words-track {
    position: relative;
    height: 100%;
    width: 100%;
  }
  .transcript-word-chip {
    position: absolute;
    top: 4px;
    bottom: 4px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #cbd5e1;
    font-size: 11px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding: 0 4px;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
  }
  .transcript-word-chip:hover {
    background: #334155;
  }
  .transcript-word-chip.active {
    background: #0369a1;
    border-color: #38bdf8;
    color: #fff;
  }
  .clip-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 11px;
    color: #64748b;
  }
</style>
