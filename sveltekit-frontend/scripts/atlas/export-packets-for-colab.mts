#!/usr/bin/env npx tsx
/**
 * Export packets for Google Colab processing
 * Creates a directory structure with:
 *   packets/ — one JSON file per packet
 *   metadata.jsonl — packet index (packet_key, source_ref, file_path, status)
 *   config.json — processing config (model, batch size, etc.)
 */

import fs from "fs/promises";
import path from "path";
import { db } from "../../src/lib/server/db/client.js";
import { eq, isNull, sql } from "drizzle-orm";

const EXPORT_DIR = path.join(process.cwd(), "colab-export");
const PACKETS_DIR = path.join(EXPORT_DIR, "packets");
const LIMIT = parseInt(process.env.LIMIT || "999999");
const DRY_RUN = process.argv.includes("--dry-run");

interface PacketForColab {
  packet_key: string;
  source_ref: string;
  file_path: string;
  feature_id: string;
  feature_label: string;
  payload: any;
  embedding?: number[];
  needs_summary: boolean;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Export Packets for Google Colab                              ║
╚════════════════════════════════════════════════════════════════╝

Export Dir: ${EXPORT_DIR}
Packets Dir: ${PACKETS_DIR}
Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
Limit: ${LIMIT}
`);

  // Fetch packets without summaries (raw SQL to avoid schema issues)
  console.log("📦 Fetching packets from Postgres...");
  const result = await db.execute(sql`
    SELECT
      packet_key, source_ref, file_path, feature_id, feature_label,
      payload, embedding, summary
    FROM atlas_packets
    WHERE summary IS NULL
    LIMIT ${sql.raw(LIMIT.toString())}
  `) as any;

  const packets = result.rows || [];

  console.log(`✓ Found ${packets.length} packets without summaries`);

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] Would create:");
    console.log(`  - ${packets.length} JSON files in ${PACKETS_DIR}/`);
    console.log(`  - metadata.jsonl (${packets.length} lines)`);
    console.log(`  - config.json`);
    console.log(`  - Total size: ~${(packets.length * 2) / 1024}MB (estimated)`);
    return;
  }

  // Create directories
  await fs.mkdir(PACKETS_DIR, { recursive: true });
  console.log(`📁 Created ${PACKETS_DIR}`);

  // Write packet files
  console.log(`📝 Writing ${packets.length} packet files...`);
  const metadataLines: string[] = [];

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];
    const packetFile = path.join(PACKETS_DIR, `${pkt.packet_key}.json`);

    const payload: PacketForColab = {
      packet_key: pkt.packet_key,
      source_ref: pkt.source_ref,
      file_path: pkt.file_path,
      feature_id: pkt.feature_id,
      feature_label: pkt.feature_label,
      payload: pkt.payload || {},
      embedding: pkt.embedding ? Array.from(pkt.embedding as any) : undefined,
      needs_summary: !pkt.summary,
    };

    await fs.writeFile(packetFile, JSON.stringify(payload, null, 2));

    // Metadata line (JSONL format for easy streaming)
    metadataLines.push(
      JSON.stringify({
        packet_key: pkt.packet_key,
        source_ref: pkt.source_ref,
        file_path: pkt.file_path,
        needs_summary: true,
        status: "pending",
      })
    );

    if ((i + 1) % 5000 === 0) {
      console.log(`  [${i + 1}/${packets.length}] written`);
    }
  }

  // Write metadata.jsonl
  const metadataFile = path.join(EXPORT_DIR, "metadata.jsonl");
  await fs.writeFile(metadataFile, metadataLines.join("\n"));
  console.log(`✓ Wrote ${metadataFile} (${packets.length} lines)`);

  // Write config.json
  const config = {
    export_timestamp: new Date().toISOString(),
    total_packets: packets.length,
    model: "gemma4-rotorquant:latest",
    processing: {
      batch_size: 10,
      temperature: 0.3,
      max_tokens: 256,
      timeout_seconds: 30,
    },
    colab_instructions: {
      step_1_mount_drive: "from google.colab import drive; drive.mount('/content/drive')",
      step_2_download: "!cp -r /content/drive/'My Drive'/deeds-colab-export /content/packets",
      step_3_install: "!pip install ollama requests tqdm",
      step_4_script: "See colab-summarize.py",
    },
    expected_output: {
      summaries_jsonl: "summaries.jsonl",
      format_per_line: '{"packet_key": "...", "summary": "..."}',
    },
  };

  const configFile = path.join(EXPORT_DIR, "config.json");
  await fs.writeFile(configFile, JSON.stringify(config, null, 2));
  console.log(`✓ Wrote ${configFile}`);

  // Write Colab Python script
  const colabScript = `#!/usr/bin/env python3
"""
Google Colab Gemma4 Summarization Script
Processes exported packets from deeds-web-app Phase B
"""

import json
import os
from pathlib import Path
from tqdm import tqdm
import requests
import time

# Configuration
PACKETS_DIR = "./packets"
METADATA_FILE = "./metadata.jsonl"
OUTPUT_FILE = "./summaries.jsonl"
GEMMA4_URL = "http://localhost:11434/api/chat"  # Ollama local or Colab GPU
MODEL = "gemma4:latest"
BATCH_SIZE = 5
TEMPERATURE = 0.3
MAX_TOKENS = 256
TIMEOUT = 30

def load_packet(packet_key):
    """Load a single packet JSON"""
    path = Path(PACKETS_DIR) / f"{packet_key}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None

def summarize_packet(packet, retries=3):
    """Call Gemma4 to summarize a packet"""
    # Extract content from payload JSONB
    payload = packet.get("payload", {})
    content = payload.get("content", "") or payload.get("text", "") or ""
    if not content or len(content) < 10:
        return f"[Empty] {packet.get('file_path', 'Unknown')}"

