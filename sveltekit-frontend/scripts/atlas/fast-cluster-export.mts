#!/usr/bin/env npx tsx
/**
 * Fast cluster export for Colab
 * Uses existing SOM clusters + directory grouping (no expensive re-clustering)
 */

import fs from "fs/promises";
import path from "path";
import { db } from "../../src/lib/server/db/client.js";
import { sql } from "drizzle-orm";

const EXPORT_DIR = path.join(process.cwd(), "colab-export-clusters");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Fast Cluster Export (SOM + Directory Grouping)               ║
╚════════════════════════════════════════════════════════════════╝

Export Dir: ${EXPORT_DIR}
Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
`);

  // Group by SOM cluster + directory
  console.log("📦 Grouping packets by SOM cluster + directory...");

  const result = await db.execute(sql`
    SELECT
      COALESCE(som_cluster, directory_path, 'unclustered') as cluster_group,
      directory_path,
      COUNT(*) as member_count,
      ARRAY_AGG(DISTINCT feature_id) as feature_ids,
      ARRAY_AGG(packet_key) as packet_keys,
      ARRAY_AGG(DISTINCT summary) FILTER (WHERE summary IS NOT NULL) as summaries
    FROM atlas_packets
    WHERE embedding IS NOT NULL
    GROUP BY 1, 2
    ORDER BY member_count DESC
    LIMIT 500
  `) as any;

  const groups = result.rows || [];
  console.log(`✓ Found ${groups.length} cluster groups`);

  // Build export format
  console.log("\n📝 Building Colab export format...");
  const clusters = groups.map((g: any, idx: number) => {
    const packetKeys = g.packet_keys || [];
    const summaries = g.summaries || [];
    const hasExistingSummaries = summaries.filter((s: string) => s).length > 0;

    return {
      cluster_id: `cluster:${g.cluster_group}:${idx}`,
      group_name: g.cluster_group,
      directory_path: g.directory_path,
      member_count: g.member_count,
      feature_ids: g.feature_ids || [],
      packet_keys: packetKeys.slice(0, 10), // Sample 10
      existing_summaries: summaries.filter((s: string) => s).length,
      needs_summary: !hasExistingSummaries,
    };
  });

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would export:`);
    console.log(`  - ${clusters.length} cluster groups`);
    console.log(`  - Total packets to summarize: ${clusters.reduce((sum: number, c: any) => sum + c.member_count, 0)}`);
    console.log(`\nSample clusters:`);
    for (let i = 0; i < Math.min(3, clusters.length); i++) {
      console.log(`  [${i}] ${clusters[i].group_name} (${clusters[i].member_count} packets)`);
    }
    return;
  }

  // Write export
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  console.log(`\n📁 Created ${EXPORT_DIR}`);

  // Write clusters.jsonl
  const jsonlPath = path.join(EXPORT_DIR, "clusters.jsonl");
  const jsonlContent = clusters.map((c: any) => JSON.stringify(c)).join("\n");
  await fs.writeFile(jsonlPath, jsonlContent);
  console.log(`✓ Wrote ${jsonlPath}`);

  // Write colab script
  const scriptPath = path.join(EXPORT_DIR, "colab-summarize.py");
  const script = `#!/usr/bin/env python3
import json
from pathlib import Path
from tqdm import tqdm
import requests
import os
import time

CLUSTERS_FILE = "clusters.jsonl"
OUTPUT_FILE = "summaries.jsonl"
MODEL = "gemma4:latest"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")

def summarize_cluster(cluster_json):
    cluster = json.loads(cluster_json)
    cluster_id = cluster["cluster_id"]
    group_name = cluster["group_name"]
    member_count = cluster["member_count"]

    prompt = f"""Summarize this code/feature cluster:

Name: {group_name}
Size: {member_count} packets
Features: {', '.join(cluster['feature_ids'][:5])}

Provide:
1. Title (8-15 words)
2. Summary (2-3 sentences)
3. Key patterns (bullet list)
4. Recommended agent actions

Title:"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "temperature": 0.3,
                "num_predict": 512,
                "stream": False,
            },
            timeout=30,
        )

        if response.status_code == 200:
            text = response.json().get("response", "").strip()
            return {
                "cluster_id": cluster_id,
                "title": text.split(chr(10))[0][:100],
                "summary": text[:500],
                "model": MODEL,
            }
    except Exception as e:
        pass

    return {
        "cluster_id": cluster_id,
        "title": f"[{group_name}]",
        "summary": f"{member_count} packets",
        "error": "timeout",
    }

print(f"Processing {sum(1 for _ in open(CLUSTERS_FILE))} clusters...")
with open(OUTPUT_FILE, "w") as out:
    for line in tqdm(open(CLUSTERS_FILE)):
        if line.strip():
            result = summarize_cluster(line.strip())
            out.write(json.dumps(result) + "\\n")

print(f"✓ Wrote {OUTPUT_FILE}")
`;

  await fs.writeFile(scriptPath, script);
  console.log(`✓ Wrote ${scriptPath}`);

  // Summary
  console.log(`
✅ EXPORT READY FOR COLAB

📊 Summary:
  Cluster groups: ${clusters.length}
  Total packets: ${clusters.reduce((sum: number, c: any) => sum + c.member_count, 0)}
  Needing summaries: ${clusters.filter((c: any) => c.needs_summary).length}

📤 Upload to Colab:
  1. ${EXPORT_DIR}/clusters.jsonl
  2. ${EXPORT_DIR}/colab-summarize.py
  3. Run: python colab-summarize.py
  4. Download: summaries.jsonl
  5. Run locally: npm run colab:import:cluster-summaries

Ready to upload! ✅
`);
}

main().catch(console.error);
