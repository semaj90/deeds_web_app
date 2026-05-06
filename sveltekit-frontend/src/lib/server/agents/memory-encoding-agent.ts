import type { TraceSubagent, TraceSubagentContext, TraceSubagentResult } from './trace-subagent-registry.js';
import { validateInformationGain } from '../ai/information-gain-validator.js';

/**
 * Memory Encoding Agent
 * 
 * Purpose: Decides whether synthesis becomes durable memory using 
 * Information Gain validation.
 */
export const memoryEncodingAgent: TraceSubagent = {
	name: 'memory_encoding',
	async run(ctx: TraceSubagentContext): Promise<TraceSubagentResult> {
		const t0 = Date.now();
		
		if (!ctx.synthesis || !ctx.query) {
			return {
				agent: 'memory_encoding',
				status: 'skipped',
				durationMs: Date.now() - t0,
				error: 'Missing synthesis or query context'
			};
		}

		// Run validator
		const validation = await validateInformationGain({
			context: ctx.query,
			existing: '', // Should be looked up in a real run
			candidate: typeof ctx.synthesis === 'string' ? ctx.synthesis : JSON.stringify(ctx.synthesis)
		});

		return {
			agent: 'memory_encoding',
			status: 'ok',
			durationMs: Date.now() - t0,
			output: validation,
			metadata: { 
				shouldEncode: validation.shouldUpdate,
				gainScore: validation.gainScore
			}
		};
	}
};
