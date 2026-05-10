#!/usr/bin/env node
// smoke-adopted-mcp.mjs — probes each "adopted" official MCP server
// from .vscode/mcp.json (the ones currently `enabled:false`) and
// reports whether the package actually installs and lists tools cleanly.
//
// Doesn't change config. Doesn't run forever. For each candidate:
//   1. Spawn it as a stdio child with a 10s ceiling
//   2. Send `initialize` + `tools/list`
//   3. Report ✅ if tools/list returns ≥1 tool, ❌ otherwise
//   4. Kill the child immediately after
//
// Use to decide which `enabled: false` to flip to `enabled: true`.
//
// Usage:
//   node scripts/smoke/smoke-adopted-mcp.mjs           # probe all
//   node scripts/smoke/smoke-adopted-mcp.mjs neo4j     # probe one by name fragment
//   node scripts/smoke/smoke-adopted-mcp.mjs --json    # machine-readable

import { spawn } from 'node:child_process';

const ARGS    = process.argv.slice(2);
const FILTER  = ARGS.find(a => !a.startsWith('--'));
const AS_JSON = ARGS.includes('--json');

const PROBES = [
  {
    name: 'neo4j-readonly',
    cmd: 'uvx', args: ['mcp-neo4j-cypher@latest'],
    env: { NEO4J_URL: 'bolt://localhost:7687', NEO4J_USERNAME: 'neo4j', NEO4J_PASSWORD: 'password', NEO4J_READ_ONLY: 'true' },
    note: 'requires uv installed AND a running Neo4j on :7687',
  },
  {
    name: 'qdrant-readonly',
    cmd: 'uvx', args: ['mcp-server-qdrant'],
    env: { QDRANT_URL: 'http://localhost:6333', COLLECTION_NAME: 'codebase_chunks_768' },
    note: 'requires uv + Qdrant on :6333',
  },
  {
    name: 'redis-readonly',
    cmd: 'uvx', args: ['mcp-server-redis'],
    env: { REDIS_HOST: 'localhost', REDIS_PORT: '6379', REDIS_DB: '0', REDIS_PASSWORD: 'redis' },
    note: 'requires uv + Redis on :6379 (legal-ai-redis container)',
  },
  {
    name: 'postgres-readonly',
    cmd: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://readonly_user:readonly_pass@localhost:5432/legal_ai_db'],
    env: {},
    note: 'requires npx + Postgres readonly_user role (you may need to CREATE ROLE first)',
  },
  {
    name: 'obsidian-vault',
    cmd: 'npx', args: ['-y', '@bitbonsai/mcpvault', '--vault', './vault'],
    env: {},
    note: 'requires npx; falls back gracefully if ./vault directory does not exist',
  },
  {
    name: 'ts-lsp',
    cmd: 'C:\\Users\\james\\go\\bin\\mcp-language-server.exe',
    args: ['--workspace', '.', '--lsp', 'C:\\Users\\james\\AppData\\Roaming\\npm\\typescript-language-server.cmd', '--', '--stdio'],
    env: {},
    note: 'requires go install github.com/isaacphi/mcp-language-server@latest + typescript-language-server on PATH',
  },
  {
    name: 'context7',
    cmd: 'npx', args: ['-y', '@upstash/context7-mcp'],
    env: { CONTEXT7_API_KEY: 'placeholder' },
    note: 'requires npx + context7 API key (probing with placeholder)',
  },
];

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', cyan: '\x1b[36m' };

async function probe(p) {
  const t0 = Date.now();
  return await new Promise(resolveP => {
    let done = false;
    const finish = (status, detail) => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch {}
      resolveP({ name: p.name, status, detail, ms: Date.now() - t0 });
    };
    const onWin = process.platform === 'win32';
    const child = spawn(p.cmd, p.args, {
      env: { ...process.env, ...p.env },
      shell: onWin, windowsHide: true,
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => {
      stdout += d.toString();
      for (const line of stdout.split('\n').filter(l => l.trim())) {
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2 && msg.result?.tools) {
          const n = msg.result.tools.length;
          finish(n > 0 ? 'pass' : 'fail', `${n} tools`);
        }
        if (msg.id === 2 && msg.error) {
          finish('fail', `tools/list error: ${msg.error.message?.slice(0, 80)}`);
        }
      }
    });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', err => finish('skip', `cannot spawn (${err.message.slice(0, 60)})`));
    child.on('exit', code => {
      if (!done) {
        const tail = stderr.split('\n').filter(l => l.trim()).slice(-1)[0]?.slice(0, 100) ?? '';
        finish('fail', `exit ${code} ${tail}`);
      }
    });
    setTimeout(() => finish('fail', 'timeout (60s)'), 60_000);
    try {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    } catch (err) {
      finish('fail', `stdin write failed: ${err.message}`);
    }
  });
}

const targets = FILTER ? PROBES.filter(p => p.name.includes(FILTER)) : PROBES;
if (targets.length === 0) {
  console.error(`no probes matched filter: ${FILTER}`);
  process.exit(2);
}

if (!AS_JSON) {
  console.log(`\n${C.cyan}Probing ${targets.length} adopted MCP server(s)…${C.reset}`);
  console.log(C.dim + 'Each probe gets 10s. Failures are mostly "package not installed yet" — expected.\n' + C.reset);
}

const results = [];
for (const p of targets) {
  if (!AS_JSON) process.stdout.write(`  ${p.name.padEnd(22)} `);
  const r = await probe(p);
  results.push(r);
  if (!AS_JSON) {
    const icon = r.status === 'pass' ? `${C.green}✅${C.reset}` : r.status === 'skip' ? `${C.yellow}⏸${C.reset} ` : `${C.red}❌${C.reset}`;
    console.log(`${icon} ${C.dim}${r.detail} (${r.ms}ms) — ${p.note}${C.reset}`);
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ targets: targets.length, results }, null, 2));
} else {
  const pass = results.filter(r => r.status === 'pass').length;
  const fail = results.filter(r => r.status === 'fail').length;
  const skip = results.filter(r => r.status === 'skip').length;
  console.log(`\n  ${C.green}${pass} pass${C.reset}  ${C.yellow}${skip} skip${C.reset}  ${C.red}${fail} fail${C.reset}\n`);
  if (pass > 0) console.log(C.dim + '  Next: in .vscode/mcp.json, flip `enabled: false` → `true` for the passing servers.\n' + C.reset);
}
process.exit(0);
