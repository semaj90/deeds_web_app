#!/usr/bin/env npx tsx
/**
 * Quick cluster export for Colab: group by feature_id
 * Output: clusters.jsonl ready for Gemma-4-E4B summarization
 */

import fs from "fs/promises";
import path from "path";
import { db } from "../../src/lib/server/db/client.js";
import { sql } from "drizzle-orm";

const EXPORT_DIR = path.join(process.cwd(), ".tmp/colab-clusters");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Quick Cluster Export for Colab (Gemma-4-E4B)                ║
╚════════════════════════════════════════════════════════════════╝

Export Dir: ${EXPORT_DIR}
Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
`);

  // Group by feature_id (top 100 clusters by packet count)
  console.log("📦 Grouping packets by feature_id...");

  const result = await db.execute(sql`
    SELECT
      feature_id,
      COUNT(*) as count,
      ARRAY_AGG(packet_key) as packet_keys,
      ARRAY_AGG(DISTINCT feature_label) as labels
    FROM atlas_packets
    WHERE feature_id IS NOT NULL
    GROUP BY feature_id
    ORDER BY count DESC
    LIMIT 100
  `) as any;

  const groups = result.rows || [];
  console.log(`✓ Found ${groups.length} feature clusters\n`);

  // Build export format
  const clusters = groups.map((g: any, idx: number) => ({
    cluster_id: `feature:${idx}:${g.feature_id}`,
    feature_id: g.feature_id,
    feature_label: g.labels?.[0] || g.feature_id,
    packet_count: g.count,
    packet_keys: (g.packet_keys || []).slice(0, 20), // Sample 20
    sample_packets: (g.packet_keys || []).slice(0, 5), // Show 5 in sample
  }));

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would export:`);
    console.log(`  - ${clusters.length} feature clusters`);
    console.log(`  - Total packets: ${clusters.reduce((sum: number, c: any) => sum + c.packet_count, 0)}`);
    console.log(`\nSample clusters:`);
    for (let i = 0; i < Math.min(3, clusters.length); i++) {
      console.log(`  [${i}] ${clusters[i].feature_id} (${clusters[i].packet_count} packets)`);
    }
    return;
  }

  // Write export
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  console.log(`✓ Created ${EXPORT_DIR}`);

  // Write clusters.jsonl
  const jsonlPath = path.join(EXPORT_DIR, "clusters.jsonl");
  const jsonlContent = clusters.map((c: any) => JSON.stringify(c)).join("\n");
  await fs.writeFile(jsonlPath, jsonlContent);
  console.log(`✓ Wrote ${jsonlPath} (${clusters.length} clusters, ${clusters.reduce((s: number, c: any) => s + c.packet_count, 0)} packets)`);

  // Write Python script for Colab
  const scriptPath = path.join(EXPORT_DIR, "colab-summarize.py");
  const script = `#!/usr/bin/env python3
"""
Gemma-4-E4B Batch Summarization for Colab
Summarizes feature clusters and generates packet summaries
"""
import json
from pathlib import Path
from tqdm import tqdm
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

# ============================================================================
# Load Gemma-4-E4B with 4-bit quantization
# ============================================================================

print("Loading Gemma-4-E4B-it with 4-bit quantization...")

model_id = "google/gemma-4-E4B-it"

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4"
)

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config,
    device_map="auto",
    torch_dtype=torch.float16,
    attn_implementation="flash_attention_2"
)
tokenizer = AutoTokenizer.from_pretrained(model_id)

print(f"✓ Model loaded")
print(f"  Params: {sum(p.numel() for p in model.parameters()) / 1e9:.2f}B (quantized)")

# ============================================================================
# Batch Summarize Clusters
# ============================================================================

CLUSTERS_FILE = "clusters.jsonl"
OUTPUT_FILE = "summaries-gemma4-e4b.jsonl"

results = []
errors = []

print(f"\\nProcessing clusters from {CLUSTERS_FILE}...")

with open(CLUSTERS_FILE) as f:
    clusters = [json.loads(line) for line in f if line.strip()]

print(f"Processing {len(clusters)} clusters...\\n")

for i, cluster in enumerate(tqdm(clusters, desc="Clusters")):
    try:
        cluster_id = cluster["cluster_id"]
        feature_id = cluster["feature_id"]
        feature_label = cluster.get("feature_label", feature_id)
        packet_count = cluster["packet_count"]

        # Build summary prompt
        prompt = f"""Summarize this code feature cluster in 2-3 sentences:

Feature ID: {feature_id}
Feature Label: {feature_label}
Packet Count: {packet_count}

Summary:"""

        # Generate
        messages = [{"role": "user", "content": prompt}]
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        inputs = tokenizer.encode(text, return_tensors="pt").to("cuda")

        with torch.no_grad():
            outputs = model.generate(
                inputs,
                max_new_tokens=200,
                temperature=0.3,
                top_p=0.95,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )

        summary_full = tokenizer.decode(outputs[0], skip_special_tokens=True)
        summary = summary_full.split("Summary:")[-1].strip()

        results.append({
            "cluster_id": cluster_id,
            "feature_id": feature_id,
            "feature_label": feature_label,
            "summary": summary[:400],
            "model": "gemma-4-E4B-it",
            "timestamp": __import__("datetime").datetime.now().isoformat()
        })

        if (i + 1) % 10 == 0:
            __import__("gc").collect()
            torch.cuda.empty_cache()

    except Exception as e:
        errors.append({
            "cluster_id": cluster.get("cluster_id", f"cluster_{i}"),
            "error": str(e)
        })
        tqdm.write(f"⚠️  Error: {e}")

print(f"\\n✓ Completed: {len(results)}/{len(clusters)} clusters")
print(f"✗ Errors: {len(errors)}")

# Save results
with open(OUTPUT_FILE, "w") as f:
    for r in results:
        f.write(json.dumps(r) + "\\n")

print(f"✓ Saved {OUTPUT_FILE}")
`;

  await fs.writeFile(scriptPath, script);
  console.log(`✓ Wrote ${scriptPath}`);

  // Summary
  console.log(`
✅ READY FOR COLAB

📊 Summary:
  Feature clusters: ${clusters.length}
  Total packets: ${clusters.reduce((sum: number, c: any) => sum + c.packet_count, 0)}

📤 Upload to Colab:
  1. File: ${path.basename(jsonlPath)}
  2. File: ${path.basename(scriptPath)}
  3. Run: python colab-summarize.py (in Colab)
  4. Download: summaries-gemma4-e4b.jsonl
  5. Import locally: npm run atlas:import:colab-summaries

Ready to upload! ✅
`);
}

main().catch(console.error);
