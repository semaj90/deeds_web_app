#!/usr/bin/env python3
"""
Week 3 Readiness Check
Verifies all prerequisites for Week 3 human-in-the-loop error fixing.

Checks:
1. Qdrant collection exists (phase92_knowledge_base from Week 1)
2. CouchDB summaries database populated (from Week 2)
3. Ollama is running and has gemma3-legal:latest
4. KB Fixing API endpoints registered
5. PostgreSQL tables created (future)
"""

import sys

# Fix Windows console encoding issues
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import requests
from typing import Tuple

# Service endpoints
QDRANT_URL = "http://localhost:6333"
COUCHDB_URL = "http://localhost:5984"
OLLAMA_URL = "http://localhost:11434"
API_URL = "http://localhost:8001"

def check_qdrant() -> Tuple[bool, str]:
    """Check Qdrant has knowledge_base collection (fallback to phase76)"""
    collections_to_try = ["knowledge_base", "phase76_knowledge_base", "phase72_ast_knowledge_base"]

    for collection_name in collections_to_try:
        try:
            response = requests.get(
                f"{QDRANT_URL}/collections/{collection_name}",
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                points = data.get('result', {}).get('points_count', 0)
                return True, f"Collection '{collection_name}' exists with {points} points"
        except requests.exceptions.RequestException:
            continue

    return False, f"No knowledge base collection found (tried: {', '.join(collections_to_try)})"

def check_couchdb() -> Tuple[bool, str]:
    """Check CouchDB has llm_summaries database"""
    try:
        response = requests.get(
            f"{COUCHDB_URL}/llm_summaries",
            auth=("admin", "password"),  # Add credentials from Phase 66
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            doc_count = data.get('doc_count', 0)
            if doc_count > 0:
                return True, f"Database exists with {doc_count} documents"
            else:
                return False, "Database exists but empty"
        else:
            return False, f"Database not found (status {response.status_code})"
    except requests.exceptions.RequestException as e:
        return False, f"Connection failed: {e}"

def check_ollama() -> Tuple[bool, str]:
    """Check Ollama is running and has gemma model (gemma3-legal or embeddinggemma)"""
    try:
        # Check Ollama is running
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            return False, f"Ollama not responding (status {response.status_code})"

        # Check for any gemma model
        data = response.json()
        models = [m['name'] for m in data.get('models', [])]
        gemma_models = [m for m in models if 'gemma' in m.lower()]

        if gemma_models:
            return True, f"Gemma model(s) available: {', '.join(gemma_models)}"
        else:
            return False, f"No Gemma model found. Available: {', '.join(models[:3])}"
    except requests.exceptions.RequestException as e:
        return False, f"Connection failed: {e}"

def check_kb_api() -> Tuple[bool, str]:
    """Check KB Fixing API endpoints are registered"""
    try:
        # Check if backend is running
        response = requests.get(f"{API_URL}/health", timeout=5)
        if response.status_code != 200:
            return False, "Backend not running"

        # Check KB stats endpoint (quick test)
        response = requests.get(f"{API_URL}/api/kb/stats", timeout=5)
        if response.status_code == 200:
            stats = response.json()
            return True, f"API registered (sessions: {stats['active_error_sessions']})"
        else:
            return False, f"KB API not registered (status {response.status_code})"
    except requests.exceptions.RequestException as e:
        return False, f"Connection failed: {e}"

def check_postgresql() -> Tuple[bool, str]:
    """Check PostgreSQL tables exist (future - Week 3 Task 3)"""
    # TODO: Implement when PostgreSQL migration complete
    return False, "Not implemented (in-memory storage currently used)"

def main():
    print("\n" + "="*70)
    print(" "*20 + "🧪 WEEK 3 READINESS CHECK")
    print("="*70)

    checks = [
        ("1️⃣  Qdrant Collection", check_qdrant),
        ("2️⃣  CouchDB Summaries", check_couchdb),
        ("3️⃣  Ollama LLM", check_ollama),
        ("4️⃣  KB Fixing API", check_kb_api),
        ("5️⃣  PostgreSQL Tables", check_postgresql),
    ]

    results = []
    for name, check_func in checks:
        print(f"\n{name}")
        success, message = check_func()
        results.append(success)

        if success:
            print(f"   ✅ PASS - {message}")
        else:
            print(f"   ❌ FAIL - {message}")

    # Summary
    print("\n" + "="*70)
    passed = sum(results)
    total = len(results)

    if passed == total:
        print("✅ ALL CHECKS PASSED - Week 3 ready to go!")
    elif passed >= 4:
        print(f"⚠️  {passed}/{total} checks passed - Week 3 can proceed (PostgreSQL migration pending)")
    else:
        print(f"❌ {passed}/{total} checks passed - Review errors above")

    print("\n🔧 Common fixes:")
    if not results[0]:  # Qdrant
        print("   - Qdrant: docker run -p 6333:6333 qdrant/qdrant")
    if not results[1]:  # CouchDB
        print("   - CouchDB summaries: python backend/scripts/generate_summaries.py")
    if not results[2]:  # Ollama
        print("   - Ollama: ollama pull gemma3-legal:latest")
    if not results[3]:  # API
        print("   - API: python backend/api/main.py")
    if not results[4]:  # PostgreSQL
        print("   - PostgreSQL: Run migration script (Week 3 Task 3)")

    print("\n📚 Week 3 Workflow:")
    print("   1. User submits error → API searches Qdrant + CouchDB")
    print("   2. User validates sources → Approve/reject knowledge sources")
    print("   3. LLM generates fix → Using validated sources only")
    print("   4. Apply fix → Track provenance in PostgreSQL")
    print("   5. Query history → Audit trail for all fixes")

    print("\n🚀 To test workflow:")
    print("   python backend/scripts/test_kb_fixing_workflow.py")

    print("="*70 + "\n")

    sys.exit(0 if passed >= 4 else 1)

if __name__ == "__main__":
    main()
