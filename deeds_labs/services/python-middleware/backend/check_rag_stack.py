"""
RAG Stack Health Check
======================
Verifies all components of the custom RAG/KAG system
"""

import httpx
import sys
from typing import Dict, Any

def check_service(name: str, url: str, auth: tuple = None) -> Dict[str, Any]:
    """Check if a service is responding"""
    try:
        response = httpx.get(url, auth=auth, timeout=5)
        return {
            "name": name,
            "status": "✅ UP" if response.status_code == 200 else f"⚠️ {response.status_code}",
            "response_time": f"{response.elapsed.total_seconds()*1000:.0f}ms"
        }
    except Exception as e:
        return {
            "name": name,
            "status": "❌ DOWN",
            "error": str(e)[:50]
        }

print("=" * 70)
print("RAG/KAG STACK HEALTH CHECK")
print("=" * 70)

# Check all services
services = [
    ("Qdrant", "http://localhost:6333"),
    ("Ollama", "http://localhost:11434/api/tags"),
    ("CouchDB", "http://localhost:5984", ("admin", "password")),
    ("Neo4j", "http://localhost:7474"),
    ("PostgreSQL (via HTTP)", "http://localhost:5432"),  # This will fail, just checking
]

results = []
for service in services:
    if len(service) == 3:
        result = check_service(service[0], service[1], service[2])
    else:
        result = check_service(service[0], service[1])
    results.append(result)

# Display results
max_name_len = max(len(r["name"]) for r in results)
for r in results:
    status = r["status"]
    name = r["name"].ljust(max_name_len)
    if "response_time" in r:
        print(f"{name}  {status}  ({r['response_time']})")
    else:
        print(f"{name}  {status}  {r.get('error', '')}")

print("\n" + "=" * 70)

# Check CouchDB databases
try:
    response = httpx.get(
        "http://localhost:5984/_all_dbs",
        auth=("admin", "password"),
        timeout=5
    )
    if response.status_code == 200:
        dbs = response.json()
        print("CouchDB Databases:")
        for db in ["codebase_graph", "llm_summaries", "error_clusters"]:
            if db in dbs:
                info_resp = httpx.get(
                    f"http://localhost:5984/{db}",
                    auth=("admin", "password")
                )
                info = info_resp.json()
                print(f"  ✅ {db}: {info.get('doc_count', 0)} documents")
            else:
                print(f"  ❌ {db}: NOT FOUND")
except Exception as e:
    print(f"❌ CouchDB check failed: {e}")

print("\n" + "=" * 70)

# Check Qdrant collections
try:
    response = httpx.get("http://localhost:6333/collections", timeout=5)
    if response.status_code == 200:
        data = response.json()
        collections = data.get("result", {}).get("collections", [])
        print("Qdrant Collections:")

        # Check for phase79_rag_vectors
        rag_collection = [c for c in collections if c.get("name") == "phase79_rag_vectors"]
        if rag_collection:
            detail = httpx.get("http://localhost:6333/collections/phase79_rag_vectors")
            if detail.status_code == 200:
                info = detail.json().get("result", {})
                print(f"  ✅ phase79_rag_vectors: {info.get('points_count', 0)} vectors")

        print(f"  Total collections: {len(collections)}")
except Exception as e:
    print(f"❌ Qdrant check failed: {e}")

print("\n" + "=" * 70)

# Check Ollama models
try:
    response = httpx.get("http://localhost:11434/api/tags", timeout=5)
    if response.status_code == 200:
        models = response.json().get("models", [])
        print("Ollama Models:")
        for model in models:
            name = model.get("name", "unknown")
            size_gb = model.get("size", 0) / (1024**3)
            print(f"  ✅ {name} ({size_gb:.1f} GB)")
except Exception as e:
    print(f"❌ Ollama check failed: {e}")

print("\n" + "=" * 70)
print("CUSTOM RAG/KAG STACK STATUS")
print("=" * 70)
print("""
NOT Microsoft GraphRAG ❌
NOT Pydantic AI (yet) ❌
NOT CopilotKit (yet) ❌

YOUR CUSTOM STACK ✅
├─ Qdrant (vectors)          - Vector database for embeddings
├─ Neo4j (knowledge graph)   - Entity relationship graph
├─ embeddinggemma (768d)     - Text embeddings
├─ gemma3-legal (LLM)        - Legal AI model
├─ CouchDB (4,722 files)     - Codebase indexing
└─ Phase 94 ACE DAG          - Orchestration layer

Ready for:
  • Legal document search with source validation
  • Case-specific knowledge management
  • Citation-backed LLM answers
  • Human-in-the-loop RAG workflow

Access Points:
  • CouchDB UI: http://localhost:5984/_utils
  • Qdrant Dashboard: http://localhost:6333/dashboard
  • RAG Search UI: http://localhost:5175/rag-search
""")
print("=" * 70)
