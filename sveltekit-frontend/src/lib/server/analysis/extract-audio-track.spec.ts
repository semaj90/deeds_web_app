// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { ENV } from '$lib/server/env.server.js';

// Real ffmpeg, same binary the helper uses (ENV.FFMPEG_PATH). Fixtures go to a private temp dir.
const ffmpegBin = ENV.FFMPEG_PATH || 'ffmpeg';

function makeFixture(args: string[]): Buffer {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'extract-fixture-'));
  const out = path.join(dir, 'fixture');
  try {
    execFileSync(ffmpegBin, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('extractAudioTrackToWav', () => {
  it('returns a 16 kHz mono WAV from a video with an audio track', async () => {
    const mp4 = makeFixture([
      '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest', '-f', 'mp4',
    ]);
    const { extractAudioTrackToWav } = await import('./media-processing.js');
    const wav = await extractAudioTrackToWav(mp4, 'clip.mp4');
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    // fmt chunk: channels (offset 22, uint16) = 1, sample rate (offset 24, uint32) = 16000
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
  }, 60_000);

  it('rejects a video with no audio stream instead of returning empty audio', async () => {
    const mp4 = makeFixture([
      '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=1',
      '-c:v', 'mpeg4', '-f', 'mp4',
    ]);
    const { extractAudioTrackToWav } = await import('./media-processing.js');
    await expect(extractAudioTrackToWav(mp4, 'silent.mp4')).rejects.toThrow(/ffmpeg exited|FFMPEG_UNAVAILABLE/);
  }, 60_000);

  it('rejects non-media input', async () => {
    const { extractAudioTrackToWav } = await import('./media-processing.js');
    await expect(extractAudioTrackToWav(Buffer.from('not media at all'), 'junk.mp4')).rejects.toThrow();
  }, 60_000);
});
