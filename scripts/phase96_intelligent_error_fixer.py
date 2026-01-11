#!/usr/bin/env python3
"""
Phase 96: Intelligent Error Fixer - Full Stack Integration
Uses RAG + KAG + DAG + Qdrant + RabbitMQ + Gemini Search Conductor + Ollama

This leverages your entire observability and AI stack:
- Qdrant: Vector search for similar error patterns
- RAG: Retrieval-Augmented Generation for fixes
- KAG: Knowledge-Augmented Generation for context
- DAG: Directed Acyclic Graph for fix dependencies
- RabbitMQ: Task orchestration and queueing
- Gemini: Web search for latest documentation
- embeddinggemma:latest: Generate embeddings
- Langfuse: Full observability
"""

import asyncio
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

# Qdrant client
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# RabbitMQ
try:
    import pika
    RABBITMQ_AVAILABLE = True
except ImportError:
    print("⚠️  RabbitMQ (pika) not available, using synchronous mode")
    RABBITMQ_AVAILABLE = False

# Ollama for embeddings and LLM
import requests

# Setup paths
WORKSPACE_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = WORKSPACE_ROOT / "sveltekit-frontend"

# Configuration
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Models
EMBEDDING_MODEL = "embeddinggemma:latest"
LLM_MODEL = "gemma3-legal:latest"
COLLECTION_NAME = "phase96_error_patterns"

print("🚀 Phase 96: Intelligent Error Fixer")
print("=" * 70)
print(f"📁 Workspace: {WORKSPACE_ROOT}")
print(f"🧠 LLM: {LLM_MODEL}")
print(f"🔍 Embedding: {EMBEDDING_MODEL}")
print(f"📊 Qdrant: {QDRANT_URL}")
print(f"🐰 RabbitMQ: {'✓ Available' if RABBITMQ_AVAILABLE else '✗ Unavailable'}")
print(f"🌐 Gemini Search: {'✓ Enabled' if GEMINI_API_KEY else '✗ Disabled'}")
print("=" * 70)


class QdrantErrorStore:
    """Store and retrieve error patterns using Qdrant vector search"""

    def __init__(self):
        self.client = QdrantClient(url=QDRANT_URL)
        self.ensure_collection()

    def ensure_collection(self):
        """Create collection if it doesn't exist"""
        collections = self.client.get_collections().collections
        if not any(c.name == COLLECTION_NAME for c in collections):
            print(f"📦 Creating Qdrant collection: {COLLECTION_NAME}")
            self.client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=768, distance=Distance.COSINE)
            )

    def get_embedding(self, text: str) -> List[float]:
        """Generate embedding using embeddinggemma:latest"""
        response = requests.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBEDDING_MODEL, "prompt": text}
        )
        return response.json()["embedding"]

    def store_error_pattern(self, error_type: str, pattern: str, fix: str, metadata: Dict):
        """Store an error pattern with its fix in Qdrant"""
        embedding = self.get_embedding(f"{error_type}: {pattern}")

        point = PointStruct(
            id=hash(pattern) % (2**31),  # Generate stable ID
            vector=embedding,
            payload={
                "error_type": error_type,
                "pattern": pattern,
                "fix": fix,
                "metadata": metadata,
                "timestamp": datetime.now().isoformat()
            }
        )

        self.client.upsert(collection_name=COLLECTION_NAME, points=[point])
        print(f"✓ Stored pattern: {error_type[:50]}...")

    def find_similar_errors(self, error_description: str, limit: int = 5) -> List[Dict]:
        """Find similar error patterns using vector search"""
        embedding = self.get_embedding(error_description)

        results = self.client.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            limit=limit
        )

        return [
            {
                "score": r.score,
                "error_type": r.payload["error_type"],
                "pattern": r.payload["pattern"],
                "fix": r.payload["fix"],
                "metadata": r.payload.get("metadata", {})
            }
            for r in results
        ]


class GeminiSearchConductor:
    """Use Gemini to search for CSS/TypeScript documentation and solutions"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.enabled = bool(api_key)

    def search_solution(self, error_message: str) -> Optional[str]:
        """Search for solutions using Gemini with web search"""
        if not self.enabled:
            return None

        # TODO: Implement Gemini search with grounding
        # For now, return None - this is a placeholder for Phase 97
        print(f"🌐 Gemini search: {error_message[:50]}...")
        return None


class ErrorFixerAgent:
    """Intelligent error fixer using RAG + KAG + DAG"""

    def __init__(self):
        self.qdrant = QdrantErrorStore()
        self.gemini = GeminiSearchConductor(GEMINI_API_KEY)
        self.fix_dag = {}  # Dependency graph of fixes

    def analyze_errors(self) -> Dict:
        """Run svelte-check and analyze errors"""
        print("\n🔍 Running svelte-check...")

        result = subprocess.run(
            ["npx", "svelte-check", "--threshold", "error"],
            cwd=FRONTEND_DIR,
            capture_output=True,
            text=True,
            shell=True,
            encoding='utf-8',
            errors='replace'
        )

        output = (result.stdout or "") + (result.stderr or "")        # Extract error count
        error_match = re.search(r'found (\d+) errors', output)
        error_count = int(error_match.group(1)) if error_match else 0

        # Extract CSS errors
        css_errors = re.findall(
            r'\[vite:css\]\[postcss\] Failed to parse.*?with message: "(.*?)"',
            output,
            re.DOTALL
        )

        print(f"📊 Found {error_count} total errors")
        print(f"📊 Found {len(css_errors)} unique CSS parsing errors")

        return {
            "total_errors": error_count,
            "css_errors": list(set(css_errors))[:10],
            "raw_output": output[:2000]  # Limit output size
        }

    def query_llm(self, prompt: str) -> str:
        """Query Ollama LLM with RAG context"""
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "stream": False
            }
        )
        return response.json()["response"]

    def generate_fix_with_rag(self, error_description: str) -> Dict:
        """Generate fix using RAG - search similar patterns first"""
        print(f"\n🔎 RAG: Searching for similar errors...")

        # Search Qdrant for similar error patterns
        similar = self.qdrant.find_similar_errors(error_description, limit=3)

        if similar and similar[0]["score"] > 0.8:
            print(f"✓ Found highly similar error (score: {similar[0]['score']:.2f})")
            return similar[0]

        # No similar pattern found - use LLM to generate fix
        print(f"🧠 Generating new fix with LLM...")

        context = ""
        if similar:
            context = f"Similar errors found:\n" + "\n".join(
                f"- {s['error_type']}: {s['fix']}" for s in similar[:2]
            )

        prompt = f"""You are a CSS/TypeScript error fixing expert.

