#!/usr/bin/env node
/**
 * packets:lora:validate (Phase 9A)
 *
 * Gate check before Colab upload. Validates lora-training-pairs.jsonl against
 * the minimum bar required for adapter training to be meaningful.
 *
 * Checks:
 *   1. File parses line-by-line (no corrupt JSONL)
 *   2. >= 30 pairs present
 *   3. All pairs have reward >= 0.7
 *   4. instruction + input + output all non-empty
 *   5. No duplicate instruction+output pairs
 *   6. output contains grounded source_ref behavior (Tool: + Reason: lines)
 *   7. trace_id and packet_uuid linkable (present in metadata)
 *   8. Contrastive file exists with correct type distribution (9B input)
 *
 * Exit 0 = pass, Exit 1 = fail.
 *
 * Usage:
 *   node scripts/packets/validate-lora-pairs.mjs [--strict]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIR  = path.join(ROOT, "memory", "packets");

const STRICT = process.argv.includes("--strict");

const PAIRS_FILE        = path.join(DIR, "lora-training-pairs.jsonl");
const CONTRASTIVE_FILE  = path.join(DIR, "lora-training-pairs-contrastive.jsonl");
const PACKETS_FILE      = path.join(DIR, "nes-chrom-packets.jsonl");
const TRACES_FILE       = path.join(DIR, "synthetic-traces.jsonl");

function loadJsonl(file) {
  if (!fs.existsSync(file)) return { rows: [], errors: [`Missing: ${path.basename(file)}`] };
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  const rows = [];
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      rows.push(JSON.parse(lines[i]));
    } catch (e) {
      errors.push(`Line ${i + 1}: parse error — ${e.message}`);
    }
  }
  return { rows, errors };
}

function check(name, pass, detail = "") {
  const icon = pass ? "✓" : "✗";
  const msg  = detail ? `${name}: ${detail}` : name;
  console.log(`  ${icon} ${msg}`);
  return pass;
}

async function run() {
  console.log("\n=== packets:lora:validate (Phase 9A) ===\n");
  let failures = 0;

  // ── Check 1: file parses ──────────────────────────────────────────
  const { rows: pairs, errors: parseErrors } = loadJsonl(PAIRS_FILE);
  const c1 = check("JSONL parses cleanly", parseErrors.length === 0,
    parseErrors.length ? `${parseErrors.length} errors: ${parseErrors[0]}` : `${pairs.length} lines`);
  if (!c1) { parseErrors.forEach(e => console.log(`      ${e}`)); failures++; }

  // ── Check 2: minimum pair count ──────────────────────────────────
  const MIN_PAIRS = 30;
  const c2 = check(`≥ ${MIN_PAIRS} pairs present`, pairs.length >= MIN_PAIRS,
    `${pairs.length} pairs found`);
  if (!c2) failures++;

  // ── Check 3: reward gate ─────────────────────────────────────────
  const lowReward = pairs.filter(p => (p.metadata?.reward ?? 0) < 0.7);
  const c3 = check("All pairs have reward ≥ 0.7", lowReward.length === 0,
    lowReward.length ? `${lowReward.length} below threshold` : "all pass");
  if (!c3) { lowReward.slice(0, 3).forEach(p => console.log(`      reward=${p.metadata?.reward} trace_id=${p.metadata?.trace_id}`)); failures++; }

  // ── Check 4: fields non-empty ────────────────────────────────────
  const missing = pairs.filter(p => !p.instruction?.trim() || !p.input?.trim() || !p.output?.trim());
  const c4 = check("instruction/input/output all non-empty", missing.length === 0,
    missing.length ? `${missing.length} pairs missing fields` : "all present");
  if (!c4) failures++;

  // ── Check 5: no duplicates ───────────────────────────────────────
  const keys = pairs.map(p => `${p.instruction}|||${p.output}`);
  const dupes = keys.length - new Set(keys).size;
  const c5 = check("No duplicate instruction+output pairs", dupes === 0,
    dupes ? `${dupes} duplicates found` : "all unique");
  if (!c5) failures++;

  // ── Check 6: output has Tool: + Reason: ──────────────────────────
  const badOutput = pairs.filter(p => !p.output.includes("Tool:") || !p.output.includes("Reason:"));
  const c6 = check("output contains Tool: + Reason: lines", badOutput.length === 0,
    badOutput.length ? `${badOutput.length} pairs missing structure` : "all structured");
  if (!c6) failures++;

  // ── Check 7: trace_id + packet_uuid present ───────────────────────
  const noMeta = pairs.filter(p => !p.metadata?.trace_id || !p.metadata?.packet_uuid);
  const c7 = check("trace_id + packet_uuid in metadata", noMeta.length === 0,
    noMeta.length ? `${noMeta.length} pairs missing linkage` : "all linkable");
  if (!c7) failures++;

  // ── Check 8: contrastive file has all 3 types ────────────────────
  const { rows: contrastive } = loadJsonl(CONTRASTIVE_FILE);
  const byType = contrastive.reduce((m, p) => {
    const t = p.metadata?.trace_type ?? "unknown";
    m[t] = (m[t] ?? 0) + 1;
    return m;
  }, {});
  const hasAllTypes = ["correct", "wrong_tool", "degraded"].every(t => (byType[t] ?? 0) > 0);
  const c8 = check("Contrastive file has correct/wrong_tool/degraded", hasAllTypes,
    JSON.stringify(byType));
  if (!c8) failures++;

  // ── Strict: check packet linkage back to source ───────────────────
  if (STRICT) {
    const { rows: packets } = loadJsonl(PACKETS_FILE);
    const { rows: traces }  = loadJsonl(TRACES_FILE);
    const packetUuids = new Set(packets.map(p => p.packet_uuid ?? p.packet_id ?? p.id));
    const traceIds    = new Set(traces.map(t => t.trace_id));

    const unlinkedPackets = pairs.filter(p => !packetUuids.has(p.metadata?.packet_uuid));
    const cs1 = check("[strict] packet_uuid links to source packet", unlinkedPackets.length === 0,
      unlinkedPackets.length ? `${unlinkedPackets.length} unresolvable` : "all resolve");
    if (!cs1) failures++;

    const unlinkedTraces = pairs.filter(p => !traceIds.has(p.metadata?.trace_id));
    const cs2 = check("[strict] trace_id links to synthetic trace", unlinkedTraces.length === 0,
      unlinkedTraces.length ? `${unlinkedTraces.length} unresolvable` : "all resolve");
    if (!cs2) failures++;
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log("");
  if (failures === 0) {
    console.log("  PASS — training pairs ready for Colab upload\n");
    console.log("  Next: npm run packets:phase9:preflight");
    console.log("        Upload memory/packets/lora-training-pairs-contrastive.jsonl to Colab G4\n");
  } else {
    console.log(`  FAIL — ${failures} check(s) failed`);
    console.log("  Fix: npm run packets:sync && npm run packets:traces:simulate && npm run packets:lora:build:contrastive\n");
    process.exit(1);
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
