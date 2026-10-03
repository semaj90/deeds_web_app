#!/usr/bin/env node

/**
 * Read-only HTTP proof for the authenticated SvelteKit ACP/NLP surface.
 *
 * This intentionally exercises the app routes, not the registry directly:
 * GET /api/acp/tools, GET /.well-known/agent.json, and one real POST for each
 * coarse NLP tool. It writes only its own receipt and never promotes data.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const baseUrl = process.env.ATLAS_SVELTEKIT_BASE_URL ?? 'http://127.0.0.1:5173';
const reportPath = path.join(root, 'docs/reports/acp-nlp-sidecar-http-live-proof-v1.json');

async function request(route, init = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* preserve non-JSON as a bounded diagnostic */ }
  return { status: response.status, body, textLength: text.length };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const report = {
  schema: 'atlas.acp-nlp-sidecar-http-live-proof.v1',
  generatedAt: new Date().toISOString(),
  baseUrl,
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
  routeProof: {},
};

try {
  const tools = await request('/api/acp/tools');
  const listed = Array.isArray(tools.body?.tools) ? tools.body.tools.map((tool) => tool.name) : [];
  const expected = ['nlp:capabilities', 'nlp:analyze', 'nlp:ast-chunk'];
  report.routeProof.tools = { status: tools.status, expected, present: expected.filter((name) => listed.includes(name)) };
  assert(tools.status === 200, `GET /api/acp/tools returned ${tools.status}`);
  assert(expected.every((name) => listed.includes(name)), `ACP tool catalog is missing an expected NLP tool: ${listed.join(', ')}`);

  const card = await request('/.well-known/agent.json');
  const skills = Array.isArray(card.body?.skills) ? card.body.skills.map((skill) => skill.id) : [];
  report.routeProof.agentCard = { status: card.status, nlpSkillPresent: skills.includes('nlp-sidecar-analysis') };
  assert(card.status === 200 && skills.includes('nlp-sidecar-analysis'), 'AgentCard does not advertise nlp-sidecar-analysis');

  const calls = [
    { tool: 'nlp:capabilities', args: {} },
    { tool: 'nlp:analyze', args: { text: 'The court held that the defendant breached the contract.', source_type: 'plain_text', extraction_mode: 'entities' } },
    { tool: 'nlp:ast-chunk', args: { source: 'export function add(a: number, b: number): number { return a + b; }', language: 'typescript', filePath: 'scratch/acp-http-proof.ts', sourceRevision: 'sha256:acp-http-proof-fixture' } },
  ];
  report.routeProof.executions = [];
  for (const call of calls) {
    const result = await request('/api/acp/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: call.tool, args: call.args, dryRun: false }),
    });
    const success = result.status === 200 && result.body?.success === true;
    const schema = result.body?.result?.schema ?? null;
    report.routeProof.executions.push({ tool: call.tool, status: result.status, success, schema, responseBytes: result.textLength });
    assert(success, `${call.tool} returned ${result.status} or success=false`);
    if (call.tool === 'nlp:ast-chunk') assert(schema === 'atlas.ast.evidence.v1', `unexpected AST schema: ${schema}`);
  }

  report.status = 'ACP_NLP_HTTP_LIVE_PROVEN';
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, reportPath: path.relative(root, reportPath) }, null, 2));
} catch (error) {
  report.status = 'ACP_NLP_HTTP_LIVE_FAILED';
  report.error = String(error?.message ?? error);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(JSON.stringify({ ...report, reportPath: path.relative(root, reportPath) }, null, 2));
  process.exitCode = 1;
}
