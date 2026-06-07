#!/usr/bin/env node
/**
 * packets:repair (Temporal Packet Immutability — Steps 3-8)
 *
 * Reads all non-superseded packets from route_runtime_packets.
 * For packets with quality issues (bad source_refs, shims feature_id, raw==null),
 * inserts a corrected v2 packet and marks the original superseded_by = new uuid.
 *
 * Packets are NEVER overwritten. The reader resolves "current" via:
 *   WHERE superseded_by IS NULL
 *
 * Quality gates applied:
 *   - source_refs regex: /^(src|scripts|drizzle|docs)\/.+\.(ts|js|mjs|svelte)$/
 *   - source_refs exclusions: .venv, /unknown, node_modules, backup-, shims
 *   - feature_id exclusions: 'shims', 'sveltekit-frontend' (fallbacks, not real features)
 *   - source_ref_quality threshold: < 0.5 triggers repair
 *
 * Git-diff ranking adds git_diff_rank to repaired packets.
 *
 * Usage:
 *   node scripts/packets/repair-packets.mjs [--dry-run] [--force]
 *   --dry-run   Print what would be done, no DB writes
 *   --force     Repair even packets that already have source_ref_quality >= 0.5
 */

import pg from "pg";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");

const DB_URL = process.env.DATABASE_URL ?? "postgresql://legal_admin:legal_password@localhost:5434/legal_ai_db";

// ── Quality gate regex ───────────────────────────────────────────────────────
const VALID_REF_RE = /^(src|scripts|drizzle|docs)\/.+\.(ts|js|mjs|svelte)$/;
const BAD_REF_SEGMENTS = [".venv", "/unknown", "node_modules", "backup-", "shims", ".svelte-kit", "/__pycache__"];
const BAD_FEATURE_IDS  = new Set(["shims", "sveltekit-frontend", "", null, undefined]);

function isValidRef(ref) {
  if (typeof ref !== "string") return false;
  if (BAD_REF_SEGMENTS.some(seg => ref.includes(seg))) return false;
  return VALID_REF_RE.test(ref);
}

function computeSourceRefQuality(sourceRefs) {
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) return 0;
  const valid = sourceRefs.filter(isValidRef).length;
  return valid / sourceRefs.length;
}

// ── Git-diff ranking ─────────────────────────────────────────────────────────
let changedFilesCache = null;
function getChangedFiles() {
  if (changedFilesCache) return changedFilesCache;
  try {
    const out = execSync("git diff --name-only HEAD~1 2>/dev/null || true", {
      cwd: ROOT, encoding: "utf8", timeout: 10_000,
    });
    changedFilesCache = new Set(out.split("\n").map(l => l.trim()).filter(Boolean));
  } catch {
    changedFilesCache = new Set();
  }
  return changedFilesCache;
}

