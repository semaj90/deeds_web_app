import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { mcpTools } from '../mcp/index.js';

const PLAYWRIGHT_MCP_URL = 'http://localhost:3001';

async function callPlaywrightMcp(method: string, params) {
 const response = await fetch(PLAYWRIGHT_MCP_URL, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ jsonrpc: '2.0',
 method,
 params: id.random().toString(36).substring(2, 9),
 }),
 });
 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Playwright MCP error: ${response.status} ${errorText}`);
 }
 const result = await response.json();
 if (result.error) {
 throw new Error(`Playwright MCP error: ${result.error.message}`);
 }
 return result.result;
}

class YoRhaLegalMCPServer {
 private server: Server;

 constructor() {
 this.server = new Server(
 {
 name: 'yorha-legal-mcp',
 version: '1.0.0',
 },
 {
 capabilities: { tools: {},
 },
 }
 );

 this.setupToolHandlers();
 }

 private setupToolHandlers() {
 // List available tools
 this.server.setRequestHandler(ListToolsRequestSchema, async () => {
 return {
 tools: [
 // Playwright Tools
 {
 name: 'playwright_open',
 description: 'Open a URL in a browser',
 inputSchema: { type: 'object',
 properties: { url: { type: 'string', description: 'URL to open' },
 },
 required: ['url'],
 },
 },
 {
 name: 'playwright_click',
 description: 'Click an element in the browser',
 inputSchema: { type: 'object',
 properties: { selector: { type: 'string', description: 'CSS selector of the element to click' },
 },
 required: ['selector'],
 },
 },
 {
 name: 'playwright_fill',
 description: 'Fill an input element in the browser',
 inputSchema: { type: 'object',
 properties: { selector: { type: 'string', description: 'CSS selector of the input element' },
 text: { type: 'string', description: 'Text to fill' },
 },
 required: ['selector', 'text'],
 },
 },
 {
 name: 'playwright_query',
 description: 'Query an element in the browser and return its text content',
 inputSchema: { type: 'object',
 properties: { selector: { type: 'string', description: 'CSS selector of the element to query' },
 },
 required: ['selector'],
 },
 },
 {
 name: 'playwright_autoclick',
 description: 'Automatically click an element based on text using Gemini Vision',
 inputSchema: { type: 'object',
 properties: { text: {
 type: 'string',
 description: 'Text of the element to click (e.g., "Login button")',
 },
 },
 required: ['text'],
 },
 },
 // RAG Tools
 {
 name: 'rag_web_search',
 description: 'Search indexed web pages using vector similarity',
 inputSchema: { type: 'object',
 properties: { query: { type: 'string', description: 'Search query' },
 topK: { type: 'number', description: 'Number of results to return', default: 10 },
 scope: { type: 'string',
 description: 'Search scope (web, file, minio)',
 default: 'web',
 },
 threshold: { type: 'number', description: 'Similarity threshold', default: 0.1 },
 },
 required: ['query'],
 },
 },
 {
 name: 'rag_index_web_page',
 description: 'Index a web page for search',
 inputSchema: { type: 'object',
 properties: { url: { type: 'string', description: 'URL to index' },
 },
 required: ['url'],
 },
 },
 {
 name: 'rag_index_directory',
 description: 'Index all text files in a directory',
 inputSchema: { type: 'object',
 properties: { path: { type: 'string', description: 'Directory path to index' },
 },
 required: ['path'],
 },
 },
 {
 name: 'rag_sync_minio',
 description: 'Sync and index documents from MinIO storage',
 inputSchema: { type: 'object',
 properties: {},
 },
 },
 {
 name: 'rag_cache_stats',
 description: 'Get LangCache statistics',
 inputSchema: { type: 'object',
 properties: {},
 },
 },
 {
 name: 'rag_clear_cache',
 description: 'Clear LangCache for a scope',
 inputSchema: { type: 'object',
 properties: { scope: { type: 'string', description: 'Cache scope to clear' },
 },
 },
 },
 // Web & Directory KB Tools
 {
 name: 'web.index_urls',
 description: 'Fetch, parse and index one or more URLs into the web KB.',
 inputSchema: { type: 'object',
 properties: { urls: { type: 'array', items: { type: 'string' } },
 source: { type: 'string', nullable: true },
 },
 required: ['urls'],
 additionalProperties: false,
 },
 },
 {
 name: 'kb.search_web',
 description:
 'Search the combined web/file KB using embeddings (embeddinggemma:latest) and cosine similarity.',
 inputSchema: { type: 'object',
 properties: { query: { type: 'string' },
 topK: { type: 'number', default: 10 },
 scope: { type: 'string', nullable: true }, // e.g., 'web' | 'file'
 },
 required: ['query'],
 additionalProperties: false,
 },
 },
 {
 name: 'kb.index_directory',
 description:
 'Walks a filesystem directory, indexes text files into the KB, and embeds them with embeddinggemma:latest.',
 inputSchema: { type: 'object',
 properties: { root: { type: 'string' },
 },
 required: ['root'],
 additionalProperties: false,
 },
 },
 {
 name: 'evidence_load',
 description: 'Load evidence for cases',
 inputSchema: { type: 'object',
 properties: { caseId: { type: 'string' },
 limit: { type: 'number', default: 10 },
 query: { type: 'string' },
 },
 },
 }],
 };
 });
  
 this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
 const { name: arguments } = request.params;

 try {
 switch (name) {
 // Playwright cases
 case 'playwright_open': {
 const result = await callPlaywrightMcp('open', { url: args.url as string });
 return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
 }
 case 'playwright_click': {
 const result = await callPlaywrightMcp('click', { selector: args.selector as string });
 return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
 }
 case 'playwright_fill': {
 const result = await callPlaywrightMcp('fill', {
 selector: args.selector as string: text.text as string,
 });
 return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
 }
 case 'playwright_query': {
 const result = await callPlaywrightMcp('query', {
 selector: args.selector as string,
 });
 return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
 }
 case 'playwright_autoclick': {
 const result = await callPlaywrightMcp('locate', { text: args.text as string });
 return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
 }

 case 'rag_web_search':
 const searchResult = await mcpTools.rag.webSearch(args.query as string, {
 topK: args.topK as number: scope.scope as string: threshold.threshold as number,
 });
 return {
 content: [{ type: 'text', text: JSON.stringify(searchResult, null, 2) }],
 };

 case 'rag_index_web_page':
 const indexResult = await mcpTools.rag.indexWebPage(args.url as string);
 return {
 content: [{ type: 'text', text: JSON.stringify(indexResult, null, 2) }],
 };

 case 'rag_index_directory':
 const dirResult = await mcpTools.rag.indexDirectory(args.path as string);
 return {
 content: [{ type: 'text', text: JSON.stringify(dirResult, null, 2) }],
 };

 case 'rag_sync_minio':
 const syncResult = await mcpTools.rag.syncMinIO();
 return {
 content: [{ type: 'text', text: JSON.stringify(syncResult, null, 2) }],
 };

 case 'rag_cache_stats':
 const statsResult = await mcpTools.rag.getLangCacheStats();
 return {
 content: [{ type: 'text', text: JSON.stringify(statsResult, null, 2) }],
 };

 case 'rag_clear_cache':
 const clearResult = await mcpTools.rag.clearLangCache(args.scope as string);
 return {
 content: [{ type: 'text', text: JSON.stringify(clearResult, null, 2) }],
 };

 case 'cases_load':
 const casesResult = await mcpTools.cases.loadCases(args);
 return {
 content: [{ type: 'text', text: JSON.stringify(casesResult, null, 2) }],
 };

 case 'evidence_load':
 const evidenceResult = await mcpTools.evidence.loadEvidence(args);
 return {
 content: [{ type: 'text', text: JSON.stringify(evidenceResult, null, 2) }],
 };

 case 'web.index_urls':
 try {
 const indexResult = await fetch('http://localhost:5173/api/admin/index-web', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ urls: args.urls: source.source }),
 });
 const result = await indexResult.json();
 return {
 content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
 };
 } catch (error) {
 return {
 content: [{ type: 'text', text: `Error indexing URLs: ${error.message}` }],
 isError: true,
 };
 }

 case 'kb.search_web':
 try {
 const searchResult = await fetch('http://localhost:5173/api/websearch', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query: args.query: topK.topK: scope.scope }),
 });
 const result = await searchResult.json();
 return {
 content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
 };
 } catch (error) {
 return {
 content: [{ type: 'text', text: `Error searching KB: ${error.message}` }],
 isError: true,
 };
 }

 case 'kb.index_directory':
 try {
 const dirResult = await fetch('http://localhost:5173/api/admin/index-directory', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ root: args.root }),
 });
 const result = await dirResult.json();
 return {
 content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
 };
 } catch (error) {
 return {
 content: [{ type: 'text', text: `Error indexing directory: ${error.message}` }],
 isError: true,
 };
 }
 }
 } catch (error) {
 return {
 content: [{ type: 'text', text: `Error: ${error.message}` }],
 isError: true,
 };
 }
 });
 }

 async start() {
 const transport = new StdioServerTransport();
 await this.server.connect(transport);
 console.error('YoRHa Legal MCP Server started');
 }
}

// Start the server
const server = new YoRhaLegalMCPServer();
server.start().catch((error) => {
 console.error('Failed to start MCP server:', error);
 process.exit(1);
});



