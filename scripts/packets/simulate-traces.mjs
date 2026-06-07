#!/usr/bin/env node
/**
 * packets:traces:simulate (Phase 6)
 *
 * Reads nes-chrom-packets.jsonl and generates synthetic traces for LoRA bootstrap.
 * For each packet, emits 3 trace variants:
 *   correct   — actual feature_id + best tool, reward=0.9
 *   wrong_tool — plausible wrong tool, reward=0.1
 *   degraded  — missing context, reward=0.3
 *
 * Output: memory/packets/synthetic-traces.jsonl
 *
 * Usage:
 *   node scripts/packets/simulate-traces.mjs [--dry-run] [--limit=<n>]
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const ARGS    = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const LIMIT   = Number(ARGS.find(a => a.startsWith("--limit="))?.slice(8) ?? "0") || Infinity;

const PACKETS_FILE = path.join(ROOT, "memory", "packets", "nes-chrom-packets.jsonl");
const TRACES_OUT   = path.join(ROOT, "memory", "packets", "synthetic-traces.jsonl");

// Tool pool — realistic tools present in the system
const TOOLS = [
  "trace.kag_search",
  "trace.qdrant_search",
  "trace.neo4j_query",
  "trace.redis_get",
  "trace.postgres_query",
  "trace.file_read",
  "trace.context_assemble",
  "trace.embed",
  "mcp.unified_ast_query",
  "mcp.agentic_recommendation",
  "mcp.system_health_check",
  "ace.route_packet",
  "ace.feature_lookup",
];

// Pick the "correct" tool based on route/feature heuristics
function pickCorrectTool(packet) {
  const route = (packet.route ?? "").toLowerCase();
  const feat  = (packet.feature_id ?? "").toLowerCase();
  if (route.includes("search") || feat.includes("search")) return "trace.qdrant_search";
  if (route.includes("ace") || feat.includes("ace"))       return "trace.kag_search";
  if (route.includes("graph") || feat.includes("graph"))   return "trace.neo4j_query";
  if (route.includes("embed"))                             return "trace.embed";
  if (feat.includes("context"))                            return "trace.context_assemble";
  if (packet.cache_hit)                                    return "trace.redis_get";
  return "trace.kag_search"; // default
}

function pickWrongTool(correctTool) {
  const wrong = TOOLS.filter(t => t !== correctTool);
  return wrong[Math.floor(Math.random() * wrong.length)];
}

async function run() {
  console.log(`\n=== packets:traces:simulate${DRY_RUN ? " [DRY-RUN]" : ""} ===`);

  if (!fs.existsSync(PACKETS_FILE)) {
    throw new Error(`Missing: ${PACKETS_FILE} — run packets:export first`);
  }

  const out = DRY_RUN ? null : fs.createWriteStream(TRACES_OUT);
  let packetCount = 0;
  let traceCount  = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(PACKETS_FILE), crlfDelay: Infinity });

  for await (const line of rl) {
    if (packetCount >= LIMIT) break;
    const t = line.trim();
    if (!t) continue;
    let p;
    try { p = JSON.parse(t); } catch { continue; }

    const packetUuid = p.packet_uuid ?? p.packet_id ?? p.id ?? randomUUID();
    const featureId  = p.feature_id ?? null;
    const queryHash  = p.query_hash ?? randomUUID().slice(0, 16);
    const correctTool = pickCorrectTool(p);
    const wrongTool   = pickWrongTool(correctTool);
    packetCount++;

    const traces = [
      {
        trace_id:           randomUUID(),
        query_hash:         queryHash,
        feature_id:         featureId,
        tool_selected:      correctTool,
        tool_correct:       true,
        reward:             0.9,
        context_packet_uuid: packetUuid,
        trace_type:         "correct",
        som_cluster:        p.som_cluster ?? null,
        route:              p.route ?? null,
        source_ref_count:   Array.isArray(p.source_refs) ? p.source_refs.length : 0,
        created_at:         new Date().toISOString(),
      },
      {
        trace_id:           randomUUID(),
        query_hash:         queryHash,
        feature_id:         featureId,
        tool_selected:      wrongTool,
        tool_correct:       false,
        reward:             0.1,
        context_packet_uuid: packetUuid,
        trace_type:         "wrong_tool",
        som_cluster:        p.som_cluster ?? null,
        route:              p.route ?? null,
        source_ref_count:   Array.isArray(p.source_refs) ? p.source_refs.length : 0,
        created_at:         new Date().toISOString(),
      },
      {
        trace_id:           randomUUID(),
        query_hash:         queryHash,
        feature_id:         featureId,
        tool_selected:      correctTool,
        tool_correct:       true,
        reward:             0.3,
        context_packet_uuid: packetUuid,
        trace_type:         "degraded",
        som_cluster:        null, // missing context
        route:              null,
        source_ref_count:   0,
        created_at:         new Date().toISOString(),
      },
    ];

    for (const trace of traces) {
      if (out) out.write(JSON.stringify(trace) + "\n");
      traceCount++;
    }
  }

  if (out) await new Promise(r => out.end(r));

  console.log(`  packets processed: ${packetCount}`);
  console.log(`  traces emitted:    ${traceCount} (3 per packet)`);
  if (!DRY_RUN) console.log(`  → ${TRACES_OUT}`);
  console.log("Done.\n");
}

run().catch(e => { console.error(e.message); process.exit(1); });
