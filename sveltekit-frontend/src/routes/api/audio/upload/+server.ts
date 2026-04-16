/**
 * POST /api/audio/upload
 *
 * Uploads audio file and publishes to RabbitMQ audio.process queue
 * Returns evidence ID for SSE progress tracking
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed';
import { getRedis } from '$lib/server/redis';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Auth check
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const caseId = formData.get('caseId') as string | null;

    if (!audioFile) {
      return json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/webm'];
    if (!allowedTypes.some(type => audioFile.type.startsWith(type.split('/')[0]))) {
      return json({ error: 'Invalid audio file type' }, { status: 400 });
    }

    // Validate file size (max 100MB)
    if (audioFile.size > 100 * 1024 * 1024) {
      return json({ error: 'File too large (max 100MB)' }, { status: 400 });
    }

    // Create evidence record
    const evidenceId = crypto.randomUUID();
    const fileName = audioFile.name;
    const fileSize = audioFile.size;

    // Save file to temp directory
    const tempDir = join(process.cwd(), 'uploads', 'audio');
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    const filePath = join(tempDir, `${evidenceId}_${fileName}`);
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    await writeFile(filePath, buffer);

    // Insert evidence record
    const [evidenceRecord] = await db.insert(evidence).values({
      id: evidenceId,
      caseId: caseId || null,
      userId: locals.user.id,
      title: fileName,
      fileName,
      filePath,
      fileSize,
      mimeType: audioFile.type,
      evidenceType: 'audio',
      metadata: {
        processingStatus: 'queued',
        uploadedBy: locals.user.id,
        uploadedAt: new Date().toISOString()
      }
    }).returning();

    // Initialize Redis status tracking
    const redis = getRedis();
    await redis.set(
      `audio:status:${evidenceId}`,
      JSON.stringify({
        stage: 'upload',
        progress: 0,
        message: 'Queued for processing',
        timestamp: Date.now()
      }),
      'EX',
      3600 // 1 hour TTL
    );

    // Publish to RabbitMQ audio.process queue
    await rabbitmq.publishWhenReady('audio.processing', 'audio.process', {
      evidenceId,
      filePath,
      fileName,
      caseId,
      userId: locals.user.id,
      timestamp: Date.now()
    });

    return json({
      success: true,
      evidenceId,
      message: 'Audio file uploaded and queued for processing'
    });
  } catch (err) {
    console.error('Audio upload error:', err);
    return json({ error: 'Audio upload failed' }, { status: 500 });
  }
};