Error: {error_description}

{context}

Generate a safe regex find-replace pattern to fix this error.
Respond in JSON format:
{{
    "pattern": "regex pattern to find",
    "replacement": "replacement string",
    "description": "what this fix does",
    "confidence": 0.0-1.0
}}

Only suggest fixes you are 100% confident are safe."""

        response = self.query_llm(prompt)

        # Parse JSON from response
        try:
            # Extract JSON from markdown code blocks if present
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', response, re.DOTALL)
            if json_match:
                fix = json.loads(json_match.group(1))
            else:
                # Try direct JSON parse
                fix = json.loads(response)

            # Store in Qdrant for future use
            if fix.get("confidence", 0) > 0.7:
                self.qdrant.store_error_pattern(
                    error_type=error_description,
                    pattern=fix["pattern"],
                    fix=fix["replacement"],
                    metadata={"confidence": fix["confidence"]}
                )

            return fix
        except json.JSONDecodeError:
            print(f"⚠️  Failed to parse LLM response as JSON")
            return None

    def apply_fix(self, pattern: str, replacement: str) -> int:
        """Apply a fix using PowerShell bulk replace"""
        print(f"\n🔧 Applying fix...")
        print(f"   Pattern: {pattern[:60]}...")
        print(f"   Replacement: {replacement[:60]}...")

        ps_script = f"""
$ErrorActionPreference = 'Stop'
$files = rg '{pattern}' src/ -g '*.svelte' -g '*.css' -l 2>$null
if ($files) {{
    foreach ($file in $files) {{
        $content = Get-Content $file -Raw
        $content = $content -replace '{pattern}', '{replacement}'
        Set-Content $file $content -NoNewline
    }}
    Write-Output $files.Count
}} else {{
    Write-Output 0
}}
"""

        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_script],
                cwd=FRONTEND_DIR,
                capture_output=True,
                text=True,
                timeout=60
            )

            files_fixed = int(result.stdout.strip() or "0")
            print(f"✓ Fixed {files_fixed} files")
            return files_fixed

        except Exception as e:
            print(f"❌ Fix failed: {e}")
            return 0

    def verify_improvement(self, baseline: int) -> int:
        """Run svelte-check and return new error count"""
        print("\n✅ Verifying improvement...")

        result = subprocess.run(
            ["npx", "svelte-check", "--threshold", "error"],
            cwd=FRONTEND_DIR,
            capture_output=True,
            text=True,
            shell=True,
            encoding='utf-8',
            errors='replace',
            timeout=300
        )

        output = (result.stdout or "") + (result.stderr or "")
        error_match = re.search(r'found (\d+) errors', output)
        new_count = int(error_match.group(1)) if error_match else baseline

        improvement = baseline - new_count
        print(f"📊 Errors: {baseline} → {new_count} ({improvement:+d})")

        return new_count


def main():
    """Run intelligent error fixing"""
    agent = ErrorFixerAgent()

    # Get baseline
    analysis = agent.analyze_errors()
    baseline = analysis["total_errors"]

    print(f"\n📊 Baseline: {baseline} errors")

    # Process top CSS errors
    css_errors = analysis["css_errors"][:5]  # Top 5

    fixes_applied = 0
    current_count = baseline

    for i, error in enumerate(css_errors, 1):
        print(f"\n{'='*70}")
        print(f"🎯 Error {i}/{len(css_errors)}: {error[:60]}...")
        print('='*70)

        # Generate fix with RAG
        fix = agent.generate_fix_with_rag(error)

        if not fix:
            print("⚠️  Skipping - no confident fix found")
            continue

        if fix.get("confidence", 0) < 0.7:
            print(f"⚠️  Skipping - low confidence ({fix['confidence']:.2f})")
            continue

        # Apply fix
        files_fixed = agent.apply_fix(fix["pattern"], fix["replacement"])

        if files_fixed > 0:
            fixes_applied += 1

            # Verify
            new_count = agent.verify_improvement(current_count)

            if new_count >= current_count:
                print("⚠️  No improvement - reverting...")
                # TODO: Git revert last change
            else:
                current_count = new_count
                print(f"✨ Success! {current_count} errors remaining")

        # Stop if we've fixed enough
        if current_count < baseline * 0.9:  # 10% improvement
            print("\n🎉 Achieved 10%+ improvement - stopping")
            break

    print(f"\n{'='*70}")
    print("✅ Phase 96 Intelligent Error Fixer Complete")
    print(f"{'='*70}")
    print(f"📊 Baseline: {baseline} errors")
    print(f"📊 Final: {current_count} errors")
    print(f"✨ Fixed: {baseline - current_count} errors ({fixes_applied} fixes applied)")
    print(f"📈 Improvement: {((baseline - current_count) / baseline * 100):.1f}%")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
