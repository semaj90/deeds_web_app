/**
 * Subagent Definitions for Supervisor-Routed Agent Architecture
 *
 * Legacy domains remain available, but HyperRAG work now also routes to a
 * small specialist team:
 *   - retrieval_contract
 *   - ranking
 *   - identity_promotion
 *   - semantic_enrichment
 *   - graph
 *   - transport
 *   - validation
 */

import { ChatOllama } from '@langchain/ollama';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { ENV } from '$lib/server/env.server.js';
import {
  SPECIALIST_AGENT_NAMES,
  SPECIALIST_AGENT_PROFILES,
  type SpecialistAgentName,
} from './specialist-team.js';

export type LegacySubagentName = 'audio' | 'document' | 'case' | 'codebase' | 'general';
export type SubagentName = LegacySubagentName | SpecialistAgentName;

const LEGACY_SUBAGENT_TOOL_MAP: Record<LegacySubagentName, string[]> = {
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
		'search_codebase',
		'codebase_search',
		'ripgrep_search',
		'find_files',
		'analyze_file',
		'extract_pattern',
		'analyze_imports',
	],
	general: [
		'search_codebase',
		'codebase_search',
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

const LEGACY_SUBAGENT_PROMPTS: Record<LegacySubagentName, string> = {
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
Tools: search_codebase, codebase_search, ripgrep_search, find_files, analyze_file, extract_pattern, analyze_imports.
Return file paths, line numbers, and code snippets with context.`,

	general: `You are a General Assistant Subagent for a legal AI platform.
Your specialty: semantic search across legal documents, glossary lookup, ACE contextual synthesis,
web research, summarization, and system health checks.
Tools: search_codebase, codebase_search, rag_search, glossary_search, ace_context, web_search, summarize, system_health, multimodal_analyze, ast_query.
Provide well-sourced answers with relevant document references.`,
};

const SPECIALIST_SUBAGENT_TOOL_MAP: Record<SpecialistAgentName, string[]> = Object.fromEntries(
	SPECIALIST_AGENT_NAMES.map((name) => [name, SPECIALIST_AGENT_PROFILES[name].tools]),
) as Record<SpecialistAgentName, string[]>;

const SPECIALIST_SUBAGENT_PROMPTS: Record<SpecialistAgentName, string> = Object.fromEntries(
	SPECIALIST_AGENT_NAMES.map((name) => [name, SPECIALIST_AGENT_PROFILES[name].prompt]),
) as Record<SpecialistAgentName, string>;

export const SUBAGENT_TOOL_MAP: Record<SubagentName, string[]> = {
	...SPECIALIST_SUBAGENT_TOOL_MAP,
	...LEGACY_SUBAGENT_TOOL_MAP,
};

export const SUBAGENT_PROMPTS: Record<SubagentName, string> = {
	...SPECIALIST_SUBAGENT_PROMPTS,
	...LEGACY_SUBAGENT_PROMPTS,
};

export const SUBAGENT_NAMES = [
	...SPECIALIST_AGENT_NAMES,
	'audio',
	'document',
	'case',
	'codebase',
	'general',
] as const satisfies readonly SubagentName[];

export interface SubagentInstance {
	name: SubagentName;
	agent: ReturnType<typeof createReactAgent>;
	toolNames: string[];
	prompt: string;
	authorization: {
		readOnly: boolean;
		writeAccess: boolean;
		shellAccess: boolean;
	};
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

	const authorization = name === 'identity_promotion' || name === 'semantic_enrichment'
		? { readOnly: false, writeAccess: true, shellAccess: false }
		: { readOnly: true, writeAccess: false, shellAccess: false };

	return { name, agent, toolNames: scopedTools.map((t) => t.name), prompt, authorization };
}

function includesAny(query: string, terms: string[]): boolean {
	return terms.some((term) => query.includes(term));
}

/**
 * Intent classification for routing to subagents.
 * Specialist routes are checked first, then legacy domains.
 */
export function classifyIntent(query: string): SubagentName {
	const q = query.toLowerCase();

	if (
		includesAny(q, [
			'retrieval',
			'rrf',
			'topk',
			'candidate',
			'fan-out',
			'fanout',
			'search runtime',
			'searchruntime',
			'packet envelope',
			'packet envelope',
			'postgres_trigram',
			'qdrant',
		])
	) {
		return 'retrieval_contract';
	}

	if (
		includesAny(q, [
			'rank',
			're-rank',
			'rerank',
			'xgboost',
			'crossencoder',
			'mixedbread',
			'bge',
			'fallback',
			'cache',
			'provenance',
		])
	) {
		return 'ranking';
	}

	if (
		includesAny(q, [
			'packet key',
			'packet_key',
			'source ref',
			'source_ref',
			'summary-layer',
			'summary layer',
			'qdrant point',
			'qdrant_point',
			'promotion',
			'outbox',
			'title id',
			'title_id',
			'identity',
		])
	) {
		return 'identity_promotion';
	}

	if (
		includesAny(q, [
			'summary',
			'domain',
			'concept',
			'embeddinggemma',
			'kmeans',
			'som',
			'semantic title',
			'title',
			'embedding',
		])
	) {
		return 'semantic_enrichment';
	}

	if (
		includesAny(q, [
			'graph',
			'tree_node',
			'pagerank',
			'neo4j',
			'community',
			'relationship',
			'k-hop',
			'k hop',
		])
	) {
		return 'graph';
	}

	if (
		includesAny(q, [
			'mcp',
			'grpc',
			'protobuf',
			'hyperrag rpc',
			'hyperrag-rpc',
			'acp',
			'packet envelope',
			'zod',
			'schema',
			'transport',
		])
	) {
		return 'transport';
	}

	if (
		includesAny(q, [
			'validate',
			'validation',
			'typecheck',
			'health',
			'smoke',
			'test',
			'reconstruct',
			'vitest',
			'evidence',
		])
	) {
		return 'validation';
	}

	// Legacy domains remain as fallbacks for non-HyperRAG work.
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

	return 'general';
}
