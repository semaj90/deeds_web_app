#!/usr/bin/env node
/**
 * packets:lora:build (Phase 8)
 *
 * Joins nes-chrom-packets.jsonl + synthetic-traces.jsonl + atlas-glyph-rewards.jsonl
 * to produce LoRA training pairs (instruction/input/output format).
 *
 * Filter: reward >= 0.7 (high-quality positives only, unless --all)
 *
 * Output: memory/packets/lora-training-pairs.jsonl
 *
 * Usage:
 *   node scripts/packets/build-lora-pairs.mjs [--dry-run] [--all] [--min-reward=<n>]
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIR  = path.join(ROOT, "memory", "packets");

const ARGS        = process.argv.slice(2);
const DRY_RUN     = ARGS.includes("--dry-run");
const ALL         = ARGS.includes("--all");
const CONTRASTIVE = ARGS.includes("--contrastive");
const MIN_REWARD  = Number(ARGS.find(a => a.startsWith("--min-reward="))?.slice(13) ?? (ALL || CONTRASTIVE ? "0" : "0.7"));

const PACKETS_FILE = path.join(DIR, "nes-chrom-packets.jsonl");
const TRACES_FILE  = path.join(DIR, "synthetic-traces.jsonl");
const REWARDS_FILE = path.join(DIR, "atlas-glyph-rewards.jsonl");
const PAIRS_OUT        = path.join(DIR, "lora-training-pairs.jsonl");
const PAIRS_CONTRASTIVE = path.join(DIR, "lora-training-pairs-contrastive.jsonl");

async function loadJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch {}
  }
  return rows;
}

function buildInstruction(packet, trace) {
  const route      = packet.route ?? trace.route ?? "unknown";
  const refs       = Array.isArray(packet.source_refs) ? packet.source_refs : [];
  const queryHint  = packet.query_hash ? `query_hash=${packet.query_hash}` : "unknown query";
  return `Route this query to the correct tool.\nRoute: ${route}\n${queryHint}\nSource refs: ${refs.length > 0 ? refs.slice(0, 3).join(", ") : "none"}`;
}

function buildInput(packet, trace) {
  const parts = [];
  if (packet.som_cluster) parts.push(`som_cluster=${packet.som_cluster}`);
  if (packet.cache_hit !== undefined) parts.push(`cache_hit=${packet.cache_hit}`);
  if (packet.latency_ms !== undefined) parts.push(`latency_ms=${packet.latency_ms}`);
  if (packet.reward !== undefined && packet.reward !== null) parts.push(`reward=${packet.reward}`);
  return parts.length > 0 ? `Context: ${parts.join(", ")}` : "Context: none";
}

function buildOutput(packet, trace) {
  const featureId  = trace.feature_id ?? packet.feature_id ?? "unknown";
  const somCluster = trace.som_cluster ?? packet.som_cluster ?? "unknown";
  const reason     = featureId !== "unknown"
    ? `feature_id=${featureId}, som_cluster=${somCluster}`
    : `route=${packet.route ?? "unknown"}`;
  return `Tool: ${trace.tool_selected}\nReason: ${reason}\nReward: ${trace.reward}`;
}

async function run() {
  console.log(`\n=== packets:lora:build${DRY_RUN ? " [DRY-RUN]" : ""} ===`);
  console.log(`  min_reward: ${MIN_REWARD}`);

  const [packets, traces, rewards] = await Promise.all([
    loadJsonl(PACKETS_FILE),
    loadJsonl(TRACES_FILE),
    loadJsonl(REWARDS_FILE),
  ]);

  console.log(`  packets: ${packets.length}, traces: ${traces.length}, rewards: ${rewards.length}`);

  // Index packets by uuid for O(1) join
  const packetByUuid = new Map();
  for (const p of packets) {
    const uuid = p.packet_uuid ?? p.packet_id ?? p.id;
    if (uuid) packetByUuid.set(uuid, p);
  }

  // Index rewards by uuid
  const rewardByUuid = new Map();
  for (const r of rewards) {
    if (r.packet_uuid) rewardByUuid.set(r.packet_uuid, r.reward);
  }

  const outPath = CONTRASTIVE ? PAIRS_CONTRASTIVE : PAIRS_OUT;
  const out = DRY_RUN ? null : fs.createWriteStream(outPath);
  let total = 0;
  let filtered = 0;

  for (const trace of traces) {
    const packet = packetByUuid.get(trace.context_packet_uuid);

    // Use trace reward directly — packet reward is context signal, not a gate.
    // wrong_tool (0.1) and degraded (0.3) are valid negative examples below any threshold.
    const effectiveReward = trace.reward;

    if (effectiveReward < MIN_REWARD) { filtered++; continue; }

    const pair = {
      instruction: buildInstruction(packet ?? {}, trace),
      input:       buildInput(packet ?? {}, trace),
      output:      buildOutput(packet ?? {}, trace),
      metadata: {
        trace_id:      trace.trace_id,
        trace_type:    trace.trace_type,
        query_hash:    trace.query_hash,
        feature_id:    trace.feature_id,
        reward:        effectiveReward,
        packet_reward: rewardByUuid.get(trace.context_packet_uuid) ?? null,
        packet_uuid:   trace.context_packet_uuid,
      },
    };

    if (out) out.write(JSON.stringify(pair) + "\n");
    total++;
  }

  if (out) await new Promise(r => out.end(r));

  console.log(`  pairs emitted: ${total} (filtered low-reward: ${filtered})`);
  if (!DRY_RUN) console.log(`  → ${outPath}`);

  if (DRY_RUN && total > 0) {
    // Print one sample
    const sample = traces.find(t => {
      const r = rewardByUuid.get(t.context_packet_uuid) ?? t.reward;
      return r >= MIN_REWARD;
    });
    if (sample) {
      const p = packetByUuid.get(sample.context_packet_uuid) ?? {};
      console.log("\n  Sample pair:");
      console.log("  instruction:", buildInstruction(p, sample));
      console.log("  input:      ", buildInput(p, sample));
      console.log("  output:     ", buildOutput(p, sample));
    }
  }

  console.log("Done.\n");
}

run().catch(e => { console.error(e.message); process.exit(1); });
