/**
 * Supervisor Agent — LangGraph StateGraph with Subagent Routing
 *
 * Architecture:
 *   START → supervisor (classifies intent) → subagent node → END
 *
 * The supervisor LLM classifies the query into one of 5 domains,
 * then routes to the appropriate subagent. Each subagent is its own
 * ReAct agent with a scoped tool subset (4-8 tools each).
 *
 * Fallback: keyword-based intent classification if LLM routing fails.
 */

import {
	StateGraph,
	Annotation,
	END,
	START,
} from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { ENV } from '$lib/server/env.server.js';
import {
	createSubagent,
	classifyIntent,
	type SubagentName,
	type SubagentInstance,
} from './subagents.js';

// ── State Schema ────────────────────────────────────────────────

const SupervisorState = Annotation.Root({
	/** The user's original query */
	query: Annotation<string>,
	/** ACE-enriched query (or same as query if no ACE) */
	enrichedQuery: Annotation<string>,
	/** Which subagent to route to */
	route: Annotation<SubagentName>,
	/** Final answer from the routed subagent */
	answer: Annotation<string>,
	/** Tool calls made during investigation */
	toolCalls: Annotation<Array<{ tool: string; input: any; output: string }>>,
	/** Reasoning trace */
	reasoning: Annotation<string[]>,
	/** ACE context if available */
	aceContext: Annotation<any>,
});

type SupervisorStateType = typeof SupervisorState.State;

// ── Supervisor Router LLM ──────────────────────────────────────

const ROUTING_PROMPT = `You are a routing supervisor for a legal AI investigation platform.
Given a user query, classify it into exactly ONE of these domains:

- audio: Audio transcription, recordings, depositions, wiretaps, 911 calls, speaker diarization
- document: Document analysis, images, PDFs, OCR, VLM, evidence upload, forensic patterns, entity extraction from documents
- case: Case management, citations, persons of interest, legal reports, motions, warrants, plea agreements
- codebase: Code search, file analysis, imports, dependencies, TODOs, migrations, API routes
- general: Legal questions, glossary, RAG search, summarization, web research, system health, anything else

Respond with ONLY the domain name (audio, document, case, codebase, or general). No explanation.`;

// ── Supervisor Graph Builder ────────────────────────────────────

export interface SupervisorConfig {
	temperature?: number;
	maxIterations?: number;
	verbose?: boolean;
	/** Timeout in ms for each subagent invoke (default: 120_000) */
	timeout?: number;
}

export class SupervisorAgent {
	private graph: ReturnType<typeof StateGraph.prototype.compile> | null = null;
	private subagents: Map<SubagentName, SubagentInstance> = new Map();
	private allTools: DynamicStructuredTool[];
	private routerLlm: ChatOllama;
	private config: SupervisorConfig;

	constructor(
		allTools: DynamicStructuredTool[],
		config: SupervisorConfig = {}
	) {
		this.allTools = allTools;
		this.config = config;

		this.routerLlm = new ChatOllama({
			baseUrl: ENV.OLLAMA_BASE_URL,
			model: 'gemma4-legal:latest',
			temperature: 0, // deterministic routing
		});

		this.initializeSubagents();
		this.buildGraph();
	}

	private initializeSubagents(): void {
		const names: SubagentName[] = ['audio', 'document', 'case', 'codebase', 'general'];
		for (const name of names) {
			try {
				const subagent = createSubagent(name, this.allTools, {
					temperature: this.config.temperature ?? 0.3,
					maxIterations: this.config.maxIterations ?? 10,
				});
				this.subagents.set(name, subagent);
			} catch (err) {
				console.warn(`[Supervisor] Failed to init ${name} subagent:`, err);
			}
		}
	}

