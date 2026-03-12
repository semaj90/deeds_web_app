import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAutonomousAgent } from '$lib/server/agent/autonomous-agent.js';
import { z } from 'zod';

/**
 * POST /api/agent/investigate
 *
 * Autonomous investigation using LangChain ReAct agent with 14 FastMCP tools.
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
	maxIterations: z.number().int().min(1, 'maxIterations must be between 1 and 50').max(50, 'maxIterations must be between 1 and 50').optional().default(10),
	caseId: z.string().max(500).optional(),
	verbose: z.boolean().optional().default(false)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const raw = await request.json();
		const parsed = investigateSchema.safeParse(raw);
		if (!parsed.success) {
			return error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
		}
		const { query, useACE, maxIterations, caseId, verbose } = parsed.data;

		// Create autonomous agent with user context
		const agent = createAutonomousAgent({
			userId: locals.user?.id,
			caseId: caseId || undefined,
			maxIterations,
			verbose,
			temperature: 0.3 // Lower temperature for more deterministic tool selection
		});

		// Execute investigation
		const startTime = Date.now();
		const result = await agent.investigate(query, { useACE });
		const duration = Date.now() - startTime;

		// Return structured result
		return json({
			...result,
			duration,
			metadata: {
				userId: locals.user?.id,
				caseId: caseId || null,
				useACE,
				maxIterations,
				timestamp: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Agent Investigate] Error:', err);

		// Handle specific error types
		if (err instanceof Error) {
			if (err.message.includes('max iterations')) {
				return error(429, {
					message: 'Investigation exceeded maximum iterations. Try a more specific query.'
				});
			}

			if (err.message.includes('timeout')) {
				return error(504, { message: 'Investigation timed out. Try breaking query into smaller parts.' });
			}

			if (err.message.includes('ACE')) {
				return error(500, { message: 'ACE context assembly failed. Try with useACE: false.' });
			}
		}

		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		return error(500, `Investigation failed: ${errorMessage}`);
	}
};

/**
 * GET /api/agent/investigate
 *
 * Returns agent configuration and available tools.
 */
export const GET: RequestHandler = async () => {
	return json({
		name: 'Autonomous Investigation Agent',
		architecture: 'ReAct (Reasoning + Acting)',
		model: 'gemma3-legal:latest',
		tools: [
			{
				name: 'evidence_analyze',
				category: 'Evidence Analysis',
				description: 'Entity extraction + forensics + auto-tagging (3-way mirroring)'
			},
			{
				name: 'multimodal_analyze',
				category: 'Multimodal',
				description: 'YOLO + Whisper + CLIP parallel analysis'
			},
			{
				name: 'detect_objects',
				category: 'Multimodal',
				description: 'YOLOv8 object detection with 80 COCO classes'
			},
			{
				name: 'transcribe_audio',
				category: 'Multimodal',
				description: 'Whisper ASR with word timestamps'
			},
			{
				name: 'search_similar',
				category: 'Multimodal',
				description: 'Cross-modal CLIP/Whisper semantic search'
			},
			{
				name: 'web_search',
				category: 'Detective Mode',
				description: 'Search docs, Stack Overflow, GitHub issues'
			},
			{
				name: 'ripgrep_search',
				category: 'Detective Mode',
				description: 'Fast regex codebase search with context lines'
			},
			{
				name: 'find_files',
				category: 'Detective Mode',
				description: 'Find files by glob pattern'
			},
			{
				name: 'analyze_file',
				category: 'Detective Mode',
				description: 'Read and analyze specific files'
			},
			{
				name: 'extract_pattern',
				category: 'Detective Mode',
				description: 'awk/sed-like text processing (extract/replace/count)'
			},
			{
				name: 'analyze_imports',
				category: 'Detective Mode',
				description: 'Track dependencies and usage'
			},
			{
				name: 'cases_load',
				category: 'Database',
				description: 'Load case data from PostgreSQL'
			},
			{
				name: 'rag_search',
				category: 'RAG',
				description: 'Semantic search via RAG pipeline'
			},
			{
				name: 'ast_query',
				category: 'Code Analysis',
				description: 'AST code structure analysis'
			}
		],
		capabilities: {
			aceContextEngine: true,
			multiStepReasoning: true,
			parallelToolExecution: false,
			maxIterations: 10,
			temperature: 0.3
		},
		usage: {
			endpoint: 'POST /api/agent/investigate',
			requiredParams: ['query'],
			optionalParams: ['useACE', 'maxIterations', 'caseId', 'verbose']
		},
		examples: [
			{
				query: 'Analyze evidence ID abc123 for forensic patterns',
				expectedTools: ['evidence_analyze'],
				description: 'Single-step analysis with entity extraction + forensics',
				category: 'Evidence Analysis'
			},
			{
				query: 'Find all Svelte 4 patterns needing migration to Svelte 5',
				expectedTools: ['ripgrep_search', 'analyze_file', 'web_search'],
				description: 'Multi-step detective mode investigation',
				category: 'Detective Mode (Base)'
			},
			{
				query: 'What evidence supports the fraud claim in case XYZ?',
				expectedTools: ['cases_load', 'rag_search', 'evidence_analyze'],
				description: 'Case-aware investigation with RAG retrieval',
				category: 'Case Analysis'
			},
			{
				query: 'Analyze this video for person detection and transcribe audio',
				expectedTools: ['detect_objects', 'transcribe_audio', 'search_similar'],
				description: 'Multimodal parallel analysis',
				category: 'Multimodal'
			},
			{
				query: 'Find all TODO comments and create a prioritized implementation roadmap',
				expectedTools: ['ripgrep_search', 'extract_pattern', 'analyze_file'],
				description: 'TODO aggregation → effort estimates → 4-phase roadmap (Enhanced Detective Mode)',
				category: 'Enhanced: TODO Management'
			},
			{
				query: 'Review drizzle migrations for dangerous DROP TABLE statements',
				expectedTools: ['find_files', 'ripgrep_search', 'analyze_file', 'web_search'],
				description: 'Database safety audit → detect DROP CASCADE → propose safe alternatives (Enhanced Detective Mode)',
				category: 'Enhanced: Database Safety'
			},
			{
				query: 'How many training datasets exist and what infrastructure is missing?',
				expectedTools: ['find_files', 'analyze_file', 'web_search'],
				description: 'Dataset inventory → count examples → gap analysis → TensorRT optimization (Enhanced Detective Mode)',
				category: 'Enhanced: ML Inventory'
			},
			{
				query: 'Which API endpoints are broken or returning 500 errors?',
				expectedTools: ['find_files', 'ripgrep_search', 'analyze_file'],
				description: 'API health audit → map all endpoints → detect 500s → missing implementations (Enhanced Detective Mode)',
				category: 'Enhanced: API Mapping'
			},
			{
				query: 'Is Redis configured with connection pooling and are embeddings persisted?',
				expectedTools: ['find_files', 'analyze_file', 'ripgrep_search'],
				description: 'Infrastructure health → Redis setup → embedding persistence → service dependencies (Enhanced Detective Mode)',
				category: 'Enhanced: Infrastructure'
			}
		]
	});
};