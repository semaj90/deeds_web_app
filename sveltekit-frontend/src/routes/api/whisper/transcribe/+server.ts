import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ENV } from '$lib/server/env.server.js';
import { extractDocument } from '$lib/server/langextract-client.js';
import { extractEntities } from '$lib/server/analysis/entity-extraction.js';
import { generateEmbedding } from '$lib/server/grpc/embedding-client.js';
import { z } from 'zod';

interface TranscriptionEnrichment {
	entities?: Array<{ text: string; label: string; confidence?: number; source?: string }>;
	ragContext?: Array<{ text: string; score: number; collection: string }>;
	graphNeighbors?: Array<{ id: string; type: string; label: string }>;
	summary?: string;
}

/**
 * Post-transcription enrichment pipeline:
 * 1. LangExtract (spaCy NER) + LLM entity extraction (parallel)
 * 2. If caseId: RAG vector search + KAG graph neighbors + LLM summary
 */
async function enrichTranscription(
	text: string,
	language: string | null,
	caseId?: string,
): Promise<TranscriptionEnrichment> {
	const enrichment: TranscriptionEnrichment = {};
	if (!text || text.length < 10) return enrichment;

	// ── Stage 1: Entity extraction (LangExtract + LLM in parallel) ──
	const [langExtractResult, llmEntities] = await Promise.allSettled([
		extractDocument(text, {
			documentType: 'legal',
			extractEntities: true,
			language: language ?? 'en',
		}),
		extractEntities(text, 20_000),
	]);

	const allEntities: TranscriptionEnrichment['entities'] = [];

	if (langExtractResult.status === 'fulfilled' && langExtractResult.value?.entities) {
		for (const e of langExtractResult.value.entities) {
			allEntities.push({ text: e.text, label: e.label, confidence: e.confidence, source: 'langextract' });
		}
	}
	if (llmEntities.status === 'fulfilled' && llmEntities.value) {
		for (const e of llmEntities.value) {
			// Dedupe by text+label
			if (!allEntities.some(x => x.text === e.text && x.label === e.label)) {
				allEntities.push({ text: e.text, label: e.label, confidence: e.score, source: e.source ?? 'llm' });
			}
		}
	}
	if (allEntities.length > 0) enrichment.entities = allEntities;

	// ── Stage 2: RAG + KAG + LLM summary (only with caseId) ──
	if (caseId) {
		try {
			const embedding = await generateEmbedding(text.slice(0, 8000));
			if (embedding) {
				const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
				const searchResult = await qdrant._denseSearch({
					query: text.slice(0, 500),
					queryEmbedding: embedding,
					collection: 'evidence_items',
					filters: { must: [{ key: 'case_id', match: { value: caseId } }] },
					limit: 5,
				});
				if (searchResult.results.length > 0) {
					enrichment.ragContext = searchResult.results.map((r: any) => ({
						text: (r.payload?.text ?? '').slice(0, 300),
						score: r.score ?? 0,
						collection: 'evidence_items',
					}));
				}
			}
		} catch (ragErr) {
			console.warn('[whisper/enrich] RAG search failed:', (ragErr as Error).message);
		}

		try {
			const { getNeo4jMultiHopNeighbors } = await import('$lib/server/retrieval/graph-context.js');
			const neighbors = await getNeo4jMultiHopNeighbors(caseId);
			if (neighbors.length > 0) {
				enrichment.graphNeighbors = neighbors.slice(0, 10).map(n => ({
					id: n.nodeId,
					type: n.connectionType ?? 'unknown',
					label: n.title ?? n.nodeId,
				}));
			}
		} catch (kagErr) {
			console.warn('[whisper/enrich] KAG graph failed:', (kagErr as Error).message);
		}

		// LLM summary of transcription + context
		if (enrichment.ragContext && enrichment.ragContext.length > 0) {
			try {
				const { ollamaFetch } = await import('$lib/server/ollama.js');
				const contextSnippets = enrichment.ragContext.map(r => r.text).join('\n---\n');
				const summaryResp = await ollamaFetch('/api/generate', {
					method: 'POST',
					body: JSON.stringify({
						model: 'gemma4-legal:latest',
						prompt: `Summarize this audio transcription in the context of the legal case. Identify key facts, dates, names, and legal relevance.\n\nTranscription:\n${text.slice(0, 6000)}\n\nRelated evidence:\n${contextSnippets.slice(0, 3000)}\n\nProvide a concise 2-3 paragraph summary:`,
						stream: false,
						options: { temperature: 0.2, num_predict: 512 },
					}),
				});
				if (summaryResp?.ok) {
					const summaryData = await summaryResp.json();
					enrichment.summary = summaryData.response?.trim() ?? null;
				}
			} catch (llmErr) {
				console.warn('[whisper/enrich] LLM summary failed:', (llmErr as Error).message);
			}
		}
	}

	return enrichment;
}

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

