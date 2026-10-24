import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOOLS = [
	{
		name: 'trace.kag_search',
		description: 'search',
		inputSchema: {
			type: 'object',
			properties: { query: { type: 'string' }, limit: { type: 'number' } },
			required: ['query'],
		},
	},
];

function toolListResponse() {
	return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: TOOLS } }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('validateToolArgsAgainstSchemaV1', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('accepts arguments that match the cached schema', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => toolListResponse()));
		const { validateToolArgsAgainstSchemaV1 } = await import('./mcp-tool-bridge.js');
		const result = await validateToolArgsAgainstSchemaV1('trace.kag_search', { query: 'auth', limit: 5 });
		expect(result).toEqual({ status: 'VALID' });
	});

	it('refuses arguments that violate the cached schema', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => toolListResponse()));
		const { validateToolArgsAgainstSchemaV1 } = await import('./mcp-tool-bridge.js');
		const result = await validateToolArgsAgainstSchemaV1('trace.kag_search', { limit: 'many' });
		expect(result.status).toBe('INVALID');
		if (result.status === 'INVALID') {
			expect(result.reasons.length).toBeGreaterThan(0);
		}
	});

	it('reports NO_CACHED_SCHEMA when the tool list is unavailable', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
		const { validateToolArgsAgainstSchemaV1 } = await import('./mcp-tool-bridge.js');
		const result = await validateToolArgsAgainstSchemaV1('trace.kag_search', { query: 'x' });
		expect(result).toEqual({ status: 'NO_CACHED_SCHEMA' });
	});

	it('reports NO_CACHED_SCHEMA for a tool that is not in the list', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => toolListResponse()));
		const { validateToolArgsAgainstSchemaV1 } = await import('./mcp-tool-bridge.js');
		const result = await validateToolArgsAgainstSchemaV1('unknown.tool', {});
		expect(result).toEqual({ status: 'NO_CACHED_SCHEMA' });
	});
});
