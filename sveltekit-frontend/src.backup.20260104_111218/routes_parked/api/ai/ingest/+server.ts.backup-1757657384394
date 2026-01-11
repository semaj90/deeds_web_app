import { json } from "@sveltejs/kit";
import type { RequestHandler } from './$types';


export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const documentType = formData.get("documentType") as string;
    const practiceArea = formData.get("practiceArea") as string;
    const jurisdiction = formData.get("jurisdiction") as string;
    const caseId = formData.get("caseId") as string;
    const userId = formData.get("userId") as string;

    if (!file) {
      return json({ error: "File is required" }, { status: 400 });
    }

    // Read file content
    const content = await file.text();

    if (!content.trim()) {
      return json({ error: "File content is empty" }, { status: 400 });
    }

    // Initialize AI pipeline
    await aiPipeline.initialize();

    // Process document with full AI pipeline
    const result = await aiPipeline.ingestLegalDocument(content, {
      title: title || file.name,
      documentType: documentType || "unknown",
      practiceArea,
      jurisdiction: jurisdiction || "federal",
      caseId,
      userId,
      fileSize: file.size,
    });

    return json({
      success: true,
      documentId: result.documentId,
      embeddingId: result.embeddingId,
      analysis: result.analysis,
      processingTime: result.processingTime,
      timestamp: new Date().toISOString(),
      metadata: {
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
    });
  } catch (error: any) {
    console.error("Document ingestion error:", error);
    return json(
      {
        error: "Document ingestion failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};

// Get ingestion statistics
export const GET: RequestHandler = async () => {
  try {
    await aiPipeline.initialize();
    const stats = await aiPipeline.getEmbeddingStats();

    return json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Ingestion stats error:", error);
    return json(
      {
        error: "Failed to get statistics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};
