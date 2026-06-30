#!/usr/bin/env python3
"""
Google Colab Cluster Enrichment Script
Input: colab-cluster-summary-batches.jsonl
Output: enriched-clusters.jsonl

Requires: Google/Gemma-4-E4B-it or community 4-bit quant
Runtime: GPU (T4 or better)
"""

import json
import sys
import os
from pathlib import Path
from tqdm import tqdm
import subprocess

# Install dependencies
print("📦 Installing dependencies...")
subprocess.run(
    ["pip", "-q", "install", "transformers", "torch", "accelerate", "bitsandbytes"],
    check=False,
)

print("\n╔════════════════════════════════════════════════════════════════╗")
print("║  Colab Cluster Enrichment (Gemma-4-E4B-it)                  ║")
print("╚════════════════════════════════════════════════════════════════╝\n")

# Load model
print("🤖 Loading Gemma-4-E4B-it model...")
try:
    from transformers import AutoTokenizer, AutoModelForCausalLM
    import torch

    MODEL_ID = "google/gemma-4-E4B-it"  # Official Google 4-bit model
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

    print(f"   Device: {DEVICE}")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
        device_map="auto",
        low_cpu_mem_usage=True,
    )
    print(f"✓ Model loaded on {DEVICE}")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    print("   Fallback: using Ollama (slower)")
    USE_OLLAMA = True
else:
    USE_OLLAMA = False

CLUSTERS_FILE = "colab-cluster-summary-batches.jsonl"
OUTPUT_FILE = "enriched-clusters.jsonl"

def enrich_cluster(cluster_json):
    """Enrich a cluster with summary, entities, actions, risks, tags"""
    cluster = json.loads(cluster_json)
    cluster_id = cluster["cluster_id"]
    domain = cluster.get("domain", "general")
    ontology = cluster.get("ontology_terms", [])
    samples = cluster.get("sample_texts", [])[:2]
    members = cluster.get("member_count", 0)

    prompt = f"""Analyze this code cluster and provide structured enrichment.

Domain: {domain}
Cluster size: {members} packets
Concepts: {", ".join(ontology[:5])}
Sample code:
{chr(10).join(samples[:2])}

Provide ONLY a valid JSON object (no markdown, no extra text):
{{
  "cluster_title": "8-15 word title",
  "summary": "2-3 sentence summary",
  "feature_label": "feature name",
  "entities": ["entity1", "entity2", "entity3"],
  "actions": ["action1", "action2", "action3"],
  "inputs": ["input1"],
  "outputs": ["output1"],
  "risks": ["risk1", "risk2"],
  "tags": ["tag1", "tag2", "tag3"],
  "ontology_text": "space separated concepts"
}}"""

    try:
        if USE_OLLAMA:
            import requests

            r = requests.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": "gemma4:latest",
                    "prompt": prompt,
                    "temperature": 0.3,
                    "num_predict": 512,
                    "stream": False,
                },
                timeout=30,
            )
            if r.status_code == 200:
                response_text = r.json()["response"]
            else:
                raise Exception(f"HTTP {r.status_code}")
        else:
            # Use transformers + Gemma-4-E4B-it
            inputs = tokenizer(prompt, return_tensors="pt").to(DEVICE)
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=512,
                    temperature=0.3,
                    top_p=0.95,
                    do_sample=True,
                )
            response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Extract JSON from response
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            enrichment = json.loads(response_text[json_start:json_end])
        else:
            # Fallback
            enrichment = {
                "cluster_title": domain.title(),
                "summary": f"Cluster of {members} packets in {domain}",
                "entities": ontology[:3],
                "actions": [],
                "inputs": [],
                "outputs": [],
                "risks": [],
                "tags": cluster.get("existing_tags", []),
                "ontology_text": " ".join(ontology),
            }

        return {
            "cluster_id": cluster_id,
            "cluster_title": enrichment.get("cluster_title", domain.title()),
            "summary": enrichment.get("summary", ""),
            "domain": domain,
            "feature_label": enrichment.get("feature_label", cluster_id),
            "entities": enrichment.get("entities", []),
            "actions": enrichment.get("actions", []),
            "inputs": enrichment.get("inputs", []),
            "outputs": enrichment.get("outputs", []),
            "risks": enrichment.get("risks", []),
            "tags": enrichment.get("tags", cluster.get("existing_tags", [])),
            "ontology_text": enrichment.get("ontology_text", " ".join(ontology)),
            "kag_edges": [
                ["belongs_to_domain", domain],
                ["uses_entity", e] for e in enrichment.get("entities", [])[:3]
            ],
            "model": "google/gemma-4-E4B-it",
        }

    except Exception as e:
        print(f"  ❌ Error on {cluster_id}: {str(e)[:50]}")
        return {
            "cluster_id": cluster_id,
            "cluster_title": f"[Error] {domain}",
            "summary": f"Failed to enrich: {str(e)[:100]}",
            "domain": domain,
            "entities": [],
            "actions": [],
            "risks": [],
            "tags": [],
            "error": str(e),
        }

# Main
if not Path(CLUSTERS_FILE).exists():
    print(f"❌ {CLUSTERS_FILE} not found")
    sys.exit(1)

cluster_count = sum(1 for _ in open(CLUSTERS_FILE))
print(f"\n🔄 Enriching {cluster_count} clusters...\n")

with open(OUTPUT_FILE, "w") as out:
    with tqdm(total=cluster_count, unit="cluster") as pbar:
        for line in open(CLUSTERS_FILE):
            if line.strip():
                result = enrich_cluster(line.strip())
                out.write(json.dumps(result) + "\n")
                out.flush()
                pbar.update(1)

print(f"\n✅ Wrote {OUTPUT_FILE}")
print(f"\n📤 Download {OUTPUT_FILE} and run:")
print(f"   node scripts/atlas/import-cluster-summaries.mjs {OUTPUT_FILE} --apply")
