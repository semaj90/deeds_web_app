import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CourtroomAudioPlayer,
  type AudioElementMockOrReal,
} from './courtroom-audio-player-v1.js';
import {
  COURTROOM_MUSIC_MANIFEST_V1,
  getMusicTrackById,
} from './courtroom-music-manifest-v1.js';

describe('Courtroom Audio Player (CSP-70, CSP-71)', () => {
  let mockAudio: AudioElementMockOrReal;

  beforeEach(() => {
    mockAudio = {
      src: '',
      loop: false,
      volume: 1.0,
      muted: false,
      paused: true,
      currentTime: 0,
      play: vi.fn().mockImplementation(async () => {
        mockAudio.paused = false;
      }),
      pause: vi.fn().mockImplementation(() => {
        mockAudio.paused = true;
      }),
    };
  });

  it('verifies manifest tracks have valid paths, licenses, and loop flags (CSP-70)', () => {
    const playableTracks = COURTROOM_MUSIC_MANIFEST_V1.tracks.filter((t) => t.id !== 'silence');
    expect(playableTracks.length).toBe(5);

    for (const track of playableTracks) {
      expect(track.file).toMatch(/^\/audio\/[a-z0-9_-]+\.mp3$/);
      expect(track.licence).toBe('CC0-1.0');
      expect(typeof track.loop).toBe('boolean');
    }
  });

  it('strictly requires user gesture before playing audio (CSP-71)', async () => {
    const player = new CourtroomAudioPlayer({ audioElement: mockAudio });

    expect(player.userGestureUnlocked).toBe(false);

    // Engine emits music cue before user interacts
    await player.syncWithEngineMusic('trial-opening');

    // Must NOT have started playback
    expect(mockAudio.play).not.toHaveBeenCalled();
    expect(player.pendingTrackId).toBe('trial-opening');
    expect(player.isPlaying).toBe(false);

    // User gesture occurs
    const unlocked = await player.unlockAudio();
    expect(unlocked).toBe(true);
    expect(player.userGestureUnlocked).toBe(true);

    // Pending track should now play automatically
    expect(mockAudio.play).toHaveBeenCalledTimes(1);
    expect(mockAudio.src).toBe('/audio/trial-opening.mp3');
    expect(mockAudio.loop).toBe(true);
    expect(player.isPlaying).toBe(true);
    expect(player.currentTrack?.id).toBe('trial-opening');
  });

  it('volume and mute controls function correctly (CSP-71)', async () => {
    const player = new CourtroomAudioPlayer({ audioElement: mockAudio, initialVolume: 0.5 });
    await player.unlockAudio();

    expect(player.volume).toBe(0.5);
    expect(mockAudio.volume).toBe(0.5);

    // Volume clamping
    player.setVolume(1.5);
    expect(player.volume).toBe(1.0);
    expect(mockAudio.volume).toBe(1.0);

    player.setVolume(-0.2);
    expect(player.volume).toBe(0.0);
    expect(mockAudio.volume).toBe(0.0);

    // Mute toggling
    expect(player.muted).toBe(false);
    player.toggleMute();
    expect(player.muted).toBe(true);
    expect(mockAudio.muted).toBe(true);

    player.toggleMute();
    expect(player.muted).toBe(false);
    expect(mockAudio.muted).toBe(false);
  });

  it('silence and null cues stop playback (CSP-71)', async () => {
    const player = new CourtroomAudioPlayer({ audioElement: mockAudio });
    await player.unlockAudio();

    await player.syncWithEngineMusic('cross-examination');
    expect(mockAudio.src).toBe('/audio/cross-examination.mp3');
    expect(player.isPlaying).toBe(true);

    // Engine cue reaches silence
    await player.syncWithEngineMusic('silence');
    expect(mockAudio.pause).toHaveBeenCalled();
    expect(mockAudio.currentTime).toBe(0);
    expect(player.currentTrack).toBeNull();
    expect(player.isPlaying).toBe(false);

    // Next track plays
    await player.syncWithEngineMusic('cornered-presto');
    expect(mockAudio.src).toBe('/audio/cornered-presto.mp3');
    expect(player.currentTrack?.id).toBe('cornered-presto');

    // Engine reset to null
    await player.syncWithEngineMusic(null);
    expect(mockAudio.pause).toHaveBeenCalled();
    expect(player.currentTrack).toBeNull();
  });

  it('dispose cleanly stops and resets on simulation exit (CSP-71)', async () => {
    const player = new CourtroomAudioPlayer({ audioElement: mockAudio });
    await player.unlockAudio();
    await player.syncWithEngineMusic('testimony-moderato');

    expect(player.isPlaying).toBe(true);

    player.dispose();
    expect(mockAudio.pause).toHaveBeenCalled();
    expect(mockAudio.currentTime).toBe(0);
    expect(player.currentTrack).toBeNull();
    expect(player.userGestureUnlocked).toBe(false);
  });
});
