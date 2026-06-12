#!/usr/bin/env node
/**
 * Read-only runtime coverage audit.
 *
 * Joins the existing feature-lineage and route-runtime-packet reports with
 * live agent_traces coverage so we can see whether the learning lane is
 * actually populated.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const JSON_OUT = path.join(REPORTS_DIR, 'runtime-coverage-report.json');
const MD_OUT = path.join(REPORTS_DIR, 'runtime-coverage-report.md');

const FEATURE_LINEAGE_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'feature-lineage-report.json');
const RUNTIME_PACKET_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'runtime-packet-density-report.json');

loadAtlasEnv(REPO_ROOT);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((Number(part) / Number(total)) * 100).toFixed(2));
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
  if (!value) return [];
  return [String(value)];
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Runtime Coverage Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- agent_traces rows: ${report.agentTraces.total}`);
  lines.push(`- selected_concepts coverage: ${report.agentTraces.selectedConceptCoveragePct}%`);
  lines.push(`- retrieved_packets coverage: ${report.agentTraces.retrievedPacketCoveragePct}%`);
  lines.push(`- tool_calls coverage: ${report.agentTraces.toolCallCoveragePct}%`);
  lines.push(`- route_runtime_packets rows: ${report.routeRuntimePackets.total}`);
  lines.push(`- runtime low-density rows: ${report.routeRuntimePackets.lowDensityCount}`);
  lines.push(`- feature-lineage sourceRef coverage: ${report.featureLineage.sourceRefCoveragePct ?? 'n/a'}%`);
  lines.push(`- feature-lineage featureId coverage: ${report.featureLineage.featureIdCoveragePct ?? 'n/a'}%`);
  lines.push(`- feature-lineage higher-hop gaps: ${report.featureLineage.missingHigherHopRows ?? 'n/a'}`);
  lines.push('');
  lines.push('## Open Traces');
  lines.push('');
  lines.push(`- traces with no selected_concepts: ${report.agentTraces.emptySelectedConcepts}`);
  lines.push(`- traces with no retrieved_packets: ${report.agentTraces.emptyRetrievedPackets}`);
  lines.push(`- traces with no tool_calls: ${report.agentTraces.emptyToolCalls}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- selected_concepts is already persisted in agent_traces, but coverage still matters for planner learning.');
  lines.push('- route_runtime_packets reports structural replay data; this audit is read-only.');
  lines.push('- feature-lineage coverage is loaded from the existing report when available.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const featureLineage = readJson(FEATURE_LINEAGE_JSON) ?? {};
  const runtimePacketDensity = readJson(RUNTIME_PACKET_JSON) ?? {};

  const dbUrl = resolveDatabaseUrl(process.env);
  const agentTraces = {
    total: 0,
    selectedConcepts: 0,
    retrievedPackets: 0,
    toolCalls: 0,
    emptySelectedConcepts: 0,
    emptyRetrievedPackets: 0,
    emptyToolCalls: 0,
    selectedConceptCoveragePct: 0,
    retrievedPacketCoveragePct: 0,
    toolCallCoveragePct: 0,
    topRetrievalStrategies: [],
    outcomeCounts: {},
  };

  if (dbUrl) {
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(selected_concepts), 0) > 0)::int AS selected_concepts,
          COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(retrieved_packets), 0) > 0)::int AS retrieved_packets,
          COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(tool_calls), 0) > 0)::int AS tool_calls,
          COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(selected_concepts), 0) = 0)::int AS empty_selected_concepts,
          COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(retrieved_packets), 0) = 0)::int AS empty_retrieved_packets,
          COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(tool_calls), 0) = 0)::int AS empty_tool_calls
        FROM agent_traces
      `);
      const row = rows[0] ?? {};
      agentTraces.total = Number(row.total ?? 0);
      agentTraces.selectedConcepts = Number(row.selected_concepts ?? 0);
      agentTraces.retrievedPackets = Number(row.retrieved_packets ?? 0);
      agentTraces.toolCalls = Number(row.tool_calls ?? 0);
      agentTraces.emptySelectedConcepts = Number(row.empty_selected_concepts ?? 0);
      agentTraces.emptyRetrievedPackets = Number(row.empty_retrieved_packets ?? 0);
      agentTraces.emptyToolCalls = Number(row.empty_tool_calls ?? 0);
      agentTraces.selectedConceptCoveragePct = pct(agentTraces.selectedConcepts, agentTraces.total);
      agentTraces.retrievedPacketCoveragePct = pct(agentTraces.retrievedPackets, agentTraces.total);
      agentTraces.toolCallCoveragePct = pct(agentTraces.toolCalls, agentTraces.total);

      const strategies = await pool.query(`
        SELECT COALESCE(NULLIF(retrieval_strategy, ''), 'missing') AS retrieval_strategy, COUNT(*)::int AS hits
        FROM agent_traces
        GROUP BY 1
        ORDER BY hits DESC, retrieval_strategy
        LIMIT 12
      `);
      agentTraces.topRetrievalStrategies = strategies.rows;

      const outcomes = await pool.query(`
        SELECT COALESCE(NULLIF(outcome, ''), 'missing') AS outcome, COUNT(*)::int AS hits
        FROM agent_traces
        GROUP BY 1
        ORDER BY hits DESC, outcome
      `);
      agentTraces.outcomeCounts = Object.fromEntries(outcomes.rows.map((row) => [row.outcome, row.hits]));
    } finally {
      await pool.end().catch(() => {});
    }
  }

  const routeRuntimePackets = {
    total: Number(runtimePacketDensity?.summary?.totalAnalyzed ?? runtimePacketDensity?.summary?.total ?? 0),
    lowDensityCount: Number(runtimePacketDensity?.summary?.lowDensityCount ?? runtimePacketDensity?.summary?.low_density ?? 0),
    emptyPointersCount: Number(runtimePacketDensity?.summary?.emptyPointersCount ?? runtimePacketDensity?.summary?.empty_pointers ?? 0),
    avgHydrationRatio: runtimePacketDensity?.summary?.avgHydrationRatio ?? 'n/a',
  };

  const report = {
    generatedAt,
    featureLineage: {
      sourceRefCoveragePct: featureLineage?.summary?.sourceRefCoveragePct ?? null,
      featureIdCoveragePct: featureLineage?.summary?.featureIdCoveragePct ?? null,
      featureLabelCoveragePct: featureLineage?.summary?.featureLabelCoveragePct ?? null,
      missingHigherHopRows: featureLineage?.summary?.missingHigherHopRows ?? null,
    },
    routeRuntimePackets,
    agentTraces,
    recommendations: [
      agentTraces.selectedConceptCoveragePct < 50 ? 'Increase selected_concepts population in agent_traces' : 'selected_concepts coverage is acceptable',
      routeRuntimePackets.lowDensityCount > 0 ? 'Repair runtime packet density / replay hydration' : 'runtime packet density is acceptable',
    ],
  };

  await fsp.mkdir(REPORTS_DIR, { recursive: true });
  await fsp.writeFile(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(MD_OUT, buildMarkdown(report), 'utf8');

  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
