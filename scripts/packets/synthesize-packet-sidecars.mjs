#!/usr/bin/env node
/**
 * packets:synthesize
 *
 * Reads memory/packets/nes-chrom-packets.jsonl and synthesizes the three sidecar files
 * from raw packet fields (no Gemma4 or CUDA required).
 *
 * Output (overwrites):
 *   memory/packets/atlas-graph-edges.jsonl
 *   memory/packets/atlas-packet-facts.jsonl
 *   memory/packets/atlas-state-snapshots.jsonl
 *
 * Edge types emitted:
 *   USES_SOURCE_REF  packet:<uuid> → source_ref:<path>
 *   SUPPORTS_FEATURE source_ref:<path> → feature:<id>
 *   HAS_FEATURE      packet:<uuid> → feature:<id>
 *   IN_CLUSTER       packet:<uuid> → cluster:<som>
 *   USED_ROUTE       packet:<uuid> → route:<route>
 *
 * When Gemma4/CUDA fills route_packet_edges directly, re-run packets:export and skip this
 * synthesizer — the loaders remain unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, "memory", "packets");

const PACKETS = path.join(DIR, "nes-chrom-packets.jsonl");
const EDGES   = path.join(DIR, "atlas-graph-edges.jsonl");
const FACTS   = path.join(DIR, "atlas-packet-facts.jsonl");
const STATES  = path.join(DIR, "atlas-state-snapshots.jsonl");

if (!fs.existsSync(PACKETS)) {
  console.error(`Missing: ${PACKETS} — run packets:export first`);
  process.exit(1);
}

function node(type, value) {
  return `${type}:${String(value ?? "unknown")}`;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function write(stream, row) {
  stream.write(JSON.stringify(row) + "\n");
}

const edgeOut  = fs.createWriteStream(EDGES);
const factOut  = fs.createWriteStream(FACTS);
const stateOut = fs.createWriteStream(STATES);

let packets = 0, edges = 0, facts = 0, states = 0;

const rl = readline.createInterface({ input: fs.createReadStream(PACKETS), crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  let p;
  try { p = JSON.parse(line); } catch { continue; }

  const packetUuid = p.packet_uuid ?? p.packet_id ?? p.id ?? p.uuid;
  const featureId  = p.feature_id ?? arr(p.feature_ids)[0] ?? null;
  const somCluster = p.som_cluster ?? p.cluster_id ?? null;
  const route      = p.route ?? p.route_state ?? "unknown";
  const sourceRefs = arr(p.source_refs);
  packets++;

  // source_ref edges + facts
  for (const sourceRef of sourceRefs) {
    write(edgeOut, {
      packet_uuid: packetUuid,
      src: node("packet", packetUuid),
      dst: node("source_ref", sourceRef),
      edge_type: "USES_SOURCE_REF",
      weight: 1,
      metadata: { source_ref: sourceRef },
    });
    edges++;

    if (featureId) {
      write(edgeOut, {
        packet_uuid: packetUuid,
        src: node("source_ref", sourceRef),
        dst: node("feature", featureId),
        edge_type: "SUPPORTS_FEATURE",
        weight: 1,
        metadata: { source_ref: sourceRef, feature_id: featureId },
      });
      edges++;
    }

    write(factOut, {
      packet_uuid: packetUuid,
      fact_type: "source_ref",
      fact_key: "source_ref",
      fact_value: sourceRef,
      score: 1,
      metadata: {},
    });
    facts++;
  }

  // feature edges + facts
  if (featureId) {
    write(edgeOut, {
      packet_uuid: packetUuid,
      src: node("packet", packetUuid),
      dst: node("feature", featureId),
      edge_type: "HAS_FEATURE",
      weight: 1,
      metadata: { feature_id: featureId },
    });
    edges++;

    write(factOut, {
      packet_uuid: packetUuid,
      fact_type: "feature",
      fact_key: "feature_id",
      fact_value: featureId,
      score: 1,
      metadata: {},
    });
    facts++;
  }

  // cluster edge
  if (somCluster) {
    write(edgeOut, {
      packet_uuid: packetUuid,
      src: node("packet", packetUuid),
      dst: node("cluster", somCluster),
      edge_type: "IN_CLUSTER",
      weight: 1,
      metadata: { som_cluster: somCluster },
    });
    edges++;
  }

  // route edge
  write(edgeOut, {
    packet_uuid: packetUuid,
    src: node("packet", packetUuid),
    dst: node("route", route),
    edge_type: "USED_ROUTE",
    weight: 1,
    metadata: { route },
  });
  edges++;

  // state snapshot
  write(stateOut, {
    packet_uuid: packetUuid,
    state_key: `${route}:${featureId ?? "unknown"}`,
    compressed_state: {
      route,
      feature_id: featureId,
      som_cluster: somCluster,
      source_ref_count: sourceRefs.length,
      reward: p.reward ?? null,
    },
    token_map: {
      feature_hint: featureId
        ? `<${String(featureId).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}>`
        : null,
    },
  });
  states++;
}

await Promise.all([
  new Promise(r => edgeOut.end(r)),
  new Promise(r => factOut.end(r)),
  new Promise(r => stateOut.end(r)),
]);

console.log(`packets:synthesize complete`);
console.log(`  packets: ${packets}`);
console.log(`  edges:   ${edges}  → ${path.basename(EDGES)}`);
console.log(`  facts:   ${facts}  → ${path.basename(FACTS)}`);
console.log(`  states:  ${states} → ${path.basename(STATES)}`);