    prompt = f"""Summarize this code/document in 1-2 sentences:

{content[:2000]}

Summary:"""

    for attempt in range(retries):
        try:
            response = requests.post(
                GEMMA4_URL,
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
                return result.get("response", "").strip()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5)
            else:
                return f"[Error: {str(e)[:50]}]"

    return "[Failed after retries]"

def main():
    os.makedirs(Path(OUTPUT_FILE).parent, exist_ok=True)

    print(f"Loading packet index from {METADATA_FILE}")
    packets_to_process = []

    with open(METADATA_FILE) as f:
        for line in f:
            if line.strip():
                packets_to_process.append(json.loads(line))

    print(f"Processing {len(packets_to_process)} packets...")

    with open(OUTPUT_FILE, "w") as out:
        for i in tqdm(range(0, len(packets_to_process), BATCH_SIZE)):
            batch = packets_to_process[i : i + BATCH_SIZE]

            for item in batch:
                packet_key = item["packet_key"]
                packet = load_packet(packet_key)

                if not packet:
                    print(f"  Skipped {packet_key} (not found)")
                    continue

                summary = summarize_packet(packet)

                out.write(
                    json.dumps({
                        "packet_key": packet_key,
                        "summary": summary,
                        "model": MODEL,
                        "timestamp": time.time(),
                    })
                    + "\\n"
                )
                out.flush()

    print(f"✓ Wrote summaries to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
`;

  const scriptFile = path.join(EXPORT_DIR, "colab-summarize.py");
  await fs.writeFile(scriptFile, colabScript);
  console.log(`✓ Wrote ${scriptFile}`);

  // Summary
  const dirSize = await getDirSize(EXPORT_DIR);
  console.log(`
✅ EXPORT COMPLETE

📊 Summary:
  Packets: ${packets.length}
  Directory: ${EXPORT_DIR}
  Size: ${(dirSize / 1024 / 1024).toFixed(2)} MB

📤 Next steps:
  1. Upload entire ${EXPORT_DIR}/ to Google Drive or Colab
  2. In Colab: mount Drive and copy to /content/packets
  3. Run: python colab-summarize.py
  4. Download summaries.jsonl back to local
  5. Import to Postgres: npm run phase-b:import-colab-summaries

📌 Command to run in Colab:
  !python colab-summarize.py
`);
}

async function getDirSize(dir: string): Promise<number> {
  let size = 0;
  const files = await fs.readdir(dir, { recursive: true });
  for (const file of files) {
    const stat = await fs.stat(path.join(dir, file as string));
    if (stat.isFile()) size += stat.size;
  }
  return size;
}

main().catch(console.error);
