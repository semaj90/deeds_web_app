import { db } from '../../db/drizzle.js';
import { evidences } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getPresignedUrl, uploadFile } from '../../storage/minio.js';
import { publishJob } from '../../mq/producer.js';
import { QUEUES } from '../../mq/connect.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const evidenceResolvers = {
  Query: {
    evidence: async (_: any, { id }: { id: string }) => {
      const [evidence] = await db.select().from(evidences).where(eq(evidences.id, id));
      return evidence || null;
    },

    evidences: async (_: any, { caseId, status, limit = 50, offset = 0 }: any) => {
      let query = db.select().from(evidences);

      if (caseId) {
        query = query.where(eq(evidences.caseId, caseId)) as any;
      }

      if (status) {
        query = query.where(eq(evidences.status, status)) as any;
      }

      const results = await query.limit(limit).offset(offset).orderBy(desc(evidences.createdAt));
      return results;
    },
  },

  Mutation: {
    createEvidence: async (_: any, { input }: any) => {
      const [newEvidence] = await db.insert(evidences).values({
        caseId: input.caseId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        storagePath: input.storagePath,
        metadata: input.metadata || {},
        status: 'pending',
      }).returning();

      // Trigger OCR pipeline
      await publishJob(QUEUES.OCR, { evidenceId: newEvidence.id });

      return newEvidence;
    },

    uploadEvidence: async (_: any, { caseId, file }: any) => {
      const { createReadStream, filename, mimetype } = await file;

      // Save to temp location
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-'));
      const tempFile = path.join(tempDir, filename);

      const stream = createReadStream();
      const writeStream = fs.createWriteStream(tempFile);

      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const stat = fs.statSync(tempFile);

      // Upload to MinIO
      const evidenceId = uuidv4();
      const storagePath = `${caseId}/${evidenceId}/${filename}`;
      await uploadFile(tempFile, storagePath, { 'Content-Type': mimetype });

      // Clean up temp file
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Create evidence record
      const [newEvidence] = await db.insert(evidences).values({
        id: evidenceId,
        caseId,
        fileName: filename,
        fileSize: stat.size,
        mimeType: mimetype,
        storagePath,
        status: 'pending',
      }).returning();

      // Trigger OCR pipeline
      await publishJob(QUEUES.OCR, { evidenceId: newEvidence.id });

      return newEvidence;
    },
  },

  Evidence: {
    entities: (parent: any) => parent.entities || [],
    forensicFlags: (parent: any) => parent.forensicFlags || [],
    presignedUrl: async (parent: any) => {
      try {
        return await getPresignedUrl(parent.storagePath);
      } catch {
        return null;
      }
    },
  },
};
