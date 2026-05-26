import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAutonomousAgent } from '$lib/server/agent/autonomous-agent.js';
import { SupervisorAgent } from '$lib/server/agent/supervisor.js';
import { SUBAGENT_TOOL_MAP } from '$lib/server/agent/subagents.js';
import { z } from 'zod';

/**
 * POST /api/agent/investigate
 *
 * - detect_objects: YOLO object detection (doc-layout preferred, COCO fallback)
 *
 * Request Body:
 * {
 *   query: string;           // Investigation query
 *   useACE?: boolean;        // Use ACE context engine (default: true)
 *   maxIterations?: number;  // Max tool invocations (default: 10)
 *   caseId?: string;         // Optional case context
 *   verbose?: boolean;       // Log intermediate steps (default: false)
 * }
 *
 * Response:
 * {
 *   answer: string;
 *   toolCalls: Array<{ tool: string; input: any; output: string; duration: number }>;
 *   reasoning: string[];
 *   aceContext?: ACEContext;
 *   duration: number;
 * }
 *
 * Tools Available:
 * - evidence_analyze: Entity extraction + forensics + auto-tagging
 * - multimodal_analyze: YOLO + Whisper + CLIP parallel analysis
 * - detect_objects: YOLOv8 object detection
 * - transcribe_audio: Whisper ASR with word timestamps
 * - search_similar: Cross-modal CLIP/Whisper search
 * - web_search: Docs/Stack Overflow/GitHub search
 * - ripgrep_search: Fast regex codebase search
 * - find_files: Glob pattern file finding
 * - analyze_file: File reading with syntax highlighting
 * - extract_pattern: awk/sed-like text processing
 * - analyze_imports: Dependency graph analysis
 * - cases_load: Database case loading
 * - rag_search: Semantic search via RAG pipeline
 * - ast_query: AST code structure analysis
 */
