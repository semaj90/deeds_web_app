/**
 * Google Deep Research Agent Client
 *
 * Unified client for the Google Gemini Deep Research Agent via the Interactions API.
 * Supports background execution, collaborative planning, and follow-up turns.
 *
 * Agent Versions:
 *   - deep-research-preview-04-2026: Fast, efficient, ideal for streaming.
 *   - deep-research-max-preview-04-2026: Comprehensive synthesis for deep analysis.
 *
 * Requirements:
 *   - background=true is mandatory for agents.
 *   - store=true (default) is required for background execution.
 */

import { GoogleGenAI, type Interactions } from '@google/genai';
import { ENV } from '$lib/server/env.server.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type DeepResearchAgent = 'deep-research-preview-04-2026' | 'deep-research-max-preview-04-2026';
export type DeepResearchInput = string | Interactions.Content[] | Interactions.Turn[];
export type DeepResearchStatus = Interactions.Interaction;

const DEFAULT_DEEP_RESEARCH_AGENT: DeepResearchAgent = 'deep-research-preview-04-2026';

function buildAgentConfig(options: DeepResearchConfig): Interactions.DeepResearchAgentConfig {
	return {
		type: 'deep-research',
		thinking_summaries: options.thinkingSummaries ?? 'auto',
		visualization: options.visualization ?? 'auto',
		collaborative_planning: options.collaborativePlanning ?? false,
	};
}

export interface DeepResearchConfig {
	agent?: DeepResearchAgent;
	collaborativePlanning?: boolean;
	visualization?: 'auto' | 'off';
	thinkingSummaries?: 'auto' | 'none';
	tools?: Interactions.Tool[];
	systemInstruction?: string;
}

export interface DeepResearchStartOptions extends DeepResearchConfig {
	input: DeepResearchInput;
}

export interface DeepResearchFollowUpOptions extends DeepResearchConfig {
	interactionId: string;
	input: DeepResearchInput;
}

// ── Client Lifecycle ─────────────────────────────────────────────────────────

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
	if (!ENV.GEMINI_API_KEY) {
		throw new Error('[deep-research-client] GEMINI_API_KEY is not configured');
	}
	if (!_client) {
		_client = new GoogleGenAI({
			apiKey: ENV.GEMINI_API_KEY
		});
	}
	return _client;
}

/** Check if Deep Research is enabled and configured. */
export function isDeepResearchEnabled(): boolean {
	return !!ENV.GEMINI_API_KEY;
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * Start a new Deep Research task in the background.
 * Returns the initial interaction object with the ID for polling.
 */
export async function startDeepResearch(options: DeepResearchStartOptions): Promise<DeepResearchStatus> {
	const client = getClient();
	const agent = options.agent ?? DEFAULT_DEEP_RESEARCH_AGENT;

	return client.interactions.create({
		agent,
		input: options.input,
		background: true,
		agent_config: buildAgentConfig(options),
		tools: options.tools,
		system_instruction: options.systemInstruction,
	});
}

/**
 * Poll or retrieve the current status of a background research task.
 */
export async function getDeepResearchStatus(interactionId: string): Promise<DeepResearchStatus> {
	const client = getClient();
	return client.interactions.get(interactionId, {
		include_input: true
	});
}

/**
 * Continue a conversation or refine a plan using a previous interaction ID.
 * This is used for "Approve" steps in collaborative planning or follow-up questions.
 */
export async function followUpDeepResearch(options: DeepResearchFollowUpOptions): Promise<DeepResearchStatus> {
	const client = getClient();
	const agent = options.agent ?? DEFAULT_DEEP_RESEARCH_AGENT;

	return client.interactions.create({
		agent,
		input: options.input,
		previous_interaction_id: options.interactionId,
		background: true,
		agent_config: buildAgentConfig(options),
		tools: options.tools,
		system_instruction: options.systemInstruction,
	});
}

/**
 * Approve a research plan (collaborative planning transition).
 * This is a convenience wrapper for followUpDeepResearch with collaborative_planning: false.
 */
export async function approveResearchPlan(interactionId: string, message = 'Plan looks good!'): Promise<DeepResearchStatus> {
	return followUpDeepResearch({
		interactionId,
		input: message,
		collaborativePlanning: false
	});
}
