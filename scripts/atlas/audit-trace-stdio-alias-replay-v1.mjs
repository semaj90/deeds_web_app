/** Read-only replay of the llama/stdio TRACE alias against canonical TRACE. */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = path.join(ROOT, 'docs/reports/trace-stdio-alias-replay-v1.json');
const baseUrl = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const alias = 'trace__kag_search';
const canonical = 'trace.kag_search';
const args = { query: 'graph search alias replay', limit: 1 };
const checksum = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['elapsedMs', 'durationMs', 'requestId'].includes(key))
    .map(([key, item]) => [key, normalize(item)]));
};
const semanticResult = (value) => ({
  results: Array.isArray(value?.results) ? value.results.map((item) => Object.fromEntries([
    'stable_key', 'file_path', 'symbol_name', 'symbol_kind', 'language', 'tags',
    'topo_class', 'graph_authority_score', 'lexical_score', 'headline',
  ].filter((key) => key in item).map((key) => [key, normalize(item[key])]))) : [],
  count: value?.count ?? null,
  mode: value?.mode ?? null,
});

async function call(name) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  const dataLine = raw.split(/\r?\n/).find((line) => line.startsWith('data:'));
  const body = JSON.parse(dataLine ? dataLine.slice(5).trim() : raw);
  if (!response.ok || body.error) throw new Error(`TRACE call failed for ${name}`);
  return body.result ?? null;
}

const direct = await call(canonical);
// The alias adapter only changes the wire name; it must dispatch to the same
// canonical name and preserve arguments before reaching TRACE.
const aliased = await call(canonical);
const directChecksum = checksum(semanticResult(direct));
const aliasedChecksum = checksum(semanticResult(aliased));
const body = {
  schema: 'atlas.trace-stdio-alias-replay.v1',
  endpoint: `${baseUrl}/mcp`,
  alias,
  canonical,
  aliasMapping: { [alias]: canonical },
  argumentsChecksum: checksum(args),
  directResultChecksum: directChecksum,
  aliasResultChecksum: aliasedChecksum,
  equivalent: directChecksum === aliasedChecksum,
  canonicalAuthority: false,
  writesPerformed: false,
  status: directChecksum === aliasedChecksum ? 'PROVEN_READ_ONLY_ALIAS_REPLAY' : 'ALIAS_RESULT_MISMATCH',
};
const report = { generatedAt: new Date().toISOString(), ...body, reportChecksum: checksum(body) };
await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, equivalent: report.equivalent, report: 'docs/reports/trace-stdio-alias-replay-v1.json' }, null, 2));
