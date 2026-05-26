import crypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
  cases,
  evidenceItems,
  evidenceMediaAssets,
  evidenceProcessingJobs,
  evidenceTranscriptSegments,
} from '$lib/server/db/schema/index.js';
import { uploadSeaweedFile as uploadFile } from '$lib/server/seaweed-client.js';
import { getRedis } from '$lib/server/redis.js';
import { embedText } from '$lib/server/evidence/services/embedding.js';
import { ENV } from '$lib/server/env.server.js';
import { createJob, updateJob } from '$lib/server/evidence-progress.js';
import { transcribeVideoAudio } from './transcript-service.js';
import { summarizeVideoTranscript } from './video-summary-service.js';
import type {
  VideoIngestRequest,
  VideoIngestResult,
} from './video-ingest-types.js';

type UploadSource = {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  cleanupDir?: string;
};

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function storageUri(bucket: string, objectName: string): string {
  return `seaweedfs://${bucket}/${objectName}`;
}

function buildObjectName(caseId: string, evidenceId: string, jobId: string, fileName: string): string {
  const ext = extname(fileName) || '.bin';
  return `evidence/${caseId}/${evidenceId}/${jobId}/${crypto.randomUUID()}${ext}`;
}

async function prepareUploadSource(request: VideoIngestRequest): Promise<UploadSource & { sourceMetadata?: Record<string, unknown> }> {
  if (request.file) {
    const buffer = Buffer.from(await request.file.arrayBuffer());
    return {
      fileName: request.file.name,
      buffer,
      mimeType: request.file.type || 'video/mp4',
    };
  }

  if (request.sourceUrl) {
    // @ts-ignore — downloadApprovedVideoSource defined in external module
    const downloaded = await downloadApprovedVideoSource(request.sourceUrl as string);
    const buffer = await readFile(downloaded.filePath);
    return {
      fileName: downloaded.fileName,
      buffer,
      mimeType: 'video/mp4',
      sourceMetadata: downloaded.sourceMetadata,
      cleanupDir: downloaded.cleanupDir,
    };
  }

  throw new Error('Provide either a video file or a source URL');
}

async function ensureCaseExists(caseId: string): Promise<void> {
  const [row] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!row) {
    throw new Error('Case not found');
  }
}

async function setRedisBestEffort(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // best effort
  }
}

