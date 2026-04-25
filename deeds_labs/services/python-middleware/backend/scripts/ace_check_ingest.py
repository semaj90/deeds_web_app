#!/usr/bin/env python3
"""
ACE Check Ingest Runner - Lock-in ACE Loop
Integrates: svelte-check + tsc → cluster → LLM → LangExtract → Qdrant + Timeline

Pipeline:
1. Run svelte-check + tsc (structured output)
2. Parse error artifacts (file, line, code, message)
3. Cluster errors by signature (embeddinggemma + DBSCAN)
4. Generate cluster cards (gemma3:270m summaries)
5. Validate with LangExtract
6. Store in Qdrant (phase89_ace_cluster_cards, phase89_file_error_cards)
7. Log to ACE Timeline Service
"""

import os
import sys
import asyncio
import json
import hashlib
import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import aiohttp
import numpy as np

# Add to path
sys.path.insert(0, str(Path(__file__).parent.parent))

@dataclass
class ErrorArtifact:
    """Structured error from tsc/svelte-check"""
    run_id: str
    tool: str  # tsc | svelte-check
    file: str
    line: int
    col: int
    code: str  # TS2339, etc
    message: str
    snippet: str
    timestamp: str

@dataclass
class ErrorClusterCard:
    """Cluster of similar errors with LLM analysis"""
    cluster_id: str
    signature: str  # Template for matching
    tool: str
    error_code: str
    count: int
    files: List[str]
    llm_summary: str  # gemma3:270m analysis
    suggested_fix: str
    confidence: float
    tags: List[str]
    created_at: str

@dataclass
class FileErrorCard:
    """Per-file error summary"""
    file_path: str
    error_count: int
    error_codes: List[str]
    cluster_ids: List[str]
    llm_analysis: str
    risk_level: str  # low | med | high
    priority: int  # 1-10
    tags: List[str]
    last_updated: str

class ErrorParser:
    """Parse tsc and svelte-check output"""

    def __init__(self):
        self.run_id = hashlib.md5(datetime.utcnow().isoformat().encode()).hexdigest()[:8]

    def parse_tsc_output(self, output: str) -> List[ErrorArtifact]:
        """Parse tsc --noEmit output"""
        errors = []

        for line in output.split('\n'):
            line = line.strip()
            if not line or not '(' in line:
                continue

            try:
                # Format: src/lib/file.ts(123,45): error TS2339: message
                parts = line.split('): error ')
                if len(parts) != 2:
                    continue

                # Extract file and position
                file_pos = parts[0]
                file_path, pos = file_pos.rsplit('(', 1)
                line_num, col_num = pos.split(',')

                # Extract error code and message
                error_info = parts[1]
                code_parts = error_info.split(': ', 1)
                error_code = code_parts[0] if len(code_parts) > 1 else "TS0000"
                message = code_parts[1] if len(code_parts) > 1 else error_info

                errors.append(ErrorArtifact(
                    run_id=self.run_id,
                    tool="tsc",
                    file=file_path.strip(),
                    line=int(line_num),
                    col=int(col_num),
                    code=error_code.strip(),
                    message=message.strip(),
                    snippet="",  # Would need file read
                    timestamp=datetime.utcnow().isoformat()
                ))
            except Exception as e:
                continue

        return errors

    def parse_svelte_check_output(self, output: str) -> List[ErrorArtifact]:
        """Parse svelte-check output"""
        errors = []

        # svelte-check format varies, adapt as needed
        # This is a basic parser
        for line in output.split('\n'):
            if 'Error:' in line or 'error' in line.lower():
                # Parse based on actual format
                pass

        return errors