const investigateSchema = z.object({
  query: z.string().min(1, 'Query is required and must be a non-empty string').max(10000),
  useACE: z.boolean().optional().default(true),
  maxIterations: z
    .number()
    .int()
    .min(1, 'maxIterations must be between 1 and 50')
    .max(50, 'maxIterations must be between 1 and 50')
    .optional()
    .default(10),
  caseId: z.string().max(500).optional(),
  verbose: z.boolean().optional().default(false),
  mode: z.enum(['flat', 'supervisor']).optional().default('supervisor'),
  stream: z.boolean().optional().default(false),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const raw = await request.json();
  const parsed = investigateSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { query, useACE, maxIterations, caseId, verbose, mode, stream: useStream } = parsed.data;

  try {
    // Create autonomous agent with user context
    const agent = createAutonomousAgent({
      userId: locals.user?.id,
      caseId: caseId || undefined,
      maxIterations,
      verbose,
      temperature: 0.3, // Lower temperature for more deterministic tool selection
    });

    const startTime = Date.now();

    if (mode === 'supervisor') {
      // Supervisor mode: StateGraph routes to scoped subagents
      const supervisor = new SupervisorAgent(agent.getToolInstances(), {
        temperature: 0.3,
        maxIterations,
        verbose,
        timeout: 120_000,
      });

      // SSE streaming mode: yield incremental updates
      if (useStream) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of supervisor.stream(query, {
                enrichedQuery: useACE ? query : undefined,
              })) {
                const event = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(encoder.encode(event));
              }
              const done = `data: ${JSON.stringify({ node: '__end__', data: { duration: Date.now() - startTime } })}\n\n`;
              controller.enqueue(encoder.encode(done));
            } catch (err) {
              console.error('[agent/investigate] Stream error:', err);
              const errEvent = `data: ${JSON.stringify({ node: '__error__', data: { error: 'Investigation failed' } })}\n\n`;
              controller.enqueue(encoder.encode(errEvent));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      const result = await supervisor.investigate(query, {
        enrichedQuery: useACE ? query : undefined,
      });

      return json({
        ...result,
        mode: 'supervisor',
        duration: Date.now() - startTime,
        metadata: {
          userId: locals.user?.id,
          caseId: caseId || null,
          useACE,
          maxIterations,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Flat mode: single ReAct agent with 32 tools (legacy)
    const result = await agent.investigate(query, { useACE });
    const duration = Date.now() - startTime;

    // Return structured result
    return json({
      ...result,
      mode: 'flat',
      duration,
      metadata: {
        userId: locals.user?.id,
        caseId: caseId || null,
        useACE,
        maxIterations,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Agent Investigate] Error:', err);

    // Handle specific error types
    if (err instanceof Error) {
      if (err.message.includes('max iterations') || err.message.includes('Recursion limit')) {
        return error(429, {
          message: 'Investigation exceeded maximum iterations. Try a more specific query.',
        });
      }

      if (err.message.includes('timeout') || err.name === 'AbortError') {
        return error(504, {
          message: 'Investigation timed out. Try breaking query into smaller parts.',
        });
      }

      if (err.message.includes('ACE')) {
        return error(500, { message: 'ACE context assembly failed. Try with useACE: false.' });
      }
    }

    return error(500, 'Investigation failed');
  }
};

/**
 * GET /api/agent/investigate
 *
 * Returns agent configuration and available tools.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	return json({
    name: 'Autonomous Investigation Agent',
    architecture: 'LangGraph StateGraph + Supervisor Routing',
    model: 'gemma4-rotorquant:latest',
    toolCount: 32,
    modes: {
      supervisor: {
        description: 'LLM classifies intent → routes to scoped subagent (4-8 tools each)',
        default: true,
        subagents: Object.entries(SUBAGENT_TOOL_MAP).map(([name, tools]) => ({
          name,
          toolCount: tools.length,
          tools,
        })),
      },
      flat: {
        description: 'Single ReAct agent with all 32 tools (legacy, use for comparison)',
        default: false,
      },
    },
    tools: [
      // Evidence Analysis (1-2)
      {
        name: 'evidence_analyze',
        category: 'Evidence Analysis',
        description: 'Entity extraction + forensics + auto-tagging (3-way mirroring)',
      },
      {
        name: 'evidence_list',
        category: 'Evidence Analysis',
        description: 'List evidence items with case and type filtering',
      },
      // Multimodal (3-7)
      {
        name: 'multimodal_analyze',
        category: 'Multimodal',
        description: 'YOLO + Whisper + CLIP parallel analysis',
      },
      {
        name: 'detect_objects',
        category: 'Multimodal',
        description: 'YOLO object detection (doc-layout preferred, COCO fallback)',
      },
      {
        name: 'transcribe_audio',
        category: 'Multimodal',
        description: 'Whisper ASR with word timestamps',
      },
      {
        name: 'search_similar',
        category: 'Multimodal',
        description: 'Cross-modal CLIP/Whisper semantic search',
      },
      {
        name: 'vlm_analyze',
        category: 'Multimodal',
        description: 'Gemma4 VLM image analysis (OCR, document structure, legal content)',
      },
      // Audio (8)
      {
        name: 'whisper_transcribe',
        category: 'Audio',
        description: 'Transcribe audio files (MP3/WAV/OGG/FLAC) via nodejs-whisper',
      },
      // Detective Mode (9-14)
      {
        name: 'web_search',
        category: 'Detective Mode',
        description: 'Search docs, Stack Overflow, GitHub issues',
      },
      {
        name: 'ripgrep_search',
        category: 'Detective Mode',
        description: 'Fast regex codebase search with context lines',
      },
      { name: 'find_files', category: 'Detective Mode', description: 'Find files by glob pattern' },
      {
        name: 'analyze_file',
        category: 'Detective Mode',
        description: 'Read and analyze specific files',
      },
      {
        name: 'extract_pattern',
        category: 'Detective Mode',
        description: 'awk/sed-like text processing (extract/replace/count)',
      },
      {
        name: 'analyze_imports',
        category: 'Detective Mode',
        description: 'Track dependencies and usage',
      },
      // Case Management (15-18)
      {
        name: 'cases_load',
        category: 'Case Management',
        description: 'Load case data from PostgreSQL',
      },
      { name: 'cases_create', category: 'Case Management', description: 'Create a new legal case' },
      {
        name: 'cases_update',
        category: 'Case Management',
        description: 'Update case title, description, status, or priority',
      },
      {
        name: 'case_notes',
        category: 'Case Management',
        description: 'Add or retrieve notes for a case (Who/What/Why/How)',
      },
      // Citations (19-20)
      {
        name: 'citations_search',
        category: 'Citations',
        description: 'Search legal citations across cases',
      },
      {
        name: 'citations_add',
        category: 'Citations',
        description: 'Add a citation to a case with source and page reference',
      },
      // Reports (21)
      {
        name: 'reports_generate',
        category: 'Reports',
        description:
          'Generate from 10 legal templates (charging memo, search warrant, case summary, etc.) with optional AI fill',
      },
      // Evidence Upload (22)
      {
        name: 'evidence_upload',
        category: 'Evidence Pipeline',
        description:
          'Upload file → 8-stage pipeline (extraction, chunking, embedding, entity, forensics, VLM, summarization)',
      },
      // POI (23)
      {
        name: 'poi_search',
        category: 'Persons of Interest',
        description: 'Search POI profiles with roles, aliases, and linked evidence',
      },
      // RAG + Search (24-26)
      { name: 'rag_search', category: 'RAG', description: 'Semantic search via RAG pipeline' },
      {
        name: 'glossary_search',
        category: 'RAG',
        description: 'Legal glossary term definitions with category and jurisdiction',
      },
      {
        name: 'codebase_search',
        category: 'RAG',
        description: 'Dual-vector semantic code search (Qdrant 768-dim)',
      },
      // LangExtract (27-28)
      {
        name: 'langextract_legal',
        category: 'Entity Extraction',
        description:
          'Extract parties, dates, citations, money, statutes, obligations with text positions',
      },
      {
        name: 'langextract_evidence',
        category: 'Entity Extraction',
        description:
          'Extract persons, locations, phone/email, document refs, quotes with attribution',
      },
      // AI Synthesis (29-30)
      {
        name: 'ace_context',
        category: 'AI Synthesis',
        description:
          'Full ACE context synthesis (RAG + KAG + glossary + evidence + codebase → LLM)',
      },
      {
        name: 'summarize',
        category: 'AI Synthesis',
        description: 'Gemma4-Legal structured summarization (brief/detailed/bullet-points)',
      },
      // Code Analysis (31)
      { name: 'ast_query', category: 'Code Analysis', description: 'AST code structure analysis' },
      // System (32)
      {
        name: 'system_health',
        category: 'System',
        description: 'Health check: Ollama, Redis, PostgreSQL, Qdrant, MinIO, RabbitMQ',
      },
    ],
    capabilities: {
      aceContextEngine: true,
      multiStepReasoning: true,
      parallelToolExecution: false,
      maxIterations: 10,
      temperature: 0.3,
    },
    usage: {
      endpoint: 'POST /api/agent/investigate',
      requiredParams: ['query'],
      optionalParams: ['useACE', 'maxIterations', 'caseId', 'verbose'],
    },
    examples: [
      {
        query: 'Analyze evidence ID abc123 for forensic patterns',
        expectedTools: ['evidence_analyze'],
        description: 'Single-step analysis with entity extraction + forensics',
        category: 'Evidence Analysis',
      },
      {
        query: 'Find all Svelte 4 patterns needing migration to Svelte 5',
        expectedTools: ['ripgrep_search', 'analyze_file', 'web_search'],
        description: 'Multi-step detective mode investigation',
        category: 'Detective Mode (Base)',
      },
      {
        query: 'What evidence supports the fraud claim in case XYZ?',
        expectedTools: ['cases_load', 'rag_search', 'evidence_analyze'],
        description: 'Case-aware investigation with RAG retrieval',
        category: 'Case Analysis',
      },
      {
        query: 'Analyze this video for person detection and transcribe audio',
        expectedTools: ['detect_objects', 'transcribe_audio', 'search_similar'],
        description: 'Multimodal parallel analysis',
        category: 'Multimodal',
      },
      {
        query: 'Find all TODO comments and create a prioritized implementation roadmap',
        expectedTools: ['ripgrep_search', 'extract_pattern', 'analyze_file'],
        description:
          'TODO aggregation → effort estimates → 4-phase roadmap (Enhanced Detective Mode)',
        category: 'Enhanced: TODO Management',
      },
      {
        query: 'Review drizzle migrations for dangerous DROP TABLE statements',
        expectedTools: ['find_files', 'ripgrep_search', 'analyze_file', 'web_search'],
        description:
          'Database safety audit → detect DROP CASCADE → propose safe alternatives (Enhanced Detective Mode)',
        category: 'Enhanced: Database Safety',
      },
      {
        query: 'How many training datasets exist and what infrastructure is missing?',
        expectedTools: ['find_files', 'analyze_file', 'web_search'],
        description:
          'Dataset inventory → count examples → gap analysis → TensorRT optimization (Enhanced Detective Mode)',
        category: 'Enhanced: ML Inventory',
      },
      {
        query: 'Which API endpoints are broken or returning 500 errors?',
        expectedTools: ['find_files', 'ripgrep_search', 'analyze_file'],
        description:
          'API health audit → map all endpoints → detect 500s → missing implementations (Enhanced Detective Mode)',
        category: 'Enhanced: API Mapping',
      },
      {
        query: 'Is Redis configured with connection pooling and are embeddings persisted?',
        expectedTools: ['find_files', 'analyze_file', 'ripgrep_search'],
        description:
          'Infrastructure health → Redis setup → embedding persistence → service dependencies (Enhanced Detective Mode)',
        category: 'Enhanced: Infrastructure',
      },
    ],
  });
};