export async function ingestVideoEvidence(request: VideoIngestRequest): Promise<VideoIngestResult> {
  await ensureCaseExists(request.caseId);

  const jobId = crypto.randomUUID();
  createJob(jobId);
  updateJob(jobId, { step: 'uploading', progress: 3, message: 'Starting video ingestion...' });

  const workDir = join(tmpdir(), `deeds-video-ingest-${jobId}`);
  await mkdir(workDir, { recursive: true });

  let sourceCleanupDir: string | undefined;
  let originalFileName = request.file?.name ?? 'video.mp4';
  let sourceMetadata: Record<string, unknown> = {};

  try {
    const uploadSource = await prepareUploadSource(request);
    originalFileName = uploadSource.fileName;
    sourceMetadata = uploadSource.sourceMetadata ?? {};
    sourceCleanupDir = uploadSource.cleanupDir;

    const originalBuffer = uploadSource.buffer;
    const checksum = sha256(originalBuffer);
    const evidenceId = crypto.randomUUID();
    const bucket = ENV.MINIO_EVIDENCE_BUCKET;
    const objectName = buildObjectName(request.caseId, evidenceId, jobId, originalFileName);
    const uploadedOriginalUri = storageUri(bucket, objectName);

    updateJob(jobId, { evidenceId, step: 'storing', progress: 10, message: 'Saving original video...' });

    const evidenceInsert = await db
      .insert(evidenceItems)
      .values({
        id: evidenceId,
        caseId: request.caseId,
        modality: 'video',
        sourceUrl: request.sourceUrl ?? null,
        storageUri: uploadedOriginalUri,
        status: 'processing',
        sha256: checksum,
        metadataJson: {
          title: request.title ?? originalFileName,
          description: request.description ?? null,
          originalFileName,
          operatorApproved: Boolean(request.operatorApproved),
          sourceMetadata,
          modality: 'video',
        },
      })
      .returning({ id: evidenceItems.id, storageUri: evidenceItems.storageUri });

    await db.insert(evidenceProcessingJobs).values({
      id: jobId,
      evidenceId,
      status: 'running',
      progress: '0',
      errorText: null,
      updatedAt: new Date(),
    });

    const originalPath = join(workDir, originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
    await writeFile(originalPath, originalBuffer);

    await uploadFile(bucket, objectName, originalBuffer, {
      'Content-Type': uploadSource.mimeType,
      'x-evidence-id': evidenceId,
      'x-case-id': request.caseId,
      'x-modality': 'video',
    });

    // @ts-ignore — extractAudioTrack defined in external module
  const audioPath = await extractAudioTrack(originalPath, workDir as string);
    updateJob(jobId, { step: 'hashing', progress: 25, message: 'Transcribing audio track...' });

    const transcription = await transcribeVideoAudio(audioPath, jobId);
    const chunks = transcription.chunks;
    const summary = await summarizeVideoTranscript(transcription.text, chunks);
    const audioObjectName = buildObjectName(request.caseId, evidenceId, jobId, 'audio.wav');

    updateJob(jobId, { step: 'db-insert', progress: 55, message: 'Persisting transcript segments...' });

    const transcriptRows = chunks.map((chunk, index) => ({
      evidenceId,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      text: chunk.text,
      language: chunk.language ?? transcription.language,
      translatedText: chunk.translatedText ?? null,
      confidence: chunk.confidence,
      model: chunk.model,
      metadataJson: {
        chunkIndex: index,
        trustTier: 'transcript_candidate',
        sourceUri: uploadedOriginalUri,
        audioUri: storageUri(bucket, audioObjectName),
      },
    }));

    const audioBuffer = await readFile(audioPath);
    await uploadFile(bucket, audioObjectName, audioBuffer, {
      'Content-Type': 'audio/wav',
      'x-evidence-id': evidenceId,
      'x-case-id': request.caseId,
      'x-modality': 'audio',
    });

    await db.insert(evidenceMediaAssets).values([
      {
        evidenceId,
        assetType: 'original',
        storageUri: uploadedOriginalUri,
        mimeType: uploadSource.mimeType,
        metadataJson: {
          sourceUrl: request.sourceUrl ?? null,
          checksum,
        },
      },
      {
        evidenceId,
        assetType: 'audio_mono',
        storageUri: storageUri(bucket, audioObjectName),
        mimeType: 'audio/wav',
        metadataJson: {
          source: 'ffmpeg',
          language: transcription.language,
        },
      },
    ]);

    if (transcriptRows.length > 0) {
      const transcriptInsertRows = transcriptRows.map((row) => ({
          evidenceId: row.evidenceId,
          startMs: row.startMs,
          endMs: row.endMs,
          text: row.text,
          language: row.language,
          translatedText: row.translatedText,
          confidence: row.confidence,
          model: row.model,
          metadataJson: row.metadataJson,
      })) as Array<Record<string, unknown>>;
      await db.insert(evidenceTranscriptSegments).values(transcriptInsertRows as never);
    }

    updateJob(jobId, { step: 'embedding', progress: 80, message: 'Embedding transcript chunks...' });

    const points = await Promise.all(
      chunks.map(async (chunk, index) => {
        const vector = await embedText(chunk.text);
        return {
          id: `${evidenceId}-${index}`,
          vector: { content: vector },
          payload: {
            evidence_id: evidenceId,
            case_id: request.caseId,
            modality: 'video',
            view: 'transcript_segment',
            start_ms: chunk.startMs,
            end_ms: chunk.endMs,
            language: chunk.language ?? transcription.language,
            text: chunk.text,
            source_uri: uploadedOriginalUri,
            trust_tier: 'transcript_candidate',
            tags: [request.title ?? 'video', 'transcript'],
            entities: [],
            model: 'whisper',
          },
        };
      })
    );

    if (points.length > 0) {
      await fetch(`${ENV.QDRANT_URL}/collections/evidence_items/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      }).catch(() => null);
    }

    await db
      .update(evidenceItems)
      .set({
        status: 'completed',
        metadataJson: {
          title: request.title ?? originalFileName,
          description: request.description ?? null,
          sourceUrl: request.sourceUrl ?? null,
          originalFileName,
          checksum,
          transcriptCount: chunks.length,
          summary: summary.summary,
          keyFacts: summary.keyFacts,
          operatorApproved: Boolean(request.operatorApproved),
          sourceMetadata,
          processingStatus: 'complete',
          processingJobId: jobId,
        },
      })
      .where(eq(evidenceItems.id, evidenceId));

    await db
      .update(evidenceProcessingJobs)
      .set({
        status: 'completed',
        progress: '100',
        updatedAt: new Date(),
        errorText: null,
      })
      .where(eq(evidenceProcessingJobs.id, jobId));

    updateJob(jobId, { step: 'complete', progress: 100, message: 'Video ingestion complete.' });

    await setRedisBestEffort(`evidence:summary:${evidenceId}`, {
      evidenceId,
      jobId,
      summary: summary.summary,
      keyFacts: summary.keyFacts,
      transcriptCount: chunks.length,
    }, 3600);

    await setRedisBestEffort(`evidence:transcript:${evidenceId}`, {
      evidenceId,
      chunks,
      language: transcription.language,
    }, 3600);

    return {
      evidenceId,
      jobId,
      storageUri: evidenceInsert[0]?.storageUri ?? uploadedOriginalUri,
      transcriptCount: chunks.length,
      summary: summary.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video ingestion failed';
    updateJob(jobId, { step: 'error', progress: 0, message: 'Video ingestion failed', error: message });

    await db
      .update(evidenceProcessingJobs)
      .set({
        status: 'failed',
        errorText: message,
        updatedAt: new Date(),
      })
      .where(eq(evidenceProcessingJobs.id, jobId))
      .catch(() => {});

    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    if (sourceCleanupDir) {
      await rm(sourceCleanupDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
