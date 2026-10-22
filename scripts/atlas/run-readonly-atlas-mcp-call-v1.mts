import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Ajv from 'ajv';

const TOOL_NAME = 'build_agentic_rag_context';
const args = process.argv.slice(2);
const runId = args.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
const query = args.find((arg) => arg.startsWith('--query='))?.slice('--query='.length);
if (!runId || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId) || !query?.trim()) {
  throw new Error('usage: tsx scripts/atlas/run-readonly-atlas-mcp-call-v1.mts --run-id=<safe-id> --query=<query>');
}

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
const serverPath = path.resolve(repoRoot, 'sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs');
const outputDirectory = path.resolve(repoRoot, '.tmp/atlas/mcp-tool-calls', runId);
const client = new Client({ name: 'parent-atlas-readonly-tool-call', version: '1.0.0' }, { capabilities: {} });
let rawResult: unknown = null;
let callError: string | null = null;
let surfaceEntry: any;

try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, ATLAS_TOOLS_MOCK: '0' } as Record<string, string>,
  }));
  const listed = await client.listTools();
  const tool = listed.tools.find((entry) => entry.name === TOOL_NAME);
  if (!tool?.inputSchema) throw new Error('LIVE_TOOL_SCHEMA_MISSING');
  const validate = new Ajv({ allErrors: true, strict: false }).compile(tool.inputSchema);
  const toolArgs = { query, maxCards: 8, maxPayloadBytes: 8192 };
  if (!validate(toolArgs)) throw new Error(`LIVE_TOOL_ARGUMENT_SCHEMA_REJECTED:${JSON.stringify(validate.errors ?? [])}`);
  if (tool.description?.includes('mock') || process.env.ATLAS_TOOLS_MOCK === '1') throw new Error('MOCK_TOOL_SURFACE_FORBIDDEN');
  surfaceEntry = {
    toolName: tool.name,
    inputSchemaDigest: sha256(tool.inputSchema),
    descriptionDigest: sha256(tool.description ?? ''),
  };
  rawResult = await client.callTool({ name: TOOL_NAME, arguments: toolArgs });
} catch (error) {
  callError = error instanceof Error ? error.message : String(error);
} finally {
  try { await client.close(); } catch { /* transport may already be closed */ }
}

mkdirSync(outputDirectory, { recursive: true });
const resultArtifact = {
  schema: 'atlas.mcp-readonly-tool-result.v1',
  runId,
  server: 'atlas-tools',
  toolName: TOOL_NAME,
  result: rawResult,
  error: callError,
  canonicalAuthority: false,
  writesPerformed: false,
};
const resultChecksum = sha256(resultArtifact);
const resultFile = path.join(outputDirectory, 'result.json');
writeFileSync(resultFile, `${JSON.stringify(resultArtifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

let parsedResult: Record<string, any> | null = null;
if (rawResult && typeof rawResult === 'object' && Array.isArray((rawResult as any).content)) {
  const text = (rawResult as any).content.find((part: any) => part.type === 'text')?.text;
  if (typeof text === 'string') {
    try { parsedResult = JSON.parse(text) as Record<string, any>; } catch { parsedResult = null; }
  }
}
const receiptBody = {
  schema: 'atlas.mcp-readonly-tool-call-receipt.v1',
  runId,
  serverAuthority: 'atlas-tools:stdio:local-script',
  toolName: TOOL_NAME,
  toolSchema: surfaceEntry,
  argumentsChecksum: sha256({ query, maxCards: 8, maxPayloadBytes: 8192 }),
  resultArtifact: path.relative(repoRoot, resultFile).replace(/\\/g, '/'),
  resultChecksum,
  callError,
  toolReportedError: Boolean((rawResult as any)?.isError),
  returnedCardCount: Number.isInteger(parsedResult?.totalCards) ? parsedResult?.totalCards : null,
  returnedSourceRefCount: Array.isArray(parsedResult?.sourceRefs) ? parsedResult.sourceRefs.length : null,
  proofUsable: false,
  admissionStatus: parsedResult?.admissionStatus ?? 'NOT_AVAILABLE',
  writesPerformed: false,
  canonicalAuthority: false,
};
const receipt = { ...receiptBody, receiptChecksum: sha256(receiptBody) };
writeFileSync(path.join(outputDirectory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ runId, toolName: TOOL_NAME, callError, returnedCardCount: receipt.returnedCardCount, admissionStatus: receipt.admissionStatus, proofUsable: false, receipt: path.relative(repoRoot, path.join(outputDirectory, 'receipt.json')).replace(/\\/g, '/') }));
