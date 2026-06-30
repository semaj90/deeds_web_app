#!/usr/bin/env python3
"""
Google Colab Gemma4 Parallel Summarization
Processes packets.jsonl and outputs summaries.jsonl
"""

import json
import time
from pathlib import Path
from tqdm import tqdm
import requests
import os

# Configuration
PACKETS_FILE = "packets.jsonl"
OUTPUT_FILE = "summaries.jsonl"
MODEL = "gemma4:latest"
BATCH_SIZE = 10
TEMPERATURE = 0.3
MAX_TOKENS = 256
TIMEOUT = 30

# Ollama URL (set via environment or default to local)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")

def summarize_packet(packet_json, retries=2):
    """Call Gemma4 to summarize a packet"""
    packet = json.loads(packet_json)
    packet_key = packet.get("packet_key")

    # Extract content from payload or other fields
    payload = packet.get("payload", {})
    content = ""

    if isinstance(payload, dict):
        content = payload.get("content", "") or payload.get("text", "")

    if not content or len(str(content)) < 10:
        return {
            "packet_key": packet_key,
            "summary": f"[Empty/no content] {packet.get('file_path', 'Unknown')}",
            "model": MODEL,
            "error": "no_content",
        }

    prompt = f"""Summarize this code/document in 1-2 sentences:

{str(content)[:1500]}

Summary:"""

    for attempt in range(retries):
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
                summary = result.get("response", "").strip()
                return {
                    "packet_key": packet_key,
                    "summary": summary,
                    "model": MODEL,
                }
            else:
                print(f"  ❌ HTTP {response.status_code} for {packet_key}")
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                return {
                    "packet_key": packet_key,
                    "summary": f"[Error: {str(e)[:40]}]",
                    "model": MODEL,
                    "error": str(e),
                }

    return {
        "packet_key": packet_key,
        "summary": "[Failed after retries]",
        "model": MODEL,
        "error": "timeout",
    }

def main():
    print(f"""
╔════════════════════════════════════════════════════════════════╗
║  Colab Gemma4 Parallel Summarization                          ║
╚════════════════════════════════════════════════════════════════╝

Model: {MODEL}
Batch Size: {BATCH_SIZE}
Temperature: {TEMPERATURE}
Max Tokens: {MAX_TOKENS}
Ollama URL: {OLLAMA_URL}
""")

    # Check Ollama health
    try:
        resp = requests.get(OLLAMA_URL.replace("/api/chat", "/api/tags"), timeout=5)
        if resp.status_code == 200:
            models = resp.json()
            print(f"✓ Ollama alive, {len(models.get('models', []))} model(s) available")
        else:
            print(f"⚠️ Ollama returned {resp.status_code}")
    except Exception as e:
        print(f"❌ Cannot connect to Ollama: {e}")
        print(f"   Make sure Ollama is running or export OLLAMA_URL")
        return

    # Load and process packets
    if not Path(PACKETS_FILE).exists():
        print(f"❌ {PACKETS_FILE} not found")
        return

    packet_count = sum(1 for _ in open(PACKETS_FILE))
    print(f"📦 Processing {packet_count} packets...\n")

    with open(OUTPUT_FILE, "w") as out:
        with tqdm(total=packet_count, unit="pkt") as pbar:
            with open(PACKETS_FILE) as f:
                batch = []
                for line in f:
                    if line.strip():
                        batch.append(line.strip())

                    if len(batch) >= BATCH_SIZE or line == "":
                        # Process batch
                        for packet_json in batch:
                            result = summarize_packet(packet_json)
                            out.write(json.dumps(result) + "\n")
                            out.flush()
                            pbar.update(1)
                        batch = []

    print(f"\n✓ Wrote summaries to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
