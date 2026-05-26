#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const host = process.env.MCP_HOST || 'http://localhost:8788';
const endpoints = [
  `${host}/health`,
  `${host}/tools`,
  `${host}/`,
];

const outDir = path.resolve('.tmp');
try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}
const outPath = path.join(outDir, 'mcp-health-status.json');

async function probe() {
  const results = { ts: new Date().toISOString(), host, checks: [] };
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'GET' });
      const text = await res.text().catch(() => '');
      results.checks.push({ url, status: res.status, ok: res.ok, snippet: text.slice(0, 512) });
    } catch (err) {
      results.checks.push({ url, error: String(err.message || err) });
    }
  }
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.error('Wrote', outPath);
  // Exit 0 always — this is read-only health; callers decide blockers
  process.exit(0);
}

probe();