// Custom Zod refinement for file validation
const audioFileSchema = z
	.custom<File>((v) => v instanceof File, 'Must be a File')
	.refine((file) => file.size <= MAX_AUDIO_SIZE, `Audio file too large. Maximum ${MAX_AUDIO_SIZE / 1024 / 1024}MB`)
	.refine((file) => !file.type || ALLOWED_AUDIO_TYPES.has(file.type), 'Invalid audio file type')
	.refine((file) => {
		const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
		return ALLOWED_AUDIO_EXTENSIONS.has(ext);
	}, 'Invalid audio file extension');

const whisperTranscribeSchema = z.object({
	file: audioFileSchema,
	language: z.string().toLowerCase().refine((lang) => VALID_LANGUAGES.has(lang), 'Invalid language code').default('auto'),
	translate: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
	timestamps: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
	enrich: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
	caseId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID').optional(),
});

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

import { transcribeViaServer } from '$lib/server/ai/whisper.js';

/** POST /api/whisper/transcribe — Transcribe audio via whisper.cpp (CUDA) */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();

    // Validate FormData with Zod (convert null → undefined so Zod .default() triggers)
    const parsed = whisperTranscribeSchema.safeParse({
      file: formData.get('file'),
      language: formData.get('language') ?? undefined,
      translate: formData.get('translate') ?? undefined,
      timestamps: formData.get('timestamps') ?? undefined,
      enrich: formData.get('enrich') ?? undefined,
      caseId: formData.get('caseId') ?? undefined,
    });

    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const {
      file: audioFile,
      language: languageParam,
      translate,
      timestamps,
      enrich,
      caseId,
    } = parsed.data;

    const ext = '.' + (audioFile.name.split('.').pop()?.toLowerCase() ?? '');
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // ── Tier 1: Persistent whisper-server.exe (no cold start) ──
    if (ENV.WHISPER_USE_SERVER) {
      try {
        const serverResult = await traceLLM(
          'whisper:transcribe',
          {
            model: 'whisper-server',
            backend: 'whisper-server-cuda',
            language: languageParam,
            translate,
            timestamps,
            fileSizeBytes: buffer.length,
            fileType: ext,
          },
          async (gen) => {
            const result = await transcribeViaServer(
              buffer,
              audioFile.name,
              languageParam,
              translate
            );
            gen.end({ output: result ? result.text.slice(0, 500) : 'server-unavailable' });
            return result;
          }
        );

        if (serverResult) {
          const enrichment = enrich
            ? await enrichTranscription(serverResult.text, serverResult.language, caseId).catch(
                () => ({})
              )
            : {};
          return json({
            ok: true,
            text: serverResult.text,
            language: serverResult.language,
            translated: translate,
            duration: null,
            model: 'whisper-server',
            cuda: true,
            ...(timestamps && serverResult.segments ? { segments: serverResult.segments } : {}),
            ...enrichment,
          });
        }
        console.warn('[whisper/transcribe] Server unavailable, falling back to nodejs-whisper');
      } catch (serverErr) {
        console.warn('[whisper/transcribe] Server error, falling back:', serverErr);
      }
    }

    // ── Tier 2: nodejs-whisper child process (cold start per request) ──
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
      const txtPath = wavBase + '.txt';
      await unlink(txtPath).catch(() => {});
      if (wavBase !== tmpPath) await unlink(wavBase).catch(() => {});

      const enrichment = enrich
        ? await enrichTranscription(text, detectedLanguage, caseId).catch(() => ({}))
        : {};
      return json({
        ok: true,
        text,
        language: detectedLanguage,
        translated: translate,
        duration: durationSeconds,
        model: whisperModel,
        cuda: useCuda,
        ...(timestamps && segments ? { segments } : {}),
        ...enrichment,
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
