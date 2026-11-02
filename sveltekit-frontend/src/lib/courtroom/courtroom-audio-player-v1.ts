import {
  COURTROOM_MUSIC_MANIFEST_V1,
  isValidMusicTrackId,
  getMusicTrackById,
  type CourtroomMusicTrackId,
  type CourtroomMusicTrack,
} from './courtroom-music-manifest-v1.js';

export interface AudioElementMockOrReal {
  src: string;
  loop: boolean;
  volume: number;
  muted: boolean;
  paused: boolean;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
}

export interface CourtroomAudioPlayerOptions {
  audioElement?: AudioElementMockOrReal;
  initialVolume?: number;
  onTrackChange?: (track: CourtroomMusicTrack | null) => void;
  onPlaybackError?: (error: Error) => void;
}

export class CourtroomAudioPlayer {
  private audio: AudioElementMockOrReal | null = null;
  private _userGestureUnlocked = false;
  private _currentTrack: CourtroomMusicTrack | null = null;
  private _volume = 0.7;
  private _muted = false;
  private _pendingTrackId: CourtroomMusicTrackId | null = null;
  private onTrackChange?: (track: CourtroomMusicTrack | null) => void;
  private onPlaybackError?: (error: Error) => void;

  constructor(options: CourtroomAudioPlayerOptions = {}) {
    if (options.audioElement) {
      this.attachAudioElement(options.audioElement);
    }
    if (options.initialVolume !== undefined) {
      this.setVolume(options.initialVolume);
    }
    this.onTrackChange = options.onTrackChange;
    this.onPlaybackError = options.onPlaybackError;
  }

  public attachAudioElement(audio: AudioElementMockOrReal): void {
    this.audio = audio;
    this.audio.volume = this._volume;
    this.audio.muted = this._muted;
  }

  public get userGestureUnlocked(): boolean {
    return this._userGestureUnlocked;
  }

  public get currentTrack(): CourtroomMusicTrack | null {
    return this._currentTrack;
  }

  public get volume(): number {
    return this._volume;
  }

  public get muted(): boolean {
    return this._muted;
  }

  public get pendingTrackId(): CourtroomMusicTrackId | null {
    return this._pendingTrackId;
  }

  public get isPlaying(): boolean {
    return Boolean(this.audio && !this.audio.paused && this._currentTrack && this._currentTrack.id !== 'silence');
  }

  /**
   * Called by a trusted user gesture (e.g. click "Start Simulation", click "Enable Sound").
   * Unlocks playback and immediately fires any pending music cue that was queued while locked.
   */
  public async unlockAudio(): Promise<boolean> {
    this._userGestureUnlocked = true;

    if (this._pendingTrackId) {
      const trackId = this._pendingTrackId;
      this._pendingTrackId = null;
      return await this.playTrack(trackId);
    }
    return true;
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this._volume = clamped;
    if (this.audio) {
      this.audio.volume = clamped;
    }
  }

  public toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.audio) {
      this.audio.muted = this._muted;
    }
    return this._muted;
  }

  public setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.audio) {
      this.audio.muted = muted;
    }
  }

  /**
   * Synchronizes active playback with the courtroom engine State.music field.
   * If audio is not yet unlocked by a user gesture, queues the track to play as soon as unlocked.
   */
  public async syncWithEngineMusic(trackId: string | null): Promise<void> {
    if (!trackId || trackId === 'silence') {
      this.stop();
      this._pendingTrackId = null;
      return;
    }

    if (!isValidMusicTrackId(trackId)) {
      console.warn(`[CourtroomAudioPlayer] Invalid track id: ${trackId}`);
      return;
    }

    if (!this._userGestureUnlocked) {
      this._pendingTrackId = trackId;
      return;
    }

    await this.playTrack(trackId);
  }

  public async playTrack(trackId: CourtroomMusicTrackId): Promise<boolean> {
    if (trackId === 'silence') {
      this.stop();
      return true;
    }

    const track = getMusicTrackById(trackId);
    if (!track || !track.file) {
      this.stop();
      return false;
    }

    if (this._currentTrack?.id === track.id && this.isPlaying) {
      return true;
    }

    this._currentTrack = track;
    this.onTrackChange?.(track);

    if (!this.audio) {
      return false;
    }

    try {
      this.audio.src = track.file;
      this.audio.loop = track.loop;
      this.audio.volume = this._volume;
      this.audio.muted = this._muted;
      await this.audio.play();
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onPlaybackError?.(error);
      return false;
    }
  }

  public pause(): void {
    if (this.audio) {
      this.audio.pause();
    }
  }

  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this._currentTrack = null;
    this.onTrackChange?.(null);
  }

  /**
   * Cleanup on component unmount or simulation exit.
   */
  public dispose(): void {
    this.stop();
    this.audio = null;
    this._pendingTrackId = null;
    this._userGestureUnlocked = false;
  }
}