	private buildGraph(): void {
		try {
			const workflow = new StateGraph(SupervisorState)
				.addNode('route_intent', this.routeIntentNode.bind(this))
				.addNode('audio', this.makeSubagentNode('audio'))
				.addNode('document', this.makeSubagentNode('document'))
				.addNode('case', this.makeSubagentNode('case'))
				.addNode('codebase', this.makeSubagentNode('codebase'))
				.addNode('general', this.makeSubagentNode('general'))
				.addEdge(START, 'route_intent')
				.addConditionalEdges('route_intent', (state: SupervisorStateType) => state.route)
				.addEdge('audio', END)
				.addEdge('document', END)
				.addEdge('case', END)
				.addEdge('codebase', END)
				.addEdge('general', END);

			this.graph = workflow.compile({ name: 'legal_supervisor' });
		} catch (err) {
			console.error('[Supervisor] Failed to build StateGraph:', err);
			this.graph = null;
		}
	}

	/**
	 * Route intent node — classifies query to a subagent domain.
	 * Tries LLM classification first, falls back to keyword matching.
	 */
	private async routeIntentNode(
		state: SupervisorStateType
	): Promise<Partial<SupervisorStateType>> {
		const query = state.enrichedQuery || state.query;
		let route: SubagentName;

		try {
			const response = await this.routerLlm.invoke([
				new SystemMessage(ROUTING_PROMPT),
				new HumanMessage(query),
			]);

			const content =
				typeof response.content === 'string'
					? response.content.trim().toLowerCase()
					: '';

			const validRoutes: SubagentName[] = ['audio', 'document', 'case', 'codebase', 'general'];
			route = validRoutes.includes(content as SubagentName)
				? (content as SubagentName)
				: classifyIntent(query);

			if (this.config.verbose) {
				console.log(`[Supervisor] LLM route: "${content}" → ${route}`);
			}
		} catch {
			// LLM failed — use keyword fallback
			route = classifyIntent(query);
			if (this.config.verbose) {
				console.log(`[Supervisor] LLM routing failed, keyword fallback → ${route}`);
			}
		}

		return {
			route,
			reasoning: [
				...(state.reasoning || []),
				`[Supervisor] Routed to ${route} subagent`,
			],
		};
	}

	/**
	 * Create a subagent execution node for the StateGraph.
	 */
	private makeSubagentNode(name: SubagentName) {
		return async (state: SupervisorStateType): Promise<Partial<SupervisorStateType>> => {
			const subagent = this.subagents.get(name);
			if (!subagent) {
				return {
					answer: `Subagent "${name}" is not available.`,
					toolCalls: [],
					reasoning: [
						...(state.reasoning || []),
						`[${name}] Subagent not initialized`,
					],
				};
			}

			const query = state.enrichedQuery || state.query;

			try {
				const maxIter = this.config.maxIterations ?? 10;
				const timeout = this.config.timeout ?? 120_000;
				const result = await subagent.agent.invoke(
					{ messages: [new HumanMessage(query)] },
					{
						recursionLimit: maxIter * 3,
						timeout,
						...(this.config.verbose ? { metadata: { subagent: name, query: query.slice(0, 200) } } : {}),
					}
				);

				// Extract tool calls and final answer from message history
				const toolCalls: Array<{ tool: string; input: any; output: string }> = [];
				const reasoning: string[] = [
					...(state.reasoning || []),
					`[${name}] Executing with ${subagent.toolNames.length} tools: ${subagent.toolNames.join(', ')}`,
				];
				let answer = '';

				for (const msg of result.messages ?? []) {
					const role = (msg as any)._getType?.() ?? (msg as any).role ?? '';
					if (role === 'tool' || (msg as any).tool_call_id) {
						toolCalls.push({
							tool: (msg as any).name ?? 'unknown',
							input: {},
							output:
								typeof (msg as any).content === 'string'
									? (msg as any).content
									: JSON.stringify((msg as any).content),
						});
					} else if (role === 'ai' || role === 'assistant') {
						const content = (msg as any).content;
						if (typeof content === 'string' && content.trim()) {
							answer = content;
							reasoning.push(`[${name}] ${content.slice(0, 200)}`);
						}
					}
				}

				return {
					answer: answer || 'Investigation complete.',
					toolCalls: [...(state.toolCalls || []), ...toolCalls],
					reasoning,
				};
			} catch (err) {
				const isRecursion = err instanceof Error && err.message.includes('Recursion limit');
				const isTimeout = err instanceof Error && err.name === 'AbortError';
				const errorLabel = isRecursion ? 'Recursion limit' : isTimeout ? 'Timeout' : 'Error';
				return {
					answer: `Subagent "${name}" ${errorLabel.toLowerCase()}: ${err instanceof Error ? err.message : String(err)}`,
					toolCalls: state.toolCalls || [],
					reasoning: [
						...(state.reasoning || []),
						`[${name}] ${errorLabel}: ${err instanceof Error ? err.message : String(err)}`,
					],
				};
			}
		};
	}

