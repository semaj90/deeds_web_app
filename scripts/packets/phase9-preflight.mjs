#!/usr/bin/env node
/**
 * packets:phase9:preflight
 *
 * Verifies all Phase 9 inputs are ready and prints the Colab upload checklist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIR  = path.join(ROOT, "memory", "packets");

const FILES = [
  { file: "lora-training-pairs.jsonl",             label: "High-quality pairs (reward ≥ 0.7)" },
  { file: "lora-training-pairs-contrastive.jsonl", label: "Contrastive pairs (all reward levels, for GRPO)" },
  { file: "nes-chrom-packets.jsonl",               label: "Raw packets (context)" },
  { file: "atlas-glyph-rewards.jsonl",             label: "Reward scores" },
  { file: "synthetic-traces.jsonl",                label: "Synthetic traces" },
];

const NOTEBOOK = path.join(ROOT, "scripts", "packets", "colab-lora-finetune.ipynb");

console.log("\n=== Phase 9: Colab LoRA Preflight ===\n");

let allGood = true;
for (const { file, label } of FILES) {
  const full = path.join(DIR, file);
  const exists = fs.existsSync(full);
  const size   = exists ? fs.statSync(full).size : 0;
  const lines  = exists ? fs.readFileSync(full, "utf8").trim().split("\n").filter(Boolean).length : 0;
  const status = exists && lines > 0 ? "✓" : "✗";
  if (!exists || lines === 0) allGood = false;
  console.log(`  ${status} ${file}`);
  console.log(`    ${label}`);
  console.log(`    ${lines} records, ${(size/1024).toFixed(1)} KB`);
}

console.log(`\n  ${fs.existsSync(NOTEBOOK) ? "✓" : "✗"} colab-lora-finetune.ipynb`);

console.log("\n=== Upload to Colab G4 ===\n");
console.log("  1. Open: https://colab.research.google.com");
console.log("  2. Upload notebook: scripts/packets/colab-lora-finetune.ipynb");
console.log("  3. Upload dataset: memory/packets/lora-training-pairs-contrastive.jsonl");
console.log("  4. Runtime → Change runtime type → GPU → A100/H100/L4 (G4 Blackwell if available)");
console.log("  5. Run all cells");
console.log("\n=== Training config ===\n");
console.log("  base model:  google/gemma-2-2b-it (Colab proxy)");
console.log("  dataset:     99 contrastive pairs (33 correct + 33 wrong_tool + 33 degraded)");
console.log("  method:      GRPO, 7 reward functions");
console.log("  epochs:      3, batch 4, 6 generations/prompt");
console.log("  output:      ./lora-output/adapter (push to Ollama as gemma4-legal-routing)");

if (!allGood) {
  console.log("\n⚠  Some files missing — run: npm run packets:sync && npm run packets:traces:simulate && npm run packets:lora:build:contrastive\n");
  process.exit(1);
}
console.log("\n✓ All inputs ready. Good to go.\n");
