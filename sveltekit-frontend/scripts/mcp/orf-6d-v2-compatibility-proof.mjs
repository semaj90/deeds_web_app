#!/usr/bin/env node
/**
 * Isolated MCP TypeScript SDK v2 / protocol 2026-07-28 compatibility proof.
 *
 * This deliberately imports the lockfile-resolved v2 packages without changing
 * the application's direct @modelcontextprotocol/sdk v1 dependency or runtime.
 * It uses only an in-process fetch handler and ephemeral client memory.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, fromJsonSchema, McpServer } from '@modelcontextprotocol/server';

const protocolVersion = '2026-07-28';
const schema2020 = 'https://json-schema.org/draft/2020-12/schema';
const projectRoot = new URL('../../', import.meta.url);

async function packageVersion(name) {
	const packageUrl = new URL(`node_modules/${name}/package.json`, projectRoot);
	const json = JSON.parse(await readFile(packageUrl, 'utf8'));
	return json.version;
}

const versions = {
	client: await packageVersion('@modelcontextprotocol/client'),
	server: await packageVersion('@modelcontextprotocol/server'),
	core: await packageVersion('@modelcontextprotocol/core')
};
assert.deepEqual(versions, { client: '2.1.0', server: '2.1.0', core: '2.1.0' });

const requestLog = [];
const inputSchema = {
	$schema: schema2020,
	type: 'object',
	properties: {
		region: { type: 'string', minLength: 1, 'x-mcp-header': 'Region' },
		query: { type: 'string', minLength: 1 }
	},
	required: ['region', 'query'],
	additionalProperties: false
};

const handler = createMcpHandler(() => {
	const server = new McpServer(
		{ name: 'orf-6d-compatibility-proof', version: '1.0.0' },
		{
			capabilities: { tools: {}, resources: {} },
			cacheHints: {
				'tools/list': { ttlMs: 30_000, cacheScope: 'private' },
				'resources/list': { ttlMs: 30_000, cacheScope: 'private' }
			}
		}
	);
	server.registerTool(
		'lookup-region',
		{ inputSchema: fromJsonSchema(inputSchema) },
		async ({ region, query }) => ({
			content: [{ type: 'text', text: `${region}:${query}` }]
		})
	);
	server.registerResource(
		'proof-resource',
		'atlas://orf-6d/proof',
		{
			mimeType: 'text/plain',
			cacheHint: { ttlMs: 30_000, cacheScope: 'public' }
		},
		async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: 'proof' }] })
	);
	return server;
}, { responseMode: 'json' });

const transport = new StreamableHTTPClientTransport(new URL('http://orf-6d.test/mcp'), {
	fetch: async (input, init) => {
		const request = input instanceof Request && init === undefined ? input : new Request(input, init);
		const bodyText = request.method === 'POST' ? await request.clone().text() : '';
		const response = await handler.fetch(request);
		let responseBody;
		try {
			responseBody = await response.clone().json();
		} catch {
			responseBody = null;
		}
		requestLog.push({
			method: request.headers.get('mcp-method'),
			name: request.headers.get('mcp-name'),
			protocolHeader: request.headers.get('mcp-protocol-version'),
			paramRegion: request.headers.get('mcp-param-region'),
			body: bodyText ? JSON.parse(bodyText) : null,
			response: responseBody
		});
		return response;
	}
});
const client = new Client(
	{ name: 'orf-6d-compatibility-probe', version: '1.0.0' },
	{ versionNegotiation: { mode: { pin: protocolVersion } } }
);

try {
	await client.connect(transport);
	assert.equal(client.getProtocolEra(), 'modern');
	assert.ok(requestLog.some((entry) => entry.method === 'server/discover'),
		'pinned negotiation performed the modern discovery request');

	const listedTools = await client.listTools();
	const tool = listedTools.tools.find((candidate) => candidate.name === 'lookup-region');
	assert.ok(tool, 'tool is advertised');
	assert.equal(tool.inputSchema.$schema, schema2020);
	assert.equal(tool.inputSchema.properties.region['x-mcp-header'], 'Region');

	const toolsListRequestCount = requestLog.filter((entry) => entry.method === 'tools/list').length;
	await client.listTools();
	assert.equal(requestLog.filter((entry) => entry.method === 'tools/list').length, toolsListRequestCount,
		'fresh tools/list result is served from the client response cache');

	const resources = await client.listResources();
	assert.equal(resources.resources[0]?.uri, 'atlas://orf-6d/proof');
	const resourceListRequestCount = requestLog.filter((entry) => entry.method === 'resources/list').length;
	await client.listResources();
	assert.equal(requestLog.filter((entry) => entry.method === 'resources/list').length, resourceListRequestCount,
		'fresh resources/list result is served from the client response cache');

	const readResource = () => client.readResource({ uri: 'atlas://orf-6d/proof' });
	const read = await readResource();
	assert.equal(read.contents[0]?.text, 'proof');
	const resourceReadRequestCount = requestLog.filter((entry) => entry.method === 'resources/read').length;
	await readResource();
	assert.equal(requestLog.filter((entry) => entry.method === 'resources/read').length, resourceReadRequestCount,
		'fresh resources/read result is served from the client response cache');

	const called = await client.callTool({ name: 'lookup-region', arguments: { region: 'us-west1', query: 'health' } });
	assert.equal(called.content[0]?.text, 'us-west1:health');
	const toolCall = requestLog.find((entry) => entry.method === 'tools/call');
	assert.ok(toolCall, 'tools/call reached the in-process v2 server');
	assert.equal(toolCall.name, 'lookup-region');
	assert.equal(toolCall.method, 'tools/call');
	assert.equal(toolCall.protocolHeader, protocolVersion);
	assert.equal(toolCall.body?.params?._meta?.['io.modelcontextprotocol/protocolVersion'], protocolVersion);
	assert.equal(toolCall.paramRegion, 'us-west1');
	assert.equal(toolCall.body?.params?.arguments?.region, toolCall.paramRegion,
		'Mcp-Param-Region agrees with the JSON-RPC body parameter');

	for (const [method, expectedScope] of [
		['tools/list', 'private'],
		['resources/list', 'private'],
		['resources/read', 'public']
	]) {
		const entry = requestLog.find((item) => item.method === method);
		assert.ok(entry, `${method} was exercised`);
		const result = entry.response?.result;
		assert.equal(result?.ttlMs, 30_000, `${method} response carries configured ttlMs`);
		assert.equal(result?.cacheScope, expectedScope, `${method} response carries configured cacheScope`);
	}

	console.log(JSON.stringify({
		schema: 'atlas.orf-6d-mcp-v2-compatibility-proof.v1',
		status: 'PASS_ISOLATED_COMPATIBILITY_ONLY',
		protocolVersion,
		protocolEra: client.getProtocolEra(),
		versions,
		checks: {
			modernVersionPin: true,
			standardHeaderRouting: requestLog.some((entry) => entry.method === 'tools/call' && entry.name === 'lookup-region'),
			parameterHeaderMirror: toolCall.paramRegion === 'us-west1',
			jsonSchema202012: tool.inputSchema.$schema === schema2020,
			listAndResourceResultCaching: true,
			cacheHintsObserved: true
		},
		requestCount: requestLog.length,
		productionRuntimeChanged: false,
		applicationDependencyChanged: false,
		datastoreWrites: 0
	}, null, 2));
} finally {
	await client.close();
	await handler.close();
}
