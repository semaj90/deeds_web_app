import type { TraceSubagent, TraceSubagentContext, TraceSubagentResult } from './trace-subagent-registry.js';

/**
 * Ontology Sortation Agent
 * 
 * Purpose: Turns messy files, chunks, and research into typed knowledge.
 */
export const ontologySortationAgent: TraceSubagent = {
	name: 'ontology_sortation',
	async run(ctx: TraceSubagentContext): Promise<TraceSubagentResult> {
		const t0 = Date.now();
		const results = (ctx.filePaths || []).map(path => {
			let type = 'file';
			if (path.includes('/routes/')) type = 'route';
			if (path.includes('/components/')) type = 'component';
			if (path.endsWith('.svelte')) type = 'ui_component';
			if (path.includes('/api/')) type = 'api_endpoint';
			if (path.includes('/db/schema/')) type = 'schema';
			if (path.includes('/research/')) type = 'external_research';

			return {
				path,
				ontology: type,
				tags: inferTags(path)
			};
		});

		return {
			agent: 'ontology_sortation',
			status: 'ok',
			durationMs: Date.now() - t0,
			output: results,
			metadata: { count: results.length }
		};
	}
};

function inferTags(path: string): string[] {
	const tags: string[] = [];
	if (path.includes('svelte')) tags.push('frontend');
	if (path.includes('server')) tags.push('backend');
	if (path.includes('ai')) tags.push('intelligence');
	if (path.includes('db')) tags.push('persistence');
	return tags;
}
