
import type { RequestHandler } from './$types';

// ======================================================================
// ENHANCED AI PROCESSING API ENDPOINT
// Integrating XState workflows with multi-model AI pipeline
// ======================================================================

import { json } from "@sveltejs/kit";

// Import AI services
export interface ProcessingPipeline {
  evidenceId: string;
  stages: {
    embedding: { status: string; result?: unknown; error?: string };
    tagging: { status: string; result?: unknown; error?: string };
    analysis: { status: string; result?: unknown; error?: string };
    vectorSearch: { status: string; result?: unknown; error?: string };
    graphDiscovery: { status: string; result?: unknown; error?: string };
  };
  overallStatus: "pending" | "processing" | "complete" | "error";
  startTime: Date;
  endTime?: Date;
  processingTime?: number;
}

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const body = await request.json();
    const { evidence, options = {} } = body;

    if (!evidence?.id || !evidence?.content) {
      return json({ error: "Invalid evidence data" }, { status: 400 });
    }

    // Initialize processing pipeline
    const pipeline: ProcessingPipeline = {
      evidenceId: evidence.id,
      stages: {
        embedding: { status: "pending" },
        tagging: { status: "pending" },
        analysis: { status: "pending" },
        vectorSearch: { status: "pending" },
        graphDiscovery: { status: "pending" },
      },
      overallStatus: "processing",
      startTime: new Date(),
    };

    // Stage 1: Generate Embeddings
    try {
      pipeline.stages.embedding.status = "processing";

      const embeddingResponse = await fetch("/api/ai/embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: evidence.content,
          model: options.embeddingModel || "nomic-embed-text",
        }),
      });

      const embeddingResult = await embeddingResponse.json();
      pipeline.stages.embedding.status = "complete";
      pipeline.stages.embedding.result = embeddingResult;
    } catch (error: any) {
      pipeline.stages.embedding.status = "error";
      pipeline.stages.embedding.error = error.message;
    }

    // Stage 2: AI Tagging (parallel with analysis)
    const taggingPromise = (async () => {
      try {
        pipeline.stages.tagging.status = "processing";

        const taggingResponse = await fetch("/api/ai/tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evidence,
            context: "legal_investigation",
            enhance_tags: true,
            model: options.taggingModel || "gemma3-legal",
          }),
        });

        const taggingResult = await taggingResponse.json();
        pipeline.stages.tagging.status = "complete";
        pipeline.stages.tagging.result = taggingResult;

        return taggingResult;
      } catch (error: any) {
        pipeline.stages.tagging.status = "error";
        pipeline.stages.tagging.error = error.message;
        return null;
      }
    })();

    // Stage 3: Deep AI Analysis (parallel with tagging)
    const analysisPromise = (async () => {
      try {
        pipeline.stages.analysis.status = "processing";

        const analysisResponse = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evidence,
            analysisType: "comprehensive",
            model: options.analysisModel || "gemma3-legal",
            includeRecommendations: true,
          }),
        });

        const analysisResult = await analysisResponse.json();
        pipeline.stages.analysis.status = "complete";
        pipeline.stages.analysis.result = analysisResult;

        return analysisResult;
      } catch (error: any) {
        pipeline.stages.analysis.status = "error";
        pipeline.stages.analysis.error = error.message;
        return null;
      }
    })();

    // Wait for parallel processing to complete
    const [taggingResult, analysisResult] = await Promise.all([
      taggingPromise,
      analysisPromise,
    ]);

    // Stage 4: Vector Similarity Search
    let vectorMatches = [];
    if (pipeline.stages.embedding.status === "complete") {
      try {
        pipeline.stages.vectorSearch.status = "processing";

        const embeddings =
          pipeline.stages.embedding.result.embeddings ||
          pipeline.stages.embedding.result.vector;

        const searchResponse = await fetch("/api/vector/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vector: embeddings,
            limit: options.vectorSearchLimit || 10,
            threshold: options.similarityThreshold || 0.7,
            excludeIds: [evidence.id], // Don't match with itself
          }),
        });

        const searchResult = await searchResponse.json();
        vectorMatches = searchResult.matches || [];

        pipeline.stages.vectorSearch.status = "complete";
        pipeline.stages.vectorSearch.result = { matches: vectorMatches };
      } catch (error: any) {
        pipeline.stages.vectorSearch.status = "error";
        pipeline.stages.vectorSearch.error = error.message;
      }
    }

    // Stage 5: Graph Relationship Discovery
    let relationships = [];
    try {
      pipeline.stages.graphDiscovery.status = "processing";

      const graphResponse = await fetch(`/api/graph/discover/${evidence.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: evidence.content,
          tags: taggingResult?.tags || [],
          depth: options.graphDepth || 2,
          relationshipTypes: [
            "references",
            "involves",
            "located_at",
            "connected_to",
            "similar_to",
          ],
        }),
      });

      const graphResult = await graphResponse.json();
      relationships = graphResult.relationships || [];

      pipeline.stages.graphDiscovery.status = "complete";
      pipeline.stages.graphDiscovery.result = { relationships };
    } catch (error: any) {
      pipeline.stages.graphDiscovery.status = "error";
      pipeline.stages.graphDiscovery.error = error.message;
    }

    // Finalize pipeline
    pipeline.endTime = new Date();
    pipeline.processingTime =
      pipeline.endTime.getTime() - pipeline.startTime.getTime();

    const hasErrors = Object.values(pipeline.stages).some(
      (stage) => stage.status === "error",
    );
    pipeline.overallStatus = hasErrors ? "error" : "complete";

    // Return comprehensive results
    return json({
      success: true,
      evidenceId: evidence.id,
      pipeline,
      results: {
        embeddings:
          pipeline.stages.embedding.result?.embeddings ||
          pipeline.stages.embedding.result?.vector,
        tags: taggingResult?.tags || [],
        analysis: analysisResult,
        vectorMatches,
        relationships,
        recommendations:
          analysisResult?.recommendations ||
          analysisResult?.suggestedActions ||
          [],
      },
      performance: {
        processingTime: pipeline.processingTime,
        totalStages: Object.keys(pipeline.stages).length,
        successfulStages: Object.values(pipeline.stages).filter(
          (s) => s.status === "complete",
        ).length,
      },
    });
  } catch (error: any) {
    console.error("Evidence processing failed:", error);
    return json(
      {
        error: "Processing failed",
        details: error.message,
      },
      { status: 500 },
    );
  }
};
