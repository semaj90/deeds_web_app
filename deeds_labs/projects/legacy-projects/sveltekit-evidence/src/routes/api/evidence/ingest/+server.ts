/**
 * Evidence Ingestion API - Handles file uploads and processing
 * POST /api/evidence/ingest - Integrates with QUIC/HTTP3 AI pipeline
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/db";
import { evidence, timeline } from "$lib/db/schema";
import { quicClient } from "$lib/services/quicClient";
import { eq } from "drizzle-orm";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const caseId = formData.get("caseId") as string;
    const uploadedBy = formData.get("uploadedBy") as string;

    if (!formData.has("file")) {
      return json({ error: "No file provided" }, { status: 400 });
    }

    if (!caseId || !uploadedBy) {
      return json({ error: "Case ID and User ID are required" }, { status: 400 });
    }

    // Forward the file to the FastAPI backend for processing
    // The Caddy reverse proxy will route this to fastapi-rag:8005
    const fastApiUrl = `${quicClient.config.quicServerUrl}/api/evidence/ingest`;

    const response = await fetch(fastApiUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("FastAPI ingestion failed:", errorBody);
      return json(
        { error: `Ingestion service failed: ${response.statusText}` },
        { status: response.status },
      );
    }

    const ingestionResult = await response.json();

    // Save the processed evidence metadata to the database
    const [newEvidence] = await db
      .insert(evidence)
      .values({
        caseId,
        uploadedBy,
        filename: ingestionResult.filename,
        originalName: ingestionResult.originalName,
        type: ingestionResult.type,
        mimeType: ingestionResult.mimeType,
        fileSize: ingestionResult.fileSize,
        filePath: ingestionResult.filePath,
        minioUrl: ingestionResult.minioUrl,
        metadata: {
          checksum: ingestionResult.checksum,
          extractedText: ingestionResult.extractedText,
        },
        // embeddings will be added by a separate worker
      })
      .returning();

    // Create a timeline event for the new evidence
    await db.insert(timeline).values({
      caseId,
      createdBy: uploadedBy,
      type: "evidence_added",
      title: "Evidence Added",
      description: `New evidence "${newEvidence.originalName}" was uploaded.`,
      relatedItemId: newEvidence.id,
    });

    return json(newEvidence, { status: 201 });
  } catch (error) {
    console.error("Evidence upload error:", error);
    return json(
      { error: "Upload failed: " + (error as Error).message },
      { status: 500 },
    );
  }
};

// GET endpoint for retrieving evidence
export const GET: RequestHandler = async ({ url }) => {
  const caseId = url.searchParams.get("caseId");

  if (!caseId) {
    return json({ error: "Case ID required" }, { status: 400 });
  }

  try {
    const evidenceList = await db
      .select()
      .from(evidence)
      .where(eq(evidence.caseId, caseId))
      .orderBy(evidence.uploadedAt);

    return json(evidenceList);
  } catch (error) {
    console.error("Evidence fetch error:", error);
    return json({ error: "Failed to fetch evidence" }, { status: 500 });
  }
};
