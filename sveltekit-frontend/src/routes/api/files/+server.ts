import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db/client.js";
import { uploadedFiles } from "$lib/server/db/schema.js";
import { desc } from "drizzle-orm";
import { putFileToSeaweed, seaweedBucket } from "$lib/server/storage/seaweed.js";
import crypto from "node:crypto";
import { createUploadedFile } from "$lib/server/files/upload-file-service.js";
import { ENV } from "$lib/server/env.server.js";
import { z } from "zod";

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const FileUploadSchema = z.object({
  name: z.string().min(1, 'File name is required').max(255, 'File name too long'),
  type: z.string().refine(
    (t) => ALLOWED_MIME_TYPES.includes(t),
    { message: 'File type not allowed' },
  ),
  size: z.number()
    .min(1, 'Empty files not allowed')
    .max(MAX_UPLOAD_BYTES, `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`),
});

/**
 * GET /api/files
 * List recent file uploads.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
    return json({ files: [], error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select()
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.createdAt))
      .limit(100);

    return json({ files: rows });
  } catch (err) {
    console.error("Failed to list files:", err);
    return json({ files: [], error: (err as Error).message }, { status: 500 });
  }
};

/**
 * POST /api/files
 * Handle multipart/form-data upload to SeaweedFS + metadata to Postgres.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return json({ error: "Missing file field" }, { status: 400 });
    }

    const parsed = FileUploadSchema.safeParse({ name: file.name, type: file.type, size: file.size });
    if (!parsed.success) {
      return json({ error: "Invalid file", issues: parsed.error.flatten() }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Sanitize filename
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const objectKey = `uploads/${crypto.randomUUID()}-${safeName}`;

    const result = await createUploadedFile({
      file,
      bytes,
      objectKey,
      bucket: seaweedBucket,
      storageBackend: "seaweed",
      upload: async ({ objectKey, bytes, contentType }) => {
        await putFileToSeaweed({
          objectKey,
          bytes,
          contentType
        });
      },
      metadata: {
        source: "sveltekit-dev",
        uploadedVia: "bits-ui-modal"
      }
    });

    const row = result.file;
    if (!row) {
      throw error(500, "File record missing after upload");
    }

    // 3. Trigger PDF OCR Workflow (Fail-Open)
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const { registerPdfOcrWorkflowRun } = await import("$lib/server/workflows/pdf-ocr-workflow.js");
      await registerPdfOcrWorkflowRun({
        workflowRunId: `ocr-${row.id}`,
        evidenceId: row.id,
        fileName: file.name,
        mimeType: file.type || "application/pdf"
      }).catch(err => console.warn("[Workflow] Failed to register OCR run:", err));
    }

    return json({ file: row }, { status: 201 });
  } catch (err) {
    console.error("Upload failed:", err);
    return json({ error: (err as Error).message }, { status: 500 });
  }
};
