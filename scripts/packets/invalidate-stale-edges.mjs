#!/usr/bin/env node
/**
 * packets:invalidate (Phase 5)
 *
 * Reads changed files from git diff HEAD~1 (or --since=<sha>), marks all
 * CALLS/USES_DB/USES_TOOL edges where src starts with that path as invalidated,
 * and appends INVALIDATED_BY edges to atlas-graph-edges.jsonl.
 *
 * Also writes invalidation records to Postgres route_packet_edges if reachable.
 *
 * Usage:
 *   node scripts/packets/invalidate-stale-edges.mjs [--dry-run] [--since=<sha>]
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const SINCE   = ARGS.find(a => a.startsWith("--since="))?.slice(8) ?? "HEAD~1";

const EDGES_FILE    = path.join(ROOT, "memory", "packets", "atlas-graph-edges.jsonl");
const AST_EDGES_DIR = path.join(ROOT, "scripts", "atlas", "out");

function git(args) {
  const res = spawnSync("git", args, { encoding: "utf8", cwd: ROOT });
  if (res.error) throw res.error;
  return (res.stdout || "").trim();
}

async function readJsonlSrc(file) {
  if (!fs.existsSync(file)) return [];
  const srcs = new Set();
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t);
      if (r.src) srcs.add(r.src);
    } catch {}
  }
  return [...srcs];
}

async function run() {
  console.log(`\n=== packets:invalidate${DRY_RUN ? " [DRY-RUN]" : ""} ===`);

  // Get changed files from git
  const commitSha = git(["rev-parse", SINCE === "HEAD~1" ? "HEAD" : SINCE]).slice(0, 12);
  const diffOut   = git(["diff", "--name-only", SINCE]);
  const changed   = diffOut.split("\n").filter(Boolean).map(f => f.replace(/\\/g, "/"));
  console.log(`  commit: ${commitSha}`);
  console.log(`  changed files: ${changed.length}`);
  if (changed.length === 0) { console.log("  Nothing changed. Done.\n"); return; }

  // Load file-path srcs from AST-derived edge files (not the synthesized packet graph)
  const astFiles = ["db-usage-edges.ndjson", "tool-usage-edges.ndjson", "calls-edges-2026-05-29.ndjson"]
    .map(f => path.join(AST_EDGES_DIR, f))
    .filter(fs.existsSync);

  // Collect file-path srcs: source_file fields from raw AST extracts
  const fileSrcs = new Set();
  for (const file of astFiles) {
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      const t = line.trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t);
        if (r.source_file) fileSrcs.add(r.source_file.replace(/\\/g, "/"));
      } catch {}
    }
  }

  const NOW = new Date().toISOString();
  const invalidated = [];

  for (const changedPath of changed) {
    // Match AST edge source files that overlap with changed paths
    const matchingSrcs = [...fileSrcs].filter(src =>
      src.includes(changedPath) ||
      src.replace(/^.*sveltekit-frontend\//, "sveltekit-frontend/") === changedPath
    );
    for (const src of matchingSrcs) {
      invalidated.push({
        id: randomUUID(),
        packet_uuid: null,
        src,
        dst: `commit:${commitSha}`,
        edge_type: "INVALIDATED_BY",
        weight: 1,
        metadata: { changed_file: changedPath, commit_sha: commitSha, invalidated_at: NOW },
        feature_id: null,
        som_cluster: null,
        created_at: NOW,
      });
    }
  }

  console.log(`  invalidated edges: ${invalidated.length}`);

  if (invalidated.length === 0) {
    console.log("  No edge srcs match changed paths. Done.\n");
    return;
  }

  if (DRY_RUN) {
    console.log("  (dry-run) sample:");
    for (const e of invalidated.slice(0, 5)) {
      console.log(`    ${e.src} → ${e.dst}`);
    }
    console.log("Done.\n");
    return;
  }

  // Append INVALIDATED_BY edges to atlas-graph-edges.jsonl
  const lines = invalidated.map(e => JSON.stringify(e)).join("\n") + "\n";
  fs.appendFileSync(EDGES_FILE, lines, "utf8");
  console.log(`  Appended ${invalidated.length} INVALIDATED_BY edges`);

  // Optional Neo4j: mark edges as stale
  try {
    const neo4j = await import("neo4j-driver");
    const driver = neo4j.default.driver(
      process.env.NEO4J_URI ?? "bolt://localhost:7687",
      neo4j.default.auth.basic(
        process.env.NEO4J_USER ?? "neo4j",
        process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? "password"
      )
    );
    const session = driver.session();
    try {
      const BATCH = 500;
      for (let i = 0; i < invalidated.length; i += BATCH) {
        const chunk = invalidated.slice(i, i + BATCH).map(e => ({
          src: e.src, commitSha, invalidatedAt: NOW,
        }));
        await session.run(`
          UNWIND $rows AS row
          MATCH (a:PacketNode {id: row.src})-[r:PACKET_EDGE]->()
          SET r.invalidated_by = row.commitSha,
              r.invalidated_at = row.invalidatedAt
        `, { rows: chunk });
      }
      console.log("  Neo4j: edges marked invalidated_by=" + commitSha);
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (e) {
    console.warn(`  Neo4j skipped: ${e.message}`);
  }

  console.log("Done.\n");
}

run().catch(e => { console.error(e.message); process.exit(1); });
