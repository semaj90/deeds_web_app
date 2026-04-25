import { json } from "@sveltejs/kit";
import { neo4jService } from "$lib/server/neo4j-service.js";
import { workerManager } from "$lib/workers/worker-manager.js";
import { eventStreamingService } from "$lib/server/event-streaming.js";

/**
 * Phase 4: Integration API endpoint
 * Coordinates all Phase 4 services: Neo4j, Workers, and Event Streaming
 */

export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action, data, options = {} } = await request.json();

    let result;

    switch (action) {
      case "process_document":
        result = await processDocument(data, options);
        break;

      case "analyze_case":
        result = await analyzeCase(data, options);
        break;

      case "create_graph_relationship":
        result = await createGraphRelationship(data, options);
        break;

      case "stream_data":
        result = await streamData(data, options);
        break;

      case "batch_process":
        result = await batchProcess(data, options);
        break;

      case "health_check":
        result = await performHealthCheck();
        break;

      default:
        return json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return json({
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Phase 4 Integration API error:", error);
    return json(
      {
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Process document through complete Phase 4 pipeline
 */
async function processDocument(documentData, options) {
  console.log("📄 Processing document through Phase 4 pipeline...");

  // Step 1: Chunk the document using worker
  const chunkingResult = await workerManager.processDocumentChunks(
    documentData
  );

  // Step 2: Generate embeddings for chunks
  const texts = chunkingResult.chunks.map((chunk) => chunk.content);
  const embeddingResult = await workerManager.generateEmbeddings(texts);

  // Step 3: Queue for background processing
  const jobId = await eventStreamingService.queueDocumentProcessing({
    documentId: documentData.id,
    chunks: chunkingResult.chunks,
    embeddings: embeddingResult.embeddings,
    metadata: documentData.metadata,
  });

  // Step 4: Create graph relationships if entities present
  const graphResults = [];
  if (documentData.entities) {
    for (const entity of documentData.entities) {
      const graphNode = await neo4jService.createEvidence({
        id: `doc_${documentData.id}_${entity.id}`,
        type: entity.type,
        description: entity.description,
        chain_of_custody: documentData.chain_of_custody,
        collected_date: documentData.created_at,
        collected_by: documentData.uploaded_by,
      });
      graphResults.push(graphNode);
    }
  }

  return {
    document: {
      id: documentData.id,
      filename: documentData.filename,
      status: "processed",
    },
    chunks: {
      count: chunkingResult.chunks.length,
      totalSize: chunkingResult.chunks.reduce((sum, c) => sum + c.size, 0),
    },
    embeddings: {
      count: embeddingResult.embeddings.length,
      model: embeddingResult.stats?.model || "unknown",
    },
    backgroundJob: {
      jobId,
      status: "queued",
    },
    graphNodes: {
      count: graphResults.length,
      created: graphResults.length > 0,
    },
    pipeline: "phase4_complete",
  };
}

/**
 * Analyze case using all Phase 4 services
 */
async function analyzeCase(caseData, options) {
  console.log(`⚖️ Analyzing case ${caseData.id} with Phase 4 services...`);

  // Step 1: Perform AI analysis using analysis worker
  const analysisResult = await workerManager.analyzeCaseData(caseData);

  // Step 2: Get graph-based insights
  const networkAnalysis = await neo4jService.getCaseNetworkAnalysis(
    caseData.id
  );
  const connectedCases = await neo4jService.findConnectedCases(caseData.id);

  // Step 3: Queue comprehensive case analysis
  const analysisJobId = await eventStreamingService.queueCaseAnalysis({
    caseId: caseData.id,
    analysisType: "comprehensive",
    parameters: {
      includePattern: true,
      includeStrength: true,
      includeRecommendations: true,
      ...options,
    },
  });

  // Step 4: Stream results if requested
  let streamingResult = null;
  if (options.enableStreaming) {
    streamingResult = await workerManager.processStream({
      type: "case_analysis",
      content: analysisResult,
      metadata: { caseId: caseData.id },
    });
  }

  return {
    caseId: caseData.id,
    analysis: analysisResult,
    network: networkAnalysis,
    connectedCases: {
      count: connectedCases?.length || 0,
      cases: connectedCases?.slice(0, 5) || [], // Top 5 most connected
    },
    backgroundAnalysis: {
      jobId: analysisJobId,
      status: "queued",
    },
    streaming: streamingResult
      ? {
          streamId: streamingResult.streamId,
          enabled: true,
        }
      : { enabled: false },
    completedAt: new Date().toISOString(),
  };
}

/**
 * Create graph relationship
 */
async function createGraphRelationship(relationshipData, options) {
  const { fromId, fromType, toId, toType, relationshipType, properties } =
    relationshipData;

  const relationship = await neo4jService.createRelationship(
    fromId,
    fromType,
    toId,
    toType,
    relationshipType,
    properties
  );

  return {
    relationship,
    created: true,
    type: relationshipType,
    nodes: { from: `${fromType}:${fromId}`, to: `${toType}:${toId}` },
  };
}

/**
 * Stream data using streaming worker
 */
async function streamData(streamData, options) {
  const streamingResult = await workerManager.processStream(streamData);

  return {
    streamId: streamingResult.streamId,
    type: streamData.type,
    ready: true,
    metadata: streamingResult.metadata,
  };
}

/**
 * Process multiple items in batch
 */
async function batchProcess(batchData, options) {
  const { operation, items } = batchData;
  const results = [];

  switch (operation) {
    case "analyze_multiple_cases":
      for (const caseData of items) {
        const result = await analyzeCase(caseData, options);
        results.push({ caseId: caseData.id, result });
      }
      break;

    case "process_multiple_documents":
      for (const docData of items) {
        const result = await processDocument(docData, options);
        results.push({ documentId: docData.id, result });
      }
      break;

    case "create_multiple_relationships":
      for (const relData of items) {
        const result = await createGraphRelationship(relData, options);
        results.push({ relationship: relData.relationshipType, result });
      }
      break;

    default:
      throw new Error(`Unknown batch operation: ${operation}`);
  }

  return {
    operation,
    totalItems: items.length,
    processed: results.length,
    results,
  };
}

/**
 * Perform comprehensive health check
 */
async function performHealthCheck() {
  const [neo4jHealth, workerHealth, eventStreamingHealth] = await Promise.all([
    neo4jService
      .healthCheck()
      .catch((err) => ({ status: "unhealthy", error: err.message })),
    workerManager
      .healthCheck()
      .catch((err) => ({ status: "unhealthy", error: err.message })),
    eventStreamingService
      .healthCheck()
      .catch((err) => ({ status: "unhealthy", error: err.message })),
  ]);

  const allHealthy = [neo4jHealth, workerHealth, eventStreamingHealth].every(
    (health) => health.status === "healthy"
  );

  return {
    overall: allHealthy ? "healthy" : "degraded",
    services: {
      neo4j: neo4jHealth,
      workers: workerHealth,
      eventStreaming: eventStreamingHealth,
    },
    phase4: {
      status: allHealthy ? "operational" : "partial",
      components: {
        graph_database: neo4jHealth.status,
        service_workers: workerHealth.status,
        event_streaming: eventStreamingHealth.status,
      },
    },
    timestamp: new Date().toISOString(),
  };
}