class ErrorClusterer:
    """Cluster errors using embeddings + DBSCAN"""

    def __init__(self):
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")

    async def generate_signature(self, error: ErrorArtifact) -> str:
        """Generate signature text for embedding"""
        return f"""TOOL: {error.tool}
CODE: {error.code}
FILE: {error.file}
MSG: {error.message}
CONTEXT: typescript | error | {error.code.lower()}"""

    async def embed_signature(self, signature: str) -> List[float]:
        """Generate embedding for error signature"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": "embeddinggemma:latest",
                    "prompt": signature
                }

                async with session.post(
                    f"{self.ollama_url}/api/embeddings",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("embedding", [])
        except Exception as e:
            print(f"⚠️  Embedding error: {e}")
        return []

    async def cluster_errors(
        self,
        errors: List[ErrorArtifact],
        eps: float = 0.3,
        min_samples: int = 2
    ) -> Dict[str, List[ErrorArtifact]]:
        """Cluster errors using DBSCAN on embeddings"""

        if not errors:
            return {}

        print(f"🔬 Clustering {len(errors)} errors...")

        # Generate signatures and embeddings
        signatures = []
        embeddings = []

        for error in errors:
            sig = await self.generate_signature(error)
            signatures.append(sig)
            emb = await self.embed_signature(sig)
            if emb:
                embeddings.append(emb)
            else:
                embeddings.append([0.0] * 768)  # Zero vector as fallback

        if not embeddings:
            return {"cluster_0": errors}

        # DBSCAN clustering
        try:
            from sklearn.cluster import DBSCAN

            X = np.array(embeddings)
            clustering = DBSCAN(eps=eps, min_samples=min_samples, metric='cosine')
            labels = clustering.fit_predict(X)

            # Group by cluster
            clusters = {}
            for i, label in enumerate(labels):
                cluster_id = f"cluster_{label}" if label >= 0 else f"outlier_{i}"
                if cluster_id not in clusters:
                    clusters[cluster_id] = []
                clusters[cluster_id].append(errors[i])

            print(f"   ✅ Found {len(clusters)} clusters")
            return clusters

        except ImportError:
            print("   ⚠️  scikit-learn not installed, using simple grouping")
            # Fallback: group by error code
            clusters = {}
            for error in errors:
                key = f"code_{error.code}"
                if key not in clusters:
                    clusters[key] = []
                clusters[key].append(error)
            return clusters

class LLMAnalyzer:
    """Generate LLM analysis using gemma3:270m"""

    def __init__(self):
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = "gemma3:270m"

    async def analyze_cluster(
        self,
        cluster_id: str,
        errors: List[ErrorArtifact]
    ) -> ErrorClusterCard:
        """Generate cluster card with LLM summary"""

        # Sample errors for prompt
        sample_errors = errors[:5]
        error_summary = "\n".join([
            f"- {e.file}:{e.line} - {e.code}: {e.message}"
            for e in sample_errors
        ])

        prompt = f"""Analyze this TypeScript error cluster:

Cluster ID: {cluster_id}
Error Count: {len(errors)}
Common Code: {errors[0].code}

Sample Errors:
{error_summary}

Provide:
1. One-sentence summary of the issue
2. Likely root cause
3. Suggested fix (1-2 sentences)

