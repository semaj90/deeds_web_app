/**
 * Audio Processing Worker
 * Consumes audio.process queue and orchestrates the full pipeline:
 * 1. Whisper CUDA transcription
 * 2. SIMD JSON parsing
 * 3. LangExtract entity extraction
 * 4. ACE analysis + summary
 * 5. Qdrant indexing with tags
 * 6. Evidence record update
 */
import { getRedis } from '$lib/server/redis';
import { db } from '$lib/server/db/client';
import { evidence, audioTranscripts, whisperSegments } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { spawn } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import type { Redis } from 'ioredis';
import { ENV } from '$lib/server/env.server';
import { getOllamaEndpoint } from '$lib/server/ollama.js';

export interface AudioJob {
  evidenceId: string;
  filePath: string;
  fileName: string;
  caseId: string | null;
  userId: string;
  timestamp: number;
}

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
}

interface EntityExtractionResult {
  entities: Array<{
    type: string;
    value: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

interface ACEAnalysisResult {
  summary: string;
  claims: Array<{ text: string; timestamp?: string }>;
  contradictions: Array<{ claim1: string; claim2: string; reason: string }>;
  confidence: number;
  tags: string[];
}

export class AudioProcessor {
  private redis: Redis;

  constructor() {
    this.redis = getRedis();
  }

  /**
   * Process audio file through full pipeline
   */
  async processAudio(job: AudioJob): Promise<void> {
    const { evidenceId, filePath, fileName, caseId } = job;

    try {
      // Stage 1: Whisper transcription (CUDA)
      await this.updateStatus(
        evidenceId,
        'transcription',
        25,
        'Transcribing audio with Whisper...'
      );
      const transcription = await this.transcribeAudio(filePath);

      // Stage 2: Entity extraction (LangExtract)
      await this.updateStatus(evidenceId, 'analysis', 50, 'Extracting entities...', {
        duration: transcription.duration,
        language: transcription.language,
      });
      const entities = await this.extractEntities(transcription.text);

      // Stage 3: ACE analysis + summary
      await this.updateStatus(evidenceId, 'analysis', 65, 'Analyzing content with ACE...');
      const aceAnalysis = await this.analyzeWithACE(transcription.text, caseId);

      // Stage 4: Qdrant indexing (full transcript + per-segment)
      await this.updateStatus(evidenceId, 'indexing', 75, 'Indexing for search...', {
        entities: entities.entities.length,
        tags: aceAnalysis.tags,
      });
      await this.indexInQdrant(evidenceId, transcription.text, aceAnalysis.tags, caseId);

      // Stage 4b: Segment-level indexing (Qdrant audio_segments + Drizzle tables)
      await this.updateStatus(evidenceId, 'indexing', 85, 'Indexing audio segments...');
      await this.indexSegments(evidenceId, caseId, transcription, aceAnalysis.tags);

      // Stage 5: Update evidence record
      await this.updateStatus(evidenceId, 'indexing', 95, 'Updating evidence record...');
      await this.updateEvidenceRecord(evidenceId, transcription, entities, aceAnalysis);

      // Stage 6: Complete
      await this.updateStatus(evidenceId, 'complete', 100, 'Processing complete', {
        duration: transcription.duration,
        language: transcription.language,
        entities: entities.entities.length,
        tags: aceAnalysis.tags,
      });

      // Cleanup: delete temp file
      await unlink(filePath).catch(() => {});
    } catch (error) {
      console.error('Audio processing error:', error);
      await this.updateStatus(
        evidenceId,
        'error',
        0,
        error instanceof Error ? error.message : 'Processing failed'
      );
      throw error;
    }
  }

  /**
   * Transcribe audio using Whisper (server, CUDA CLI, or CPU CLI fallback)
   */
  private async transcribeAudio(filePath: string): Promise<TranscriptionResult> {
    const whisperPath = ENV.WHISPER_PATH;
    const whisperModel = ENV.WHISPER_MODEL;
    const whisperDevice = ENV.WHISPER_DEVICE;
    const whisperUseServer = ENV.WHISPER_USE_SERVER;
    const whisperServerUrl = ENV.WHISPER_SERVER_URL;
    const ffmpegPath = ENV.FFMPEG_PATH;

    if (whisperUseServer) {
      return this.transcribeViaServer(filePath, whisperServerUrl, ffmpegPath);
    }
    return this.transcribeViaCLI(filePath, whisperPath, whisperModel, whisperDevice, ffmpegPath);
  }

  /**
   * Transcribe via persistent Whisper HTTP server (stays loaded in VRAM)
   */
  private async transcribeViaServer(
    filePath: string,
    serverUrl: string,
    ffmpegPath: string | undefined
  ): Promise<TranscriptionResult> {
    const form = new FormData();
    const blob = new Blob([await readFile(filePath)]);
    form.append('file', blob, filePath.split(/[\\/]/).pop() || 'audio');
    form.append('response_format', 'verbose_json');
    if (ffmpegPath) form.append('ffmpeg_path', ffmpegPath);

    const response = await fetch(`${serverUrl}/inference`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(300_000),
    });

    if (!response.ok) {
      throw new Error(`Whisper server error: ${response.status}`);
    }

    const result = await response.json();
    return {
      text: result.text || '',
      language: result.language || 'unknown',
      duration: result.duration || 0,
      segments: result.segments || [],
    };
  }

  /**
   * Transcribe via local Whisper CLI using spawn (shell: false — Windows-safe, no injection)
   */
  private transcribeViaCLI(
    filePath: string,
    whisperPath: string,
    model: string,
    device: string,
    ffmpegPath: string | undefined
  ): Promise<TranscriptionResult> {
    const outputDir = join(filePath, '..');
    const outputPath = filePath.replace(/\.[^.]+$/, '.json');

    const args = [
      filePath,
      '--model',
      model,
      '--device',
      device,
      '--output_format',
      'json',
      '--output_dir',
      outputDir,
      '--fp16',
      'False', // required for CPU; harmless on GPU
    ];

    // Inject ffmpeg directory into PATH so Whisper can find it
    const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (ffmpegPath) {
      const ffmpegDir = ffmpegPath.replace(/[\\/][^\\/]+$/, '');
      spawnEnv.PATH =
        ffmpegDir + (process.platform === 'win32' ? ';' : ':') + (spawnEnv.PATH || '');
    }

    return new Promise((resolve, reject) => {
      const timeoutMs = device === 'cpu' ? 600_000 : 300_000;
      const proc = spawn(whisperPath, args, { shell: false, env: spawnEnv });
      const stderr: string[] = [];

      proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Whisper CLI timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      proc.on('close', async (code) => {
        clearTimeout(timer);
        const stderrText = stderr.join('');
        if (code !== 0) {
          // Retry with CPU if CUDA failed
          if (device !== 'cpu') {
            console.warn('Whisper CUDA failed, retrying with CPU:', stderrText.slice(0, 200));
            try {
              const result = await this.transcribeViaCLI(
                filePath,
                whisperPath,
                model,
                'cpu',
                ffmpegPath
              );
              resolve(result);
            } catch (retryErr) {
              reject(retryErr);
            }
          } else {
            reject(new Error(`Whisper CLI exited ${code}: ${stderrText.slice(0, 500)}`));
          }
          return;
        }
        if (stderrText && !stderrText.includes('Warning')) {
          console.warn('Whisper stderr:', stderrText.slice(0, 200));
        }
        try {
          const jsonContent = await readFile(outputPath, 'utf-8');
          const result = JSON.parse(jsonContent);
          await unlink(outputPath).catch(() => {});
          resolve({
            text: result.text || '',
            language: result.language || 'unknown',
            duration: result.duration || 0,
            segments: result.segments || [],
          });
        } catch (parseErr) {
          reject(parseErr);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Failed to spawn Whisper: ${(err as Error).message}. Check WHISPER_PATH env var.`
          )
        );
      });
    });
  }

  /**
   * Extract entities using LangExtract service
   */
  private async extractEntities(text: string): Promise<EntityExtractionResult> {
    try {
      const response = await fetch(`${ENV.LANGEXTRACT_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`LangExtract failed: ${response.status}`);
      }

      const result = await response.json();
      return { entities: result.entities || [] };
    } catch (error) {
      console.warn('LangExtract failed, continuing without entities:', error);
      return { entities: [] };
    }
  }

  /**
   * Analyze transcription with ACE (Agentic Cognitive Engine)
   */
  private async analyzeWithACE(text: string, caseId: string | null): Promise<ACEAnalysisResult> {
    try {
      // Call Ollama with gemma3-legal model
      const systemPrompt = `You are a legal AI assistant. Analyze the following audio transcription and provide:
1. A concise summary (2-3 sentences)
2. Key claims or statements made
3. Any contradictions or inconsistencies
4. Relevant legal tags (3-5 tags)

Respond in JSON format:
{
  "summary": "...",
  "claims": [{"text": "...", "timestamp": "MM:SS"}],
  "contradictions": [{"claim1": "...", "claim2": "...", "reason": "..."}],
  "tags": ["tag1", "tag2", "tag3"]
}`;

      const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt: `${systemPrompt}\n\nTranscription:\n${text}`,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 512,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama ACE analysis failed: ${response.status}`);
      }

      const result = await response.json();
      const analysis = JSON.parse(result.response);

      return {
        summary: analysis.summary || '',
        claims: analysis.claims || [],
        contradictions: analysis.contradictions || [],
        confidence: 0.85,
        tags: analysis.tags || [],
      };
    } catch (error) {
      console.warn('ACE analysis failed, using fallback:', error);
      return {
        summary: text.slice(0, 200) + '...',
        claims: [],
        contradictions: [],
        confidence: 0.5,
        tags: ['audio', 'transcription'],
      };
    }
  }

  /**
   * Index transcription in Qdrant for semantic search
   */
  private async indexInQdrant(
    evidenceId: string,
    text: string,
    tags: string[],
    caseId: string | null
  ): Promise<void> {
    try {
      // Get embedding from embeddinggemma
      const embedResponse = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: text,
        }),
      });

      if (!embedResponse.ok) {
        throw new Error(`Embedding failed: ${embedResponse.status}`);
      }

      const { embedding } = await embedResponse.json();

      // Upsert to Qdrant evidence_items collection
      const qdrantResponse = await fetch(
        `${ENV.QDRANT_URL}/collections/evidence_items/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [
              {
                id: evidenceId,
                vector: embedding,
                payload: {
                  evidenceId,
                  caseId,
                  text,
                  tags,
                  type: 'audio_transcription',
                  timestamp: new Date().toISOString(),
                },
              },
            ],
          }),
        }
      );

      if (!qdrantResponse.ok) {
        throw new Error(`Qdrant indexing failed: ${qdrantResponse.status}`);
      }
    } catch (error) {
      console.warn('Qdrant indexing failed, continuing without search index:', error);
    }
  }

