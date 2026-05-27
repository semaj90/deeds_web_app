import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema, ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mcpTools } from '../mcp/index.js';
import { ENV } from '$lib/server/env.server.js';
import { expandNotecardNeighbors, getNotecardById, getNotecardBySourcePath, searchNotecards } from '$lib/server/kb/search-logic.js';
import { runRgSearchAtlas } from '$lib/server/rg-atlas/run.js';
import type { RgSearchAtlasOptions } from '$lib/server/rg-atlas/types.js';
import { REPAIR_TOOLS_SCHEMAS, handleRepairToolCall } from './tools/repair_tools.js';
import { getWikiStatus, searchWiki, explainWikiPage, refreshDirectory } from '$lib/server/kb/wiki-logic.js';
import { getVlmState, switchVlmMode, VlmMode } from '$lib/server/inference/vlm-lifecycle.js';
import { resolveAgentsMdQuickHit } from '$lib/server/graph/community-graph.js';

const SCHEMA_INDEXER_CONTRACT_CARDS_PATH = join(process.cwd(), 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl');

export const server = new Server(
  {
    name: 'deeds-legal-server',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
  }
);

// ─────────────────────────────────────────────────────────────────────
// Auth guard — checks MCP_AUTH_TOKEN env var when set
// ─────────────────────────────────────────────────────────────────────
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

function checkAuth(request: any): void {
  if (!MCP_AUTH_TOKEN) return; // no token configured → open access
  const token = request?.params?._meta?.authToken ?? request?.params?.arguments?._authToken;
  if (token !== MCP_AUTH_TOKEN) {
    throw new Error('Unauthorized: invalid or missing MCP auth token');
  }
}

// ─────────────────────────────────────────────────────────────────────
// MinIO helper — single place for client creation + file fetch
// ─────────────────────────────────────────────────────────────────────
let _mcpMinioClient: any = null;
async function getMcpMinioClient() {
  if (!_mcpMinioClient) {
    const { Client } = await import('minio');
    _mcpMinioClient = new Client({
      endPoint: ENV.MINIO_ENDPOINT?.split(':')[0] || 'minio',
      port: parseInt(ENV.MINIO_PORT || '9000', 10),
      useSSL: ENV.MINIO_USE_SSL === 'true',
      accessKey: ENV.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: ENV.MINIO_SECRET_KEY || 'minioadmin',
    });
  }
  return _mcpMinioClient;
}

async function mcpGetFile(objectKey: string, bucket?: string): Promise<Buffer> {
  const client = await getMcpMinioClient();
  const bucketName = bucket || process.env.MINIO_EVIDENCE_BUCKET || 'evidence';
  const chunks: Buffer[] = [];
  const stream = await client.getObject(bucketName, objectKey);
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ─────────────────────────────────────────────────────────────────────
// Tool executor — enables compose:pipeline to call tools by name
// ─────────────────────────────────────────────────────────────────────
async function executeTool(
  toolName: string,
  toolArgs: Record<string, any>,
  handler: (request: any) => Promise<any>
): Promise<any> {
  const fakeRequest = { params: { name: toolName, arguments: toolArgs } };
  return handler(fakeRequest);
}

/**
 * Setup tool handlers for MCP server
 */
export function setupToolHandlers() {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'cases:load',
        description: 'Load legal cases with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            limit: { type: 'number' },
            query: { type: 'string' },
          },
        },
      },
      {
        name: 'rag:search',
        description: 'Perform a semantic search across legal documents and web',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' }, topK: { type: 'number' } },
          required: ['query'],
        },
      },
      {
        name: 'rag:index_page',
        description: 'Index a web page for RAG knowledge',
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      },
      {
        name: 'memory:prior_answer_lookup',
        description: 'Look up a prior LLM answer from the 3-tier cache (Redis L1 → Postgres L2 → Qdrant L3 semantic). Returns compressed CodeLlmOutputMeta envelope (summary, citations, confidence, grounding) suitable for ACE prompt preambles. Use BEFORE generating a new RAG answer to reuse compressed reasoning.',
        inputSchema: {
          type: 'object',
          properties: {
            path:              { type: 'string', description: 'Code path or directory to look up first (cheapest L1 lookup).' },
            query:             { type: 'string', description: 'Free-text query for L3 Qdrant semantic fallback when path misses.' },
            clusterId:         { type: 'number', description: 'Optional glyph cluster filter for L3 search.' },
            includeFullOutput: { type: 'boolean', description: 'When true, include the full llmOutput; default false (only meta).' },
            minScore:          { type: 'number', description: 'Minimum cosine similarity for L3 hits (default 0.78).' },
          },
        },
      },
      {
        name: 'playwright:browser_action',
        description: 'Execute a browser action using Playwright',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'enum', enum: ['goto', 'click', 'fill', 'screenshot'] },
            url: { type: 'string' },
            selector: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'transcribe_audio',
        description:
          'Transcribe audio evidence files (WAV, MP3, M4A) using Docling ASR. Returns transcript text with word count and duration.',
        inputSchema: {
          type: 'object',
          properties: {
            evidenceId: { type: 'string', description: 'Evidence record ID in PostgreSQL' },
            audioUrl: { type: 'string', description: 'MinIO object key or URL for the audio file' },
          },
          required: ['evidenceId', 'audioUrl'],
        },
      },
      {
        name: 'evidence:analyze',
        description:
          'Analyze evidence text: extract entities, detect forensic patterns, auto-tag with 3-store mirroring (pgvector + Qdrant + CouchDB)',
        inputSchema: {
          type: 'object',
          properties: {
            evidenceId: { type: 'string', description: 'Evidence record ID' },
            text: { type: 'string', description: 'Evidence text content (max 50000 chars)' },
            evidenceType: { type: 'string', description: 'Evidence type classification' },
          },
          required: ['evidenceId', 'text'],
        },
      },
      {
        name: 'evidence:analyze_multimodal',
        description:
          'GPU-accelerated multimodal evidence analysis (images/videos/audio): YOLO object detection, Whisper transcription, CLIP embeddings. Returns detected objects, transcript, and 512-dim embeddings for semantic search.',
        inputSchema: {
          type: 'object',
          properties: {
            evidenceId: { type: 'string', description: 'Evidence record ID in PostgreSQL' },
            fileUrl: { type: 'string', description: 'MinIO object key or URL for evidence file' },
            evidenceType: {
              type: 'string',
              enum: ['image', 'video', 'audio'],
              description: 'Evidence file type',
            },
            analyzeVision: {
              type: 'boolean',
              description: 'Run YOLO object detection (images/videos)',
              default: true,
            },
            analyzeAudio: {
              type: 'boolean',
              description: 'Run Whisper transcription (audio/videos)',
              default: true,
            },
            extractEmbeddings: {
              type: 'boolean',
              description: 'Extract CLIP/Whisper embeddings for search',
              default: true,
            },
          },
          required: ['evidenceId', 'fileUrl', 'evidenceType'],
        },
      },
      {
        name: 'evidence:detect_objects',
        description:
          'Detect objects in image evidence using the installed YOLO ONNX model. The live repo currently uses a restored yolov8n COCO fallback; document-layout mode still requires models/yolo-doc.onnx.',
        inputSchema: {
          type: 'object',
          properties: {
            evidenceId: { type: 'string', description: 'Evidence record ID' },
            imageUrl: { type: 'string', description: 'MinIO object key or URL for image' },
            confidenceThreshold: {
              type: 'number',
              description: 'Min detection confidence (0.0-1.0)',
              default: 0.5,
            },
          },
          required: ['evidenceId', 'imageUrl'],
        },
      },
      {
        name: 'evidence:transcribe_gpu',
        description:
          'GPU-accelerated audio/video transcription using Whisper. Faster than browser WASM for long recordings (>10s). Returns full transcript with word-level timestamps and language detection.',
        inputSchema: {
          type: 'object',
          properties: {
            evidenceId: { type: 'string', description: 'Evidence record ID' },
            audioUrl: {
              type: 'string',
              description: 'MinIO object key or URL for audio/video file',
            },
            language: {
              type: 'string',
              description: 'Language code (en, es, etc) or null for auto-detect',
            },
            wordTimestamps: {
              type: 'boolean',
              description: 'Enable word-level timestamps',
              default: false,
            },
          },
          required: ['evidenceId', 'audioUrl'],
        },
      },
      {
        name: 'evidence:search_similar',
        description:
          'Cross-modal semantic search: find visually or acoustically similar evidence using CLIP/Whisper embeddings. Query with text, find matching images/audio.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: "Text search query (e.g., 'person with weapon')",
            },
            modalities: {
              type: 'array',
              items: { type: 'string', enum: ['vision', 'audio'] },
              description: 'Modalities to search',
              default: ['vision', 'audio'],
            },
            topK: { type: 'number', description: 'Number of results to return', default: 10 },
          },
          required: ['query'],
        },
      },
      {
        name: 'cases:create',
        description: 'Create a new legal case. Returns the created case with ID.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Case title' },
            description: { type: 'string', description: 'Case description' },
            status: {
              type: 'string',
              enum: ['open', 'active', 'closed', 'archived'],
              description: 'Case status',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Case priority',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'cases:update',
        description: "Update an existing case's title, description, status, or priority.",
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Case ID to update' },
            title: { type: 'string', description: 'New case title' },
            description: { type: 'string', description: 'New description' },
            status: {
              type: 'string',
              enum: ['open', 'active', 'closed', 'archived'],
              description: 'New status',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'New priority',
            },
          },
          required: ['caseId'],
        },
      },
      {
        name: 'cases:delete',
        description: 'Delete a case and all associated data. Use with caution.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Case ID to delete' },
          },
          required: ['caseId'],
        },
      },
      {
        name: 'citations:search',
        description:
          'Search legal citations across cases. Returns matching citations with source, page, and relevance.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query for citation text' },
            caseId: { type: 'string', description: 'Filter to a specific case' },
            limit: { type: 'number', description: 'Max results' },
            offset: { type: 'number', description: 'Pagination offset' },
          },
        },
      },
      {
        name: 'citations:list_by_case',
        description: 'List all citations linked to a specific case.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Case ID to list citations for' },
          },
          required: ['caseId'],
        },
      },
      {
        name: 'citations:add_to_case',
        description:
          'Add a legal citation to a case. Stores citation text, source, and page reference.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Case ID to add citation to' },
            citationText: {
              type: 'string',
              description: "The citation text (e.g., 'Miranda v. Arizona, 384 U.S. 436 (1966)')",
            },
            sourceTitle: { type: 'string', description: 'Source document title' },
            pageNumber: { type: 'number', description: 'Page number in source document' },
          },
          required: ['caseId', 'citationText'],
        },
      },
      {
        name: 'reports:list',
        description:
          'List reports with optional case filtering. Returns report metadata including title, status, creation date.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Filter reports by case ID' },
            limit: {
              type: 'number',
              description: 'Maximum number of reports to return',
              default: 20,
            },
            offset: { type: 'number', description: 'Pagination offset', default: 0 },
          },
        },
      },
      {
        name: 'reports:create',
        description: 'Create a new blank report for a case. Returns report ID and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            caseId: { type: 'string', description: 'Case ID to associate report with' },
            title: { type: 'string', description: 'Report title', default: 'Untitled Report' },
            contentHtml: {
              type: 'string',
              description: 'Initial HTML content',
              default: '<p>Start writing...</p>',
            },
            status: {
              type: 'string',
              enum: ['draft', 'in_review', 'finalized', 'published'],
              description: 'Report status',
              default: 'draft',
            },
          },
          required: ['caseId'],
        },
      },
      {
        name: 'reports:generate_from_template',
        description:
          'Generate a report from a legal template (charging memo, search warrant affidavit, case summary, evidence inventory, witness interview, plea agreement, motion to suppress, trial brief, sentencing memo, discovery index). Optionally use AI to fill in case-specific analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            templateType: {
              type: 'string',
              enum: [
                'charging_memo',
                'search_warrant',
                'case_summary',
                'evidence_inventory',
                'witness_interview',
                'plea_agreement',
                'motion_suppress',
                'trial_brief',
                'sentencing_memo',
                'discovery_index',
              ],
              description: 'Template type to use',
            },
            caseId: { type: 'string', description: 'Case ID to generate report for' },
            customTitle: {
              type: 'string',
              description: 'Custom report title (overrides template default)',
            },
            useAI: {
              type: 'boolean',
              description: 'Use AI (Ollama gemma4-rotorquant:latest) to generate case-specific content',
              default: false,
            },
          },
          required: ['templateType', 'caseId'],
        },
      },
      {
        name: 'reports:update',
        description: "Update an existing report's title, content, or status.",
        inputSchema: {
          type: 'object',
          properties: {
            reportId: { type: 'string', description: 'Report ID to update' },
            title: { type: 'string', description: 'New report title' },
            contentHtml: { type: 'string', description: 'Updated HTML content' },
            status: {
              type: 'string',
              enum: ['draft', 'in_review', 'finalized', 'published'],
              description: 'New report status',
            },
          },
          required: ['reportId'],
        },
      },
      {
        name: 'reports:delete',
        description: 'Delete a report. Audit log entry will be created for legal compliance.',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: { type: 'string', description: 'Report ID to delete' },
          },
          required: ['reportId'],
        },
      },
      {
        name: 'reports:export',
        description: 'Export a report to PDF, DOCX, or HTML format. Returns download URL.',
        inputSchema: {
          type: 'object',
          properties: {
            reportId: { type: 'string', description: 'Report ID to export' },
            format: {
              type: 'string',
              enum: ['pdf', 'docx', 'html'],
              description: 'Export format',
              default: 'pdf',
            },
          },
          required: ['reportId', 'format'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // GPU Direct — bypass HTTP for hot-path operations
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'embedding:generate',
        description:
          'Generate 768-dim embeddings via gRPC direct (bypasses HTTP, ~50ms vs ~180ms). Falls back to Ollama HTTP if gRPC unavailable.',
        inputSchema: {
          type: 'object',
          properties: {
            texts: {
              type: 'array',
              items: { type: 'string' },
              description: 'Text(s) to embed (max 32 items, 2048 chars each)',
            },
          },
          required: ['texts'],
        },
      },
      {
        name: 'gpu:similarity',
        description:
          'Compute pairwise cosine similarity matrix on GPU via LibTorch CUDA (bypasses HTTP, ~5-20ms). Falls back to CPU if GPU unavailable.',
        inputSchema: {
          type: 'object',
          properties: {
            embeddings: {
              type: 'array',
              items: { type: 'array', items: { type: 'number' } },
              description: 'Array of embedding vectors (768-dim float arrays)',
            },
          },
          required: ['embeddings'],
        },
      },
      {
        name: 'inference:route',
        description:
          'Route an inference request through the optimal backend: TRT→Triton→Bifrost→Ollama cascade. Direct import bypasses HTTP layer.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The inference prompt' },
            model: { type: 'string', description: 'Model name (default: gemma4-rotorquant:latest)' },
            maxTokens: { type: 'number', description: 'Max output tokens', default: 2048 },
            temperature: { type: 'number', description: 'Sampling temperature', default: 0.3 },
            stream: { type: 'boolean', description: 'Enable streaming', default: false },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'LLMS.md',
        description:
          'Resolve the nearest applicable LLMS.md instructions for a file or directory. Prefers Redis-rendered mirrors and falls back to on-disk LLMS.md walk-up.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Workspace-relative or absolute file/directory path',
            },
          },
          required: ['path'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Codebase Search — Dual-vector semantic search (Qdrant 768-dim)
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'codebase:search',
        description:
          'Semantic code search using dual-vector (content + signature) embeddings in Qdrant. Uses 768-dim embeddinggemma vectors with configurable content/signature weighting. Returns ranked code chunks with file paths, line numbers, and relevance scores.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language or code search query' },
            limit: { type: 'number', description: 'Max results (1-50)', default: 10 },
            contentWeight: {
              type: 'number',
              description: 'Weight for content vector (0-1)',
              default: 0.6,
            },
            signatureWeight: {
              type: 'number',
              description: 'Weight for signature vector (0-1)',
              default: 0.4,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'codebase:ace_context',
        description:
          'Run full ACE (Agentic Contextual Engineering) synthesis with optional codebase/AST context. Assembles user profile, case context, RAG chunks, KAG graph, glossary, evidence, and codebase semantic search into a single LLM prompt, then generates and self-evaluates the response.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query' },
            caseId: { type: 'string', description: 'Optional case UUID for case-specific context' },
            enableCodebaseContext: {
              type: 'boolean',
              description: 'Include codebase/AST semantic search in context',
              default: true,
            },
            includeResearch: {
              type: 'boolean',
              description:
                'Include Lane 3 deep research chunks (chunks_web_search Qdrant collection). Grounding order: Docs > GitHub Issues > Reddit.',
              default: false,
            },
            persona: {
              type: 'string',
              enum: ['neutral', 'prosecutor', 'defense', 'plain-language', 'academic'],
              default: 'neutral',
            },
            maxTokens: { type: 'number', description: 'Max tokens for LLM output', default: 2048 },
          },
          required: ['query'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Codebase Cluster Explain — VLM narrative for a GPU k-means cluster
      // Step 8: Claude / Copilot MCP bridge
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'codebase:explain_cluster',
        description:
          'Return a VLM-synthesised narrative for a GPU k-means cluster in the codebase index. ' +
          'Accepts a clusterId (integer) OR a free-text query (searches the most relevant cluster). ' +
          'Returns: purpose, summary, patterns, keyFiles, warnings. ' +
          'Use this when Claude / Copilot needs to explain what a group of related files does ' +
          '(e.g. "how does auth work?", "what is the evidence pipeline?").',
        inputSchema: {
          type: 'object',
          properties: {
            clusterId: {
              type: 'number',
              description: 'GPU cluster index (0-based). If omitted, query must be provided.',
            },
            query: {
              type: 'string',
              description:
                'Natural language query — the tool searches codebase_chunks_768 and picks the top cluster. ' +
                'Used when clusterId is unknown.',
            },
            maxFiles: {
              type: 'number',
              description:
                'Max file chunks to include when query-based lookup is used (default: 5)',
              default: 5,
            },
            force: {
              type: 'boolean',
              description: 'Bypass Redis cache and regenerate narrative (default: false)',
              default: false,
            },
          },
        },
      },
      {
        name: 'codebase:get_buffer',
        description:
          'Retrieve a pre-assembled context buffer containing high-token codebase insights (e.g. architecture overview). ' +
          'More efficient than explain_cluster for large-scale repo understanding.',
        inputSchema: {
          type: 'object',
          properties: {
            bufferKey: {
              type: 'string',
              description: 'The key of the buffer to retrieve (e.g. "architecture-overview")',
              default: 'architecture-overview',
            },
            bakeIfMissing: {
              type: 'boolean',
              description:
                'If true, re-synthesises the buffer if it is expired or missing (default: true)',
              default: true,
            },
            lastHash: {
              type: 'string',
              description:
                'Optional. Result of a previous call. If hashes match, content is omitted.',
            },
          },
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // LangExtract Tools — Google's official structured extraction library
      // Uses local Ollama (gemma4-rotorquant:latest) instead of Gemini API
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'langextract:legal',
        description:
          'Extract structured legal entities from text using Google LangExtract + gemma4-rotorquant:latest. Returns parties (plaintiff/defendant), dates, citations, money amounts, statutes, obligations with exact text locations for source grounding.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Legal document text to analyze (max 50000 chars)',
            },
            extraction_passes: {
              type: 'number',
              description: 'Number of extraction passes for higher recall (1-3)',
              default: 1,
            },
            temperature: {
              type: 'number',
              description: 'Sampling temperature (0.0-1.0)',
              default: 0.3,
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'langextract:evidence',
        description:
          'Extract forensic/evidentiary entities from text: persons (witnesses, suspects), locations, phone numbers, emails, document references, quotes with attribution. Returns structured data with exact text positions.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Evidence document or investigation notes (max 50000 chars)',
            },
            extraction_passes: {
              type: 'number',
              description: 'Number of extraction passes (1-3)',
              default: 1,
            },
            temperature: {
              type: 'number',
              description: 'Sampling temperature (0.0-1.0)',
              default: 0.3,
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'langextract:file',
        description:
          'Extract structured information from a file path or URL. Supports PDF, TXT, and web pages. Uses LangExtract multi-pass processing for long documents.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Local file path or URL to extract from' },
            extraction_type: {
              type: 'string',
              enum: ['legal', 'evidence'],
              description: 'Type of entities to extract',
              default: 'legal',
            },
            extraction_passes: {
              type: 'number',
              description: 'Passes for long documents (1-5)',
              default: 2,
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'langextract:custom',
        description:
          'Custom structured extraction with user-defined prompt and few-shot examples. Flexible for any domain (medical, financial, research papers).',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to extract from' },
            prompt: {
              type: 'string',
              description:
                "Extraction instructions (e.g., 'Extract medications, dosages, and frequencies')",
            },
            examples: {
              type: 'array',
              items: { type: 'object' },
              description: 'Few-shot examples in LangExtract format',
            },
            extraction_passes: { type: 'number', description: 'Extraction passes', default: 1 },
          },
          required: ['text', 'prompt'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Compose Pipeline — Chain multiple tools sequentially
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'compose:pipeline',
        description:
          'Chain multiple tools sequentially. Each step can reference previous results via {{stepN.field}} template syntax. Example: search codebase → analyze evidence → extract entities in one call.',
        inputSchema: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tool: {
                    type: 'string',
                    description: 'Tool name to call (e.g., "codebase:search")',
                  },
                  args: {
                    type: 'object',
                    description:
                      'Arguments for the tool. Use {{stepN.field}} to reference output of step N (0-indexed).',
                  },
                },
                required: ['tool', 'args'],
              },
              description: 'Ordered list of tool invocations',
            },
            stopOnError: {
              type: 'boolean',
              description: 'Stop pipeline on first error',
              default: true,
            },
          },
          required: ['steps'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Codebase File Intelligence — Neo4j + CouchDB aggregated view
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'codebase:file_intel',
        description:
          'Unified file intelligence: Neo4j AST metadata, IMPORTS graph edges (in+out), GPU cluster assignment, and missing-import recommendations from CouchDB. Use when you need deep context about a specific source file.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file (e.g. src/lib/server/rag-pipeline.ts)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'codebase:graph_neighbors',
        description:
          'Return immediate graph neighbors for a file: files it imports and files that import it. Useful for impact analysis and understanding module coupling.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative file path (e.g. src/lib/server/cache.ts)',
            },
            direction: {
              type: 'string',
              enum: ['both', 'imports', 'importedBy'],
              description: 'Edge direction to return (default: both)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'codebase:graph_traverse',
        description:
          'Multi-hop graph traversal from a start file. Returns subgraph nodes and edges with LibTorch PageRank scores. Use mode=ego for immediate neighbors, mode=bfs for N-hop subgraph, mode=cluster for same GPU cluster. Results are limited to 50 nodes by default.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Start file path (e.g. src/lib/server/ace/context-assembler.ts)',
            },
            hops: {
              type: 'number',
              description: 'Number of hops (1-4, default 2)',
            },
            mode: {
              type: 'string',
              enum: ['bfs', 'ego', 'cluster'],
              description: 'Traversal mode',
            },
            direction: {
              type: 'string',
              enum: ['both', 'imports', 'importedBy'],
            },
            limit: {
              type: 'number',
              description: 'Max nodes to return (default 50)',
            },
          },
          required: ['path'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Topology Search — 4D manifold neighbourhood + cosine hybrid search
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'topology_search',
        description:
          'Search the 4D topology-indexed codebase using cosine prefilter (Qdrant 768-dim) ' +
          'followed by manifold4 Euclidean neighbourhood expansion. ' +
          'The 4 dimensions are: som_x/som_y (SOM grid position), semantic_z (centroid projection), ' +
          'grpo_w (RL quality score). Returns hits with hybridScore (0.60×cosine + 0.40×manifold), ' +
          'topoClass, somCluster, graphAuthorityScore, and summary. ' +
          'Requires topology-search-server running on port 8101 (npm run topology:search:ensure).',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural-language search query (embedded to 768-dim for cosine stage)',
            },
            radius: {
              type: 'number',
              description: 'Manifold4 Euclidean search radius (0.05–2.0, default 0.25)',
            },
            limit: {
              type: 'number',
              description: 'Max hits to return (1–40, default 15)',
            },
            somCluster: {
              type: 'number',
              description: 'Optional SOM cluster filter (integer) to restrict neighbourhood search',
            },
          },
          required: ['query'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Analytics — Deep Research + JSONL Research Index (feedback-weighted)
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'analytics:deep_research',
        description:
          'Generate personalized deep research topics from RAG/KAG/DAG/ACE hit analytics, ' +
          'thumbs-up/down feedback signals, Neo4j graph centrality, and Ollama self-prompting. ' +
          'Returns up to 8 research topics with selfPrompt fields ready to execute, plus ' +
          'pipeline hit summary, feedback index, and graph insights. Cached 30 min per user.',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User UUID for personalisation' },
            refresh: {
              type: 'boolean',
              description: 'Bypass 30-min Redis cache and regenerate (default: false)',
              default: false,
            },
          },
          required: ['userId'],
        },
      },
      {
        name: 'analytics:research_topics',
        description:
          'Query the Redis-cached JSONL research index: qlora_examples joined with response_feedback, ' +
          'scored by quality tier × feedback ratio × response score. Returns sketches for a specific ' +
          'pipeline (ace/rag/kag/dag/codebase/all) with self-prompt chains. Optionally force-rebuilds the index.',
        inputSchema: {
          type: 'object',
          properties: {
            pipeline: {
              type: 'string',
              enum: ['ace', 'rag', 'kag', 'dag', 'codebase', 'reranker', 'all'],
              description: 'Retrieval pipeline to filter by (default: all)',
              default: 'all',
            },
            limit: {
              type: 'number',
              description: 'Max sketches to return (1-50, default: 12)',
              default: 12,
            },
            domains: {
              type: 'string',
              description:
                'Comma-separated codebase domain seeds: typescript,sveltekit,ripgrep,awk,ollama',
              default: '',
            },
            rebuild: {
              type: 'boolean',
              description: 'Force-rebuild Redis index from Postgres (default: false)',
              default: false,
            },
          },
          required: [],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Codebase Ripgrep — fast literal+regex search over source files
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'codebase:rg_search',
        description:
          'Fast ripgrep search over the SvelteKit codebase. Supports regex patterns and file-type ' +
          'filtering. Returns matching lines with file paths and line numbers. Use for finding ' +
          'imports, API route wiring, auth guards (G18), Zod validation (G19), rune compliance, ' +
          'or any code pattern. More precise than semantic codebase:search for known symbol names.',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Regex or literal pattern to search for',
            },
            fileGlob: {
              type: 'string',
              description:
                'Glob pattern to filter files (e.g. "*.ts", "*.svelte", "**/*.server.ts")',
              default: '*.{ts,svelte}',
            },
            maxResults: {
              type: 'number',
              description: 'Max matching lines to return (default: 40, max: 200)',
              default: 40,
            },
            caseInsensitive: {
              type: 'boolean',
              description: 'Case-insensitive search (default: false)',
              default: false,
            },
          },
          required: ['pattern'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Analytics — MapReduce Matrix Analysis (RAG/KAG/DAG/ACE similarity)
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'analytics:mapreduce_matrix',
        description:
          'Execute MapReduce matrix analysis across RAG/KAG/DAG/ACE pipelines. ' +
          'MAP: extracts 5 data sources (chunk_hit_log, response_feedback, CouchDB glyph topology, ' +
          'Redis rerank cache, qlora_examples). REDUCE: builds 8-dimensional similarity matrix. ' +
          'SYNTHESIZE: generates LangGraph-compatible research topics via Ollama. ' +
          'Returns ranked chunks, pipeline coverage, glyph context, and self-prompting topics.',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User UUID for personalisation' },
            days: {
              type: 'number',
              description: 'Lookback window in days (1-30, default: 7)',
              default: 7,
            },
            topK: {
              type: 'number',
              description: 'Top chunks to return (1-100, default: 20)',
              default: 20,
            },
            synthesize: {
              type: 'boolean',
              description: 'Run Ollama synthesis (default: true)',
              default: true,
            },
          },
          required: ['userId'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Analytics — Unified Research Playground
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'analytics:unified_research',
        description:
          'Unified research query orchestrating: research-cache (qlora × feedback), ' +
          'mapreduce-matrix (cosine similarity × CouchDB glyph), codebase rg/awk, ' +
          'web search (Firecrawl), deep-research Ollama self-prompting, AWK-style SQL ' +
          'score aggregations, and LangGraph supervisor state. Cached 20 min per user.',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User UUID' },
            query: {
              type: 'string',
              description: 'Text query or URL (Firecrawl fetches URL content)',
            },
            pipeline: {
              type: 'string',
              enum: ['all', 'ace', 'rag', 'kag', 'dag', 'codebase'],
              default: 'all',
            },
            domains: {
              type: 'array',
              items: { type: 'string' },
              description: 'Codebase domain hints (typescript, sveltekit, ripgrep)',
            },
            depth: { type: 'number', description: 'Self-prompt chain depth 1-5', default: 3 },
            days: { type: 'number', description: 'Lookback window 1-30 days', default: 7 },
            includeWeb: { type: 'boolean', default: false },
            includeCodebase: { type: 'boolean', default: true },
            includeMatrix: { type: 'boolean', default: true },
            rebuild: { type: 'boolean', default: false },
          },
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // Analytics — Codebase Deep Research (rg + pipeline + Ollama)
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'analytics:codebase_research',
        description:
          'Deep research codebase scanner using ripgrep pattern analysis, pipeline hit distribution, ' +
          'feedback-weighted query insights, and Ollama synthesis. Generates TypeScript/SvelteKit-specific ' +
          'research topics with code patterns and self-prompts. Cached 30 min per user.',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User UUID for personalisation' },
            days: {
              type: 'number',
              description: 'Lookback window in days (1-30, default: 7)',
              default: 7,
            },
            query: {
              type: 'string',
              description: 'Optional rg search query to include in analysis',
            },
            synthesize: {
              type: 'boolean',
              description: 'Run Ollama synthesis (default: true)',
              default: true,
            },
          },
          required: ['userId'],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'codebase:concurrent_research',
        description:
          'LangGraph-style concurrent deep research over codebase_chunks_768. ' +
          'Runs a supervisor → parallel domain workers → Ollama synthesizer DAG. ' +
          'Domains: api-routes, state-machines, database, error-patterns, ml-inference, ' +
          'auth, cache, rag-pipeline, ui-components, graph-db, general. ' +
          'Returns supervisorSummary, keyFindings, actionItems, per-domain chunks + insights. ' +
          'format=markdown returns Claude-Code-ready context block with file paths. ' +
          'All LLM calls via L1 Redis → L2 Bifrost → L3 Ollama (zero API cost).',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language research question about the codebase',
            },
            domains: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'api-routes',
                  'state-machines',
                  'database',
                  'error-patterns',
                  'ml-inference',
                  'auth',
                  'cache',
                  'rag-pipeline',
                  'ui-components',
                  'graph-db',
                  'general',
                ],
              },
              description: 'Explicit research domains (auto-detected from query if omitted)',
            },
            limitPerWorker: {
              type: 'number',
              description: 'Max Qdrant chunks per domain worker (default 12, max 30)',
              default: 12,
            },
            format: {
              type: 'string',
              enum: ['json', 'markdown'],
              description:
                'Response format: json (structured) or markdown (Claude Code context block)',
              default: 'json',
            },
          },
          required: ['query'],
        },
      },
      // Analytics — Web Research Crawler (SearXNG → cosine → ACE summarize)
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'analytics:web_research',
        description:
          'Run web research for selfPrompt queries: SearXNG/Google/DDG search → 768-dim embedding → ' +
          'GPU cosine similarity ranking → Ollama ACE summarization → entity tag extraction → ' +
          'Redis ZSET index. Summaries surface in research-topics and deep-research pipelines.',
        inputSchema: {
          type: 'object',
          properties: {
            selfPrompts: {
              type: 'array',
              items: { type: 'string' },
              description: 'Research queries to search (1-10)',
            },
            pipeline: {
              type: 'string',
              enum: ['ace', 'rag', 'kag', 'dag', 'codebase', 'all'],
              description: 'Pipeline label for ZSET routing (default: ace)',
              default: 'ace',
            },
            maxResults: {
              type: 'number',
              description: 'Web results per query (1-10, default: 5)',
              default: 5,
            },
            action: {
              type: 'string',
              enum: ['crawl', 'corpus-search', 'query', 'corpus-query', 'stats', 'invalidate'],
              description:
                'crawl=web search, corpus-search=local Qdrant, query/corpus-query=read cache, stats=counts, invalidate=clear both',
              default: 'crawl',
            },
          },
          required: ['selfPrompts'],
        },
      },
      {
        name: 'face:identify',
        description:
          'Multi-pass GRPO face matching for a reference POI using gemma4 VLM. ' +
          'Pass 1: 768-dim pgvector cosine similarity. ' +
          'Pass 2: gemma4 visual reasoning ("same person?" → confidence 0-100). ' +
          'Pass 3: GRPO reward fusion (0.25 × embed + 0.75 × VLM). ' +
          'Returns ranked candidate POIs with per-pass scores and VLM reasoning.',
        inputSchema: {
          type: 'object',
          properties: {
            poiId: {
              type: 'string',
              format: 'uuid',
              description: 'Reference POI ID to match against all candidates',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 50,
              default: 10,
              description: 'Max candidates to return',
            },
            passes: {
              type: 'number',
              enum: [1, 2, 3],
              default: 3,
              description: '1=embed only, 2=embed+VLM, 3=full GRPO fusion',
            },
          },
          required: ['poiId'],
        },
      },
      {
        name: 'poi:face_synth',
        description:
          'Generate QLoRA synthetic training data (JSONL) for POI face identity fine-tuning. ' +
          'Three modes: description (gemma4 describes each photo), compare (positive + negative pairs), ' +
          'adversarial (hard negatives from confusable POIs). Writes to qlora_examples table.',
        inputSchema: {
          type: 'object',
          properties: {
            poiIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              description: 'Restrict to these POI IDs (omit for all)',
            },
            mode: {
              type: 'string',
              enum: ['description', 'compare', 'adversarial'],
              default: 'description',
              description: 'Synthesis mode',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 200,
              default: 50,
              description: 'Max training pairs to generate',
            },
            download: {
              type: 'boolean',
              default: false,
              description: 'Return raw JSONL bytes instead of JSON summary',
            },
          },
          required: [],
        },
      },
      // ─────────────────────────────────────────────────────────────────────
      // CodeIntel — cluster summaries, chunk lookup, job status
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'codeintel.health',
        description:
          'Check CodeIntel pipeline health (cluster_summaries + chunk index + gRPC reachability).',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'cluster.summary.get',
        description:
          'Fetch the LLM-generated summary for a GPU cluster (purpose, patterns, warnings, tags).',
        inputSchema: {
          type: 'object',
          properties: {
            gpuCluster: { type: 'number', description: 'GPU cluster index (0-19)' },
            repoId: {
              type: 'string',
              description: 'Repository ID (default: "default")',
              default: 'default',
            },
          },
          required: ['gpuCluster'],
        },
      },
      {
        name: 'cluster.summary.refresh',
        description:
          'Re-run LLM summarization for a cluster and store the new embedding. Use force=true to bypass cache.',
        inputSchema: {
          type: 'object',
          properties: {
            gpuCluster: { type: 'number', description: 'GPU cluster index (0-19)' },
            repoId: { type: 'string', description: 'Repository ID', default: 'default' },
            force: { type: 'boolean', description: 'Bypass Redis cache', default: true },
          },
          required: ['gpuCluster'],
        },
      },
      {
        name: 'clusters.get_summary_lenses',
        description:
          'Return LLM-generated semantic summaries for all 87 SOM/GPU clusters stored in Redis. ' +
          'Each lens includes clusterId, label, summary, size, and representative filePaths. ' +
          'Use to identify which semantic neighbourhood a query falls into before Qdrant ANN search. ' +
          'Optional topK limits results; optional query filters by keyword match in summary.',
        inputSchema: {
          type: 'object',
          properties: {
            topK:  { type: 'number', description: 'Max clusters to return (default: all)', default: 87 },
            query: { type: 'string', description: 'Keyword filter — only clusters whose summary contains this string (case-insensitive).' },
          },
        },
      },
      {
        name: 'chunk.lookup',
        description:
          'Look up a single codebase chunk by its Qdrant ID. Returns path, kind, domain, cluster, semantic tags.',
        inputSchema: {
          type: 'object',
          properties: {
            chunkId: { type: 'string', description: 'Qdrant chunk ID (UUID)' },
            repoId: { type: 'string', description: 'Repository ID', default: 'default' },
          },
          required: ['chunkId'],
        },
      },
      {
        name: 'codebase:export_bundle',
        description:
          'Return the unified codebase indexing export bundle: graph (nodes + edges), cluster summaries (purpose + patterns + warnings + embedding flag), Karpathy wiki feedback notes (playbook + cluster), 4D manifold coords, tile atlas stats, and live Redis cache key counts. Primary entry point for agentic tools that need the full state — far cheaper than calling 6 individual endpoints. Degrades per-part (meta.sources / meta.errors) so a failing backend never breaks the shape.',
        inputSchema: {
          type: 'object',
          properties: {
            include: {
              type: 'string',
              description:
                "Comma-separated subset: 'graph,clusters,wikiNotes,manifold4,tileAtlas,cacheStats'. Omit for all parts.",
            },
            limit: {
              type: 'number',
              description: 'Cap graph.nodes and manifold4 rows (10-10000, default 2000)',
              default: 2000,
            },
            repoId: {
              type: 'string',
              description: 'Repository ID for cluster_summaries filter',
              default: 'default',
            },
          },
        },
      },
      {
        name: 'codeintel.fix_recommend',
        description:
          'Given a TypeScript/SvelteKit compiler error or runtime exception, retrieves semantically similar codebase chunks from the 16,626-row enriched index, fetches the GPU cluster narrative, and calls Gemma4 to return 1-6 concrete fix recommendations with reference files. Use this for any error-fixing workflow targeting this codebase.',
        inputSchema: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description:
                'The full error message or compiler diagnostic (TS code, message, stack)',
            },
            filePath: {
              type: 'string',
              description: 'File path where the error occurred (optional but improves accuracy)',
            },
            line: {
              type: 'number',
              description: 'Line number of the error (optional)',
            },
            codeSnippet: {
              type: 'string',
              description: 'Up to 800 chars of surrounding code for context (optional)',
            },
            framework: {
              type: 'string',
              description:
                'Framework hint: "svelte5", "sveltekit", "drizzle", "bits-ui", etc. (optional)',
            },
            topK: {
              type: 'number',
              description: 'Number of fix recommendations to return (1-6, default 3)',
              default: 3,
            },
            includeClusterSummary: {
              type: 'boolean',
              description:
                'Include the GPU cluster narrative (purpose, patterns, warnings) in context (default true)',
              default: true,
            },
          },
          required: ['error'],
        },
      },
      {
        name: 'codeintel.ace.context',
        description:
          'Assemble a normalized ACE CodeIntel context bundle from cluster summaries, chunk metadata, and health stats. Returns structured JSON ready for Gemma4 prompting or Claude Code fix recommendations. Specify clusterIds and/or chunkIds to focus context, or omit for a broad overview.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'What you are trying to understand or fix — drives context selection',
            },
            repoId: {
              type: 'string',
              description: 'Repository ID (default: "default")',
              default: 'default',
            },
            clusterIds: {
              type: 'array',
              items: { type: 'number' },
              description: 'Optional list of GPU cluster IDs to include (0-19)',
            },
            chunkIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of Qdrant chunk IDs or relative file paths',
            },
            limit: {
              type: 'number',
              description: 'Max cluster summaries to include (default 20)',
              default: 20,
            },
          },
          required: ['query'],
        },
      },

      // ── Graph Indexing ────────────────────────────────────────────────────
      {
        name: 'graph.index',
        description:
          'Trigger graph indexing pipeline: Neo4j sync → SOM topology training → GPU graph analysis. ' +
          'Chains up to 3 stages in order. Run after codebase indexing to update all graph representations.',
        inputSchema: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: { type: 'string', enum: ['sync', 'som', 'analyze'] },
              description: 'Which steps to run (default: all three in order)',
              default: ['sync', 'som', 'analyze'],
            },
            caseId: {
              type: 'string',
              description: 'Optional case UUID to scope Neo4j sync (omit for full sync)',
            },
            somMaxFiles: {
              type: 'number',
              description: 'Max files for SOM topology training (default 2000)',
              default: 2000,
            },
          },
        },
      },
      {
        name: 'graph.status',
        description:
          'Report current graph indexing health: cluster count, chunk count, embedding coverage, Neo4j reachability.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ── ACE Wiki ──────────────────────────────────────────────────────────
      {
        name: 'ace.wiki',
        description:
          'Generate a structured wiki-style article about a query from ACE codebase context. ' +
          'Returns title, summary, 3-5 sections, related files, and related clusters. ' +
          'Falls back to heuristic content from cluster summaries when LLM is unavailable.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'What to generate a wiki article about (e.g. "authentication flow", "evidence pipeline")',
            },
            repoId: {
              type: 'string',
              description: 'Repository ID (default: "default")',
              default: 'default',
            },
            clusterIds: {
              type: 'array',
              items: { type: 'number' },
              description: 'Focus on specific GPU cluster IDs (omit for broad search)',
            },
            maxWords: {
              type: 'number',
              description: 'Approximate max article body word count (default 600)',
              default: 600,
            },
            task: {
              type: 'string',
              enum: ['explain', 'troubleshoot', 'overview', 'deep-dive'],
              description: 'Article style (default: explain)',
              default: 'explain',
            },
          },
          required: ['query'],
        },
      },

      // ─────────────────────────────────────────────────────────────────────
      // Lane 3: Deep Research — GitHub / Reddit / chunks_web_search
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'research:github_search',
        description:
          'Search GitHub issues, code, or repositories for deep research context. ' +
          'Results are embedded and upserted into the chunks_web_search Qdrant collection. ' +
          'Priority for ACE assembly: official docs > GitHub issues > Reddit posts.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'GitHub search query (max 256 chars, supports language:TypeScript etc.)',
            },
            type: {
              type: 'string',
              enum: ['issues', 'code', 'repos'],
              description: 'Search type — semantic only works for issues',
              default: 'issues',
            },
            semantic: {
              type: 'boolean',
              description: 'Use semantic search (issues only, requires GITHUB_TOKEN)',
              default: false,
            },
            limit: {
              type: 'number',
              description: 'Max results (1-100, default 20)',
              default: 20,
            },
            ingest: {
              type: 'boolean',
              description: 'Embed + upsert results into chunks_web_search (default: true)',
              default: true,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'research:reddit_search',
        description:
          'Search Reddit posts for community knowledge. Always uses raw_json=1 to prevent ' +
          'HTML entity corruption. Keyword only (no semantic variant). ' +
          'Uses sort=top + t=year for highest quality signal.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Keyword search query (max 512 chars)',
            },
            subreddit: {
              type: 'string',
              description:
                'Limit to a subreddit (e.g. "svelte", "typescript") — omit for all-Reddit',
            },
            sort: {
              type: 'string',
              enum: ['relevance', 'top', 'hot', 'new', 'comments'],
              default: 'top',
            },
            timeRange: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
              default: 'year',
            },
            limit: {
              type: 'number',
              description: 'Max results (1-100, default 25)',
              default: 25,
            },
            ingest: {
              type: 'boolean',
              description: 'Embed + upsert results into chunks_web_search (default: true)',
              default: true,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'research:search_chunks',
        description:
          'Semantic search over the chunks_web_search collection. Returns ranked results from ' +
          'previously ingested GitHub issues, Reddit posts, and web pages. ' +
          'Use to retrieve research context for ACE assembly.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to embed and match against research chunks',
            },
            sources: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'github_issue',
                  'github_code',
                  'github_repo',
                  'reddit_post',
                  'web_page',
                  'official_docs',
                ],
              },
              description: 'Filter by source type (omit for all)',
            },
            limit: {
              type: 'number',
              description: 'Max results to return (1-50, default 10)',
              default: 10,
            },
            scoreThreshold: {
              type: 'number',
              description: 'Min cosine similarity threshold (0-1, default 0.55)',
              default: 0.55,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'kb.search_cards',
        description: 'Semantic search across the codebase index returning structured "cards" (identity spine format). Use for finding relevant code with stable IDs for grounding.',
        inputSchema: {
          type: 'object',
          properties: {
            query:  { type: 'string', description: 'Semantic query (e.g. "auth middleware logic")' },
            limit:  { type: 'number', description: 'Max cards to return (1-20)', default: 10 },
            filters: { type: 'object', description: 'Optional metadata filters (kind, domain, extension)' }
          },
          required: ['query']
        }
      },
      {
        name: 'kb.search_schema_contract',
        description: 'Semantic search across the standalone schema-indexer contract cards. Use for schema-focused prompt context engineering and MCP routing without touching workspace-gap cards.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Semantic query (e.g. "pgTable schema indexer")' },
            limit: { type: 'number', description: 'Max cards to return (1-20)', default: 10 },
          },
          required: ['query']
        }
      },
      {
        name: 'kb.get_card',
        description: 'Retrieve a single codebase card by its stable chunk_id (card:path:hash). Returns full content, metadata, and cluster context.',
        inputSchema: {
          type: 'object',
          properties: {
            chunk_id: { type: 'string', description: 'The stable ID of the chunk' }
          },
          required: ['chunk_id']
        }
      },
      {
        name: 'kb.expand_neighbors',
        description: 'Get immediate graph neighbors for a card from the hypergraph. Returns related cards linked by imports, shared symbols, or topological proximity.',
        inputSchema: {
          type: 'object',
          properties: {
            chunk_id: { type: 'string', description: 'The starting card ID' },
            hops:     { type: 'number', description: 'Traversal depth (1-2, default 1)', default: 1 }
          },
          required: ['chunk_id']
        }
      },
      {
        name: 'kb.explain_retrieval',
        description: 'Explain why a specific card was retrieved for a query. Returns rank, similarity score, cluster dominance analysis, and topological authority context.',
        inputSchema: {
          type: 'object',
          properties: {
            query:    { type: 'string', description: 'The original search query' },
            chunk_id: { type: 'string', description: 'The ID of the retrieved card (optional)' }
          },
          required: ['query']
        }
      },
      {
        name: 'kb.rg_atlas_search',
        description:
          'Full RG-Atlas search pipeline: rg lexical sweep → GPU Karpathy blend → ' +
          'multi-query Qdrant union → MS-MARCO cross-encoder rerank → LangExtract GRPO → ' +
          'cosine-weighted final blend. Returns ranked hits with per-stage score breakdown. ' +
          'Use for deep codebase search that combines lexical precision with semantic recall. ' +
          'Lighter alternatives: kb.search_cards (semantic only) or kb.trace_search (TRACE MCP).',
        inputSchema: {
          type: 'object',
          properties: {
            query:             { type: 'string',  description: 'Search query — regex for lexical stage, NL for semantic stages' },
            paths:             { type: 'array',   items: { type: 'string' }, description: 'Directories to scan. Default: ["src"]' },
            file_types:        { type: 'array',   items: { type: 'string' }, description: 'File extensions for rg. Default: ["ts","svelte"]' },
            variant_count:     { type: 'number',  description: 'Multi-query variants (1-5). Default: 3' },
            top_k_per_lane:    { type: 'number',  description: 'Qdrant hits per variant. Default: 20' },
            enable_marco:      { type: 'boolean', description: 'Run MS-MARCO cross-encoder rerank. Default: true' },
            enable_langextract:{ type: 'boolean', description: 'Run LangExtract GRPO validation. Default: false (slow)' },
            persist:           { type: 'boolean', description: 'Write run + hits to Postgres for replay. Default: false' },
          },
          required: ['query']
        }
      },
      {
        name: 'ast:cross_language',
        description:
          'Synthesize cross-language equivalents for a TypeScript/JS function. ' +
          'Uses codebase AST context (GPU k-means clusters) + Lane 3 deep-research grounding ' +
          '(official_docs > github_issue > reddit_post) to produce idiomatic translations. ' +
          'Runs background-only (never blocks interactive chat). ' +
          'Supported targets: python, rust, go, java, csharp.',
        inputSchema: {
          type: 'object',
          properties: {
            sourceCode: {
              type: 'string',
              description: 'Source function code to translate',
            },
            sourceLanguage: {
              type: 'string',
              enum: ['typescript', 'python', 'rust', 'go', 'java', 'csharp'],
              description: 'Language of the source code (default: typescript)',
              default: 'typescript',
            },
            targetLanguages: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['python', 'rust', 'go', 'java', 'csharp', 'typescript'],
              },
              description: 'Target languages to synthesize',
              minItems: 1,
            },
            functionName: {
              type: 'string',
              description: 'Optional function/method name hint for context retrieval',
            },
            domainHint: {
              type: 'string',
              description: 'Optional domain hint (e.g. "evidence pipeline", "auth")',
            },
            maxTokensPerTarget: {
              type: 'number',
              description: 'Max tokens per target language synthesis (default: 1024)',
              default: 1024,
            },
          },
          required: ['sourceCode', 'targetLanguages'],
        },
      },
      {
        name: 'wiki.status',
        description: 'Returns high-level status of the codebase knowledge base (Karpathy/AGENTS). includes page count, last updated, and stale directories.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'wiki.search',
        description: 'Searches the codebase wiki (Karpathy/AGENTS) using a hybrid approach: lexical ripgrep, graph metadata, and semantic Qdrant. Returns ranked pages with summaries and confidence.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results', default: 10 },
          },
          required: ['query'],
        },
      },
      {
        name: 'wiki.explain_page',
        description: 'Returns a detailed explanation of a specific wiki page (directory or feature), including related files, imports, clusters, and activity scores.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Wiki page ID (e.g. agents:dir:src-lib-server)' },
          },
          required: ['id'],
        },
      },
      {
        name: 'wiki.refresh_directory',
        description: 'Refreshes one directory card (LLMS.md mirror). Default dryRun=true.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path to refresh' },
            dryRun: { type: 'boolean', description: 'Perform a dry run (default true)', default: true },
          },
          required: ['path'],
        },
      },
      {
        name: 'vlm:switch_mode',
        description: 'Switch the VLM inference mode between TEXT (TurboQuant) and VISION (Ollama VLM). Use this to prevent VRAM OOM on 8GB cards when switching between text-heavy and image-heavy tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['TEXT', 'VISION', 'OFF'],
              description: 'Target mode (TEXT = TurboQuant, VISION = Ollama VLM, OFF = shut down both)'
            }
          },
          required: ['mode']
        }
      },
      {
        name: 'llm_synthesis.log_event',
        description:
          'Durably log an LLM synthesis event: writes to Postgres llm_synthesis_events, ' +
          'caches a hot copy in Redis (ace:packet:{runId}, 1h TTL), and appends a row to ' +
          'the daily JSONL training dataset. Audit-only — never triggers inference. ' +
          'Forbidden fields (hiddenThoughts, chainOfThought, kv_cache, tensor, cudaPointer) ' +
          'are rejected with an error.',
        inputSchema: {
          type: 'object',
          properties: {
            runId:      { type: 'string',  description: 'Unique ID for this synthesis run (required)' },
            sessionId:  { type: 'string',  description: 'Session ID (optional)' },
            userId:     { type: 'number',  description: 'Integer user ID from Lucia auth (optional)' },
            authUserId: { type: 'string',  description: 'String Lucia user ID for cross-reference (optional)' },
            query:      { type: 'string',  description: 'The user query that triggered synthesis (required)' },
            profile:    { type: 'string',  description: 'ACE retrieval profile, e.g. code_debug, legal_qa (required)' },
            acePacket:  { type: 'object',  description: 'ACE context packet — must include lanes and sourceRefs (required)' },
            toolCalls:  { type: 'array',   items: { type: 'string' }, description: 'MCP/ACE tool names invoked during this run' },
            sourceRefs: { type: 'array',   items: { type: 'string' }, description: 'File paths or doc IDs that grounded the answer' },
            cacheKeys:  { type: 'object',  description: 'Redis/BitFrost cache key state (exactHit, semanticHit, etc.)' },
            trustTier:  { type: 'string',  description: 'Trust classification, e.g. local_code_plus_official_docs' },
            model:      { type: 'string',  description: 'Model ID used for synthesis (required)' },
            validation: { type: 'object',  description: 'Validation state — testsPassed, commandRun, etc.' },
          },
          required: ['runId', 'query', 'profile', 'acePacket', 'model'],
        },
      },
      {
        name: 'agents_md',
        description: 'Resolve the nearest AGENTS.md file for a given source path. Checks Redis first (agents:dir:<path>) then walks up the directory hierarchy on disk.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path or directory relative to sveltekit-frontend root' },
          },
          required: ['path'],
        },
      },
      ...REPAIR_TOOLS_SCHEMAS as any[],

    ],
  }));

  // ── SNES RPC Cache Bus — MCP read-only tool cache ────────────────────────
  //
  // Deterministic read-only MCP tools get a Redis-backed L1 cache so repeated
  // agent calls within the TTL window return immediately. Mutating tools are
  // excluded (apply_patch, write_file, run_command, state-altering calls).
  //
  // Key shape: rpc:mcp:<tool>:v1:<sha256(args)[0:16]>
  // TTL: 3600s (1 hr) — overridable per tool via MCP_CACHE_TTL_SECONDS env.

  const MCP_READONLY_TOOLS = new Set([
    'LLMS.md',
    'codebase:search',
    'codebase:ace_context',
    'codebase:graph_neighbors',
    'codebase:explain_cluster',
    'codebase:file_intel',
    'codebase:export_bundle',
    'cluster.summary.get',
    'clusters.get_summary_lenses',
    'chunk.lookup',
    'rag:search',
    'gpu:similarity',
    'embedding:generate',
    'citations:search',
    'citations:list_by_case',
    'reports:list',
    'analytics:deep_research',
    'analytics:research_topics',
    'kb.search_cards',
    'kb.get_card',
    'kb.expand_neighbors',
    'kb.explain_retrieval',
    'kb.rg_atlas_search',
    'wiki.status',
    'wiki.search',
    'wiki.explain_page',
  ]);

  const MCP_CACHE_TTL = parseInt(process.env.MCP_CACHE_TTL_SECONDS ?? '3600', 10);

  let _mcpRedis: any = null;
  async function getMcpRedis() {
    if (_mcpRedis) return _mcpRedis;
    try {
      const { default: Redis } = await import('ioredis');
      const url = ENV.REDIS_URL;
      _mcpRedis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1000 });
      _mcpRedis.on('error', () => { _mcpRedis = null; });
    } catch { _mcpRedis = null; }
    return _mcpRedis;
  }

  function mcpArgsHash(args: Record<string, any>): string {
    return createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
  }

  async function withMcpCache(
    name: string,
    args: Record<string, any>,
    compute: () => Promise<any>,
  ): Promise<any> {
    if (!MCP_READONLY_TOOLS.has(name)) return compute();
    const key = `rpc:mcp:${name}:v1:${mcpArgsHash(args)}`;
    try {
      const redis = await getMcpRedis();
      if (redis) {
        const cached = await redis.get(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Inject cache metadata into first text content block
          if (Array.isArray(parsed?.content) && parsed.content[0]?.type === 'text') {
            try {
              const payload = JSON.parse(parsed.content[0].text);
              parsed.content[0].text = JSON.stringify({ ...payload, _rpc_cache: { hit: true, key } });
            } catch { /* non-JSON text content — return as-is */ }
          }
          return parsed;
        }
      }
    } catch { /* Redis unavailable — fall through */ }

    const result = await compute();

    try {
      const redis = await getMcpRedis();
      if (redis) await redis.set(key, JSON.stringify(result), 'EX', MCP_CACHE_TTL);
    } catch { /* non-fatal */ }

    return result;
  }

  // Reusable tool handler for compose:pipeline reuse
  async function handleToolCall(name: string, args: Record<string, any>): Promise<any> {
    return withMcpCache(name, args, () => _handleToolCallInner(name, args));
  }

  async function _handleToolCallInner(name: string, args: Record<string, any>): Promise<any> {
    const repairResult = await handleRepairToolCall(name, args);
    if (repairResult) return repairResult;

    switch (name) {
      case 'vlm:switch_mode': {
        const { mode } = args as { mode: VlmMode };
        const result = await switchVlmMode(mode);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'wiki.status': {
        const result = await getWikiStatus();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'wiki.search': {
        const { query, limit } = args as { query: string; limit?: number };
        const result = await searchWiki(query, { limit });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'wiki.explain_page': {
        const { id } = args as { id: string };
        const result = await explainWikiPage(id);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      
      case 'wiki.refresh_directory': {
        const { path: dirPath, dryRun } = args as { path: string; dryRun?: boolean };
        const result = await refreshDirectory(dirPath, dryRun ?? true);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'agents_md': {
        const { path: filePath } = args as { path: string };
        const hit = await resolveAgentsMdQuickHit(filePath);
        if (!hit) {
          return { content: [{ type: 'text', text: JSON.stringify({ path: filePath, resolvedBy: null, markdown: null }) }] };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              path: filePath,
              resolvedBy: hit.source,
              resolvedPath: hit.resolvedPath,
              resolvedKey: hit.resolvedKey ?? null,
              markdown: hit.markdown,
            }),
          }],
        };
      }

      case 'cases:load': {

        const result = await mcpTools.cases.loadCases(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'rag:search': {
        const { query, topK } = args as { query: string; topK?: number };
        const result = await mcpTools.rag.webSearch(query, { topK });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'memory:prior_answer_lookup': {
        const { lookupPriorAnswerMemory, renderPriorAnswerSection } = await import('$lib/server/cache/code-llm-index.js');
        const hit = await lookupPriorAnswerMemory(args as Parameters<typeof lookupPriorAnswerMemory>[0]);
        if (!hit) {
          return { content: [{ type: 'text', text: JSON.stringify({ found: false }) }] };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              found:      true,
              layer:      hit.layer,
              latencyMs:  hit.latencyMs,
              path:       hit.path,
              source:     hit.source,
              clusterId:  hit.glyphClusterId,
              meta:       hit.meta,
              llmOutput:  hit.llmOutput,
              promptSection: renderPriorAnswerSection(hit),
            }),
          }],
        };
      }

      case 'rag:index_page': {
        const { url, chunkSize, chunkOverlap } = args as {
          url: string;
          chunkSize?: number;
          chunkOverlap?: number;
        };
        const startMs = Date.now();

        // 1. Fetch page content
        const response = await fetch(url, {
          headers: { 'User-Agent': 'DeedsLegalBot/1.0 (+legal-research)' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        const html = await response.text();

        // 2. Strip HTML → plain text
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100_000);

        if (text.length < 50) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  indexed: false,
                  error: 'Page content too short',
                  url,
                  textLength: text.length,
                }),
              },
            ],
          };
        }

        // 3. Chunk text
        const size = chunkSize ?? 500;
        const overlap = chunkOverlap ?? 100;
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += size - overlap) {
          chunks.push(text.slice(i, i + size));
          if (i + size >= text.length) break;
        }

        // 4. Generate embeddings via Ollama
        const { ollamaFetch } = await import('../lib/server/ollama.js');
        const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
        const embeddings: number[][] = [];

        for (const chunk of chunks) {
          try {
            const res = await ollamaFetch(`${OLLAMA_URL}/api/embed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'embeddinggemma:latest', input: chunk }),
            });
            const json = await res.json();
            const vec = json.embeddings?.[0] ?? json.embedding;
            if (Array.isArray(vec)) embeddings.push(vec);
          } catch {
            embeddings.push([]); // skip failed embeddings
          }
        }

        // 5. Store in Qdrant knowledge_base collection
        const QDRANT_URL = ENV.QDRANT_URL;
        const collection = 'knowledge_base';
        const points = chunks
          .map((chunk, i) => ({
            id: crypto.randomUUID(),
            vector: embeddings[i] ?? [],
            payload: {
              content: chunk,
              source: url,
              chunk_index: i,
              doc_name: new URL(url).pathname.split('/').pop() || 'web-page',
              indexed_at: new Date().toISOString(),
              source_type: 'web',
            },
          }))
          .filter((p) => p.vector.length > 0);

        if (points.length > 0) {
          await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points }),
          });
        }

        const elapsed = Date.now() - startMs;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                indexed: true,
                url,
                textLength: text.length,
                chunks: chunks.length,
                embedded: points.length,
                collection,
                processingTimeMs: elapsed,
              }),
            },
          ],
        };
      }

      case 'playwright:browser_action': {
        const { action, url: targetUrl, selector, value } = args;

        // Call the Playwright test infrastructure via the app's test API
        const testUrl = ENV.PUBLIC_API_URL;
        if (action === 'goto' && targetUrl) {
          // Navigate + screenshot via the test runner
          const { chromium } = await import('playwright');
          const browser = await chromium.launch({ headless: true });
          const page = await browser.newPage();
          try {
            await page.goto(targetUrl, { timeout: 15_000, waitUntil: 'networkidle' });
            if (selector && action === 'click') {
              await page.click(selector, { timeout: 5_000 });
            }
            if (selector && action === 'fill' && value) {
              await page.fill(selector, value, { timeout: 5_000 });
            }
            const screenshot = await page.screenshot({ type: 'png' });
            const title = await page.title();
            const htmlContent = await page.content();
            await browser.close();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    action,
                    url: targetUrl,
                    title,
                    contentLength: htmlContent.length,
                    screenshotSize: screenshot.length,
                    timestamp: new Date().toISOString(),
                  }),
                },
              ],
            };
          } catch (err: any) {
            await browser.close();
            throw new Error(`Browser action '${action}' failed: ${err.message}`);
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Action '${action}' requires a url parameter`,
              }),
            },
          ],
          isError: true,
        };
      }

      case 'transcribe_audio': {
        const { evidenceId, audioUrl } = args as { evidenceId: string; audioUrl: string };
        const { transcribeAudio, isDoclingAvailable } = await import('../lib/server/docling.js');

        if (!(await isDoclingAvailable())) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Docling ASR unavailable — python/docling_analyze.py not found',
                  evidenceId,
                }),
              },
            ],
            isError: true,
          };
        }

        // Fetch audio from MinIO
        const audioBuffer = await mcpGetFile(audioUrl);

        // Detect MIME from extension
        const ext = audioUrl.split('.').pop()?.toLowerCase() || '';
        const mimeMap: Record<string, string> = {
          mp3: 'audio/mpeg',
          wav: 'audio/wav',
          m4a: 'audio/mp4',
          ogg: 'audio/ogg',
          flac: 'audio/flac',
        };
        const mimeType = mimeMap[ext] || 'audio/wav';

        const result = await transcribeAudio(audioBuffer, mimeType);
        const wordCount = result.fullText.split(/\s+/).filter(Boolean).length;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                evidenceId,
                transcript: result.fullText,
                wordCount,
                blocks: result.blocks,
                processingTimeMs: result.processingTimeMs,
              }),
            },
          ],
        };
      }

      case 'evidence:analyze': {
        const { evidenceId, text, evidenceType } = args as {
          evidenceId: string;
          text: string;
          evidenceType?: string;
        };
        const { extractEntities } = await import('../lib/server/analysis/entity-extraction.js');
        const { detectForensicPatterns } = await import('../lib/server/analysis/forensics.js');
        const { autoTagDocument } = await import('../lib/server/ace/auto-tagger.js');

        const [entities, forensics, tags] = await Promise.all([
          extractEntities(text.slice(0, 50_000)).catch(() => []),
          Promise.resolve(detectForensicPatterns(text.slice(0, 50_000))),
          autoTagDocument({
            documentId: evidenceId,
            text: text.slice(0, 15_000),
            maxTags: 20,
          }).catch(() => ({ tags: [], mirrored: 0 })),
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                evidenceId,
                entities: entities.length,
                forensicFlags: forensics.length,
                highSeverityFlags: forensics.filter((f: any) => f.severity === 'high').length,
                tags: tags.tags?.length ?? 0,
                tagsMirrored: tags.mirrored ?? 0,
              }),
            },
          ],
        };
      }

      case 'evidence:analyze_multimodal': {
        const {
          evidenceId,
          fileUrl,
          evidenceType,
          analyzeVision,
          analyzeAudio,
          extractEmbeddings,
        } = args;
        const FASTAPI_URL = ENV.FASTAPI_URL;

        // Fetch file from MinIO
        const fileBuffer = await mcpGetFile(fileUrl);

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
          body: formData as unknown as BodyInit,
          headers: formData.getHeaders(),
        } as RequestInit);

        if (!response.ok) {
          throw new Error(
            `Multimodal analysis failed: ${response.status} ${await response.text()}`
          );
        }

        const result = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'evidence:detect_objects': {
        const { evidenceId, imageUrl, confidenceThreshold } = args;
        const FASTAPI_URL = ENV.FASTAPI_URL;

        // Fetch image from MinIO
        const imageBuffer = await mcpGetFile(imageUrl);

        // Call FastAPI vision endpoint
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append('file', imageBuffer, { filename: imageUrl.split('/').pop() || 'image' });

        const url = new URL(`${FASTAPI_URL}/vision/analyze`);
        url.searchParams.set('evidence_id', evidenceId);
        url.searchParams.set('confidence_threshold', String(confidenceThreshold ?? 0.5));

        const response = await fetch(url.toString(), {
          method: 'POST',
          body: formData as unknown as BodyInit,
          headers: formData.getHeaders(),
        } as RequestInit);

        if (!response.ok) {
          throw new Error(`Object detection failed: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'evidence:transcribe_gpu': {
        const { evidenceId, audioUrl, language, wordTimestamps } = args;
        const FASTAPI_URL = ENV.FASTAPI_URL;

        // Fetch audio from MinIO
        const audioBuffer = await mcpGetFile(audioUrl);

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
          body: formData as unknown as BodyInit,
          headers: formData.getHeaders(),
        } as RequestInit);

        if (!response.ok) {
          throw new Error(`GPU transcription failed: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'evidence:search_similar': {
        const { query, modalities, topK } = args;
        const FASTAPI_URL = ENV.FASTAPI_URL;

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
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'reports:list': {
        const result = await mcpTools.reports.listReports(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'reports:create': {
        const result = await mcpTools.reports.createReport(
          args as Parameters<typeof mcpTools.reports.createReport>[0]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'reports:generate_from_template': {
        const result = await mcpTools.reports.generateFromTemplate(
          args as Parameters<typeof mcpTools.reports.generateFromTemplate>[0]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'reports:update': {
        const result = await mcpTools.reports.updateReport(
          args as Parameters<typeof mcpTools.reports.updateReport>[0]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'reports:delete': {
        const { reportId } = args as { reportId: string };
        const result = await mcpTools.reports.deleteReport(reportId);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'reports:export': {
        const result = await mcpTools.reports.exportReport(
          args as Parameters<typeof mcpTools.reports.exportReport>[0]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'cases:create': {
        const result = await mcpTools.cases.createCase(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'cases:update': {
        const { caseId, ...updates } = args as { caseId: string; [k: string]: any };
        const result = await mcpTools.cases.updateCase(caseId, updates);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'cases:delete': {
        const { caseId } = args as { caseId: string };
        const result = await mcpTools.cases.deleteCase(caseId);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'citations:search': {
        const result = await mcpTools.citations.searchCitations(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'citations:list_by_case': {
        const { caseId } = args as { caseId: string };
        const result = await mcpTools.citations.listByCaseId(caseId);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'citations:add_to_case': {
        const result = await mcpTools.citations.addToCase(
          args as Parameters<typeof mcpTools.citations.addToCase>[0]
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      // ─────────────────────────────────────────────────────────────────────
      // GPU Direct — bypass HTTP for hot-path operations
      // ─────────────────────────────────────────────────────────────────────
      case 'embedding:generate': {
        const { texts } = args as { texts: string[] };
        if (!Array.isArray(texts) || texts.length === 0) {
          throw new Error('texts must be a non-empty array');
        }
        const capped = texts.slice(0, 32).map((t) => t.slice(0, 2048));
        const { generateEmbeddings } = await import('../lib/server/grpc/embedding-client.js');
        const embeddings = await generateEmbeddings(capped);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: embeddings.vectors.length,
                dimensions: embeddings.vectors[0]?.length ?? 0,
                embeddings: embeddings.vectors,
              }),
            },
          ],
        };
      }

      case 'gpu:similarity': {
        const { embeddings } = args as { embeddings: number[][] };
        if (!Array.isArray(embeddings) || embeddings.length < 2) {
          throw new Error('embeddings must contain at least 2 vectors');
        }
        try {
          const { graphSimilarity } = await import('../lib/server/gpu/libtorch-bridge.js');
          const matrix = await graphSimilarity(embeddings);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  size: embeddings.length,
                  backend: 'libtorch-cuda',
                  matrix,
                }),
              },
            ],
          };
        } catch {
          // CPU fallback: manual cosine similarity
          const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
          const norm = (a: number[]) => Math.sqrt(dot(a, a));
          const matrix = embeddings.map((a) =>
            embeddings.map((b) => {
              const d = norm(a) * norm(b);
              return d > 0 ? Math.round((dot(a, b) / d) * 1000) / 1000 : 0;
            })
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  size: embeddings.length,
                  backend: 'cpu-fallback',
                  matrix,
                }),
              },
            ],
          };
        }
      }

      case 'kb.search_cards': {
        const { query, limit = 10, filters = {} } = args as { query: string; limit?: number; filters?: Record<string, any> };
        const results = await searchNotecards({
          query,
          limit,
          filters: filters as Parameters<typeof searchNotecards>[0]['filters'],
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              count: results.length,
              cards: results.map((hit) => ({
                chunk_id: hit.card_id,
                source_path: hit.source_path,
                score: hit.score,
                why: hit.why,
                kind: hit.kind,
                tags: hit.tags,
                rank_score: hit.rank_score,
                content: hit.context_text,
              })),
            }),
          }],
        };
      }

      case 'kb.search_schema_contract': {
        const { query, limit = 10 } = args as { query: string; limit?: number };
        const results = await searchNotecards({
          query,
          limit,
          cardsPath: SCHEMA_INDEXER_CONTRACT_CARDS_PATH,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              count: results.length,
              retrieval_mode: 'schema-contract-lexical-rank',
              cards: results.map((hit) => ({
                chunk_id: hit.card_id,
                source_path: hit.source_path,
                score: hit.score,
                why: hit.why,
                kind: hit.kind,
                tags: hit.tags,
                rank_score: hit.rank_score,
                content: hit.context_text,
              })),
            }),
          }],
        };
      }

      case 'kb.get_card': {
        const { chunk_id } = args as { chunk_id: string };
        const card = (await getNotecardById(chunk_id)) ?? (await getNotecardBySourcePath(chunk_id));

        if (!card) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Card not found', chunk_id }) }],
            isError: true
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              card: {
                chunk_id: card.card_id,
                source_path: card.source_path,
                title: card.title,
                kind: card.kind,
                zone: card.zone,
                tags: card.tags,
                exports: card.exports,
                confidence: card.confidence,
                updated_at: card.updated_at,
                summary: card.search_text,
                content: card.context_text,
              },
            }),
          }],
        };
      }

      case 'kb.expand_neighbors': {
        const { chunk_id, hops = 1 } = args as { chunk_id: string; hops?: number };
        try {
          const expanded = await expandNotecardNeighbors({ cardId: chunk_id, hops, limit: 20 });

          if (!expanded) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Card not found', chunk_id }) }],
              isError: true,
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                root_id: chunk_id,
                center: {
                  chunk_id: expanded.center.card_id,
                  source_path: expanded.center.source_path,
                  title: expanded.center.title,
                  kind: expanded.center.kind,
                  tags: expanded.center.tags,
                },
                neighbors: expanded.neighbors.map((neighbor) => ({
                  chunk_id: neighbor.card_id,
                  source_path: neighbor.source_path,
                  title: neighbor.title,
                  kind: neighbor.kind,
                  tags: neighbor.tags,
                  hop: neighbor.hop,
                  via: neighbor.via,
                })),
              }),
            }],
          };
        } catch (err) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true };
        }
      }

      case 'kb.explain_retrieval': {
        const { query, chunk_id } = args as { query: string; chunk_id?: string };
        const matches = await searchNotecards({ query, limit: 20 });
        const card = chunk_id ? (await getNotecardById(chunk_id)) ?? (await getNotecardBySourcePath(chunk_id)) : null;
        const effectiveChunkId = chunk_id ?? matches[0]?.card_id ?? null;
        const match = matches.find((item) => item.card_id === effectiveChunkId || item.source_path === card?.source_path) ?? matches[0];

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              chunk_id: effectiveChunkId,
              explanation: {
                retrieval_mode: 'sparse-lexical-rank',
                score: match?.score ?? null,
                rank_score: match?.rank_score ?? null,
                why: match?.why ?? [],
              },
              context: { card: card ?? null, topMatch: match ?? null },
            }),
          }],
        };
      }

      case 'kb.rg_atlas_search': {
        const {
          query,
          paths,
          file_types,
          variant_count,
          top_k_per_lane,
          enable_marco,
          enable_langextract,
          persist,
        } = args as {
          query: string;
          paths?: string[];
          file_types?: string[];
          variant_count?: number;
          top_k_per_lane?: number;
          enable_marco?: boolean;
          enable_langextract?: boolean;
          persist?: boolean;
        };

        try {
          const opts: RgSearchAtlasOptions = {
            query,
            paths:               paths ?? ['src'],
            fileTypes:           file_types ?? ['ts', 'svelte'],
            variantCount:        variant_count ?? 3,
            topKPerLane:         top_k_per_lane ?? 20,
            enableMarcoRerank:   enable_marco ?? true,
            enableLangExtract:   enable_langextract ?? false,
            persist:             persist ?? false,
          };

          const result = await runRgSearchAtlas(opts);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                runId:      result.runId,
                query:      result.query,
                hitCount:   result.hits.length,
                clusterCount: result.clusters.length,
                diagnostics: result.diagnostics,
                hits: result.hits.slice(0, 30).map(h => ({
                  filePath:    h.filePath,
                  lineNumber:  h.lineNumber,
                  snippet:     h.snippet,
                  source:      h.source,
                  clusterId:   h.clusterId,
                  finalScore:  h.scores.final,
                  scoreBreakdown: {
                    marco:       h.scores.marco,
                    karpathy:    h.scores.karpathy,
                    qdrantCos:   h.scores.qdrantCosine,
                    langExtract: h.scores.langExtract,
                  },
                })),
                clusters: result.clusters.map(c => ({
                  id:          c.id,
                  memberFiles: c.memberFiles.slice(0, 10),
                })),
              }),
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: String(err), query }) }],
            isError: true,
          };
        }
      }

      case 'inference:route': {
        const { prompt, model, maxTokens, temperature, stream } = args as {
          prompt: string;
          model?: string;
          maxTokens?: number;
          temperature?: number;
          stream?: boolean;
        };
        try {
          const { routeInference } = await import('../lib/server/inference/inference-router.js');
          const result = await routeInference({
            prompt,
            model: model ?? 'gemma4-rotorquant:latest',
            maxTokens: maxTokens ?? 2048,
            temperature: temperature ?? 0.3,
            stream: stream ?? false,
          });
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch {
          // Direct Ollama fallback
          const { ollamaFetch } = await import('../lib/server/ollama.js');
          const ollamaUrl = ENV.OLLAMA_BASE_URL;
          const res = await ollamaFetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model ?? 'gemma4-rotorquant:latest',
              prompt,
              stream: false,
              options: { num_predict: maxTokens ?? 2048, temperature: temperature ?? 0.3 },
            }),
          });
          const data = await res.json();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  response: data.response ?? '',
                  model: data.model,
                  backend: 'ollama-direct-fallback',
                  evalCount: data.eval_count,
                }),
              },
            ],
          };
        }
      }

      case 'LLMS.md': {
        const targetPath = String(args.path ?? '').trim();
        if (!targetPath) throw new Error('path is required');

        const { resolveAgentsMdQuickHit } = await import('../lib/server/graph/community-graph.js');
        const hit = await resolveAgentsMdQuickHit(targetPath);

        if (!hit) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  path: targetPath,
                  markdown: null,
                  error: 'No LLMS.md found for this path (run npm run llms:write)',
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                path: targetPath,
                markdown: hit.markdown,
                length: hit.markdown.length,
                resolvedBy: hit.source,
                resolvedPath: hit.resolvedPath,
                resolvedKey: hit.resolvedKey ?? null,
              }),
            },
          ],
        };
      }

      // ─────────────────────────────────────────────────────────────────────
      // Codebase Search — Dual-vector semantic search via Qdrant
      // ─────────────────────────────────────────────────────────────────────
      case 'codebase:search': {
        const { query, limit, contentWeight, signatureWeight } = args as {
          query: string;
          limit?: number;
          contentWeight?: number;
          signatureWeight?: number;
        };
        const { searchCodebase } = await import('../lib/server/indexer/dual-embedder.js');
        const results = await searchCodebase(query, {
          limit: Math.min(Math.max(limit ?? 10, 1), 50),
          contentWeight: contentWeight ?? 0.6,
          signatureWeight: signatureWeight ?? 0.4,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query,
                total: results.length,
                results: results.map((r) => ({
                  path: r.chunk.path,
                  lineStart: r.chunk.lineStart,
                  lineEnd: r.chunk.lineEnd,
                  kind: r.chunk.kind,
                  score: Math.round(r.score * 1000) / 1000,
                  content: r.chunk.content?.slice(0, 500),
                  httpMethod: r.chunk.httpMethod,
                  routeId: r.chunk.routeId,
                  tags: r.chunk.tags,
                })),
              }),
            },
          ],
        };
      }

      case 'codebase:ace_context': {
        const {
          query: aceQuery,
          caseId: aceCaseId,
          enableCodebaseContext,
          includeResearch,
          persona: acePersona,
          maxTokens: aceMaxTokens,
        } = args as {
          query: string;
          caseId?: string;
          enableCodebaseContext?: boolean;
          includeResearch?: boolean;
          persona?: string;
          maxTokens?: number;
        };
        const { assembleACEContext, buildACEPromptCached } = await import(
          '../lib/server/ace/context-assembler.js'
        );
        const { ollamaFetch } = await import('../lib/server/ollama.js');

        const context = await assembleACEContext({
          query: aceQuery,
          caseId: aceCaseId,
          enableCodebaseContext: enableCodebaseContext ?? true,
          includeResearch: includeResearch ?? false,
          enableWebSearch: false,
          enableWikipedia: true,
          persona: acePersona as
            | import('../lib/server/ace/style-adapter.js').LegalPersona
            | undefined,
        });
        const acePrompt = await buildACEPromptCached(context, aceQuery);

        const ollamaUrl = ENV.OLLAMA_BASE_URL;
        const llmRes = await ollamaFetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.LLM_MODEL || 'gemma4-rotorquant:latest',
            prompt: aceQuery,
            system: acePrompt.systemPrompt,
            stream: false,
            options: { num_predict: aceMaxTokens ?? 2048, temperature: 0.4 },
          }),
        });
        const llmData = await llmRes.json();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: aceQuery,
                answer: llmData.response ?? '',
                confidenceFactors: acePrompt.confidenceFactors,
                contextSources: {
                  ragChunks: context.ragChunks.length,
                  kagNeighbors: context.kagNeighbors.length,
                  codebaseChunks: context.codebaseContext?.length ?? 0,
                  hasEvidence: !!context.evidenceMetadata?.length,
                  hasGlossary: !!context.glossaryMatches?.length,
                  hasUserProfile: !!context.userProfile,
                  hasCaseContext: !!context.caseContext,
                  hasResearch: !!context.webSearchContext?.includes('Deep Research'),
                },
                model: llmData.model,
                tokensUsed: llmData.prompt_eval_count + (llmData.eval_count ?? 0),
              }),
            },
          ],
        };
      }

      // ─────────────────────────────────────────────────────────────────────
      // Codebase Cluster Explain (Step 8 MCP bridge)
      // ─────────────────────────────────────────────────────────────────────
      case 'codebase:explain_cluster': {
        const {
          clusterId: inputClusterId,
          query: clusterQuery,
          maxFiles = 5,
          force = false,
        } = args as {
          clusterId?: number;
          query?: string;
          maxFiles?: number;
          force?: boolean;
        };

        // Resolve clusterId — either from input or via Qdrant semantic search
        let resolvedClusterId: number | null = inputClusterId ?? null;

        if (resolvedClusterId == null && clusterQuery) {
          const { searchCodebase } = await import('../lib/server/indexer/dual-embedder.js');
          const hits = await searchCodebase(clusterQuery, {
            limit: maxFiles,
            contentWeight: 0.6,
            signatureWeight: 0.4,
          });
          const topCluster = hits[0]?.chunk?.neo4j_gpuCluster ?? hits[0]?.chunk?.som_cluster;
          if (typeof topCluster === 'number') resolvedClusterId = topCluster;
        }

        if (resolvedClusterId == null) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Provide clusterId or query to resolve one' }),
              },
            ],
          };
        }

        const { generateClusterSummary } = await import('../lib/server/indexer/cluster-summary.js');
        const result = await generateClusterSummary(resolvedClusterId, force);

        if (result.ok === false) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: result.reason }),
              },
            ],
          };
        }
        const summary = result.summary;

        // If a free-text query was provided, return the top-scoring search hits
        // from that cluster so the caller has grounding evidence
        let clusterChunks: Array<{ path: string; score: number; content: string }> = [];
        if (clusterQuery) {
          const { searchCodebase } = await import('../lib/server/indexer/dual-embedder.js');
          const hits = await searchCodebase(clusterQuery, { limit: maxFiles * 2 });
          clusterChunks = hits
            .filter((h) => {
              const hCluster = h.chunk?.neo4j_gpuCluster ?? h.chunk?.som_cluster;
              return hCluster === resolvedClusterId;
            })
            .slice(0, maxFiles)
            .map((h) => ({
              path: String(h.chunk.path ?? h.chunk.relativePath ?? ''),
              score: Math.round(h.score * 1000) / 1000,
              content: String(h.chunk.content ?? '').slice(0, 500),
            }));
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                clusterId: resolvedClusterId,
                purpose: summary.purpose,
                summary: summary.summary,
                patterns: summary.patterns,
                keyFiles: summary.keyFiles,
                warnings: summary.warnings,
                generatedAt: summary.generatedAt,
                chunks: clusterChunks,
              }),
            },
          ],
        };
      }

      case 'codebase:get_buffer': {
        const {
          bufferKey = 'architecture-overview',
          bakeIfMissing = true,
          lastHash,
        } = args as {
          bufferKey?: string;
          bakeIfMissing?: boolean;
          lastHash?: string;
        };
        const { getBuffer, bakeArchitectureBuffer } = await import(
          '../lib/server/retrieval/context-buffer.js'
        );

        let buffer = await getBuffer(bufferKey);

        if (!buffer && bakeIfMissing && bufferKey === 'architecture-overview') {
          const content = await bakeArchitectureBuffer();
          buffer = {
            content,
            tokenCount: Math.ceil(content.length / 4),
            updatedAt: new Date().toISOString(),
            hash: (await import('node:crypto'))
              .createHash('sha256')
              .update(content)
              .digest('hex')
              .slice(0, 16),
          };
        }

        if (!buffer) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: `Buffer '${bufferKey}' not found.` }) },
            ],
            isError: true,
          };
        }

        if (lastHash && buffer.hash === lastHash) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  bufferKey,
                  status: 'no_change',
                  hash: buffer.hash,
                  updatedAt: buffer.updatedAt,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                bufferKey,
                status: 'ok',
                content: buffer.content,
                tokenCount: buffer.tokenCount,
                updatedAt: buffer.updatedAt,
                hash: buffer.hash,
              }),
            },
          ],
        };
      }

      // ─────────────────────────────────────────────────────────────────────
      // LangExtract Handlers — Call Python service on port 8095
      // ─────────────────────────────────────────────────────────────────────
      case 'langextract:legal': {
        const { text, extraction_passes, temperature } = args as {
          text: string;
          extraction_passes?: number;
          temperature?: number;
        };
        const LANGEXTRACT_URL = ENV.LANGEXTRACT_URL;

        const response = await fetch(`${LANGEXTRACT_URL}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.slice(0, 50000),
            extraction_type: 'legal',
            extraction_passes: extraction_passes ?? 1,
            temperature: temperature ?? 0.3,
          }),
        });

        if (!response.ok) {
          throw new Error(`LangExtract failed: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'langextract:evidence': {
        const { text, extraction_passes, temperature } = args as {
          text: string;
          extraction_passes?: number;
          temperature?: number;
        };
        const LANGEXTRACT_URL = ENV.LANGEXTRACT_URL;

        const response = await fetch(`${LANGEXTRACT_URL}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.slice(0, 50000),
            extraction_type: 'evidence',
            extraction_passes: extraction_passes ?? 1,
            temperature: temperature ?? 0.3,
          }),
        });

        if (!response.ok) {
          throw new Error(`LangExtract failed: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'langextract:file': {
        const { file_path, extraction_type, extraction_passes } = args as {
          file_path: string;
          extraction_type?: string;
          extraction_passes?: number;
        };
        const LANGEXTRACT_URL = ENV.LANGEXTRACT_URL;

        const response = await fetch(`${LANGEXTRACT_URL}/extract/file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path,
            extraction_type: extraction_type ?? 'legal',
            extraction_passes: extraction_passes ?? 2,
          }),
        });

        if (!response.ok) {
          throw new Error(`LangExtract file failed: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'langextract:custom': {
        const { text, prompt, examples, extraction_passes } = args as {
          text: string;
          prompt: string;
          examples?: any[];
          extraction_passes?: number;
        };
        const LANGEXTRACT_URL = ENV.LANGEXTRACT_URL;

        const response = await fetch(`${LANGEXTRACT_URL}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.slice(0, 50000),
            extraction_type: 'custom',
            custom_prompt: prompt,
            custom_examples: examples ?? [],
            extraction_passes: extraction_passes ?? 1,
          }),
        });

        if (!response.ok) {
          throw new Error(`LangExtract custom failed: ${response.status} ${await response.text()}`);
        }

        const result = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      // ─────────────────────────────────────────────────────────────────────
      // Compose Pipeline — Chain multiple tools sequentially
      // ─────────────────────────────────────────────────────────────────────
      case 'compose:pipeline': {
        const { steps, stopOnError } = args as {
          steps: Array<{ tool: string; args: Record<string, any> }>;
          stopOnError?: boolean;
        };

        if (!Array.isArray(steps) || steps.length === 0) {
          throw new Error('Pipeline requires at least one step');
        }
        if (steps.length > 10) {
          throw new Error('Pipeline limited to 10 steps');
        }

        const results: any[] = [];
        const pipelineStart = Date.now();

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          // Template substitution: replace {{stepN.field}} with actual values
          let resolvedArgs = JSON.stringify(step.args);
          for (let j = 0; j < results.length; j++) {
            const pattern = new RegExp(`\\{\\{step${j}\\.([^}]+)\\}\\}`, 'g');
            resolvedArgs = resolvedArgs.replace(pattern, (_match, field) => {
              try {
                const parsed = typeof results[j] === 'string' ? JSON.parse(results[j]) : results[j];
                const keys = field.split('.');
                let val = parsed;
                for (const k of keys) val = val?.[k];
                return typeof val === 'string' ? val : JSON.stringify(val ?? null);
              } catch {
                return 'null';
              }
            });
          }

          try {
            const stepResult = await handleToolCall(step.tool, JSON.parse(resolvedArgs));
            const text = stepResult?.content?.[0]?.text ?? JSON.stringify(stepResult);
            results.push(text);
          } catch (err: any) {
            results.push(JSON.stringify({ error: err.message, step: i, tool: step.tool }));
            if (stopOnError !== false) break;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                pipeline: true,
                stepsCompleted: results.length,
                totalSteps: steps.length,
                processingTimeMs: Date.now() - pipelineStart,
                results,
              }),
            },
          ],
        };
      }

      // ─────────────────────────────────────────────────────────────────────
      // Codebase File Intelligence
      // ─────────────────────────────────────────────────────────────────────
      case 'codebase:file_intel': {
        const { path: filePath } = args as { path: string };
        if (!filePath) throw new Error('path is required');

        const { getNeo4jDriver } = await import('../lib/server/neo4j-driver.js');
        const { couchdb: couch } = await import('../lib/server/services/couchdb-client.js');

        const fileId = (filePath.startsWith('src/') ? filePath : `src/${filePath}`).replace(
          /[^a-zA-Z0-9/_.-]/g,
          '_'
        );

        const driver = getNeo4jDriver();
        const session = driver.session({ database: 'neo4j' });

        let node: Record<string, unknown> | null = null;
        let imports: unknown[] = [];
        let importedBy: unknown[] = [];

        try {
          const [nr, outr, inr] = await Promise.all([
            session.run(
              `MATCH (f:CodebaseFile {id: $id})
                 RETURN f.id AS id, f.filePath AS filePath, f.type AS type,
                        f.cluster AS cluster, f.gpuCluster AS gpuCluster,
                        f.lineCount AS lineCount, f.complexity AS complexity,
                        f.importCount AS importCount, f.exportCount AS exportCount`,
              { id: fileId }
            ),
            session.run(
              `MATCH (a:CodebaseFile {id: $id})-[:IMPORTS]->(b:CodebaseFile)
                 RETURN b.filePath AS filePath, b.type AS type LIMIT 30`,
              { id: fileId }
            ),
            session.run(
              `MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile {id: $id})
                 RETURN a.filePath AS filePath, a.type AS type LIMIT 30`,
              { id: fileId }
            ),
          ]);
          if (nr.records[0]) {
            node = Object.fromEntries(
              [
                'id',
                'filePath',
                'type',
                'cluster',
                'gpuCluster',
                'lineCount',
                'complexity',
                'importCount',
                'exportCount',
              ].map((k) => [k, nr.records[0].get(k)])
            );
          }
          imports = outr.records.map((r) => ({ filePath: r.get('filePath'), type: r.get('type') }));
          importedBy = inr.records.map((r) => ({
            filePath: r.get('filePath'),
            type: r.get('type'),
          }));
        } finally {
          await session.close();
        }

        const recoDoc = await couch
          .get('graph_recommendations', `graph-reco:file:${fileId}`)
          .catch(() => null);

        const result = {
          fileId,
          filePath,
          node,
          graph: { imports, importedBy },
          recommendations: recoDoc,
        };
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'codebase:graph_neighbors': {
        const { path: filePath, direction = 'both' } = args as { path: string; direction?: string };
        if (!filePath) throw new Error('path is required');

        const { getNeo4jDriver } = await import('../lib/server/neo4j-driver.js');
        const fileId = (filePath.startsWith('src/') ? filePath : `src/${filePath}`).replace(
          /[^a-zA-Z0-9/_.-]/g,
          '_'
        );

        const driver = getNeo4jDriver();
        const session = driver.session({ database: 'neo4j' });

        let imports: unknown[] = [];
        let importedBy: unknown[] = [];

        try {
          if (direction === 'both' || direction === 'imports') {
            const r = await session.run(
              `MATCH (a:CodebaseFile {id: $id})-[:IMPORTS]->(b:CodebaseFile)
                 RETURN b.filePath AS filePath, b.type AS type, b.cluster AS cluster LIMIT 50`,
              { id: fileId }
            );
            imports = r.records.map((rec) => ({
              filePath: rec.get('filePath'),
              type: rec.get('type'),
              cluster: rec.get('cluster'),
            }));
          }
          if (direction === 'both' || direction === 'importedBy') {
            const r = await session.run(
              `MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile {id: $id})
                 RETURN a.filePath AS filePath, a.type AS type, a.cluster AS cluster LIMIT 50`,
              { id: fileId }
            );
            importedBy = r.records.map((rec) => ({
              filePath: rec.get('filePath'),
              type: rec.get('type'),
              cluster: rec.get('cluster'),
            }));
          }
        } finally {
          await session.close();
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                fileId,
                filePath,
                direction,
                imports,
                importedBy,
                summary: { importCount: imports.length, importedByCount: importedBy.length },
              }),
            },
          ],
        };
      }

      // ── Codebase: Multi-hop Graph Traversal ──────────────────────────────
      case 'codebase:graph_traverse': {
        const {
          path: traversePath,
          hops: rawHops = 2,
          mode: traverseMode = 'bfs',
          direction: traverseDir = 'both',
          limit: rawLimit = 50,
        } = args as {
          path: string;
          hops?: number;
          mode?: string;
          direction?: string;
          limit?: number;
        };

        if (!traversePath) throw new Error('path is required');

        const hops = Math.min(4, Math.max(1, Number(rawHops)));
        const limit = Math.min(200, Math.max(1, Number(rawLimit)));
        const mode = ['bfs', 'ego', 'cluster'].includes(traverseMode) ? traverseMode : 'bfs';
        const direction = ['imports', 'importedBy', 'both'].includes(traverseDir)
          ? traverseDir
          : 'both';

        const { getNeo4jDriver } = await import('../lib/server/neo4j-driver.js');
        const fileId = (
          traversePath.startsWith('src/') ? traversePath : `src/${traversePath}`
        ).replace(/[^a-zA-Z0-9/_.-]/g, '_');

        const driver = getNeo4jDriver();
        const session = driver.session({ database: 'neo4j' });

        const nodeMap = new Map<
          string,
          { id: string; filePath: string; type: string; cluster: number }
        >();
        const edgeSet = new Set<string>();
        const edges: Array<{ source: string; target: string }> = [];

        const addEdge = (src: string, tgt: string) => {
          const key = `${src}→${tgt}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: src, target: tgt });
          }
        };

        try {
          const toNum = (v: unknown): number => {
            if (v != null && typeof (v as { toNumber?: () => number }).toNumber === 'function') {
              return (v as { toNumber: () => number }).toNumber();
            }
            return (v as number) ?? 0;
          };

          if (mode === 'ego') {
            const [rOut, rIn] = await Promise.all([
              session.run(
                `MATCH (a:CodebaseFile {id: $id})-[:IMPORTS]->(b:CodebaseFile)
                 RETURN b.id AS id, b.filePath AS fp, b.type AS type, b.cluster AS cluster
                 LIMIT $limit`,
                { id: fileId, limit }
              ),
              session.run(
                `MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile {id: $id})
                 RETURN a.id AS id, a.filePath AS fp, a.type AS type, a.cluster AS cluster
                 LIMIT $limit`,
                { id: fileId, limit }
              ),
            ]);
            for (const rec of rOut.records) {
              const id = rec.get('id') as string;
              if (id) {
                nodeMap.set(id, {
                  id,
                  filePath: (rec.get('fp') as string) ?? id,
                  type: (rec.get('type') as string) ?? '',
                  cluster: toNum(rec.get('cluster')),
                });
                addEdge(fileId, id);
              }
            }
            for (const rec of rIn.records) {
              const id = rec.get('id') as string;
              if (id) {
                nodeMap.set(id, {
                  id,
                  filePath: (rec.get('fp') as string) ?? id,
                  type: (rec.get('type') as string) ?? '',
                  cluster: toNum(rec.get('cluster')),
                });
                addEdge(id, fileId);
              }
            }
          } else if (mode === 'cluster') {
            const r = await session.run(
              `MATCH (a:CodebaseFile {id: $id})
               MATCH (b:CodebaseFile) WHERE b.cluster = a.cluster AND b.id <> $id
               RETURN b.id AS id, b.filePath AS fp, b.type AS type, b.cluster AS cluster
               LIMIT $limit`,
              { id: fileId, limit }
            );
            for (const rec of r.records) {
              const id = rec.get('id') as string;
              if (id) {
                nodeMap.set(id, {
                  id,
                  filePath: (rec.get('fp') as string) ?? id,
                  type: (rec.get('type') as string) ?? '',
                  cluster: toNum(rec.get('cluster')),
                });
              }
            }
          } else {
            // bfs — variable-length path
            const hopStr = `1..${hops}`;
            const queries: Promise<{ records: unknown[] }>[] = [];

            if (direction === 'imports' || direction === 'both') {
              queries.push(
                session.run(
                  `MATCH (a:CodebaseFile {id: $id})-[:IMPORTS*${hopStr}]->(b:CodebaseFile)
                   WITH a, b
                   MATCH path=(a)-[:IMPORTS*${hopStr}]->(b)
                   UNWIND relationships(path) AS rel
                   WITH startNode(rel) AS src, endNode(rel) AS tgt
                   RETURN DISTINCT
                     src.id AS srcId, src.filePath AS srcFp, src.type AS srcType, src.cluster AS srcCluster,
                     tgt.id AS tgtId, tgt.filePath AS tgtFp, tgt.type AS tgtType, tgt.cluster AS tgtCluster
                   LIMIT $limit`,
                  { id: fileId, limit }
                ) as Promise<{ records: unknown[] }>
              );
            }
            if (direction === 'importedBy' || direction === 'both') {
              queries.push(
                session.run(
                  `MATCH (b:CodebaseFile)-[:IMPORTS*${hopStr}]->(a:CodebaseFile {id: $id})
                   WITH a, b
                   MATCH path=(b)-[:IMPORTS*${hopStr}]->(a)
                   UNWIND relationships(path) AS rel
                   WITH startNode(rel) AS src, endNode(rel) AS tgt
                   RETURN DISTINCT
                     src.id AS srcId, src.filePath AS srcFp, src.type AS srcType, src.cluster AS srcCluster,
                     tgt.id AS tgtId, tgt.filePath AS tgtFp, tgt.type AS tgtType, tgt.cluster AS tgtCluster
                   LIMIT $limit`,
                  { id: fileId, limit }
                ) as Promise<{ records: unknown[] }>
              );
            }

            const results = await Promise.all(queries);
            for (const r of results) {
              for (const _rec of r.records) {
                const rec = _rec as { get: (k: string) => unknown };
                const srcId = rec.get('srcId') as string;
                const tgtId = rec.get('tgtId') as string;
                if (!srcId || !tgtId) continue;
                if (!nodeMap.has(srcId)) {
                  nodeMap.set(srcId, {
                    id: srcId,
                    filePath: (rec.get('srcFp') as string) ?? srcId,
                    type: (rec.get('srcType') as string) ?? '',
                    cluster: toNum(rec.get('srcCluster')),
                  });
                }
                if (!nodeMap.has(tgtId)) {
                  nodeMap.set(tgtId, {
                    id: tgtId,
                    filePath: (rec.get('tgtFp') as string) ?? tgtId,
                    type: (rec.get('tgtType') as string) ?? '',
                    cluster: toNum(rec.get('tgtCluster')),
                  });
                }
                addEdge(srcId, tgtId);
              }
            }
          }
        } finally {
          await session.close();
        }

        // Always include the start node
        if (!nodeMap.has(fileId)) {
          nodeMap.set(fileId, { id: fileId, filePath: traversePath, type: '', cluster: 0 });
        }

        const rawNodes = Array.from(nodeMap.values());
        const n = rawNodes.length;
        const pageRankScores: number[] = new Array(n).fill(1 / Math.max(n, 1));

        if (n >= 2 && edges.length > 0) {
          try {
            const { pageRankGPU } = await import('../lib/server/gpu/pytorch-graph.js');
            const nodeIndex = new Map(rawNodes.map((nd, i) => [nd.id, i]));
            const adj = new Float32Array(n * n);
            for (const e of edges) {
              const src = nodeIndex.get(e.source);
              const tgt = nodeIndex.get(e.target);
              if (src !== undefined && tgt !== undefined) {
                adj[src * n + tgt] = 1;
              }
            }
            const { scores } = pageRankGPU(adj, n);
            for (let i = 0; i < n; i++) pageRankScores[i] = scores[i];
          } catch {
            // addon not loaded or OOM — leave uniform scores
          }
        }

        const nodes = rawNodes.map((nd, i) => ({ ...nd, pageRankScore: pageRankScores[i] }));
        const topByRank = [...nodes]
          .sort((a, b) => b.pageRankScore - a.pageRankScore)
          .slice(0, 5)
          .map((nd) => nd.filePath);

        const summary =
          `Traversed ${mode} graph from ${traversePath} (${hops} hop${hops === 1 ? '' : 's'}, ` +
          `direction=${direction}). Found ${nodes.length} nodes and ${edges.length} edges. ` +
          (topByRank.length > 0
            ? `Top nodes by PageRank: ${topByRank.join(', ')}.`
            : 'No edges found (start node may be isolated).');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                nodes,
                edges,
                pageRankScores: Object.fromEntries(
                  nodes.map((nd) => [nd.filePath, nd.pageRankScore])
                ),
                total: nodes.length,
                truncated: nodes.length >= limit,
                meta: { hops, mode, direction, startNode: traversePath },
                summary,
              }),
            },
          ],
        };
      }

      // ── Analytics: Deep Research ──────────────────────────────────────────
      case 'analytics:deep_research': {
        const { generateDeepResearch } = await import('$lib/server/analytics/deep-research.js');
        const userId = String(args.userId ?? 'anonymous');
        const refresh = Boolean(args.refresh ?? false);
        const result = await generateDeepResearch(userId, { skipCache: refresh });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      // ── Analytics: Research Topics (JSONL index) ──────────────────────────
      case 'analytics:research_topics': {
        const {
          queryResearchIndex,
          buildResearchIndex,
          invalidateResearchIndex,
          getResearchIndexStats,
        } = await import('$lib/server/analytics/research-cache.js');

        const pipeline = (args.pipeline ?? 'all') as Parameters<typeof queryResearchIndex>[0];
        const limit = Math.min(50, Math.max(1, Number(args.limit ?? 12)));
        const rebuild = Boolean(args.rebuild ?? false);
        const domains = String(args.domains ?? '')
          .split(',')
          .map((d: string) => d.trim())
          .filter(Boolean);

        if (rebuild) {
          await invalidateResearchIndex();
        }

        const [sketches, stats] = await Promise.all([
          queryResearchIndex(pipeline, limit),
          getResearchIndexStats(),
        ]);

        // Seed domain topics for codebase pipeline when index is sparse
        const DOMAIN_SEEDS: Record<string, string[]> = {
          typescript: [
            'How do TypeScript generics constrain Drizzle ORM query builders?',
            'What unsafe casts remain in the server layer?',
          ],
          sveltekit: [
            'How does SvelteKit 2 layout hierarchy affect SSR caching?',
            'Which routes misuse throw error() inside try/catch?',
          ],
          ripgrep: [
            'What files import from db/index instead of db/client?',
            'Which API routes are missing Zod validation?',
          ],
          awk: [
            'Aggregate chunk score distribution from chunk_hit_log.',
            'Compute avg search_time_ms per pipeline grouped by day.',
          ],
          ollama: [
            'Optimal KV cache quantisation for gemma4-rotorquant:latest at 8K context?',
            'Flash Attention trade-offs on RTX 3060 Ti.',
          ],
        };
        const seedTopics = domains
          .flatMap((d: string) => DOMAIN_SEEDS[d.toLowerCase()] ?? [])
          .slice(0, 6);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ sketches, seedTopics, meta: { pipeline, limit, ...stats } }),
            },
          ],
        };
      }

      // ── Codebase: Ripgrep Search ──────────────────────────────────────────
      case 'codebase:rg_search': {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        const pattern = String(args.pattern ?? '');
        const fileGlob = String(args.fileGlob ?? '*.{ts,svelte}');
        const maxRes = Math.min(200, Math.max(1, Number(args.maxResults ?? 40)));
        const noCase = Boolean(args.caseInsensitive ?? false);

        if (!pattern) throw new Error('pattern is required');

        const rgArgs = [
          '--no-heading',
          '--line-number',
          '--color=never',
          '--glob',
          fileGlob,
          ...(noCase ? ['-i'] : []),
          '--max-count',
          String(maxRes),
          pattern,
          'src',
        ];

        let output = '';
        try {
          const cwd = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
          const result = await execFileAsync('rg', rgArgs, { cwd, maxBuffer: 1_048_576 });
          output = result.stdout;
        } catch (err: any) {
          // rg exits 1 when no matches — that's OK
          output = err.stdout ?? '';
        }

        const lines = output.split('\n').filter(Boolean).slice(0, maxRes);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ pattern, fileGlob, matchCount: lines.length, matches: lines }),
            },
          ],
        };
      }

      // ── Analytics: MapReduce Matrix Analysis ─────────────────────────────
      case 'analytics:mapreduce_matrix': {
        const { executeMapReduceAnalysis } = await import(
          '$lib/server/analytics/mapreduce-matrix-analysis.js'
        );
        const userId = String(args.userId ?? 'anonymous');
        const days = Math.min(30, Math.max(1, Number(args.days ?? 7)));
        const topK = Math.min(100, Math.max(1, Number(args.topK ?? 20)));
        const synthesize = args.synthesize !== false;
        const result = await executeMapReduceAnalysis(userId, { days, topK, synthesize });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...result,
                matrix: result.matrix.map((r) => ({
                  chunkId: r.chunkId,
                  filePath: r.filePath,
                  scores: Array.from(r.scores),
                  composite: r.composite,
                })),
              }),
            },
          ],
        };
      }

      // ── Analytics: Unified Research Playground ────────────────────────────
      case 'analytics:unified_research': {
        const { executeUnifiedResearch } = await import(
          '$lib/server/analytics/unified-research-query.js'
        );
        const userId = String(args.userId ?? 'anonymous');
        const result = await executeUnifiedResearch(userId, {
          query: args.query ? String(args.query) : undefined,
          pipeline: args.pipeline ? String(args.pipeline) : 'all',
          domains: Array.isArray(args.domains) ? args.domains.map(String) : [],
          depth: Math.min(5, Math.max(1, Number(args.depth ?? 3))),
          days: Math.min(30, Math.max(1, Number(args.days ?? 7))),
          includeWeb: args.includeWeb !== false,
          includeCodebase: args.includeCodebase !== false,
          includeMatrix: args.includeMatrix !== false,
          rebuild: args.rebuild === true,
        });
        // Serialize Float64Arrays before JSON
        const safe = JSON.stringify(result, (_k, v) =>
          v instanceof Float64Array ? Array.from(v) : v
        );
        return { content: [{ type: 'text', text: safe }] };
      }

      // ── Analytics: Codebase Deep Research ─────────────────────────────────
      case 'analytics:codebase_research': {
        const { executeCodebaseResearch } = await import(
          '$lib/server/analytics/codebase-research.js'
        );
        const userId = String(args.userId ?? 'anonymous');
        const days = Math.min(30, Math.max(1, Number(args.days ?? 7)));
        const query = args.query ? String(args.query) : undefined;
        const synthesize = args.synthesize !== false;
        const result = await executeCodebaseResearch(userId, { days, query, synthesize });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      // ── Analytics: Web Research Crawler ────────────────────────────────────
      // ── Codebase: Concurrent LangGraph Research ──────────────────────────────────
      case 'codebase:concurrent_research': {
        const { runConcurrentResearch, formatGraphForClaudeCode } = await import(
          '$lib/server/ai/langgraph-research.js'
        );
        const query = String(args.query ?? '');
        const domains = Array.isArray(args.domains) ? args.domains : undefined;
        const limitPerWorker = Math.min(30, Math.max(3, Number(args.limitPerWorker ?? 12)));
        const format = args.format === 'markdown' ? 'markdown' : 'json';

        if (!query.trim()) throw new Error('query is required');

        const graph = await runConcurrentResearch(query, { domains, limitPerWorker });

        if (format === 'markdown') {
          const md = formatGraphForClaudeCode(graph);
          return { content: [{ type: 'text', text: md }] };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: graph.query,
                domains: graph.domains,
                supervisorSummary: graph.supervisorSummary,
                keyFindings: graph.keyFindings,
                actionItems: graph.actionItems,
                totalChunks: graph.totalChunks,
                totalDurationMs: graph.totalDurationMs,
                workers: graph.workerFindings.map((w) => ({
                  domain: w.domain,
                  chunkCount: w.chunks.length,
                  summary: w.summary,
                  keyInsights: w.keyInsights,
                  relevantPaths: w.relevantPaths,
                  source: w.source,
                  cached: w.cached,
                })),
              }),
            },
          ],
        };
      }

      case 'analytics:web_research': {
        const {
          crawlWebResearch,
          queryWebResearchIndex,
          getWebResearchStats,
          invalidateWebResearchCache,
          crawlLegalCorpus,
          queryCorpusIndex,
          getCorpusSearchStats,
          invalidateCorpusCache,
        } = await import('$lib/server/analytics/web-research-crawler.js');

        const action = String(args.action ?? 'crawl');
        const pipeline = String(args.pipeline ?? 'ace');
        const maxResults = Math.min(10, Math.max(1, Number(args.maxResults ?? 5)));

        if (action === 'invalidate') {
          await Promise.all([invalidateWebResearchCache(), invalidateCorpusCache()]);
          return { content: [{ type: 'text', text: JSON.stringify({ cleared: true }) }] };
        }
        if (action === 'stats') {
          const [webStats, corpusStats] = await Promise.all([
            getWebResearchStats(),
            getCorpusSearchStats(),
          ]);
          return {
            content: [
              { type: 'text', text: JSON.stringify({ web: webStats, corpus: corpusStats }) },
            ],
          };
        }
        if (action === 'query') {
          const limit = Math.min(50, Math.max(1, Number(args.maxResults ?? 20)));
          const summaries = await queryWebResearchIndex(pipeline, limit);
          return {
            content: [{ type: 'text', text: JSON.stringify({ summaries, source: 'web' }) }],
          };
        }
        if (action === 'corpus-query') {
          const limit = Math.min(50, Math.max(1, Number(args.maxResults ?? 20)));
          const summaries = await queryCorpusIndex(pipeline, limit);
          return {
            content: [{ type: 'text', text: JSON.stringify({ summaries, source: 'corpus' }) }],
          };
        }

        const selfPrompts: string[] = Array.isArray(args.selfPrompts)
          ? (args.selfPrompts as string[]).slice(0, 10)
          : [];
        if (!selfPrompts.length) throw new Error('selfPrompts must be a non-empty array');

        // action === 'corpus-search' — query local Qdrant legal collections
        if (action === 'corpus-search') {
          const batches = [];
          let totalSummaries = 0;
          for (const q of selfPrompts) {
            try {
              const batch = await crawlLegalCorpus(q, pipeline, maxResults);
              batches.push(batch);
              totalSummaries += batch.summaries.length;
            } catch {
              /* non-fatal */
            }
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  batches,
                  totalSummaries,
                  source: 'corpus',
                  indexedAt: new Date().toISOString(),
                }),
              },
            ],
          };
        }

        // action === 'crawl' — live web search
        const batches = [];
        let totalSummaries = 0;
        for (const q of selfPrompts) {
          try {
            const batch = await crawlWebResearch(q, pipeline, maxResults);
            batches.push(batch);
            totalSummaries += batch.summaries.length;
          } catch {
            /* non-fatal */
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                batches,
                totalSummaries,
                source: 'web',
                indexedAt: new Date().toISOString(),
              }),
            },
          ],
        };
      }

      // ─────────────────────────────────────────────────────────────────────
      // CodeIntel — cluster summaries, chunk lookup, job status
      // ─────────────────────────────────────────────────────────────────────
      case 'codeintel.health': {
        const { getClusterSummary } = await import('../lib/server/grpc/codeintel-client.js');
        // Quick probe: fetch cluster 0
        const c = await getClusterSummary('default', 0);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: c !== null, clusterZeroFound: c !== null }),
            },
          ],
        };
      }

      case 'cluster.summary.get': {
        const { gpuCluster, repoId } = args as { gpuCluster: number; repoId?: string };
        const { getClusterSummary } = await import('../lib/server/grpc/codeintel-client.js');
        const cluster = await getClusterSummary(repoId ?? 'default', gpuCluster);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ cluster, error: cluster ? null : 'not found' }),
            },
          ],
        };
      }

      case 'cluster.summary.refresh': {
        const { gpuCluster, repoId, force } = args as {
          gpuCluster: number;
          repoId?: string;
          force?: boolean;
        };
        const { refreshClusterSummary } = await import('../lib/server/grpc/codeintel-client.js');
        const result = await refreshClusterSummary(repoId ?? 'default', gpuCluster, force ?? true);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      case 'clusters.get_summary_lenses': {
        const { topK, query } = args as { topK?: number; query?: string };
        const redis = await getMcpRedis();
        try {
          // Scan all cluster:summary:* keys
          const keys: string[] = [];
          let cursor = '0';
          do {
            const [next, batch] = await redis.scan(cursor, 'MATCH', 'cluster:summary:*', 'COUNT', 200);
            keys.push(...(batch as string[]));
            cursor = next;
          } while (cursor !== '0');

          const lenses: {
            clusterId: number;
            label: string;
            summary: string;
            size: number;
            filePaths: string[];
            trainedAt: string;
          }[] = [];

          for (const key of keys) {
            const raw = await redis.get(key);
            if (!raw) continue;
            try {
              const rec = JSON.parse(raw);
              if (typeof rec.clusterId !== 'number') continue;
              const summary: string = rec.summary ?? '';
              if (query && !summary.toLowerCase().includes(query.toLowerCase())) continue;
              const firstSentence = summary.match(/^[^.!?\n]+[.!?]?/)?.[0]?.trim() ?? summary;
              lenses.push({
                clusterId:  rec.clusterId,
                label:      firstSentence.length > 80 ? firstSentence.slice(0, 77) + '…' : firstSentence || `Cluster ${rec.clusterId}`,
                summary,
                size:       rec.size ?? 0,
                filePaths:  (rec.filePaths ?? []).slice(0, 5),
                trainedAt:  rec.trainedAt ?? '',
              });
            } catch { /* skip malformed */ }
          }

          lenses.sort((a, b) => a.clusterId - b.clusterId);
          const result = topK ? lenses.slice(0, topK) : lenses;

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                total:  lenses.length,
                returned: result.length,
                query:  query ?? null,
                lenses: result,
              }),
            }],
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: err instanceof Error ? err.message : String(err), lenses: [] }),
            }],
          };
        }
      }

      case 'chunk.lookup': {
        const { chunkId, repoId } = args as { chunkId: string; repoId?: string };
        const { lookupChunk } = await import('../lib/server/grpc/codeintel-client.js');
        const chunk = await lookupChunk(repoId ?? 'default', chunkId);
        return {
          content: [
            { type: 'text', text: JSON.stringify({ chunk, error: chunk ? null : 'not found' }) },
          ],
        };
      }

      case 'codebase:export_bundle': {
        const { include, limit, repoId } = args as {
          include?: string;
          limit?: number;
          repoId?: string;
        };
        const baseUrl = ENV.PUBLIC_API_URL;
        const params = new URLSearchParams();
        if (include) params.set('include', include);
        if (typeof limit === 'number' && limit > 0) params.set('limit', String(limit));
        if (repoId) params.set('repoId', repoId);
        const qs = params.toString() ? `?${params.toString()}` : '';
        try {
          const res = await fetch(`${baseUrl}/api/codebase-index/export/bundle${qs}`, {
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: `bundle endpoint returned HTTP ${res.status}`,
                    graph: null,
                    clusters: null,
                    wikiNotes: null,
                    manifold4: null,
                    tileAtlas: null,
                    cacheStats: null,
                    meta: { sources: {}, errors: { fetch: `HTTP ${res.status}` } },
                  }),
                },
              ],
            };
          }
          const data = await res.text();
          return { content: [{ type: 'text', text: data }] };
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                  graph: null,
                  clusters: null,
                  wikiNotes: null,
                  manifold4: null,
                  tileAtlas: null,
                  cacheStats: null,
                  meta: { sources: {}, errors: { fetch: 'request failed' } },
                }),
              },
            ],
          };
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // CodeIntel Fix Recommender — ACE + enriched codebase index + Gemma4
      // ─────────────────────────────────────────────────────────────────────
      case 'codeintel.fix_recommend': {
        const {
          error: errMsg,
          filePath,
          line,
          codeSnippet,
          framework,
          topK,
          includeClusterSummary,
        } = args as {
          error: string;
          filePath?: string;
          line?: number;
          codeSnippet?: string;
          framework?: string;
          topK?: number;
          includeClusterSummary?: boolean;
        };

        if (!errMsg || typeof errMsg !== 'string') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: 'error field is required',
                  recommendations: [],
                }),
              },
            ],
          };
        }

        const { getFixRecommendations } = await import(
          '../lib/server/codeintel/fix-recommender.js'
        );
        const result = await getFixRecommendations({
          error: errMsg,
          filePath,
          line,
          codeSnippet,
          framework,
          topK: topK ?? 3,
          includeClusterSummary: includeClusterSummary !== false,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // ─────────────────────────────────────────────────────────────────────
      // ACE CodeIntel context assembly — cluster + chunk + health bundle
      // ─────────────────────────────────────────────────────────────────────
      case 'codeintel.ace.context': {
        const { query, repoId, clusterIds, chunkIds, limit } = args as {
          query: string;
          repoId?: string;
          clusterIds?: number[];
          chunkIds?: string[];
          limit?: number;
        };

        if (!query || typeof query !== 'string') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  query: '',
                  repoId: 'default',
                  clusterContext: [],
                  chunkContext: [],
                  health: { ok: false, chunkCount: 0, clusterCount: 0, embeddingCoverage: null },
                  degraded: true,
                  errors: ['query field is required'],
                }),
              },
            ],
          };
        }

        const { assembleAceContext } = await import('../lib/server/ace/codeintel-datastore.js');
        const context = await assembleAceContext(query, {
          repoId: repoId ?? 'default',
          clusterIds: Array.isArray(clusterIds) && clusterIds.length ? clusterIds : undefined,
          chunkIds: Array.isArray(chunkIds) && chunkIds.length ? chunkIds : undefined,
          limit: limit ?? 20,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(context) }],
        };
      }

      // ── Graph Indexing ────────────────────────────────────────────────────
      case 'graph.index': {
        // graph.index is a JOB TRIGGER — it fires the pipeline and returns immediately.
        // Use graph.status to poll progress. Never blocks on the full chain.
        const VALID_STAGES = ['sync', 'som', 'analyze'] as const;
        const requestedStages: string[] = Array.isArray(args.steps)
          ? (args.steps as string[]).filter((s) =>
              VALID_STAGES.includes(s as (typeof VALID_STAGES)[number])
            )
          : ['sync', 'som', 'analyze'];
        const caseId = args.caseId ? String(args.caseId) : undefined;

        const { withMcpLog } = await import('../lib/server/mcp/mcp-logger.js');

        const indexResult = await withMcpLog('graph.index', args, async () => {
          // Validate UUID if provided
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (caseId && !UUID_RE.test(caseId)) {
            return {
              ok: false,
              jobId: null,
              accepted: false,
              requestedStages,
              degraded: false,
              error: 'caseId must be a valid UUID',
            };
          }

          // Generate a job ID and start the pipeline fire-and-forget
          const jobId = crypto.randomUUID();
          const somMaxFiles = Math.min(5000, Math.max(1, Number(args.somMaxFiles ?? 2000)));

          // Fire-and-forget — errors are logged but do not fail the trigger response
          (async () => {
            try {
              if (requestedStages.includes('sync')) {
                const { syncCaseToGraph, syncAllCasesToGraph } = await import(
                  '../lib/server/graph/pg-neo4j-sync.js'
                );
                if (caseId) await syncCaseToGraph(caseId);
                else await syncAllCasesToGraph();
              }
              if (requestedStages.includes('som')) {
                const { runSOMTopologyPipeline } = await import(
                  '../lib/server/graph/som-topology-pipeline.js'
                );
                await runSOMTopologyPipeline({ maxFiles: somMaxFiles });
              }
              if (requestedStages.includes('analyze')) {
                const { analyzeGraph } = await import('../lib/server/graph/gpu-graph-analysis.js');
                await analyzeGraph({
                  includePageRank: true,
                  includeCommunities: true,
                  maxNodes: 500,
                });
              }
              console.log(
                JSON.stringify({ mcp: true, tool: 'graph.index', jobId, status: 'done' })
              );
            } catch (e: unknown) {
              console.error(
                JSON.stringify({
                  mcp: true,
                  tool: 'graph.index',
                  jobId,
                  status: 'failed',
                  error: e instanceof Error ? e.message : String(e),
                })
              );
            }
          })();

          return {
            ok: true,
            jobId,
            accepted: true,
            requestedStages,
            degraded: false,
            error: null,
          };
        });

        return { content: [{ type: 'text', text: JSON.stringify(indexResult) }] };
      }

      case 'graph.status': {
        const { withMcpLog } = await import('../lib/server/mcp/mcp-logger.js');

        const statusResult = await withMcpLog('graph.status', args, async () => {
          const EMPTY_GRAPH = { chunkCount: 0, clusterCount: 0, nodeCount: 0, edgeCount: 0 };

          // ── Postgres chunk/cluster counts ────────────────────────────────
          let graph = { ...EMPTY_GRAPH };
          let pgOk = false;
          try {
            const { getCodeIntelHealthForAce } = await import(
              '../lib/server/ace/codeintel-datastore.js'
            );
            const health = await getCodeIntelHealthForAce();
            graph.chunkCount = health.chunkCount;
            graph.clusterCount = health.clusterCount;
            pgOk = health.ok;
          } catch {
            /* non-fatal */
          }

          // ── Neo4j node/edge counts ───────────────────────────────────────
          try {
            const { getNeo4jDriver } = await import('../lib/server/neo4j-driver.js');
            const driver = getNeo4jDriver();
            const session = driver.session({ database: 'neo4j' });
            try {
              const [nodeRes, edgeRes] = await Promise.all([
                session.run('MATCH (n) RETURN count(n) AS c'),
                session.run('MATCH ()-[r]->() RETURN count(r) AS c'),
              ]);
              graph.nodeCount = (nodeRes.records[0]?.get('c') as { low: number })?.low ?? 0;
              graph.edgeCount = (edgeRes.records[0]?.get('c') as { low: number })?.low ?? 0;
            } finally {
              await session.close();
            }
          } catch {
            /* non-fatal — keep counts as 0 */
          }

          const degraded = !pgOk;
          return {
            ok: !degraded,
            graph,
            jobs: [] as Array<{
              jobId: string;
              status: string;
              stage: string | null;
              updatedAt: string | null;
            }>,
            degraded,
            error: degraded ? 'Codebase index not fully populated.' : null,
          };
        });

        return { content: [{ type: 'text', text: JSON.stringify(statusResult) }] };
      }

      // ── ACE Wiki ──────────────────────────────────────────────────────────
      case 'ace.wiki': {
        const {
          query: wikiQuery,
          repoId,
          clusterIds,
          maxWords,
          task,
        } = args as {
          query: string;
          repoId?: string;
          clusterIds?: number[];
          maxWords?: number;
          task?: 'explain' | 'troubleshoot' | 'overview' | 'deep-dive';
        };

        if (!wikiQuery || typeof wikiQuery !== 'string') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  query: '',
                  title: null,
                  summary: null,
                  sections: [],
                  relatedFiles: [],
                  relatedClusters: [],
                  degraded: true,
                  errors: ['query field is required'],
                  latencyMs: 0,
                }),
              },
            ],
          };
        }

        const { withMcpLog } = await import('../lib/server/mcp/mcp-logger.js');
        const { generateAceWiki } = await import('../lib/server/ace/ace-wiki.js');

        const wikiResult = await withMcpLog('ace.wiki', args, () =>
          generateAceWiki({
            query: wikiQuery,
            repoId: repoId ?? 'default',
            clusterIds: Array.isArray(clusterIds) ? clusterIds : undefined,
            maxWords: maxWords ?? 600,
            task: task ?? 'explain',
          })
        );

        return { content: [{ type: 'text', text: JSON.stringify(wikiResult) }] };
      }

      // ── Lane 3: Deep Research ──────────────────────────────────────────────
      case 'research:github_search': {
        const {
          query,
          type = 'issues',
          semantic = false,
          limit = 20,
          ingest = true,
        } = args as {
          query: string;
          type?: string;
          semantic?: boolean;
          limit?: number;
          ingest?: boolean;
        };

        const { searchGitHubIssues, searchGitHubCode, searchGitHubRepos } = await import(
          '../lib/server/research/github-harvester.js'
        );

        let chunks: any[] = [];
        if (type === 'issues') chunks = await searchGitHubIssues({ query, limit, semantic });
        else if (type === 'code') chunks = await searchGitHubCode({ query, limit });
        else if (type === 'repos') chunks = await searchGitHubRepos({ query, limit });

        let ingestResult = null;
        if (ingest && chunks.length) {
          const { ingestResearchChunks } = await import(
            '../lib/server/research/web-research-ingester.js'
          );
          ingestResult = await ingestResearchChunks(chunks, false);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                fetched: chunks.length,
                ingest: ingestResult,
                preview: chunks.slice(0, 3),
              }),
            },
          ],
        };
      }

      case 'research:reddit_search': {
        const {
          query,
          subreddit,
          sort = 'top',
          timeRange = 'year',
          limit = 25,
          ingest = true,
        } = args as {
          query: string;
          subreddit?: string;
          sort?: any;
          timeRange?: any;
          limit?: number;
          ingest?: boolean;
        };

        const { searchReddit } = await import('../lib/server/research/reddit-harvester.js');
        const { chunks } = await searchReddit({ query, subreddit, sort, timeRange, limit });

        let ingestResult = null;
        if (ingest && chunks.length) {
          const { ingestResearchChunks } = await import(
            '../lib/server/research/web-research-ingester.js'
          );
          ingestResult = await ingestResearchChunks(chunks, false);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                fetched: chunks.length,
                ingest: ingestResult,
                preview: chunks.slice(0, 3),
              }),
            },
          ],
        };
      }

      case 'research:search_chunks': {
        const {
          query,
          sources,
          limit = 10,
          scoreThreshold = 0.55,
        } = args as { query: string; sources?: any[]; limit?: number; scoreThreshold?: number };

        // Embed the query then search chunks_web_search
        const { generateEmbedding } = await import('../lib/server/grpc/embedding-client.js');
        const embedding = await generateEmbedding(query);
        if (!embedding?.length) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ results: [], error: 'embedding failed' }) },
            ],
          };
        }

        const { searchResearchChunks } = await import(
          '../lib/server/research/web-research-ingester.js'
        );
        const results = await searchResearchChunks({
          queryEmbedding: embedding,
          limit,
          sourceFilter: sources?.length ? sources : undefined,
          scoreThreshold,
        });

        return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
      }

      // ── AST Cross-Language Synthesis ──────────────────────────────────────
      case 'ast:cross_language': {
        const {
          sourceCode,
          sourceLanguage = 'typescript',
          targetLanguages,
          functionName,
          domainHint,
          maxTokensPerTarget = 1024,
        } = args as {
          sourceCode: string;
          sourceLanguage?: string;
          targetLanguages: string[];
          functionName?: string;
          domainHint?: string;
          maxTokensPerTarget?: number;
        };

        if (!sourceCode?.trim() || !targetLanguages?.length) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'sourceCode and targetLanguages are required' }),
              },
            ],
          };
        }

        const { synthesizeCrossLanguage } = await import(
          '../lib/server/ast/cross-language-synthesis.js'
        );
        const result = await synthesizeCrossLanguage(
          {
            sourceCode,
            sourceLanguage: sourceLanguage as any,
            targetLanguages: targetLanguages as any,
            functionName,
            domainHint,
            maxTokensPerTarget,
          },
          { temperature: 0.3 }
        );

        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'topology_search': {
        const { queryTopology: topoSearch } = await import(
          '$lib/server/retrieval/topology-search-client.js'
        );
        const query    = String(args.query ?? '').trim();
        const radius   = Math.min(Math.max(Number(args.radius   ?? 0.25), 0.05), 2.0);
        const limit    = Math.min(Math.max(Number(args.limit    ?? 15),   1),    40);
        const somCluster = args.somCluster != null ? Number(args.somCluster) : undefined;

        if (!query) {
          return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
        }

        const result = await topoSearch(query, { radius, limit, somCluster });
        if (!result) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Topology search engine unavailable (port 8101).',
                hint:  'Run: npm run topology:search:ensure',
              }),
            }],
            isError: true,
          };
        }

        const hits = result.hits.slice(0, limit).map((h) => ({
          path:               h.path,
          topoClass:          h.topoClass,
          topoHex:            h.topoHex,
          somCluster:         h.somCluster,
          hybridScore:        h.hybridScore ?? h.manifoldScore,
          cosineScore:        h.cosineScore ?? null,
          graphAuthorityScore: h.graphAuthorityScore ?? null,
          summary:            h.summary ?? h.contentPreview ?? '',
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              center:     result.center,
              radius,
              totalFound: result.totalFound,
              durationMs: result.durationMs,
              hits,
            }),
          }],
        };
      }

      case 'llm_synthesis.log_event': {
        const { logLlmSynthesisEvent } = await import('$lib/server/llm-synthesis/log-event.js');
        const runId      = String(args.runId ?? '').trim();
        const query      = String(args.query ?? '').trim();
        const profile    = String(args.profile ?? '').trim();
        const model      = String(args.model ?? '').trim();

        if (!runId || !query || !profile || !model) {
          return { content: [{ type: 'text', text: 'Error: runId, query, profile, and model are required' }], isError: true };
        }

        const acePacket = (args.acePacket as Record<string, unknown>) ?? {};
        if (!acePacket || typeof acePacket !== 'object') {
          return { content: [{ type: 'text', text: 'Error: acePacket must be an object' }], isError: true };
        }

        const recordId = await logLlmSynthesisEvent({
          runId,
          sessionId:  args.sessionId  != null ? String(args.sessionId)  : undefined,
          userId:     args.userId     != null ? Number(args.userId)      : undefined,
          authUserId: args.authUserId != null ? String(args.authUserId)  : undefined,
          query,
          profile,
          acePacket,
          toolCalls:  Array.isArray(args.toolCalls)  ? args.toolCalls  : [],
          sourceRefs: Array.isArray(args.sourceRefs) ? args.sourceRefs : [],
          cacheKeys:  (args.cacheKeys as Record<string, string>) ?? {},
          trustTier:  args.trustTier != null ? String(args.trustTier)   : undefined,
          model,
          validation: (args.validation as Record<string, unknown>) ?? {},
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ ok: true, id: recordId, runId, redisKey: `ace:packet:${runId}` }),
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ── Face: Identify (GRPO reranker via tool-router-client) ────────────────
  async function handleFaceIdentify(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { routeToolCall } = await import('$lib/server/grpc/tool-router-client.js');
    const result = await routeToolCall('face_identify', args);
    return {
      content: [
        { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) },
      ],
    };
  }

  // ── POI: face_synth (QLoRA synthetic data) ───────────────────────────────
  async function handlePoiFaceSynth(
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    // Call internal route handler via fetch (admin route, needs auth bypass)
    // Construct a direct DB call instead for server-side MCP context
    const { routeToolCall } = await import('$lib/server/grpc/tool-router-client.js');
    // face_synth isn't a contextual tool — forward as a structured summary call
    const summary = JSON.stringify({
      status: 'use_http',
      message:
        'Call POST /api/persons/face-synth with the provided args to generate QLoRA training pairs.',
      args,
    });
    return { content: [{ type: 'text', text: summary }] };
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      checkAuth(request);
      if (name === 'face:identify')
        return await handleFaceIdentify(args as Record<string, unknown>);
      if (name === 'poi:face_synth')
        return await handlePoiFaceSynth(args as Record<string, unknown>);
      return await handleToolCall(name, args as Record<string, any>);
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });
}

async function main() {
  setupToolHandlers();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Deeds Legal MCP Server running on stdio');
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))
) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}