	/**
	 * Run the supervisor graph.
	 */
	async investigate(
		query: string,
		options: {
			enrichedQuery?: string;
			aceContext?: any;
		} = {}
	): Promise<{
		answer: string;
		route: SubagentName;
		toolCalls: Array<{ tool: string; input: any; output: string }>;
		reasoning: string[];
		aceContext?: any;
	}> {
		const initialState: Partial<SupervisorStateType> = {
			query,
			enrichedQuery: options.enrichedQuery || query,
			route: 'general', // will be overridden by route_intent
			answer: '',
			toolCalls: [],
			reasoning: [`[Supervisor] Query: "${query.slice(0, 100)}..."`],
			aceContext: options.aceContext || null,
		};

		if (this.graph) {
			const result = await this.graph.invoke(initialState);
			return {
				answer: result.answer || 'Investigation complete.',
				route: result.route,
				toolCalls: result.toolCalls || [],
				reasoning: result.reasoning || [],
				aceContext: result.aceContext,
			};
		}

		// Fallback: run single subagent directly without graph
		const route = classifyIntent(query);
		const subagentNode = this.makeSubagentNode(route);
		const fallbackState = {
			...initialState,
			route,
		} as SupervisorStateType;

		const result = await subagentNode(fallbackState);
		return {
			answer: result.answer || 'Investigation complete.',
			route,
			toolCalls: result.toolCalls || [],
			reasoning: result.reasoning || [],
			aceContext: options.aceContext,
		};
	}

	/**
	 * Stream the supervisor graph.
	 * Yields incremental updates per node execution.
	 */
	async *stream(
		query: string,
		options: {
			enrichedQuery?: string;
			aceContext?: any;
		} = {}
	): AsyncGenerator<{
		node: string;
		data: Partial<SupervisorStateType>;
	}> {
		const initialState: Partial<SupervisorStateType> = {
			query,
			enrichedQuery: options.enrichedQuery || query,
			route: 'general',
			answer: '',
			toolCalls: [],
			reasoning: [`[Supervisor] Query: "${query.slice(0, 100)}..."`],
			aceContext: options.aceContext || null,
		};

		if (!this.graph) {
			// Fallback: no streaming, yield single result
			const route = classifyIntent(query);
			const subagentNode = this.makeSubagentNode(route);
			const result = await subagentNode({ ...initialState, route } as SupervisorStateType);
			yield { node: route, data: result };
			return;
		}

		const stream = await this.graph.stream(initialState, {
			streamMode: 'updates',
		});

		for await (const chunk of stream) {
			// chunk is Record<nodeName, nodeOutput>
			for (const [node, data] of Object.entries(chunk)) {
				yield { node, data: data as Partial<SupervisorStateType> };
			}
		}
	}

	/**
	 * Get topology info for the GET endpoint.
	 */
	getTopology() {
		const subagentInfo = Array.from(this.subagents.entries()).map(([name, sa]) => ({
			name,
			toolCount: sa.toolNames.length,
			tools: sa.toolNames,
		}));

		return {
			architecture: 'LangGraph StateGraph + Supervisor Routing',
			totalTools: this.allTools.length,
			subagents: subagentInfo,
			routing: 'LLM classification → keyword fallback',
			graph: this.graph ? 'compiled' : 'fallback-only',
		};
	}
}
