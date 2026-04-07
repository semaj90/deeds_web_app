import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { traceLLM } from '$lib/server/observability/langfuse.js';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_AUDIO_TYPES = new Set([
	'audio/wav', 'audio/wave', 'audio/x-wav',
	'audio/mp3', 'audio/mpeg',
	'audio/ogg', 'audio/webm',
	'audio/flac', 'audio/x-flac',
	'audio/mp4', 'audio/aac',
	'application/octet-stream', '' // allow unknown MIME
]);
const ALLOWED_AUDIO_EXTENSIONS = new Set([
	'.wav', '.mp3', '.ogg', '.webm', '.flac', '.m4a', '.aac', '.opus'
]);

// Valid ISO 639-1 language codes accepted by whisper.cpp
const VALID_LANGUAGES = new Set([
	'auto', 'en', 'zh', 'de', 'es', 'ru', 'ko', 'fr', 'ja', 'pt', 'tr', 'pl',
	'ca', 'nl', 'ar', 'sv', 'it', 'id', 'hi', 'fi', 'vi', 'he', 'uk', 'el',
	'ms', 'cs', 'ro', 'da', 'hu', 'ta', 'no', 'th', 'ur', 'hr', 'bg', 'lt',
	'la', 'mi', 'ml', 'cy', 'sk', 'te', 'fa', 'lv', 'bn', 'sr', 'az', 'sl',
	'kn', 'et', 'mk', 'br', 'eu', 'is', 'hy', 'ne', 'mn', 'bs', 'kk', 'sq',
	'sw', 'gl', 'mr', 'pa', 'si', 'km', 'sn', 'yo', 'so', 'af', 'oc', 'ka',
	'be', 'tg', 'sd', 'gu', 'am', 'yi', 'lo', 'uz', 'fo', 'ht', 'ps', 'tk',
	'nn', 'mt', 'sa', 'lb', 'my', 'bo', 'tl', 'mg', 'as', 'tt', 'haw', 'ln',
	'ha', 'ba', 'jw', 'su', 'yue',
]);

/** POST /api/whisper/transcribe — Transcribe audio via whisper.cpp (CUDA) */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
    const formData = await request.formData();
    const audioFile = formData.get('file') as File | null;

    if (!audioFile) {
      return json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Validate file size
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return json(
        { error: `Audio file too large. Maximum ${MAX_AUDIO_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (audioFile.type && !ALLOWED_AUDIO_TYPES.has(audioFile.type)) {
      return json({ error: 'Invalid audio file type' }, { status: 400 });
    }

    // Validate extension
    const ext = '.' + (audioFile.name.split('.').pop()?.toLowerCase() ?? '');
    if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      return json({ error: 'Invalid audio file extension' }, { status: 400 });
    }

    // Parse optional params
    const languageParam = (formData.get('language') as string | null)?.toLowerCase() ?? 'auto';
    const translate = formData.get('translate') === 'true';
    const timestamps = formData.get('timestamps') === 'true';

    // Validate language code
    if (!VALID_LANGUAGES.has(languageParam)) {
      return json({ error: `Invalid language code: ${languageParam}` }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // Write audio to a temp file — nodejs-whisper requires a file path
    const tmpPath = join(tmpdir(), `whisper-${randomUUID()}${ext}`);
    try {
      await writeFile(tmpPath, buffer);
    } catch {
      return json(
        { ok: false, text: '', error: 'Failed to write temp audio file' },
        { status: 500 }
      );
    }

    try {
      const { nodewhisper } = await import('nodejs-whisper');
      const whisperModel = process.env.WHISPER_MODEL ?? 'base';
      const useCuda = (process.env.WHISPER_CUDA ?? 'true') === 'true';

      const transcript = await traceLLM(
        'whisper:transcribe',
        {
          model: `whisper-${whisperModel}`,
          backend: useCuda ? 'whisper-cuda' : 'whisper-cpu',
          language: languageParam,
          translate,
          timestamps,
          fileSizeBytes: buffer.length,
          fileType: ext,
        },
        async (gen) => {
          const result = await nodewhisper(tmpPath, {
            modelName: whisperModel,
            removeWavFileAfterTranscription: false,
            withCuda: useCuda,
            whisperOptions: {
              outputInText: true,
              outputInJsonFull: true,
              language: languageParam,
              translateToEnglish: translate,
              wordTimestamps: timestamps,
            },
          });
          gen.end({ output: typeof result === 'string' ? result.slice(0, 500) : 'array' });
          return result;
        }
      );

      // Extract plain text from transcript
      const text = Array.isArray(transcript)
        ? transcript
            .map((t: any) => t.speech ?? t.text ?? '')
            .join(' ')
            .trim()
        : String(transcript ?? '').trim();

      // Try to read the full JSON output for language detection + segments
      let detectedLanguage: string | null = null;
      let segments: Array<{ start: number; end: number; text: string }> | null = null;
      let durationSeconds: number | null = null;

      // whisper.cpp writes .json alongside the .wav (same base name)
      const wavBase = tmpPath.replace(/\.[^.]+$/, '.wav');
      const jsonPath = wavBase + '.json';
      try {
        const jsonData = await readFile(jsonPath, 'utf-8');
        const parsed = JSON.parse(jsonData);
        detectedLanguage = parsed?.result?.language ?? parsed?.params?.language ?? null;

        if (parsed?.result?.segments && Array.isArray(parsed.result.segments)) {
          durationSeconds = 0;
          segments = parsed.result.segments.map((seg: any) => {
            const end = typeof seg.t1 === 'number' ? seg.t1 / 100 : (seg.end ?? 0);
            const start = typeof seg.t0 === 'number' ? seg.t0 / 100 : (seg.start ?? 0);
            if (end > (durationSeconds ?? 0)) durationSeconds = end;
            return {
              start,
              end,
              text: (seg.text ?? '').trim(),
            };
          });
        }
        await unlink(jsonPath).catch(() => {});
      } catch {
        // JSON file may not exist — not fatal
      }

      // Cleanup temp files
      await unlink(tmpPath).catch(() => {});
      // whisper may also create a .txt file
      const txtPath = wavBase + '.txt';
      await unlink(txtPath).catch(() => {});
      // Clean up the intermediate .wav if different from input
      if (wavBase !== tmpPath) await unlink(wavBase).catch(() => {});

      return json({
        ok: true,
        text,
        language: detectedLanguage,
        translated: translate,
        duration: durationSeconds,
        model: whisperModel,
        cuda: useCuda,
        ...(timestamps && segments ? { segments } : {}),
      });
    } catch (whisperErr) {
      await unlink(tmpPath).catch(() => {});
      console.error('[whisper/transcribe] Whisper error:', whisperErr);
      return json({ ok: false, text: '', error: 'Whisper transcription failed' }, { status: 500 });
    }
  } catch (err) {
    console.error('[/api/whisper/transcribe] error:', err);
    return json({ ok: false, text: '', error: 'Transcription failed' }, { status: 500 });
  }
};
