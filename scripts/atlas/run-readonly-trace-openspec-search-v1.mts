import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Ajv from 'ajv';

const TOOL_NAME = 'openspec.search';
const args = process.argv.slice(2);
const runId = args.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
const query = args.find((arg) => arg.startsWith('--query='))?.slice('--query='.length);
if (!runId || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId) || !query?.trim()) throw new Error('run-id and query are required');

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
}

const repoRoot = process.cwd();
const outputDirectory = path.resolve(repoRoot, '.tmp/atlas/mcp-tool-calls', runId);
const endpoint = process.env.TRACE_MCP_HTTP_URL ?? 'http://127.0.0.1:8788/mcp';
const client = new Client({ name: 'parent-atlas-readonly-openspec-search', version: '1.0.0' }, { capabilities: {} });
let rawResult: unknown = null;
let callError: string | null = null;
let toolEvidence: Record<string, unknown> | null = null;
let serverInfo: Record<string, unknown> | null = null;

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  serverInfo = client.getServerVersion() as Record<string, unknown> | null;
  const listed = await client.listTools();
  const tool = listed.tools.find((entry) => entry.name === TOOL_NAME);
  if (!tool?.inputSchema || !/search/i.test(tool.description ?? '')) throw new Error('LIVE_READONLY_SEARCH_TOOL_UNAVAILABLE');
  const toolArgs = { query, limit: 5 };
  const validate = new Ajv({ allErrors: true, strict: false }).compile(tool.inputSchema);
  if (!validate(toolArgs)) throw new Error(`LIVE_TOOL_ARGUMENT_SCHEMA_REJECTED:${JSON.stringify(validate.errors ?? [])}`);
  toolEvidence = { name: tool.name, description: tool.description ?? null, inputSchema: tool.inputSchema, schemaDigest: sha256(tool.inputSchema) };
  rawResult = await client.callTool({ name: TOOL_NAME, arguments: toolArgs });
} catch (error) {
  callError = error instanceof Error ? error.message : String(error);
} finally {
  try { await client.close(); } catch { /* transport may already be closed */ }
}

mkdirSync(outputDirectory, { recursive: true });
const artifact = { schema: 'atlas.trace-readonly-tool-result.v1', runId, endpoint, serverInfo, toolEvidence, result: rawResult, error: callError, canonicalAuthority: false, writesPerformed: false };
const resultChecksum = sha256(artifact);
const resultPath = path.join(outputDirectory, 'trace-openspec-result.json');
writeFileSync(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
let parsed: any = null;
const responseText = (rawResult as any)?.content?.find((part: any) => part.type === 'text')?.text;
if (typeof responseText === 'string') { try { parsed = JSON.parse(responseText); } catch { parsed = null; } }
const body = {
  schema: 'atlas.trace-readonly-tool-call-receipt.v1', runId, endpoint, serverInfo,
  toolName: TOOL_NAME, toolSchemaDigest: toolEvidence?.schemaDigest ?? null,
  argumentsChecksum: sha256({ query, limit: 5 }), resultArtifact: path.relative(repoRoot, resultPath).replace(/\\/g, '/'),
  resultChecksum, callError, toolReportedError: Boolean((rawResult as any)?.isError),
  returnedItems: Array.isArray(parsed?.results) ? parsed.results.length : Array.isArray(parsed) ? parsed.length : null,
  resultIsClaimOnly: true, proofUsable: false, writesPerformed: false, canonicalAuthority: false,
};
const receipt = { ...body, receiptChecksum: sha256(body) };
writeFileSync(path.join(outputDirectory, 'trace-openspec-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ runId, toolName: TOOL_NAME, callError, returnedItems: body.returnedItems, proofUsable: false, receipt: path.relative(repoRoot, path.join(outputDirectory, 'trace-openspec-receipt.json')).replace(/\\/g, '/') }));
