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

// ─────────────────────────────────────────────────────────────────────
// Auth guard — checks MCP_AUTH_TOKEN env var when set
// ─────────────────────────────────────────────────────────────────────
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

function checkAuth(request: any): void {
  if (!MCP_AUTH_TOKEN) return; // no token configured → open access
  const token = request?.params?._meta?.authToken
    ?? request?.params?.arguments?._authToken;
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
      endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
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
function setupToolHandlers() {
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
              description: 'Use AI (Ollama gemma4-legal) to generate case-specific content',
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
            model: { type: 'string', description: 'Model name (default: gemma4-legal:latest)' },
            maxTokens: { type: 'number', description: 'Max output tokens', default: 2048 },
            temperature: { type: 'number', description: 'Sampling temperature', default: 0.3 },
            stream: { type: 'boolean', description: 'Enable streaming', default: false },
          },
          required: ['prompt'],
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
              description: 'Max file chunks to include when query-based lookup is used (default: 5)',
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
      // ─────────────────────────────────────────────────────────────────────
      // LangExtract Tools — Google's official structured extraction library
      // Uses local Ollama (gemma4-legal) instead of Gemini API
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'langextract:legal',
        description:
          'Extract structured legal entities from text using Google LangExtract + gemma4-legal. Returns parties (plaintiff/defendant), dates, citations, money amounts, statutes, obligations with exact text locations for source grounding.',
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
              description: 'Comma-separated codebase domain seeds: typescript,sveltekit,ripgrep,awk,ollama',
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
              description: 'Glob pattern to filter files (e.g. "*.ts", "*.svelte", "**/*.server.ts")',
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
    ],
  }));

  // Reusable tool handler for compose:pipeline reuse
  async function handleToolCall(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'cases:load': {
        const result = await mcpTools.cases.loadCases(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      case 'rag:search': {
        const { query, topK } = args as { query: string; topK?: number };
        const result = await mcpTools.rag.webSearch(query, { topK });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
        const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
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
        const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
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
        const testUrl = process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:5173';
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
        const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

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
        const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

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
        const FASTAPI_URL = process.env.FASTAPI_MULTIMODAL_URL || 'http://localhost:8000';

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
            model: model ?? 'gemma4-legal:latest',
            maxTokens: maxTokens ?? 2048,
            temperature: temperature ?? 0.3,
            stream: stream ?? false,
          });
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch {
          // Direct Ollama fallback
          const { ollamaFetch } = await import('../lib/server/ollama.js');
          const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
          const res = await ollamaFetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model ?? 'gemma4-legal:latest',
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
          persona: acePersona,
          maxTokens: aceMaxTokens,
        } = args as {
          query: string;
          caseId?: string;
          enableCodebaseContext?: boolean;
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
          enableWebSearch: false,
          enableWikipedia: true,
          persona: acePersona as
            | import('../lib/server/ace/style-adapter.js').LegalPersona
            | undefined,
        });
        const acePrompt = await buildACEPromptCached(context, aceQuery);

        const ollamaUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
        const llmRes = await ollamaFetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.LLM_MODEL || 'gemma4-legal:latest',
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
          const hits = await searchCodebase(clusterQuery, { limit: maxFiles, contentWeight: 0.6, signatureWeight: 0.4 });
          const topCluster = hits[0]?.chunk?.neo4j_gpuCluster ?? hits[0]?.chunk?.som_cluster;
          if (typeof topCluster === 'number') resolvedClusterId = topCluster;
        }

        if (resolvedClusterId == null) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Provide clusterId or query to resolve one' }) }],
          };
        }

        const { generateClusterSummary } = await import('../lib/server/indexer/cluster-summary.js');
        const summary = await generateClusterSummary(resolvedClusterId, force);

        if (!summary) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `No data for cluster ${resolvedClusterId}` }) }],
          };
        }

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
              path:    String(h.chunk.path ?? h.chunk.relativePath ?? ''),
              score:   Math.round(h.score * 1000) / 1000,
              content: String(h.chunk.content ?? '').slice(0, 500),
            }));
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                clusterId: resolvedClusterId,
                purpose:     summary.purpose,
                summary:     summary.summary,
                patterns:    summary.patterns,
                keyFiles:    summary.keyFiles,
                warnings:    summary.warnings,
                generatedAt: summary.generatedAt,
                chunks:      clusterChunks,
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
        const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://localhost:8095';

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
        const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://localhost:8095';

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
        const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://localhost:8095';

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
        const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://localhost:8095';

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
        const { couchdb: couch } = await import('../lib/services/couchdb-client.js');

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

      // ── Analytics: Deep Research ──────────────────────────────────────────
      case 'analytics:deep_research': {
        const { generateDeepResearch } = await import('$lib/server/analytics/deep-research.js');
        const userId  = String(args.userId ?? 'anonymous');
        const refresh = Boolean(args.refresh ?? false);
        const result  = await generateDeepResearch(userId, { skipCache: refresh });
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
        const limit    = Math.min(50, Math.max(1, Number(args.limit ?? 12)));
        const rebuild  = Boolean(args.rebuild ?? false);
        const domains  = String(args.domains ?? '').split(',').map((d: string) => d.trim()).filter(Boolean);

        if (rebuild) {
          await invalidateResearchIndex();
        }

        const [sketches, stats] = await Promise.all([
          queryResearchIndex(pipeline, limit),
          getResearchIndexStats(),
        ]);

        // Seed domain topics for codebase pipeline when index is sparse
        const DOMAIN_SEEDS: Record<string, string[]> = {
          typescript: ['How do TypeScript generics constrain Drizzle ORM query builders?', 'What unsafe casts remain in the server layer?'],
          sveltekit:  ['How does SvelteKit 2 layout hierarchy affect SSR caching?', 'Which routes misuse throw error() inside try/catch?'],
          ripgrep:    ['What files import from db/index instead of db/client?', 'Which API routes are missing Zod validation?'],
          awk:        ['Aggregate chunk score distribution from chunk_hit_log.', 'Compute avg search_time_ms per pipeline grouped by day.'],
          ollama:     ['Optimal KV cache quantisation for gemma4-legal at 8K context?', 'Flash Attention trade-offs on RTX 3060 Ti.'],
        };
        const seedTopics = domains.flatMap((d: string) => DOMAIN_SEEDS[d.toLowerCase()] ?? []).slice(0, 6);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ sketches, seedTopics, meta: { pipeline, limit, ...stats } }),
          }],
        };
      }

      // ── Codebase: Ripgrep Search ──────────────────────────────────────────
      case 'codebase:rg_search': {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        const pattern   = String(args.pattern ?? '');
        const fileGlob  = String(args.fileGlob ?? '*.{ts,svelte}');
        const maxRes    = Math.min(200, Math.max(1, Number(args.maxResults ?? 40)));
        const noCase    = Boolean(args.caseInsensitive ?? false);

        if (!pattern) throw new Error('pattern is required');

        const rgArgs = [
          '--no-heading', '--line-number', '--color=never',
          '--glob', fileGlob,
          ...(noCase ? ['-i'] : []),
          '--max-count', String(maxRes),
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
          content: [{
            type: 'text',
            text: JSON.stringify({ pattern, fileGlob, matchCount: lines.length, matches: lines }),
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      checkAuth(request);
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
  console.error("Deeds Legal MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});



