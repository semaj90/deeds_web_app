import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { ENV } from '$lib/server/env.server.js';
import { transcribeAudio } from '$lib/server/analysis/media-processing.js';
import type { VideoTranscriptChunk } from './video-ingest-types.js';

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

export type DownloadedVideoSource = {
  filePath: string;
  fileName: string;
  cleanupDir: string;
  sourceMetadata: Record<string, unknown>;
};

function spawnPromise(command: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(command, args, { shell: false, cwd });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => reject(error));
    proc.on('close', (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

function resolveYtDlpPath(): string {
  const windowsSidecar = join(process.cwd(), '..', '.venv', 'Scripts', 'yt-dlp.exe');
  return existsSync(windowsSidecar) ? windowsSidecar : 'yt-dlp';
}

export async function downloadApprovedVideoSource(sourceUrl: string): Promise<DownloadedVideoSource> {
  const cleanupDir = join(tmpdir(), `deeds-video-${randomUUID()}`);

  await mkdir(cleanupDir, { recursive: true });
  const outputTemplate = join(cleanupDir, 'source.%(ext)s');
  const ytdlpPath = resolveYtDlpPath();

  const command = await spawnPromise(ytdlpPath, ['--no-playlist', '--no-warnings', '-o', outputTemplate, '--print-json', sourceUrl]);
  if (command.code !== 0) {
    await rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`yt-dlp failed: ${command.stderr.slice(0, 500)}`);
  }

  const files = await readdir(cleanupDir);
  const sourceFile = files.find((file) => file.startsWith('source.'));
  if (!sourceFile) {
    await rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
    throw new Error('yt-dlp download completed without producing a file');
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(command.stdout.split('\n')[0] ?? '{}') as Record<string, unknown>;
  } catch {
    metadata = { sourceUrl };
  }

  return {
    filePath: join(cleanupDir, sourceFile),
    fileName: sourceFile,
    cleanupDir,
    sourceMetadata: metadata,
  };
}

export async function extractAudioTrack(videoPath: string, workDir?: string): Promise<string> {
  const ffmpegPath = ENV.FFMPEG_PATH || 'ffmpeg';
  const outputPath = join(workDir ?? dirname(videoPath), `${randomUUID()}.wav`);

  const result = await spawnPromise(ffmpegPath, ['-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', outputPath]);
  if (result.code !== 0) {
    throw new Error(`ffmpeg audio extraction failed: ${result.stderr.slice(0, 500)}`);
  }

  return outputPath;
}

export async function transcribeVideoAudio(audioPath: string, jobId: string): Promise<{
  text: string;
  language: string;
  chunks: VideoTranscriptChunk[];
}> {
  const result = await transcribeAudio(audioPath, jobId);
  const segments = (result.chunks ?? []) as WhisperSegment[];
  return {
    text: result.text,
    language: result.language,
    chunks: segments.map((chunk) => ({
      startMs: Math.round(chunk.start * 1000),
      endMs: Math.round(chunk.end * 1000),
      text: chunk.text,
      confidence: 0.85,
      model: ENV.WHISPER_MODEL || 'whisper',
      language: result.language,
    })),
  };
}
