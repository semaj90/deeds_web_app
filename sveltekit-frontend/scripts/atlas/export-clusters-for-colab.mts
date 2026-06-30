#!/usr/bin/env npx tsx
/**
 * Export cluster groups to Colab for parallel summarization
 * Instead of exporting 57K individual packets, export ~100-500 clusters
 * Each cluster includes: domain, topology, ontology, sample texts
 */

import fs from "fs/promises";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "../../src/lib/server/db/client.js";

const EXPORT_DIR = path.join(process.cwd(), "colab-export-clusters");
const DRY_RUN = process.argv.includes("--dry-run");

interface ClusterGroup {
  cluster_id: string;
  domain: string;
  member_count: number;
  topology_paths: string[];
  ontology_terms: string[];
  representative_packet_key: string;
  sample_packet_keys: string[];
  sample_texts: string[];
  needs_summary: boolean;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Export Clusters for Colab Summarization                      ║
╚════════════════════════════════════════════════════════════════╝

Export Dir: ${EXPORT_DIR}
Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
`);

  // Fetch clusters
  console.log("📦 Fetching clusters from Postgres...");
  const result = await db.execute(sql`
    SELECT
      cluster_id, domain, topology, ontology, members,
      status, summary
    FROM cluster_cards
    WHERE status = 'pending_summary' OR summary IS NULL
    LIMIT 999
  `) as any;

  const clusters = result.rows || [];
  console.log(`✓ Loaded ${clusters.length} clusters needing summaries`);

  // Enrich clusters with sample texts
  console.log("📝 Enriching clusters with sample texts...");
  const enriched: ClusterGroup[] = [];

  for (const cluster of clusters) {
    const members = cluster.members || [];
    const sampleKeys = members.slice(0, 3);

    // Fetch sample texts
    const sampleResult = await db.execute(
      sql`
        SELECT packet_key, payload, file_path
        FROM atlas_packets
        WHERE packet_key = ANY(${sql.raw(`ARRAY[${sampleKeys.map((k) => `'${k}'`).join(",")}]`)})
        LIMIT 3
      `
    ) as any;

    const sampleTexts: string[] = (sampleResult.rows || []).map((row: any) => {
      const payload = row.payload || {};
      const text = payload.content || payload.text || row.file_path;
      return String(text).substring(0, 500);
    });

    enriched.push({
      cluster_id: cluster.cluster_id,
      domain: cluster.domain,
      member_count: members.length,
      topology_paths: cluster.topology || [],
      ontology_terms: cluster.ontology || [],
      representative_packet_key: members[0] || "unknown",
      sample_packet_keys: sampleKeys,
      sample_texts: sampleTexts,
      needs_summary: !cluster.summary,
    });
  }

  console.log(`✓ Enriched ${enriched.length} clusters`);

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would export:`);
    console.log(`  - ${enriched.length} cluster groups`);
    console.log(`  - clusters.jsonl (one cluster per line)`);
    console.log(`  - colab-summarize-clusters.py`);
    console.log(`  - config.json`);

    if (enriched.length > 0) {
      console.log(`\nSample cluster 0:`);
      console.log(JSON.stringify(enriched[0], null, 2).substring(0, 300) + "...");
    }
    return;
  }

  // Create export directory
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  console.log(`\n📁 Created ${EXPORT_DIR}`);

  // Write clusters.jsonl
  const clusterLines = enriched.map((c) => JSON.stringify(c));
  const jsonlPath = path.join(EXPORT_DIR, "clusters.jsonl");
  await fs.writeFile(jsonlPath, clusterLines.join("\n"));
  console.log(`✓ Wrote ${jsonlPath} (${enriched.length} lines)`);

  // Write Colab summarization script
  const colabScript = `#!/usr/bin/env python3
"""
Colab Cluster Summarization Script
Reads clusters.jsonl and outputs cluster-summaries.jsonl
"""

import json
import time
from pathlib import Path
from tqdm import tqdm
import requests
import os

CLUSTERS_FILE = "clusters.jsonl"
OUTPUT_FILE = "cluster-summaries.jsonl"
MODEL = "gemma4:latest"
TEMPERATURE = 0.3
MAX_TOKENS = 512
TIMEOUT = 30

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")

def summarize_cluster(cluster_json):
    """Summarize a cluster using Gemma4"""
    cluster = json.loads(cluster_json)
    cluster_id = cluster["cluster_id"]
    domain = cluster["domain"]
    ontology_terms = cluster["ontology_terms"]
    sample_texts = cluster["sample_texts"]

    prompt = f"""You are a code/architecture summarizer. Analyze this cluster and provide:
1. A clear title (8-15 words)
2. A summary (2-3 sentences) of what this cluster does
3. Key files/patterns
4. Recommended next steps for agent processing

Domain: {domain}
Concepts: {", ".join(ontology_terms)}
Sample code/content:
{chr(10).join(sample_texts[:2])}

Respond as JSON:
{{
  "title": "...",
  "summary": "...",
  "key_patterns": ["...", "..."],
  "agent_recommendations": ["..."]
}}
"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "temperature": TEMPERATURE,
                "num_predict": MAX_TOKENS,
                "stream": False,
            },
            timeout=TIMEOUT,
        )

        if response.status_code == 200:
            result = response.json()
            summary_text = result.get("response", "").strip()

            # Try to parse as JSON
            try:
                summary_obj = json.loads(summary_text)
            except:
                summary_obj = {"summary": summary_text}

            return {
                "cluster_id": cluster_id,
                "title": summary_obj.get("title", f"Cluster: {domain}"),
                "summary": summary_obj.get("summary", summary_text),
                "key_patterns": summary_obj.get("key_patterns", []),
                "agent_recommendations": summary_obj.get("agent_recommendations", []),
                "model": MODEL,
            }
    except Exception as e:
        return {
            "cluster_id": cluster_id,
            "title": f"[Error] {domain}",
            "summary": f"Failed to summarize: {str(e)[:100]}",
            "model": MODEL,
            "error": str(e),
        }

def main():
    print(f"""
╔════════════════════════════════════════════════════════════════╗
║  Colab Cluster Summarization                                  ║
╚════════════════════════════════════════════════════════════════╝

Ollama: {OLLAMA_URL}
Model: {MODEL}
""")

    # Check file
    if not Path(CLUSTERS_FILE).exists():
        print(f"❌ {CLUSTERS_FILE} not found")
        return

    cluster_count = sum(1 for _ in open(CLUSTERS_FILE))
    print(f"Processing {cluster_count} clusters...\\n")

    with open(OUTPUT_FILE, "w") as out:
        with tqdm(total=cluster_count) as pbar:
            for line in open(CLUSTERS_FILE):
                if line.strip():
                    result = summarize_cluster(line.strip())
                    out.write(json.dumps(result) + "\\n")
                    out.flush()
                    pbar.update(1)

    print(f"\\n✓ Wrote {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
`;

  const scriptPath = path.join(EXPORT_DIR, "colab-summarize-clusters.py");
  await fs.writeFile(scriptPath, colabScript);
  console.log(`✓ Wrote ${scriptPath}`);

  // Write config
  const config = {
    export_timestamp: new Date().toISOString(),
    total_clusters: enriched.length,
    model: "gemma4:latest",
    processing: {
      temperature: 0.3,
      max_tokens: 512,
      timeout_seconds: 30,
    },
    expected_output: "cluster-summaries.jsonl",
  };

  const configPath = path.join(EXPORT_DIR, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  console.log(`✓ Wrote ${configPath}`);

  console.log(`
✅ EXPORT COMPLETE

📊 Summary:
  Clusters: ${enriched.length}
  Directory: ${EXPORT_DIR}

📤 Next:
  1. Upload ${EXPORT_DIR}/ to Google Colab
  2. Run: python colab-summarize-clusters.py
  3. Download cluster-summaries.jsonl
  4. Run: npm run colab:import:cluster-summaries
`);
}

main().catch(console.error);