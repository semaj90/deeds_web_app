#!/usr/bin/env npx tsx
/**
 * Simple cluster export: group by directory_path + feature_id
 * Fast and produces meaningful groupings
 */

import fs from "fs/promises";
import path from "path";
import { db } from "../../src/lib/server/db/client.js";
import { sql } from "drizzle-orm";

const EXPORT_DIR = path.join(process.cwd(), "colab-export-clusters");

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Cluster by Directory for Colab Export                        ║
╚════════════════════════════════════════════════════════════════╝

Fetching packets...`);

  // Get all packets grouped by directory
  const result = await db.execute(sql`
    SELECT
      directory_path,
      COUNT(*) as count,
      ARRAY_AGG(packet_key) as packet_keys,
      ARRAY_AGG(DISTINCT feature_id) as feature_ids,
      ARRAY_AGG(DISTINCT summary) FILTER (WHERE summary IS NOT NULL) as summaries
    FROM atlas_packets
    WHERE directory_path IS NOT NULL
    GROUP BY directory_path
    ORDER BY count DESC
    LIMIT 1000
  `) as any;

  const groups = result.rows || [];
  console.log(`✓ Found ${groups.length} directory clusters\n`);

  // Build cluster format
  const clusters = groups.map((g: any, idx: number) => ({
    cluster_id: `dir:${idx}`,
    directory: g.directory_path,
    packet_count: g.count,
    feature_ids: (g.feature_ids || []).slice(0, 10),
    packet_keys: (g.packet_keys || []).slice(0, 10),
    has_summaries: (g.summaries || []).length > 0,
  }));

  // Create directory
  await fs.mkdir(EXPORT_DIR, { recursive: true });

  // Write clusters.jsonl
  const jsonlPath = path.join(EXPORT_DIR, "clusters.jsonl");
  const lines = clusters.map((c) => JSON.stringify(c));
  await fs.writeFile(jsonlPath, lines.join("\n"));

  // Write Python script
  const scriptPath = path.join(EXPORT_DIR, "colab-summarize.py");
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env python3
import json
from pathlib import Path
from tqdm import tqdm
import requests
import os

CLUSTERS_FILE = "clusters.jsonl"
OUTPUT_FILE = "summaries.jsonl"
MODEL = "gemma4:latest"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")

def summarize(line):
    cluster = json.loads(line)
    cluster_id = cluster["cluster_id"]
    directory = cluster["directory"]

    prompt = f"""One sentence summary of code/directory: {directory}
Key files: {', '.join(cluster['feature_ids'][:3])}
Summary:"""

    try:
        r = requests.post(OLLAMA_URL, json={"model": MODEL, "prompt": prompt, "temperature": 0.3, "num_predict": 100, "stream": False}, timeout=10)
        if r.status_code == 200:
            return {"cluster_id": cluster_id, "summary": r.json()["response"][:200]}
    except:
        pass

    return {"cluster_id": cluster_id, "summary": directory}

print(f"Summarizing {sum(1 for _ in open(CLUSTERS_FILE))} clusters...")
with open(OUTPUT_FILE, "w") as out:
    for line in tqdm(open(CLUSTERS_FILE)):
        out.write(json.dumps(summarize(line)) + "\\n")
print(f"✓ {OUTPUT_FILE}")
`
  );

  console.log(`✅ READY FOR COLAB

📁 Directory: ${EXPORT_DIR}
📊 Clusters: ${clusters.length}
📦 Total packets: ${clusters.reduce((s, c) => s + c.packet_count, 0)}

Files to upload:
  • clusters.jsonl
  • colab-summarize.py

Steps:
1. Upload both files to Google Colab
2. Run: python colab-summarize.py
3. Download summaries.jsonl
4. Run locally: npm run colab:import:cluster-summaries

YOU CAN UPLOAD NOW ✅
`);

  // Show sample
  console.log("Sample clusters:");
  for (let i = 0; i < Math.min(5, clusters.length); i++) {
    console.log(
      `  [${i}] ${clusters[i].directory} (${clusters[i].packet_count} packets)`
    );
  }
}

main().catch(console.error);
