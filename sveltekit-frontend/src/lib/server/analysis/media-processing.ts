import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { ENV } from '$lib/server/env.server.js';

export interface MediaDownloadResult {
  audioPath: string;
  metadata: any;
}

export interface TranscriptionResult {
  text: string;
  chunks: Array<{ start: number; end: number; text: string }>;
  language: string;
}

/**
 * Downloads media from URL using yt-dlp.
 * Returns the path to the downloaded audio file (extracted).
 */
export async function downloadMedia(url: string, jobId: string): Promise<MediaDownloadResult> {
  const outputDir = path.resolve('temp/media', jobId);
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'audio.%(ext)s');
  const ytdlpPath = path.resolve('../.venv/Scripts/yt-dlp.exe');
  const ffmpegPath = ENV.FFMPEG_PATH || 'ffmpeg';

  return new Promise((resolve, reject) => {
    console.log(`[MediaProcessing] Starting download: ${url}`);
    
    const args = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--ffmpeg-location', ffmpegPath,
      '-o', outputPath,
      '--print-json',
      url
    ];

    const child = spawn(ytdlpPath, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', async (code) => {
      if (code === 0) {
        try {
          const metadata = JSON.parse(stdout.split('\n')[0]);
          const files = await fs.readdir(outputDir);
          const audioFile = files.find(f => f.startsWith('audio.'));
          if (!audioFile) throw new Error('Audio file not found after download');
          
          resolve({
            audioPath: path.join(outputDir, audioFile),
            metadata
          });
        } catch (err) {
          reject(new Error(`Failed to parse yt-dlp output: ${err}`));
        }
      } else {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Transcribes audio file using faster-whisper.
 */
/**
 * Persistent faster-whisper worker (scripts/atlas/faster-whisper-asr-worker-v1.py).
 * Set ASR_WORKER_URL=off to force the legacy per-file shim.
 */
const ASR_WORKER_URL = (process.env.ASR_WORKER_URL?.trim() || 'http://127.0.0.1:8093');
const ASR_WORKER_TIMEOUT_MS = Number(process.env.ASR_WORKER_TIMEOUT_MS) || 900_000;

class AsrWorkerError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'AsrWorkerError';
  }
}

async function transcribeViaWorker(absoluteAudioPath: string): Promise<TranscriptionResult> {
  let res: Response;
  try {
    res = await fetch(`${ASR_WORKER_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: absoluteAudioPath, word_timestamps: false, beam_size: 1 }),
      signal: AbortSignal.timeout(ASR_WORKER_TIMEOUT_MS)
    });
  } catch (err) {
    // Network failure or timeout: worker not reachable, so the shim may run.
    throw new AsrWorkerError(`ASR worker unreachable: ${(err as Error).message}`, true);
  }
  if (!res.ok) {
    // 5xx and 503 (model not loaded) can fall back; 403/413/422 are real rejections.
    throw new AsrWorkerError(
      `ASR worker HTTP ${res.status}: ${await res.text()}`,
      res.status >= 500
    );
  }
  const body = (await res.json()) as {
    language: string;
    segments: Array<{ start: number; end: number; text: string }>;
  };
  const chunks = body.segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
  return { text: chunks.map((c) => c.text).join(' '), chunks, language: body.language };
}

export async function transcribeAudio(audioPath: string, jobId: string): Promise<TranscriptionResult> {
  if (ASR_WORKER_URL.toLowerCase() !== 'off') {
    try {
      console.log(`[MediaProcessing] Transcribing via ASR worker: ${audioPath}`);
      return await transcribeViaWorker(path.resolve(audioPath));
    } catch (err) {
      if (err instanceof AsrWorkerError && !err.retryable) {
        throw new Error(`TRANSCRIPTION_REJECTED: ${err.message}`);
      }
      console.warn(`[MediaProcessing] ${(err as Error).message}; falling back to shim`);
    }
  }

  const whisperPath = ENV.WHISPER_PATH || 'whisper';
  const model = ENV.WHISPER_MODEL || 'base';
  const device = ENV.WHISPER_DEVICE || 'cpu';

  // We'll use a small python shim to use faster-whisper if available, 
  // otherwise fallback to the standard whisper CLI.
  
  const pythonPath = path.resolve('../.venv/Scripts/python.exe');
  const shimPath = path.resolve('scripts/media/transcribe_shim.py');

  // Ensure shim exists
  await ensureTranscriptionShim(shimPath);

  return new Promise((resolve, reject) => {
    console.log(`[MediaProcessing] Starting transcription: ${audioPath}`);
    
    const child = spawn(pythonPath, [shimPath, audioPath, model, device]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('data', (data) => { stdout += data; });
    child.on('error', (err: any) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`TRANSCRIPTION_BINARY_UNAVAILABLE: Python executable not found at ${pythonPath}`));
      } else {
        reject(new Error(`TRANSCRIPTION_BINARY_UNAVAILABLE: ${err.message}`));
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse whisper output: ${err}\nRaw: ${stdout}`));
        }
      } else {
        if (stderr.includes('No module named') || stderr.includes('faster_whisper') || stderr.includes('not recognized')) {
          reject(new Error(`TRANSCRIPTION_BINARY_UNAVAILABLE: faster-whisper not installed in environment (${stderr.trim()})`));
        } else {
          reject(new Error(`Whisper shim failed with code ${code}: ${stderr}`));
        }
      }
    });
  });
}

/**
 * Extracts the audio track of a video buffer to a 16 kHz mono WAV buffer using
 * ffmpeg (FFMPEG_PATH). Rejects when ffmpeg is unavailable, the input has no
 * audio stream, or decoding fails. Uses a private temp directory that is always
 * removed; never touches repository files.
 */
export async function extractAudioTrackToWav(input: Buffer, sourceName: string): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'av-extract-'));
  const ext = path.extname(sourceName).toLowerCase() || '.mp4';
  const inPath = path.join(dir, `source${ext}`);
  const outPath = path.join(dir, 'audio.wav');
  try {
    await fs.writeFile(inPath, input);
    const ffmpegBin = ENV.FFMPEG_PATH || 'ffmpeg';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegBin, [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', inPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', outPath
      ]);
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => reject(new Error(`FFMPEG_UNAVAILABLE: ${err.message}`)));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(0, 400)}`));
      });
    });
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureTranscriptionShim(shimPath: string) {
  const content = `
import sys
import json
import os
from faster_whisper import WhisperModel

def transcribe(audio_path, model_size, device):
    model = WhisperModel(model_size, device=device, compute_type="int8")
    segments, info = model.transcribe(audio_path, beam_size=5)
    
    results = []
    full_text = []
    for segment in segments:
        results.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip()
        })
        full_text.append(segment.text.strip())
        
    return {
        "text": " ".join(full_text),
        "chunks": results,
        "language": info.language
    }

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Missing arguments"}))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_size = sys.argv[2]
    device = sys.argv[3]
    
    try:
        result = transcribe(audio_path, model_size, device)
        print(json.dumps(result))
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
`;
  await fs.mkdir(path.dirname(shimPath), { recursive: true });
  await fs.writeFile(shimPath, content.trim());
}
