import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema, ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpTools } from '../mcp/index.js';

const server = new Server(
  {
    name: "deeds-legal-server",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {},
    },
  }
);

/**
 * Setup tool handlers for MCP server
 */
function setupToolHandlers() {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "cases:load",
        description: "Load legal cases with optional filtering",
        inputSchema: { type: "object",
          properties: { userId: { type: "string" },
            limit: { type: "number" },
            query: { type: "string" },
          },
        },
      },
      {
        name: "rag:search",
        description: "Perform a semantic search across legal documents and web",
        inputSchema: { type: "object",
          properties: { query: { type: "string" },
            topK: { type: "number" },
          },
          required: ["query"],
        },
      },
      {
        name: "rag:index_page",
        description: "Index a web page for RAG knowledge",
        inputSchema: { type: "object",
          properties: { url: { type: "string" },
          },
          required: ["url"],
        },
      },
      {
        name: "playwright:browser_action",
        description: "Execute a browser action using Playwright",
        inputSchema: { type: "object",
          properties: { action: { type: "enum", enum: ["goto", "click", "fill", "screenshot"] },
            url: { type: "string" },
            selector: { type: "string" },
            value: { type: "string" },
          },
          required: ["action"],
        },
      },
      {
        name: "transcribe_audio",
        description: "Transcribe audio evidence files (WAV, MP3, M4A) using Docling ASR. Returns transcript text with word count and duration.",
        inputSchema: { type: "object",
          properties: {
            evidenceId: { type: "string", description: "Evidence record ID in PostgreSQL" },
            audioUrl: { type: "string", description: "MinIO object key or URL for the audio file" },
          },
          required: ["evidenceId", "audioUrl"],
        },
      },
      {
        name: "evidence:analyze",
        description: "Analyze evidence text: extract entities, detect forensic patterns, auto-tag with 3-store mirroring (pgvector + Qdrant + CouchDB)",
        inputSchema: { type: "object",
          properties: {
            evidenceId: { type: "string", description: "Evidence record ID" },
            text: { type: "string", description: "Evidence text content (max 50000 chars)" },
            evidenceType: { type: "string", description: "Evidence type classification" },
          },
          required: ["evidenceId", "text"],
        },
      },
      {
        name: "evidence:analyze_multimodal",
        description: "GPU-accelerated multimodal evidence analysis (images/videos/audio): YOLO object detection, Whisper transcription, CLIP embeddings. Returns detected objects, transcript, and 512-dim embeddings for semantic search.",
        inputSchema: { type: "object",
          properties: {
            evidenceId: { type: "string", description: "Evidence record ID in PostgreSQL" },
            fileUrl: { type: "string", description: "MinIO object key or URL for evidence file" },
            evidenceType: { type: "string", enum: ["image", "video", "audio"], description: "Evidence file type" },
            analyzeVision: { type: "boolean", description: "Run YOLO object detection (images/videos)", default: true },
            analyzeAudio: { type: "boolean", description: "Run Whisper transcription (audio/videos)", default: true },
            extractEmbeddings: { type: "boolean", description: "Extract CLIP/Whisper embeddings for search", default: true },
          },
          required: ["evidenceId", "fileUrl", "evidenceType"],
        },
      },
      {
        name: "evidence:detect_objects",
        description: "Detect objects in image evidence using YOLOv8 (GPU). Returns bounding boxes, class names, confidence scores for 80 COCO classes (person, weapon, vehicle, etc).",
        inputSchema: { type: "object",
          properties: {
            evidenceId: { type: "string", description: "Evidence record ID" },
            imageUrl: { type: "string", description: "MinIO object key or URL for image" },
            confidenceThreshold: { type: "number", description: "Min detection confidence (0.0-1.0)", default: 0.5 },
          },
          required: ["evidenceId", "imageUrl"],
        },
      },
      {
        name: "evidence:transcribe_gpu",
        description: "GPU-accelerated audio/video transcription using Whisper. Faster than browser WASM for long recordings (>10s). Returns full transcript with word-level timestamps and language detection.",
        inputSchema: { type: "object",
          properties: {
            evidenceId: { type: "string", description: "Evidence record ID" },
            audioUrl: { type: "string", description: "MinIO object key or URL for audio/video file" },
            language: { type: "string", description: "Language code (en, es, etc) or null for auto-detect" },
            wordTimestamps: { type: "boolean", description: "Enable word-level timestamps", default: false },
          },
          required: ["evidenceId", "audioUrl"],
        },
      },
      {
        name: "evidence:search_similar",
        description: "Cross-modal semantic search: find visually or acoustically similar evidence using CLIP/Whisper embeddings. Query with text, find matching images/audio.",
        inputSchema: { type: "object",
          properties: {
            query: { type: "string", description: "Text search query (e.g., 'person with weapon')" },
            modalities: { type: "array", items: { type: "string", enum: ["vision", "audio"] }, description: "Modalities to search", default: ["vision", "audio"] },
            topK: { type: "number", description: "Number of results to return", default: 10 },
          },
          required: ["query"],
        },
      },
      {
        name: "reports:list",
        description: "List reports with optional case filtering. Returns report metadata including title, status, creation date.",
        inputSchema: { type: "object",
          properties: {
            caseId: { type: "string", description: "Filter reports by case ID" },
            limit: { type: "number", description: "Maximum number of reports to return", default: 20 },
            offset: { type: "number", description: "Pagination offset", default: 0 },
          },
        },
      },
      {
        name: "reports:create",
        description: "Create a new blank report for a case. Returns report ID and metadata.",
        inputSchema: { type: "object",
          properties: {
            caseId: { type: "string", description: "Case ID to associate report with" },
            title: { type: "string", description: "Report title", default: "Untitled Report" },
            contentHtml: { type: "string", description: "Initial HTML content", default: "<p>Start writing...</p>" },
            status: { type: "string", enum: ["draft", "in_review", "finalized", "published"], description: "Report status", default: "draft" },
          },
          required: ["caseId"],
        },
      },
      {
        name: "reports:generate_from_template",
        description: "Generate a report from a legal template (charging memo, search warrant affidavit, case summary, evidence inventory, witness interview, plea agreement, motion to suppress, trial brief, sentencing memo, discovery index). Optionally use AI to fill in case-specific analysis.",
        inputSchema: { type: "object",
          properties: {
            templateType: { type: "string", enum: ["charging_memo", "search_warrant", "case_summary", "evidence_inventory", "witness_interview", "plea_agreement", "motion_suppress", "trial_brief", "sentencing_memo", "discovery_index"], description: "Template type to use" },
            caseId: { type: "string", description: "Case ID to generate report for" },
            customTitle: { type: "string", description: "Custom report title (overrides template default)" },
            useAI: { type: "boolean", description: "Use AI (Ollama gemma3-legal) to generate case-specific content", default: false },
          },
          required: ["templateType", "caseId"],
        },
      },
      {
        name: "reports:update",
        description: "Update an existing report's title, content, or status.",
        inputSchema: { type: "object",
          properties: {
            reportId: { type: "string", description: "Report ID to update" },
            title: { type: "string", description: "New report title" },
            contentHtml: { type: "string", description: "Updated HTML content" },
            status: { type: "string", enum: ["draft", "in_review", "finalized", "published"], description: "New report status" },
          },
          required: ["reportId"],
        },
      },
      {
        name: "reports:delete",
        description: "Delete a report. Audit log entry will be created for legal compliance.",
        inputSchema: { type: "object",
          properties: {
            reportId: { type: "string", description: "Report ID to delete" },
          },
          required: ["reportId"],
        },
      },
      {
        name: "reports:export",
        description: "Export a report to PDF, DOCX, or HTML format. Returns download URL.",
        inputSchema: { type: "object",
          properties: {
            reportId: { type: "string", description: "Report ID to export" },
            format: { type: "string", enum: ["pdf", "docx", "html"], description: "Export format", default: "pdf" },
          },
          required: ["reportId", "format"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "cases:load": {
          const result = await mcpTools.cases.loadCases(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "rag:search": {
          const { query, topK } = args as { query: string; topK?: number };
          const result = await mcpTools.rag.webSearch(query, { topK });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "rag:index_page": {
          const { url } = args as { url: string };
          const result = await mcpTools.rag.indexWebPage(url);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "playwright:browser_action": {
          const { action, url, selector, value } = args as any;
          // In a real implementation, this would call a playwright service
          const mockResult = {
            success: true,
            action,
            timestamp: new Date().toISOString(),
            id: Math.random().toString(36).substring(7)
          };
          return { content: [{ type: "text", text: JSON.stringify(mockResult) }] };
        }

        case "transcribe_audio": {
          const { evidenceId, audioUrl } = args as { evidenceId: string; audioUrl: string };
          const { transcribeAudio, isDoclingAvailable } = await import('../lib/server/docling.js');

          if (!(await isDoclingAvailable())) {
            return { content: [{ type: "text", text: JSON.stringify({ error: "Docling ASR unavailable — python/docling_analyze.py not found", evidenceId }) }], isError: true };
          }

          // Fetch audio from MinIO via minio npm client
          const { Client } = await import('minio');
          const minio = new Client({
            endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
          });
          const bucketName = process.env.MINIO_EVIDENCE_BUCKET || 'evidence';
          const chunks: Buffer[] = [];
          const stream = await minio.getObject(bucketName, audioUrl);
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          const audioBuffer = Buffer.concat(chunks);

          // Detect MIME from extension
          const ext = audioUrl.split('.').pop()?.toLowerCase() || '';
          const mimeMap: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' };
          const mimeType = mimeMap[ext] || 'audio/wav';

          const result = await transcribeAudio(audioBuffer, mimeType);
          const wordCount = result.fullText.split(/\s+/).filter(Boolean).length;

          return { content: [{ type: "text", text: JSON.stringify({
            evidenceId,
            transcript: result.fullText,
            wordCount,
            blocks: result.blocks,
            processingTimeMs: result.processingTimeMs,
          }) }] };
        }

        case "evidence:analyze": {
          const { evidenceId, text, evidenceType } = args as { evidenceId: string; text: string; evidenceType?: string };
          const { extractEntities } = await import('../lib/server/analysis/entity-extraction.js');
          const { detectForensicPatterns } = await import('../lib/server/analysis/forensics.js');
          const { autoTagDocument } = await import('../lib/server/ace/auto-tagger.js');

          const [entities, forensics, tags] = await Promise.all([
            extractEntities(text.slice(0, 50_000)).catch(() => []),
            Promise.resolve(detectForensicPatterns(text.slice(0, 50_000))),
            autoTagDocument({ documentId: evidenceId, text: text.slice(0, 15_000), maxTags: 20 }).catch(() => ({ tags: [], mirrored: 0 })),
          ]);

          return { content: [{ type: "text", text: JSON.stringify({
            evidenceId,
            entities: entities.length,
            forensicFlags: forensics.length,
            highSeverityFlags: forensics.filter((f: any) => f.severity === 'high').length,
            tags: (tags as any).tags?.length ?? 0,
            tagsMirrored: (tags as any).mirrored ?? 0,
          }) }] };
        }

        case "evidence:analyze_multimodal": {
          const { evidenceId, fileUrl, evidenceType, analyzeVision, analyzeAudio, extractEmbeddings } = args as any;
          const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

          // Fetch file from MinIO
          const { Client } = await import('minio');
          const minio = new Client({
            endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
          });
          const bucketName = process.env.MINIO_EVIDENCE_BUCKET || 'evidence';
          const chunks: Buffer[] = [];
          const stream = await minio.getObject(bucketName, fileUrl);
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          const fileBuffer = Buffer.concat(chunks);

          // Call FastAPI multimodal endpoint
          const FormData = (await import('form-data')).default;
          const formData = new FormData();
          formData.append('file', fileBuffer, { filename: fileUrl.split('/').pop() || 'evidence' });

          const url = new URL(`${FASTAPI_URL}/multimodal/analyze`);
          url.searchParams.set('evidence_id', evidenceId);
          url.searchParams.set('evidence_type', evidenceType);
          url.searchParams.set('analyze_vision', String(analyzeVision ?? true));
          url.searchParams.set('analyze_audio', String(analyzeAudio ?? true));
          url.searchParams.set('extract_embeddings', String(extractEmbeddings ?? true));

          const response = await fetch(url.toString(), {
            method: 'POST',
            body: formData as any,
            headers: formData.getHeaders(),
          });

          if (!response.ok) {
            throw new Error(`Multimodal analysis failed: ${response.status} ${await response.text()}`);
          }

          const result = await response.json();
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "evidence:detect_objects": {
          const { evidenceId, imageUrl, confidenceThreshold } = args as any;
          const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

          // Fetch image from MinIO
          const { Client } = await import('minio');
          const minio = new Client({
            endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
          });
          const bucketName = process.env.MINIO_EVIDENCE_BUCKET || 'evidence';
          const chunks: Buffer[] = [];
          const stream = await minio.getObject(bucketName, imageUrl);
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          const imageBuffer = Buffer.concat(chunks);

          // Call FastAPI vision endpoint
          const FormData = (await import('form-data')).default;
          const formData = new FormData();
          formData.append('file', imageBuffer, { filename: imageUrl.split('/').pop() || 'image' });

          const url = new URL(`${FASTAPI_URL}/vision/analyze`);
          url.searchParams.set('evidence_id', evidenceId);
          url.searchParams.set('confidence_threshold', String(confidenceThreshold ?? 0.5));

          const response = await fetch(url.toString(), {
            method: 'POST',
            body: formData as any,
            headers: formData.getHeaders(),
          });

          if (!response.ok) {
            throw new Error(`Object detection failed: ${response.status} ${await response.text()}`);
          }

          const result = await response.json();
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "evidence:transcribe_gpu": {
          const { evidenceId, audioUrl, language, wordTimestamps } = args as any;
          const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

          // Fetch audio from MinIO
          const { Client } = await import('minio');
          const minio = new Client({
            endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
          });
          const bucketName = process.env.MINIO_EVIDENCE_BUCKET || 'evidence';
          const chunks: Buffer[] = [];
          const stream = await minio.getObject(bucketName, audioUrl);
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          const audioBuffer = Buffer.concat(chunks);

          // Call FastAPI audio endpoint
          const FormData = (await import('form-data')).default;
          const formData = new FormData();
          formData.append('file', audioBuffer, { filename: audioUrl.split('/').pop() || 'audio' });

          const url = new URL(`${FASTAPI_URL}/audio/transcribe`);
          url.searchParams.set('evidence_id', evidenceId);
          if (language) url.searchParams.set('language', language);
          url.searchParams.set('word_timestamps', String(wordTimestamps ?? false));

          const response = await fetch(url.toString(), {
            method: 'POST',
            body: formData as any,
            headers: formData.getHeaders(),
          });

          if (!response.ok) {
            throw new Error(`GPU transcription failed: ${response.status} ${await response.text()}`);
          }

          const result = await response.json();
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "evidence:search_similar": {
          const { query, modalities, topK } = args as any;
          const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

          const url = new URL(`${FASTAPI_URL}/multimodal/search`);
          url.searchParams.set('query', query);
          url.searchParams.set('top_k', String(topK ?? 10));
          if (modalities) {
            for (const modality of modalities) {
              url.searchParams.append('modalities', modality);
            }
          }

          const response = await fetch(url.toString(), { method: 'POST' });

          if (!response.ok) {
            throw new Error(`Cross-modal search failed: ${response.status} ${await response.text()}`);
          }

          const result = await response.json();
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "reports:list": {
          const result = await mcpTools.reports.listReports(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "reports:create": {
          const result = await mcpTools.reports.createReport(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "reports:generate_from_template": {
          const result = await mcpTools.reports.generateFromTemplate(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "reports:update": {
          const result = await mcpTools.reports.updateReport(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "reports:delete": {
          const { reportId } = args as { reportId: string };
          const result = await mcpTools.reports.deleteReport(reportId);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "reports:export": {
          const result = await mcpTools.reports.exportReport(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });
}

async function main() {
  setupToolHandlers();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Deeds Legal MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});



