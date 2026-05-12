import { spawn } from 'child_process';
import path from 'path';
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
export async function transcribeAudio(audioPath: string, jobId: string): Promise<TranscriptionResult> {
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

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse whisper output: ${err}\nRaw: ${stdout}`));
        }
      } else {
        reject(new Error(`Whisper shim failed with code ${code}: ${stderr}`));
      }
    });
  });
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
