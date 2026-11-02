#!/usr/bin/env node
// Read-only: compares atlas_tool_manifest_vectors_v1 live_surface flags with a discovered MCP surface
// (output of discover-mcp-tools-live-v1.mts). Writes nothing; exits 1 on drift.
//   node scripts/atlas/audit-tool-manifest-live-drift-v1.mjs [--surface=docs/reports/mcp-tool-surface-live-v1.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = process.argv.find((a) => a.startsWith('--surface='));
const surfacePath = path.resolve(ROOT, arg ? arg.slice('--surface='.length) : 'docs/reports/mcp-tool-surface-live-v1.json');
const doc = JSON.parse(fs.readFileSync(surfacePath, 'utf8'));
const live = new Set();
for (const s of Object.values(doc.servers ?? {})) for (const t of s.surface?.tools ?? []) live.add(t.ref.toolName);
if (live.size === 0) { console.error('SURFACE_EMPTY'); process.exit(2); }

const sql = postgres(resolveDatabaseUrl(loadRepoEnv()), { max: 1, idle_timeout: 5 });
try {
  const rows = await sql`SELECT tool_name, payload->>'live_surface' AS flag FROM public.atlas_tool_manifest_vectors_v1 WHERE jsonb_typeof(payload) = 'object'`;
  const inTable = new Map(rows.map((r) => [r.tool_name, r.flag === 'true']));
  const missingFromTable = [...live].filter((n) => !inTable.has(n));
  const flaggedLiveButGone = [...inTable].filter(([n, f]) => f && !live.has(n)).map(([n]) => n);
  const liveButUnflagged = [...inTable].filter(([n, f]) => !f && live.has(n)).map(([n]) => n);
  const report = {
    schema: 'atlas.tool-manifest-live-drift.v1', surface: path.relative(ROOT, surfacePath), surfaceGeneratedAt: doc.generatedAt ?? null,
    liveTools: live.size, tableRows: inTable.size,
    missingFromTable, flaggedLiveButGone, liveButUnflagged,
    drift: missingFromTable.length + flaggedLiveButGone.length + liveButUnflagged.length,
    readOnly: true, writesPerformed: false,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.drift > 0 ? 1 : 0);
} finally {
  await sql.end();
}
