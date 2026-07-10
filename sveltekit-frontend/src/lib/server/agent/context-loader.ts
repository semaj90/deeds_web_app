/**
 * Agent Context Loader
 *
 * Loads context packets based on current workflow state.
 * Central intelligence: NOT all packets get loaded, only state-appropriate ones.
 *
 * Pattern: HMM state → packet plan → load from cache/DB → assemble context
 */

import { z } from 'zod';
import { valkey } from '$lib/server/cache/valkey-client-corrected';
import { pool } from '$lib/server/db/client';

/**
 * Workflow state (from HMM classification)
 */
export type WorkflowState = 'retrieve' | 'graph_expand' | 'plan' | 'implement' | 'validate' | 'repair' | 'synthesize';

/**
 * Packet selection plan for each state
 */
const PACKET_PLANS: Record<WorkflowState, PacketSelector[]> = {
	retrieve: [
		{ type: 'source_identity', maxCount: 3, tokenBudget: 1024 },
		{ type: 'route_schema', maxCount: 2, tokenBudget: 512 },
		{ type: 'search_results', maxCount: 5, tokenBudget: 1500 },
	],
	graph_expand: [
		{ type: 'imports', maxCount: 4, tokenBudget: 1024 },
		{ type: 'callers', maxCount: 3, tokenBudget: 768 },
		{ type: 'dependencies', maxCount: 4, tokenBudget: 1024 },
		{ type: 'som_neighbors', maxCount: 3, tokenBudget: 512 },
	],
	plan: [
		{ type: 'feature_spec', maxCount: 1, tokenBudget: 2048 },
		{ type: 'acceptance_criteria', maxCount: 1, tokenBudget: 1024 },
		{ type: 'architecture_constraints', maxCount: 2, tokenBudget: 1024 },
		{ type: 'successful_patterns', maxCount: 3, tokenBudget: 1536 },
	],
	implement: [
		{ type: 'source_files', maxCount: 5, tokenBudget: 3072 },
		{ type: 'symbols', maxCount: 8, tokenBudget: 1536 },
		{ type: 'schema_contracts', maxCount: 2, tokenBudget: 512 },
		{ type: 'active_task', maxCount: 1, tokenBudget: 512 },
	],
	validate: [
		{ type: 'acceptance_criteria', maxCount: 1, tokenBudget: 1024 },
		{ type: 'changed_files', maxCount: 5, tokenBudget: 1536 },
		{ type: 'test_commands', maxCount: 3, tokenBudget: 768 },
		{ type: 'prior_failures', maxCount: 3, tokenBudget: 768 },
	],
	repair: [
		{ type: 'failing_output', maxCount: 1, tokenBudget: 1024 },
		{ type: 'relevant_implementation', maxCount: 3, tokenBudget: 1536 },
		{ type: 'known_fix_packets', maxCount: 2, tokenBudget: 1024 },
	],
	synthesize: [
		{ type: 'validated_results', maxCount: 5, tokenBudget: 2048 },
		{ type: 'evidence', maxCount: 3, tokenBudget: 768 },
		{ type: 'blockers', maxCount: 2, tokenBudget: 512 },
	],
};

/**
 * Packet selector: what kind of packet, how many, token budget
 */
export interface PacketSelector {
	type: string;
	maxCount: number;
	tokenBudget: number;
}

/**
 * Context packet in cache or DB
 */
export interface ContextPacket {
	packetId: string;
	packetType: string;
	sourceRef: string;
	contentHash: string;
	authority: number;
	relevance: number;
	stateCompatibility: number;
	validated: boolean;
	estimatedTokens: number;
	content: string;
	createdAt: Date;
	expiresAt?: Date;
}

/**
 * Agent context assembled for Gemma4
 */
export interface AgentContext {
	featureId: string;
	runId: string;
	workflowState: WorkflowState;
	hmState: string; // HMM state code
	packets: ContextPacket[];
	totalTokensEstimated: number;
	tokenBudget: number;
	packetSources: Record<string, number>; // type -> count
	cacheHits: number;
	dbHits: number;
	loadedAt: Date;
}

/**
 * Load context packets for a given state
 *
 * Priority: Redis cache → Postgres → reject if neither available
 */
