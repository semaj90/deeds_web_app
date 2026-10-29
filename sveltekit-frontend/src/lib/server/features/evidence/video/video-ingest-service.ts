import crypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { and, eq, or } from 'drizzle-orm';
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
import { requireOwnedEvidenceCaseV1 } from '$lib/server/evidence-case-admission-v1.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import { buildVideoTranscriptPointV1 } from './video-qdrant-point-v1.js';
import { transcribeVideoAudio } from './transcript-service.js';
import { summarizeVideoTranscript } from './video-summary-service.js';
import { checkVideoUploadSizeV1, MAX_VIDEO_UPLOAD_BYTES_V1 } from './video-upload-policy-v1.js';
import { mapBoundedV1 } from './map-bounded-v1.js';
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
    const sizeDecision = checkVideoUploadSizeV1(request.file.size);
    if ('reason' in sizeDecision) {
      throw new Error(sizeDecision.reason === 'too_large'
        ? `Video file exceeds the ${MAX_VIDEO_UPLOAD_BYTES_V1 / 1024 / 1024} MiB upload limit`
        : 'Video file has an invalid size');
    }
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

async function ensureCaseOwned(caseId: string, ownerId: string): Promise<void> {
  const numericOwnerId = Number(ownerId);
  await requireOwnedEvidenceCaseV1(caseId, numericOwnerId, async (requestedCaseId, userId) => {
    const [row] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.id, requestedCaseId),
          or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))
        )
      )
      .limit(1);
    return row?.id ?? null;
  });
}

async function setRedisBestEffort(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // best effort
  }
}

export async function ingestVideoEvidence(request: VideoIngestRequest, ownerId: string): Promise<VideoIngestResult> {
  await ensureCaseOwned(request.caseId, ownerId);

  const jobId = crypto.randomUUID();
  createJob(jobId, ownerId);
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
    const sourceRevision = formatEvidenceSourceRevisionV1(checksum);
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
          source_revision: sourceRevision,
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

    const points = await mapBoundedV1(chunks, 4, async (chunk, index) => {
        const vector = await embedText(chunk.text);
        return buildVideoTranscriptPointV1({
          evidenceId,
          caseId: request.caseId,
          sourceRevisionHex: checksum,
          chunkIndex: index,
          startMs: chunk.startMs,
          endMs: chunk.endMs,
          text: chunk.text,
          language: chunk.language ?? transcription.language,
          model: chunk.model,
          vector,
          sourceUri: uploadedOriginalUri,
        });
    });

    let searchIndexStatus: VideoIngestResult['searchIndexStatus'] = 'not_applicable';
    let searchIndexError: string | null = null;
    if (points.length > 0) {
      try {
        const response = await fetch(`${ENV.QDRANT_URL}/collections/evidence_items/points?wait=true`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
        });
        if (!response.ok) throw new Error(`Qdrant returned HTTP ${response.status}`);
        searchIndexStatus = 'indexed';
      } catch (error) {
        searchIndexStatus = 'failed';
        searchIndexError = error instanceof Error ? error.message : 'Qdrant indexing failed';
        console.warn('[VideoIngest] Transcript search indexing failed:', searchIndexError);
      }
    }

    const summaryRevision = formatEvidenceSourceRevisionV1(
      crypto.createHash('sha256').update(summary.summary).digest('hex')
    );

    await db
      .update(evidenceItems)
      .set({
        status: 'completed',
        metadataJson: {
          title: request.title ?? originalFileName,
          description: request.description ?? null,
          sourceUrl: request.sourceUrl ?? null,
          originalFileName,
          fileSize: originalBuffer.byteLength,
          mimeType: uploadSource.mimeType,
          checksum,
          sourceRevision,
          summaryRevision,
          transcriptCount: chunks.length,
          summary: summary.summary,
          keyFacts: summary.keyFacts,
          operatorApproved: Boolean(request.operatorApproved),
          sourceMetadata,
          processingStatus: searchIndexStatus === 'failed' ? 'complete_with_search_index_error' : 'complete',
          processingJobId: jobId,
          searchIndexStatus,
          searchIndexError,
        },
      })
      .where(eq(evidenceItems.id, evidenceId));

    await db
      .update(evidenceProcessingJobs)
      .set({
        status: 'completed',
        progress: '100',
        updatedAt: new Date(),
        errorText: searchIndexError,
      })
      .where(eq(evidenceProcessingJobs.id, jobId));

    updateJob(jobId, {
      step: 'complete',
      progress: 100,
      message: searchIndexStatus === 'failed'
        ? 'Video analysis complete; transcript search indexing failed.'
        : 'Video ingestion complete.',
      ...(searchIndexError ? { error: searchIndexError } : {}),
    });

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
      searchIndexStatus,
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