function computeGitDiffRank(sourceRefs) {
  const changed = getChangedFiles();
  if (!sourceRefs?.length) return 0;
  let score = 0;
  for (const ref of sourceRefs) {
    // Normalize to relative path from repo root
    const rel = ref.replace(/^sveltekit-frontend\//, "");
    if (changed.has(rel) || changed.has(`sveltekit-frontend/${rel}`)) {
      score += 1.0;
    }
  }
  return Math.min(score, 5.0); // cap at 5
}

// ── Packet repair logic ──────────────────────────────────────────────────────
function repairPacket(original, gitSha) {
  const rawSourceRefs = Array.isArray(original.source_refs) ? original.source_refs : [];

  // Clean source_refs
  const cleanedRefs = rawSourceRefs.filter(isValidRef);

  // Clean feature_ids — remove shims/sveltekit-frontend
  const rawFeatureIds = Array.isArray(original.feature_ids) ? original.feature_ids : [];
  const cleanedFeatureIds = rawFeatureIds.filter(id => !BAD_FEATURE_IDS.has(id));

  // Determine clean feature_id
  const badFeatureId = BAD_FEATURE_IDS.has(original.feature_id);
  const newFeatureId = badFeatureId ? (cleanedFeatureIds[0] ?? null) : original.feature_id;

  const newQuality = computeSourceRefQuality(cleanedRefs);
  const gitDiffRank = computeGitDiffRank(cleanedRefs);

  // Build repaired raw envelope
  const newRaw = {
    packet_version: 2,
    feature_id: newFeatureId,
    feature_ids: cleanedFeatureIds,
    som_cluster: original.som_cluster,
    source_refs: cleanedRefs,
    lane_ids: Array.isArray(original.lane_ids) ? original.lane_ids : [],
    route: original.route,
    cache_tier: original.cache_tier,
    qdrant_hits: original.qdrant_hits,
    redis_hot_keys: Array.isArray(original.redis_hot_keys) ? original.redis_hot_keys : [],
    latency_ms: original.latency_ms,
    repair_reason: buildRepairReason(original, cleanedRefs, newFeatureId),
  };

  return {
    new_uuid: randomUUID(),
    source_refs: cleanedRefs,
    feature_ids: cleanedFeatureIds,
    feature_id: newFeatureId,
    raw: newRaw,
    packet_version: 2,
    source_ref_quality: newQuality,
    git_diff_rank: gitDiffRank,
    git_sha: gitSha,
    repair_reason: newRaw.repair_reason,
    repair_method: "repair-packets.mjs:v1",
    supersedes_packet_uuid: original.packet_uuid,
  };
}

function buildRepairReason(original, cleanedRefs, newFeatureId) {
  const reasons = [];
  const rawRefs = Array.isArray(original.source_refs) ? original.source_refs : [];
  const removedCount = rawRefs.length - cleanedRefs.length;
  if (removedCount > 0) reasons.push(`removed ${removedCount} invalid source_refs (.venv/unknown/node_modules)`);
  if (BAD_FEATURE_IDS.has(original.feature_id)) {
    reasons.push(`feature_id was '${original.feature_id}', remapped to '${newFeatureId ?? "null"}'`);
  }
  if (!original.raw) reasons.push("raw JSONB was null, backfilled");
  return reasons.join("; ") || "routine quality pass";
}

function needsRepair(row, forceRepair) {
  if (forceRepair) return true;
  // Needs repair if source_ref_quality < 0.5, or feature_id is bad, or raw is null
  if (!row.raw) return true;
  if (BAD_FEATURE_IDS.has(row.feature_id)) return true;
  const quality = typeof row.source_ref_quality === "string"
    ? parseFloat(row.source_ref_quality)
    : (row.source_ref_quality ?? 0);
  if (quality < 0.5) return true;
  // Check if any source_refs are invalid
  const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
  if (refs.some(r => !isValidRef(r))) return true;
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n=== packets:repair (temporal immutability) ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"} | Force: ${FORCE}\n`);

  const pool = new pg.Pool({ connectionString: DB_URL, max: 3 });

  // Get current git SHA
  let gitSha = "unknown";
  try {
    gitSha = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8", timeout: 5000 }).trim();
  } catch {}

  // Read all non-superseded packets
  const { rows: packets } = await pool.query(`
    SELECT id, packet_uuid, packet_version, route, query_hash, query_preview,
           source_refs, feature_ids, feature_id, lane_ids, cluster_id, som_cluster,
           qdrant_hits, redis_hot_keys, latency_ms, cache_hit, cache_tier,
           user_id, session_id, raw, reward, source_ref_quality, git_diff_rank
    FROM route_runtime_packets
    WHERE superseded_by IS NULL
    ORDER BY id ASC
  `);

  console.log(`Found ${packets.length} active (non-superseded) packets.\n`);

  let repairCount = 0;
  let skipCount = 0;

  for (const row of packets) {
    if (!needsRepair(row, FORCE)) {
      skipCount++;
      continue;
    }

    const repaired = repairPacket(row, gitSha);

    console.log(`[REPAIR] packet_uuid=${row.packet_uuid}`);
    console.log(`  reason: ${repaired.repair_reason}`);
    console.log(`  feature_id: '${row.feature_id}' → '${repaired.feature_id}'`);
    console.log(`  source_refs: ${(row.source_refs ?? []).length} → ${repaired.source_refs.length}`);
    console.log(`  quality: ${(parseFloat(row.source_ref_quality) || 0).toFixed(2)} → ${repaired.source_ref_quality.toFixed(2)}`);
    console.log(`  git_diff_rank: ${repaired.git_diff_rank}`);
    console.log(`  new_uuid: ${repaired.new_uuid}`);
    console.log("");

    if (!DRY_RUN) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Insert repaired v2 packet (copy all fields from original, apply overrides)
        await client.query(`
          INSERT INTO route_runtime_packets (
            route, query_hash, query_preview, source_refs, feature_ids, lane_ids,
            cluster_id, som_cluster, qdrant_hits, redis_hot_keys, latency_ms,
            cache_hit, cache_tier, user_id, session_id, raw, reward,
            packet_uuid, packet_version, supersedes_packet_uuid,
            git_sha, git_diff_rank, source_ref_quality, repair_reason, repair_method
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
            $18,$19,$20,$21,$22,$23,$24,$25
          )
        `, [
          row.route,
          row.query_hash,
          row.query_preview,
          JSON.stringify(repaired.source_refs),
          JSON.stringify(repaired.feature_ids),
          JSON.stringify(Array.isArray(row.lane_ids) ? row.lane_ids : []),
          row.cluster_id,
          row.som_cluster,
          row.qdrant_hits,
          JSON.stringify(Array.isArray(row.redis_hot_keys) ? row.redis_hot_keys : []),
          row.latency_ms,
          row.cache_hit,
          row.cache_tier,
          row.user_id,
          row.session_id,
          JSON.stringify(repaired.raw),
          row.reward,
          repaired.new_uuid,
          2,
          row.packet_uuid,
          repaired.git_sha,
          repaired.git_diff_rank,
          repaired.source_ref_quality,
          repaired.repair_reason,
          repaired.repair_method,
        ]);

        // Mark original as superseded
        await client.query(`
          UPDATE route_runtime_packets
          SET superseded_by = $1
          WHERE packet_uuid = $2
        `, [repaired.new_uuid, row.packet_uuid]);

        await client.query("COMMIT");
        repairCount++;
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`  ERROR: ${e.message}`);
      } finally {
        client.release();
      }
    } else {
      repairCount++;
    }
  }

  // Summary
  console.log("─────────────────────────────────────────────────");
  console.log(`Total active packets: ${packets.length}`);
  console.log(`Repaired:             ${repairCount}${DRY_RUN ? " (dry run — not written)" : ""}`);
  console.log(`Skipped (clean):      ${skipCount}`);

  if (!DRY_RUN && repairCount > 0) {
    // Verify
    const { rows: [{ active, superseded }] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE superseded_by IS NULL) AS active,
        COUNT(*) FILTER (WHERE superseded_by IS NOT NULL) AS superseded
      FROM route_runtime_packets
    `);
    console.log(`\nDB state: ${active} active, ${superseded} superseded`);
    console.log("\nNext: npm run packets:export && npm run packets:supervision:refresh");
  }

  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
