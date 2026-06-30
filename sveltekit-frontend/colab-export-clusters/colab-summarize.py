#!/usr/bin/env python3
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
        out.write(json.dumps(summarize(line)) + "\n")
print(f"✓ {OUTPUT_FILE}")
