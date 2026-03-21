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
          'Detect objects in image evidence using YOLOv8 (GPU). Returns bounding boxes, class names, confidence scores for 80 COCO classes (person, weapon, vehicle, etc).',
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
              description: 'Use AI (Ollama gemma3-legal) to generate case-specific content',
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
      // ─────────────────────────────────────────────────────────────────────
      // LangExtract Tools — Google's official structured extraction library
      // Uses local Ollama (gemma3-legal) instead of Gemini API
      // ─────────────────────────────────────────────────────────────────────
      {
        name: 'langextract:legal',
        description:
          'Extract structured legal entities from text using Google LangExtract + gemma3-legal. Returns parties (plaintiff/defendant), dates, citations, money amounts, statutes, obligations with exact text locations for source grounding.',
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
                  tool: { type: 'string', description: 'Tool name to call (e.g., "codebase:search")' },
                  args: { type: 'object', description: 'Arguments for the tool. Use {{stepN.field}} to reference output of step N (0-indexed).' },
                },
                required: ['tool', 'args'],
              },
              description: 'Ordered list of tool invocations',
            },
            stopOnError: { type: 'boolean', description: 'Stop pipeline on first error', default: true },
          },
          required: ['steps'],
        },
      },
    ],
  }));

  // Reusable tool handler for compose:pipeline reuse
  async function handleToolCall(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'cases:load': {
        const result = await mcpTools.cases.loadCases(args as any);
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
            content: [{ type: 'text', text: JSON.stringify({
              indexed: false, error: 'Page content too short', url, textLength: text.length,
            }) }],
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
        const points = chunks.map((chunk, i) => ({
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
        })).filter(p => p.vector.length > 0);

        if (points.length > 0) {
          await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points }),
          });
        }

        const elapsed = Date.now() - startMs;
        return {
          content: [{ type: 'text', text: JSON.stringify({
            indexed: true,
            url,
            textLength: text.length,
            chunks: chunks.length,
            embedded: points.length,
            collection,
            processingTimeMs: elapsed,
          }) }],
        };
      }

      case 'playwright:browser_action': {
        const { action, url: targetUrl, selector, value } = args as any;

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
              content: [{ type: 'text', text: JSON.stringify({
                success: true,
                action,
                url: targetUrl,
                title,
                contentLength: htmlContent.length,
                screenshotSize: screenshot.length,
                timestamp: new Date().toISOString(),
              }) }],
            };
          } catch (err: any) {
            await browser.close();
            throw new Error(`Browser action '${action}' failed: ${err.message}`);
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: false,
            error: `Action '${action}' requires a url parameter`,
          }) }],
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
                  tags: (tags as any).tags?.length ?? 0,
                  tagsMirrored: (tags as any).mirrored ?? 0,
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
          } = args as any;
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
            throw new Error(
              `Multimodal analysis failed: ${response.status} ${await response.text()}`
            );
          }

          const result = await response.json();
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'evidence:detect_objects': {
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
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'evidence:transcribe_gpu': {
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
            throw new Error(
              `GPU transcription failed: ${response.status} ${await response.text()}`
            );
          }

          const result = await response.json();
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'evidence:search_similar': {
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
            throw new Error(
              `Cross-modal search failed: ${response.status} ${await response.text()}`
            );
          }

          const result = await response.json();
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'reports:list': {
          const result = await mcpTools.reports.listReports(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'reports:create': {
          const result = await mcpTools.reports.createReport(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'reports:generate_from_template': {
          const result = await mcpTools.reports.generateFromTemplate(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'reports:update': {
          const result = await mcpTools.reports.updateReport(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'reports:delete': {
          const { reportId } = args as { reportId: string };
          const result = await mcpTools.reports.deleteReport(reportId);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'reports:export': {
          const result = await mcpTools.reports.exportReport(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'cases:create': {
          const result = await mcpTools.cases.createCase(args as any);
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
          const result = await mcpTools.citations.searchCitations(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'citations:list_by_case': {
          const { caseId } = args as { caseId: string };
          const result = await mcpTools.citations.listByCaseId(caseId);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'citations:add_to_case': {
          const result = await mcpTools.citations.addToCase(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
            throw new Error(
              `LangExtract custom failed: ${response.status} ${await response.text()}`
            );
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
            content: [{ type: 'text', text: JSON.stringify({
              pipeline: true,
              stepsCompleted: results.length,
              totalSteps: steps.length,
              processingTimeMs: Date.now() - pipelineStart,
              results,
            }) }],
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