  /**
   * Index individual segments in Qdrant audio_segments + Drizzle whisper_segments table
   */
  private async indexSegments(
    evidenceId: string,
    caseId: string | null,
    transcription: TranscriptionResult,
    tags: string[]
  ): Promise<void> {
    if (!transcription.segments.length) return;

    try {
      // 1. Create transcript record in Drizzle
      const [transcript] = await db
        .insert(audioTranscripts)
        .values({
          evidenceId,
          caseId,
          language: transcription.language,
          duration: transcription.duration,
          fullText: transcription.text,
          segmentCount: transcription.segments.length,
          whisperModel: ENV.WHISPER_MODEL,
        })
        .returning({ id: audioTranscripts.id });

      if (!transcript) return;

      // 2. Batch-embed all segment texts (max 20 per batch to avoid timeout)
      const BATCH_SIZE = 20;
      const qdrantPoints: Array<{
        id: string;
        vector: Record<string, number[]>;
        payload: Record<string, unknown>;
      }> = [];
      const dbRows: Array<{
        transcriptId: string;
        evidenceId: string;
        segmentIndex: number;
        startMs: number;
        endMs: number;
        text: string;
        language: string;
        embedding: number[];
        embeddingModel: string;
        qdrantPointId: string;
      }> = [];

      for (
        let batchStart = 0;
        batchStart < transcription.segments.length;
        batchStart += BATCH_SIZE
      ) {
        const batch = transcription.segments.slice(batchStart, batchStart + BATCH_SIZE);
        const embeddings = await Promise.all(batch.map((seg) => this.getEmbedding(seg.text)));

        for (let i = 0; i < batch.length; i++) {
          const seg = batch[i];
          const embedding = embeddings[i];
          if (!embedding) continue;

          const segIdx = batchStart + i;
          const segId = `${evidenceId}-seg-${segIdx}`;

          qdrantPoints.push({
            id: segId,
            vector: { content: embedding },
            payload: {
              evidenceId,
              caseId,
              transcriptId: transcript.id,
              segmentIndex: segIdx,
              startMs: Math.round(seg.start * 1000),
              endMs: Math.round(seg.end * 1000),
              text: seg.text,
              language: transcription.language,
              tags,
              evidenceType: 'audio_segment',
            },
          });

          dbRows.push({
            transcriptId: transcript.id,
            evidenceId,
            segmentIndex: segIdx,
            startMs: Math.round(seg.start * 1000),
            endMs: Math.round(seg.end * 1000),
            text: seg.text,
            language: transcription.language,
            embedding,
            embeddingModel: 'embeddinggemma:latest',
            qdrantPointId: segId,
          });
        }
      }

      // 3. Upsert to Qdrant audio_segments collection
      if (qdrantPoints.length > 0) {
        await fetch(`${ENV.QDRANT_URL}/collections/audio_segments/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: qdrantPoints }),
        }).catch((err) => console.warn('Qdrant audio_segments upsert failed:', err));
      }

      // 4. Batch insert into Drizzle whisper_segments table
      if (dbRows.length > 0) {
        await db.insert(whisperSegments).values(dbRows);
      }
    } catch (error) {
      console.warn('Segment indexing failed, continuing:', error);
    }
  }

  /**
   * Get embedding vector for text via embeddinggemma
   */
  private async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
      });
      if (!response.ok) return null;
      const { embedding } = await response.json();
      return embedding;
    } catch {
      return null;
    }
  }

  /**
   * Update evidence record with transcription results
   */
  private async updateEvidenceRecord(
    evidenceId: string,
    transcription: TranscriptionResult,
    entities: EntityExtractionResult,
    aceAnalysis: ACEAnalysisResult
  ): Promise<void> {
    await db
      .update(evidence)
      .set({
        metadata: {
          transcription: {
            text: transcription.text,
            language: transcription.language,
            segments: transcription.segments,
            duration: transcription.duration,
          },
          entities: entities.entities,
          aceAnalysis: {
            summary: aceAnalysis.summary,
            claims: aceAnalysis.claims,
            contradictions: aceAnalysis.contradictions,
            confidence: aceAnalysis.confidence,
            tags: aceAnalysis.tags,
          },
          processingStatus: 'complete',
          processedAt: new Date().toISOString(),
        },
      })
      .where(eq(evidence.id, evidenceId));
  }

  /**
   * Update Redis status for SSE streaming
   */
  private async updateStatus(
    evidenceId: string,
    stage: string,
    progress: number,
    message: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.redis.set(
      `audio:status:${evidenceId}`,
      JSON.stringify({
        stage,
        progress,
        message,
        details,
        timestamp: Date.now(),
      }),
      'EX',
      3600 // 1 hour TTL
    );
  }
}

export default AudioProcessor;