export async function loadContextPackets(
	featureId: string,
	state: WorkflowState,
	tokenBudget: number = 8192
): Promise<ContextPacket[]> {
	const plan = PACKET_PLANS[state] || [];
	const packets: ContextPacket[] = [];
	let tokensUsed = 0;

	for (const selector of plan) {
		if (tokensUsed >= tokenBudget) break;

		const remaining = tokenBudget - tokensUsed;
		const budget = Math.min(selector.tokenBudget, remaining);

		// Try cache first
		const cacheKey = `feature:${featureId}:packets:${selector.type}`;
		let cached: ContextPacket[] | null = null;

		try {
			const cachedJson = await valkey.get(cacheKey);
			if (cachedJson) {
				cached = JSON.parse(cachedJson);
			}
		} catch {
			// Cache miss or parse error, fall through to DB
		}

		if (cached && cached.length > 0) {
			// Use cached packets up to selector limit
			const selected = cached.slice(0, selector.maxCount);
			packets.push(...selected);
			tokensUsed += selected.reduce((sum, p) => sum + p.estimatedTokens, 0);
		} else {
			// Load from DB
			const dbPackets = await loadPacketsFromDb(featureId, selector.type, selector.maxCount, budget);
			packets.push(...dbPackets);
			tokensUsed += dbPackets.reduce((sum, p) => sum + p.estimatedTokens, 0);

			// Cache for next time
			if (dbPackets.length > 0) {
				try {
					await valkey.setex(cacheKey, 3600, JSON.stringify(dbPackets));
				} catch {
					// Cache write failed, non-blocking
				}
			}
		}
	}

	return packets;
}

/**
 * Load packets from database
 */
async function loadPacketsFromDb(
	featureId: string,
	packetType: string,
	limit: number,
	tokenBudget: number
): Promise<ContextPacket[]> {
	const result = await pool.query(
		`SELECT packet_id, packet_type, source_ref, content_hash, authority, relevance,
		        state_compatibility, validated, estimated_tokens, content, created_at, expires_at
		 FROM ace_context_packets
		 WHERE feature_id = $1 AND packet_type = $2 AND estimated_tokens <= $3
		 ORDER BY authority DESC, relevance DESC
		 LIMIT $4`,
		[featureId, packetType, tokenBudget, limit]
	);

	return (result.rows || []).map((row: any) => ({
		packetId: row.packet_id,
		packetType: row.packet_type,
		sourceRef: row.source_ref,
		contentHash: row.content_hash,
		authority: row.authority,
		relevance: row.relevance,
		stateCompatibility: row.state_compatibility,
		validated: row.validated,
		estimatedTokens: row.estimated_tokens,
		content: row.content,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
	}));
}

/**
 * Assemble full agent context for Gemma4
 */
export async function assembleAgentContext(
	featureId: string,
	runId: string,
	workflowState: WorkflowState,
	hmState: string,
	tokenBudget: number = 8192
): Promise<AgentContext> {
	const startTime = Date.now();
	const packets = await loadContextPackets(featureId, workflowState, tokenBudget);

	const tokensUsed = packets.reduce((sum, p) => sum + p.estimatedTokens, 0);
	const packetSources: Record<string, number> = {};
	packets.forEach((p) => {
		packetSources[p.packetType] = (packetSources[p.packetType] || 0) + 1;
	});

	return {
		featureId,
		runId,
		workflowState,
		hmState,
		packets,
		totalTokensEstimated: tokensUsed,
		tokenBudget,
		packetSources,
		cacheHits: 0, // TODO: track actual cache hits
		dbHits: 0, // TODO: track actual DB hits
		loadedAt: new Date(),
	};
}

/**
 * Format context for Gemma4 prompt
 */
export function formatContextForPrompt(context: AgentContext): string {
	const lines: string[] = [];

	lines.push(`# Agent Context`);
	lines.push(`State: ${context.workflowState}`);
	lines.push(`Feature: ${context.featureId}`);
	lines.push(`Tokens: ${context.totalTokensEstimated}/${context.tokenBudget}`);
	lines.push(``);

	const grouped: Record<string, ContextPacket[]> = {};
	context.packets.forEach((p) => {
		if (!grouped[p.packetType]) {
			grouped[p.packetType] = [];
		}
		grouped[p.packetType].push(p);
	});

	Object.entries(grouped).forEach(([type, packets]) => {
		lines.push(`## ${type}`);
		packets.forEach((p) => {
			lines.push(`### ${p.sourceRef} (authority: ${p.authority.toFixed(2)})`);
			lines.push(p.content);
			lines.push(``);
		});
	});

	return lines.join('\n');
}
