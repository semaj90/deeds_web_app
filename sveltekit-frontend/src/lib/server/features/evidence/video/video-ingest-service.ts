import crypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
  cases,
  evidence,
  evidenceFrames,
  evidenceItems,
  evidenceMediaAssets,
  evidenceProcessingJobs,
  evidenceTranscriptSegments,
} from '$lib/server/db/schema/index.js';
import { uploadSeaweedFile as uploadFile } from '$lib/server/seaweed-client.js';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { createJob, updateJob } from '$lib/server/evidence-progress.js';
import { requireOwnedEvidenceCaseV1 } from '$lib/server/evidence-case-admission-v1.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import {
  downloadApprovedVideoSource,
  extractAudioTrack,
  transcribeVideoAudio,
} from './transcript-service.js';
import { summarizeVideoTranscript } from './video-summary-service.js';
import { checkVideoUploadSizeV1, MAX_VIDEO_UPLOAD_BYTES_V1 } from './video-upload-policy-v1.js';
import { detectVideoAndAudioStreamsV1 } from './storyboard-manifest-contract-v1.js';
import { VisionService } from '$lib/server/evidence/video/vision-service.js';
import type {
  VideoAdmissionResultV1,
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

export async function ensureCaseOwned(caseId: string, ownerId: string): Promise<void> {
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

export async function admitVideoEvidenceV1(
  request: VideoIngestRequest,
  ownerId: string | number
): Promise<VideoAdmissionResultV1> {
  const numericOwnerId = Number(ownerId);
  await ensureCaseOwned(request.caseId, String(numericOwnerId));

  const uploadSource = await prepareUploadSource(request);
  const originalFileName = uploadSource.fileName;
  const originalBuffer = uploadSource.buffer;
  const checksum = sha256(originalBuffer);
  const sourceRevision = formatEvidenceSourceRevisionV1(checksum);
  const evidenceId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const bucket = ENV.SEAWEED_EVIDENCE_BUCKET;
  const objectName = buildObjectName(request.caseId, evidenceId, jobId, originalFileName);
  const uploadedOriginalUri = storageUri(bucket, objectName);

  await uploadFile(bucket, objectName, originalBuffer, uploadSource.mimeType);

  await db.insert(evidence).values({
    id: evidenceId,
    caseId: request.caseId,
    kind: 'video',
    title: request.title ?? originalFileName,
    description: request.description ?? null,
    fileKey: objectName,
    mimeType: uploadSource.mimeType,
    sizeBytes: String(originalBuffer.byteLength),
    hash: checksum,
    hashAlgorithm: 'sha256',
    tags: ['video', 'unprocessed'],
  });

  const { enqueueJob } = await import('$lib/server/analysis/analysis-jobs.js');
  await enqueueJob({
    id: jobId,
    evidenceId,
    caseId: request.caseId,
    jobType: 'upload_pipeline',
    result: {
      evidenceId,
      caseId: request.caseId,
      objectKey: objectName,
      object_bucket: bucket,
      sourceSha256: sourceRevision,
      fileName: originalFileName,
      contentType: uploadSource.mimeType,
      uploadedBy: numericOwnerId,
    },
  });

  createJob(jobId, String(numericOwnerId));
  updateJob(jobId, {
    evidenceId,
    step: 'queued',
    progress: 0,
    message: 'Video stored; durable processing job queued',
  });

  return {
    ok: true,
    evidenceId,
    jobId,
    status: 'queued',
    sourceRevision,
    fileName: originalFileName,
    storageUri: uploadedOriginalUri,
  };
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
  let admittedEvidenceId: string | undefined;

  try {
    const uploadSource = await prepareUploadSource(request);
    originalFileName = uploadSource.fileName;
    sourceMetadata = uploadSource.sourceMetadata ?? {};
    sourceCleanupDir = uploadSource.cleanupDir;

    const originalBuffer = uploadSource.buffer;
    const checksum = sha256(originalBuffer);
    const sourceRevision = formatEvidenceSourceRevisionV1(checksum);
    const evidenceId = crypto.randomUUID();
    admittedEvidenceId = evidenceId;
    const bucket = ENV.SEAWEED_EVIDENCE_BUCKET;
    const artifactsBucket = ENV.SEAWEED_ARTIFACTS_BUCKET || 'atlas-artifacts';
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

    updateJob(jobId, { step: 'hashing', progress: 20, message: 'Probing media streams...' });
    let probeResult: { hasAudioStream: boolean; hasVideoStream: boolean };
    try {
      probeResult = await detectVideoAndAudioStreamsV1(originalPath);
    } catch (cause) {
      throw new Error('VIDEO_MEDIA_PROBE_FAILED', { cause });
    }
    if (!probeResult.hasVideoStream) throw new Error('VIDEO_STREAM_NOT_FOUND');

    let chunks: Array<{
      startMs: number;
      endMs: number;
      text: string;
      language?: string;
      translatedText?: string | null;
      confidence?: number | string | null;
      model?: string | null;
    }> = [];
    let summary: { summary: string; keyFacts: string[] } = {
      summary: 'Visual-only recording (no audio stream detected in video container).',
      keyFacts: []
    };
    let audioObjectName: string | null = null;
    let transcriptionLanguage: string | null = null;

    if (probeResult.hasAudioStream) {
      try {
        const audioPath = await extractAudioTrack(originalPath, workDir);
        updateJob(jobId, { step: 'hashing', progress: 30, message: 'Transcribing audio track...' });

        const transcription = await transcribeVideoAudio(audioPath, jobId);
        chunks = transcription.chunks;
        transcriptionLanguage = transcription.language;
        summary = await summarizeVideoTranscript(transcription.text, chunks);
        audioObjectName = buildObjectName(request.caseId, evidenceId, jobId, 'audio.wav');

        const audioBuffer = await readFile(audioPath);
        await uploadFile(artifactsBucket, audioObjectName, audioBuffer, {
          'Content-Type': 'audio/wav',
          'x-evidence-id': evidenceId,
          'x-case-id': request.caseId,
          'x-modality': 'audio',
        });
      } catch (audioErr) {
        console.warn('[VideoIngest] Audio extraction or transcription skipped:', audioErr);
        summary.summary = 'Video audio track unreadable or absent; visual analysis proceeding.';
      }
    } else {
      updateJob(jobId, { step: 'hashing', progress: 30, message: 'Skipping audio transcription (no audio stream found)...' });
    }

    // Extract keyframes at 1 fps (50 frames for a 50s video) up to 60 frames
    updateJob(jobId, { step: 'storing', progress: 45, message: 'Extracting video keyframes at 1 fps with image analysis...' });
    let frameList: Array<{ timestamp: number; framePath: string; description: string; objects: string[]; tags: string[]; confidence: number }> = [];
    try {
      const vision = new VisionService();
      const extracted = await vision.extractFrames(originalBuffer, { fps: 1, maxFrames: 60 });
      let yoloService: any = null;
      try {
        const { YOLOService } = await import('$lib/server/yolo.js');
        yoloService = new YOLOService({ confidence: 0.4 });
      } catch {
        yoloService = null;
      }

      for (let idx = 0; idx < extracted.length; idx += 1) {
        const f = extracted[idx];
        const frameSec = f.timestampMs / 1000;
        const frameObjectName = buildObjectName(request.caseId, evidenceId, jobId, `frame_${idx.toString().padStart(4, '0')}.jpg`);
        await uploadFile(artifactsBucket, frameObjectName, f.buffer, {
          'Content-Type': 'image/jpeg',
          'x-evidence-id': evidenceId,
          'x-case-id': request.caseId,
          'x-modality': 'video_frame',
        });
        const frameUri = storageUri(artifactsBucket, frameObjectName);

        let detectedObjects: string[] = [];
        let detectedTags: string[] = ['keyframe', 'surveillance'];
        let description = `Video keyframe ${idx + 1} at ${frameSec.toFixed(1)}s`;

        if (yoloService && idx < 12 && f.buffer && f.buffer.length > 0) {
          try {
            const yoloRes = await yoloService.analyzeDocument(f.buffer, `frame_${idx}.jpg`);
            if (yoloRes?.objects?.length) {
              detectedObjects = Array.from(new Set(yoloRes.objects.map((o: any) => o.class)));
              detectedTags = Array.from(new Set([...detectedTags, ...detectedObjects.slice(0, 4)]));
              description = `Keyframe ${idx + 1} at ${frameSec.toFixed(1)}s: detected ${detectedObjects.join(', ')}`;
            }
          } catch (yoloErr) {
            console.debug('[VideoIngest] YOLO frame inference skipped:', yoloErr);
          }
        }

        frameList.push({
          timestamp: frameSec,
          framePath: frameUri,
          description,
          objects: detectedObjects,
          tags: detectedTags,
          confidence: 1.0,
        });
      }

      if (frameList.length > 0) {
        const frameInsertRows = frameList.map((f) => ({
          evidenceId,
          timestampMs: Math.round(f.timestamp * 1000),
          storageUri: f.framePath,
          caption: f.description,
          objectsJson: f.objects,
          tagsJson: f.tags,
          confidence: f.confidence.toFixed(3),
        }));
        await db.insert(evidenceFrames).values(frameInsertRows as never);
      }
    } catch (frameErr) {
      console.warn('[VideoIngest] Keyframe extraction failed:', frameErr);
      throw frameErr;
    }

    updateJob(jobId, { step: 'db-insert', progress: 55, message: 'Persisting transcript segments...' });

    const transcriptRows = chunks.map((chunk, index) => ({
      evidenceId,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      text: chunk.text,
      language: chunk.language ?? transcriptionLanguage,
      translatedText: chunk.translatedText ?? null,
      confidence: chunk.confidence,
      model: chunk.model,
      metadataJson: {
        chunkIndex: index,
        trustTier: 'transcript_candidate',
        source_revision: sourceRevision,
        sourceUri: uploadedOriginalUri,
        audioUri: audioObjectName ? storageUri(artifactsBucket, audioObjectName) : storageUri(artifactsBucket, 'placeholder.wav'),
      },
    }));

    const mediaAssetRows: Array<{
      evidenceId: string;
      assetType: string;
      storageUri: string;
      mimeType: string;
      metadataJson: Record<string, unknown>;
    }> = [
      {
        evidenceId,
        assetType: 'original',
        storageUri: uploadedOriginalUri,
        mimeType: uploadSource.mimeType,
        metadataJson: {
          sourceUrl: request.sourceUrl ?? null,
          checksum,
        },
      }
    ];

    if (audioObjectName && transcriptionLanguage) {
      mediaAssetRows.push({
        evidenceId,
        assetType: 'audio_mono',
        storageUri: storageUri(artifactsBucket, audioObjectName),
        mimeType: 'audio/wav',
        metadataJson: {
          source: 'ffmpeg',
          language: transcriptionLanguage,
        },
      });
    }

    await db.insert(evidenceMediaAssets).values(mediaAssetRows as never);

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

    updateJob(jobId, {
      step: 'embedding',
      progress: 80,
      message: 'Saving transcript; vector indexing awaits the canonical PostgreSQL lane...',
    });

    // This legacy media ledger has no canonical multimodal vector owner. Do not
    // publish directly to Qdrant; indexing remains deferred until media identity
    // is reconciled with public.evidence and its PostgreSQL outbox.
    const searchIndexStatus: VideoIngestResult['searchIndexStatus'] = chunks.length > 0
      ? 'deferred'
      : 'not_applicable';
    const searchIndexError = chunks.length > 0
      ? 'CANONICAL_MULTIMODAL_VECTOR_OWNER_NOT_WIRED'
      : null;

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
          frameAnalysis: frameList,
          frameCount: frameList.length,
          operatorApproved: Boolean(request.operatorApproved),
          sourceMetadata,
          processingStatus: searchIndexStatus === 'failed'
            ? 'complete_with_search_index_error'
            : searchIndexStatus === 'deferred'
              ? 'complete_with_search_index_deferred'
              : 'complete',
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
        errorText: searchIndexStatus === 'failed' ? searchIndexError : null,
      })
      .where(eq(evidenceProcessingJobs.id, jobId));

    updateJob(jobId, {
      step: 'complete',
      progress: 100,
      message: searchIndexStatus === 'failed'
        ? 'Video analysis complete; transcript search indexing failed.'
        : searchIndexStatus === 'deferred'
          ? 'Video analysis complete; transcript indexing is pending the canonical PostgreSQL lane.'
          : 'Video ingestion complete.',
      ...(searchIndexStatus === 'failed' && searchIndexError ? { error: searchIndexError } : {}),
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
      language: transcriptionLanguage,
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

    if (admittedEvidenceId) {
      await db
        .update(evidenceItems)
        .set({ status: 'failed' })
        .where(eq(evidenceItems.id, admittedEvidenceId))
        .catch(() => {});
    }

    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    if (sourceCleanupDir) {
      await rm(sourceCleanupDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