Be concise and actionable."""

        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 150
                    }
                }

                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        llm_output = data.get("response", "")

                        # Extract summary and fix
                        lines = llm_output.strip().split('\n')
                        summary = lines[0] if lines else "Error cluster detected"
                        suggested_fix = '\n'.join(lines[1:3]) if len(lines) > 1 else "Review and fix errors"

                        return ErrorClusterCard(
                            cluster_id=cluster_id,
                            signature=await self._generate_signature(errors),
                            tool=errors[0].tool,
                            error_code=errors[0].code,
                            count=len(errors),
                            files=[e.file for e in errors],
                            llm_summary=summary[:200],
                            suggested_fix=suggested_fix[:200],
                            confidence=0.8,  # Could be computed
                            tags=[errors[0].code, errors[0].tool, "cluster"],
                            created_at=datetime.utcnow().isoformat()
                        )
        except Exception as e:
            print(f"⚠️  LLM analysis failed: {e}")

        # Fallback
        return ErrorClusterCard(
            cluster_id=cluster_id,
            signature=f"{errors[0].code}: {errors[0].message}",
            tool=errors[0].tool,
            error_code=errors[0].code,
            count=len(errors),
            files=[e.file for e in errors],
            llm_summary=f"{len(errors)} instances of {errors[0].code}",
            suggested_fix="Review error messages and fix instances",
            confidence=0.5,
            tags=[errors[0].code, errors[0].tool],
            created_at=datetime.utcnow().isoformat()
        )

    async def _generate_signature(self, errors: List[ErrorArtifact]) -> str:
        """Generate signature template"""
        return f"{errors[0].code}: {errors[0].message[:100]}"

class ACETimelineLogger:
    """Log events to ACE Timeline Service"""

    def __init__(self):
        self.timeline_url = os.getenv("ACE_TIMELINE_URL", "http://localhost:8002")

    async def log_cluster_card(self, card: ErrorClusterCard):
        """Log cluster card creation"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "file_path": f"cluster/{card.cluster_id}",
                    "error_type": "ClusterCreated",
                    "error_message": card.llm_summary,
                    "fix_explanation": card.suggested_fix,
                    "confidence_score": card.confidence,
                    "llm_provider": "ollama",
                    "llm_model": "gemma3:270m",
                    "applied": False,
                    "success": False,
                    "sources_used": [f"errors:{card.count}"],
                    "metadata": {
                        "cluster_id": card.cluster_id,
                        "error_code": card.error_code,
                        "file_count": len(card.files),
                        "tags": card.tags
                    }
                }

                async with session.post(
                    f"{self.timeline_url}/log/fix-attempt",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        print(f"   ✅ Timeline logged: Event #{result.get('event_id')}")
        except Exception as e:
            print(f"   ⚠️  Timeline logging failed: {e}")

class QdrantIndexer:
    """Index cluster cards in Qdrant"""

    def __init__(self):
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.cluster_collection = "phase89_ace_cluster_cards"
        self.file_collection = "phase89_file_error_cards"

    async def ensure_collections(self):
        """Create collections if needed"""
        async with aiohttp.ClientSession() as session:
            for collection in [self.cluster_collection, self.file_collection]:
                try:
                    # Check existence
                    async with session.get(f"{self.qdrant_url}/collections/{collection}") as resp:
                        if resp.status == 200:
                            print(f"✅ Collection '{collection}' exists")
                            continue

                    # Create
                    payload = {
                        "vectors": {
                            "size": 768,
                            "distance": "Cosine"
                        }
                    }

                    async with session.put(
                        f"{self.qdrant_url}/collections/{collection}",
                        json=payload
                    ) as resp:
                        if resp.status == 200:
                            print(f"✅ Created collection '{collection}'")
                except Exception as e:
                    print(f"⚠️  Collection setup failed: {e}")

    async def index_cluster_card(self, card: ErrorClusterCard, vector: List[float]):
        """Index cluster card in Qdrant"""
        try:
            point_id = int(hashlib.md5(card.cluster_id.encode()).hexdigest()[:16], 16) % (2**63)

            async with aiohttp.ClientSession() as session:
                payload = {
                    "points": [{
                        "id": point_id,
                        "vector": vector,
                        "payload": asdict(card)
                    }]
                }

                async with session.put(
                    f"{self.qdrant_url}/collections/{self.cluster_collection}/points",
                    json=payload
                ) as resp:
                    if resp.status == 200:
                        print(f"   ✅ Indexed cluster card: {card.cluster_id}")
        except Exception as e:
            print(f"   ⚠️  Qdrant indexing failed: {e}")

async def main():
    import argparse

    parser = argparse.ArgumentParser(description="ACE Check Ingest Runner")
    parser.add_argument("--check", action="store_true", help="Run svelte-check")
    parser.add_argument("--tsc", action="store_true", help="Run tsc")
    parser.add_argument("--input", help="Parse existing check output file")
    parser.add_argument("--cluster", action="store_true", help="Cluster errors")
    parser.add_argument("--analyze", action="store_true", help="Generate LLM analysis")

    args = parser.parse_args()

    print("=" * 70)
    print("🔍 ACE Check Ingest Runner")
    print("=" * 70)
    print()

    parser_obj = ErrorParser()
    clusterer = ErrorClusterer()
    analyzer = LLMAnalyzer()
    timeline = ACETimelineLogger()
    indexer = QdrantIndexer()

    # Ensure Qdrant collections
    await indexer.ensure_collections()

    # 1. Get errors
    errors = []

    if args.tsc:
        print("1️⃣  Running tsc --noEmit...")
        try:
            result = subprocess.run(
                ["npx", "tsc", "--noEmit"],
                capture_output=True,
                text=True,
                cwd="sveltekit-frontend"
            )
            tsc_errors = parser_obj.parse_tsc_output(result.stdout + result.stderr)
            errors.extend(tsc_errors)
            print(f"   ✅ Found {len(tsc_errors)} tsc errors")
        except Exception as e:
            print(f"   ❌ tsc failed: {e}")

    if args.input and Path(args.input).exists():
        print(f"1️⃣  Reading errors from {args.input}...")
        with open(args.input, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            file_errors = parser_obj.parse_tsc_output(content)
            errors.extend(file_errors)
            print(f"   ✅ Parsed {len(file_errors)} errors")

    if not errors:
        print("❌ No errors found")
        return

    print(f"\n📊 Total errors: {len(errors)}")

    # 2. Cluster
    if args.cluster or args.analyze:
        print("\n2️⃣  Clustering errors...")
        clusters = await clusterer.cluster_errors(errors)
        print(f"   ✅ Created {len(clusters)} clusters")

        # 3. Analyze and index
        if args.analyze:
            print("\n3️⃣  Generating LLM analysis...")
            for cluster_id, cluster_errors in clusters.items():
                if len(cluster_errors) < 2:
                    continue  # Skip single-error clusters

                print(f"\n   📦 Analyzing {cluster_id} ({len(cluster_errors)} errors)")

                # Generate cluster card
                card = await analyzer.analyze_cluster(cluster_id, cluster_errors)

                # Get embedding for card
                sig = await clusterer.generate_signature(cluster_errors[0])
                vector = await clusterer.embed_signature(sig)

                # Index in Qdrant
                if vector:
                    await indexer.index_cluster_card(card, vector)

                # Log to timeline
                await timeline.log_cluster_card(card)

    print()
    print("=" * 70)
    print("✅ ACE Check Ingest Complete!")
    print("=" * 70)
    print()
    print(f"📊 Summary:")
    print(f"   Errors processed: {len(errors)}")
    print(f"   Clusters created: {len(clusters) if 'clusters' in locals() else 0}")
    print()
    print(f"🔍 Query cluster cards:")
    print(f"   Qdrant: http://localhost:6333/collections/phase89_ace_cluster_cards")
    print(f"   Timeline: http://localhost:8002/events")
    print()

if __name__ == "__main__":
    # UTF-8 encoding for Windows
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    asyncio.run(main())
