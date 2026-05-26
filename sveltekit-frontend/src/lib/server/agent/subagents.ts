/**
 * Subagent Definitions for Supervisor-Routed Agent Architecture
 *
 * Splits the 32-tool flat pool into 5 focused subagents:
 *   - AudioSubagent: Transcription, speaker analysis, audio search
 *   - DocumentSubagent: VLM, OCR, entity extraction, evidence pipeline
 *   - CaseSubagent: Case CRUD, citations, POI, reports
 *   - CodebaseSubagent: Ripgrep, file analysis, imports, semantic search
 *   - GeneralSubagent: RAG, glossary, ACE context, system health
 *
 * Each subagent is a mini ReAct agent with its own scoped tool subset
 * and domain-specific system prompt.
 */

import { ChatOllama } from '@langchain/ollama';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { ENV } from '$lib/server/env.server.js';

export type SubagentName = 'audio' | 'document' | 'case' | 'codebase' | 'general';

/** Which tools belong to each subagent */
export const SUBAGENT_TOOL_MAP: Record<SubagentName, string[]> = {
	audio: [
		'whisper_transcribe',
		'transcribe_audio',
		'search_similar',
		'evidence_analyze',
		'summarize',
	],
	document: [
		'vlm_analyze',
		'detect_objects',
		'langextract_legal',
		'langextract_evidence',
		'evidence_analyze',
		'evidence_upload',
		'evidence_list',
	],
	case: [
		'cases_load',
		'cases_create',
		'cases_update',
		'case_notes',
		'citations_search',
		'citations_add',
		'poi_search',
		'reports_generate',
	],
	codebase: [
		'ripgrep_search',
		'find_files',
		'analyze_file',
		'extract_pattern',
		'analyze_imports',
		'codebase_search',
	],
	general: [
		'rag_search',
		'glossary_search',
		'ace_context',
		'web_search',
		'summarize',
		'system_health',
		'multimodal_analyze',
		'ast_query',
	],
};

/** Domain-specific system prompts for each subagent */
const SUBAGENT_PROMPTS: Record<SubagentName, string> = {
	audio: `You are an Audio Analysis Subagent for a legal AI platform.
Your specialty: transcribing audio evidence (depositions, recordings, 911 calls, wiretaps),
identifying speakers, extracting entities from transcripts, and finding similar audio.
Tools: whisper_transcribe (local CUDA), transcribe_audio (GPU FastAPI), search_similar, evidence_analyze, summarize.
Always return the transcript text, detected language, and any entities found.`,

	document: `You are a Document Analysis Subagent for a legal AI platform.
Your specialty: analyzing documents, images, PDFs, and evidence files.
Determine if content is OCR-able or needs VLM analysis. Extract legal entities,
detect forensic patterns (PII, tampering indicators), and process evidence through the pipeline.
Tools: vlm_analyze, detect_objects, langextract_legal, langextract_evidence, evidence_analyze, evidence_upload, evidence_list.
Always classify document type and extract structured data.`,

	case: `You are a Case Management Subagent for a legal AI platform.
Your specialty: creating and managing legal cases, adding citations and notes,
searching persons of interest, and generating legal reports.
Tools: cases_load, cases_create, cases_update, case_notes, citations_search, citations_add, poi_search, reports_generate.
Always confirm actions taken and return the affected case/citation IDs.`,

	codebase: `You are a Codebase Investigation Subagent for a legal AI platform.
Your specialty: searching codebases, analyzing files, tracing imports and dependencies,
finding patterns, and performing code audits.
Tools: ripgrep_search, find_files, analyze_file, extract_pattern, analyze_imports, codebase_search.
Return file paths, line numbers, and code snippets with context.`,

	general: `You are a General Assistant Subagent for a legal AI platform.
Your specialty: semantic search across legal documents, glossary lookup, ACE contextual synthesis,
web research, summarization, and system health checks.
Tools: rag_search, glossary_search, ace_context, web_search, summarize, system_health, multimodal_analyze, ast_query.
Provide well-sourced answers with relevant document references.`,
};

export interface SubagentInstance {
	name: SubagentName;
	agent: ReturnType<typeof createReactAgent>;
	toolNames: string[];
	prompt: string;
}

/**
 * Create a subagent with a scoped tool subset and domain-specific system prompt.
 */
export function createSubagent(
	name: SubagentName,
	allTools: DynamicStructuredTool[],
	options: { temperature?: number; maxIterations?: number } = {}
): SubagentInstance {
	const toolNames = SUBAGENT_TOOL_MAP[name];
	const scopedTools = allTools.filter((t) => toolNames.includes(t.name));
	const prompt = SUBAGENT_PROMPTS[name];

	const llm = new ChatOllama({
		baseUrl: ENV.OLLAMA_BASE_URL,
		model: 'gemma4-rotorquant:latest',
		temperature: options.temperature ?? 0.3,
	});

	const agent = createReactAgent({
		llm,
		tools: scopedTools,
		prompt,
		name,
		description: `${name} subagent — ${scopedTools.length} tools: ${scopedTools.map((t) => t.name).join(', ')}`,
	});

	return { name, agent, toolNames: scopedTools.map((t) => t.name), prompt };
}

/**
 * Intent classification keywords for routing to subagents.
 * The supervisor LLM is the primary router; this is the fallback.
 */
export function classifyIntent(query: string): SubagentName {
	const q = query.toLowerCase();

	// Audio signals
	if (
		q.includes('audio') ||
		q.includes('transcri') ||
		q.includes('recording') ||
		q.includes('whisper') ||
		q.includes('deposition') ||
		q.includes('wiretap') ||
		q.includes('911 call') ||
		q.includes('speaker')
	) {
		return 'audio';
	}

	// Document signals
	if (
		q.includes('document') ||
		q.includes('ocr') ||
		q.includes('image') ||
		q.includes('photo') ||
		q.includes('pdf') ||
		q.includes('scan') ||
		q.includes('vlm') ||
		q.includes('detect object') ||
		q.includes('evidence analyz') ||
		q.includes('upload evidence') ||
		q.includes('forensic')
	) {
		return 'document';
	}

	// Case management signals
	if (
		q.includes('case') ||
		q.includes('citation') ||
		q.includes('cite') ||
		q.includes('miranda') ||
		q.includes('statute') ||
		q.includes('person of interest') ||
		q.includes('poi') ||
		q.includes('suspect') ||
		q.includes('witness') ||
		q.includes('report') ||
		q.includes('memo') ||
		q.includes('warrant') ||
		q.includes('motion') ||
		q.includes('plea')
	) {
		return 'case';
	}

	// Codebase signals
	if (
		q.includes('codebase') ||
		q.includes('import') ||
		q.includes('ripgrep') ||
		q.includes('grep') ||
		q.includes('find file') ||
		q.includes('todo') ||
		q.includes('fixme') ||
		q.includes('migration') ||
		q.includes('drop table') ||
		q.includes('endpoint') ||
		q.includes('api route') ||
		q.includes('analyze file') ||
		q.includes('dependency')
	) {
		return 'codebase';
	}

	// Default to general
	return 'general';
}
