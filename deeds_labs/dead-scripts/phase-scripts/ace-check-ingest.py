#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ACE Check Ingest Runner
Parses svelte-check + tsc output → clusters errors → generates file cards → Qdrant
Integrates with Enhanced Codebase Indexer for contextual routing
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import os
import json
import re
import hashlib
import subprocess
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from collections import defaultdict

# Import enhanced indexer for embedding/tagging from backend
backend_scripts = os.path.join(os.path.dirname(__file__), '..', '..', 'backend', 'scripts')
sys.path.insert(0, backend_scripts)
from fastmcp_ripgrep_indexer import FastMCPCodebaseIndexer as EnhancedCodebaseIndexer


class ACECheckIngester:
    """
    Ingest svelte-check + tsc output into structured error artifacts
    """

    def __init__(self):
        self.indexer = EnhancedCodebaseIndexer()
        self.run_id = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

        # Initialize Qdrant client
        from qdrant_client import QdrantClient
        self.qdrant = QdrantClient(url=os.getenv("QDRANT_URL", "http://localhost:6333"))

        # Ollama config
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.embedding_model = "embeddinggemma:latest"

    def get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding vector from Ollama"""
        import requests

        try:
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={"model": self.embedding_model, "prompt": text},
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                return result.get("embedding")
            else:
                return None
        except Exception as e:
            print(f"   ⚠️  Embedding failed: {e}")
            return None

    def run_checks(self) -> Tuple[str, str]:
        """Run svelte-check and tsc, return outputs"""

        print("🔍 Running svelte-check...")
        try:
            svelte_result = subprocess.run(
                ['npx', 'svelte-check', '--output', 'machine'],
                capture_output=True,
                text=True,
                timeout=60
            )
            svelte_output = svelte_result.stdout + svelte_result.stderr
        except Exception as e:
            print(f"   ⚠️  svelte-check failed: {e}")
            svelte_output = ""

        print("🔍 Running tsc...")
        try:
            tsc_result = subprocess.run(
                ['npx', 'tsc', '--noEmit', '--pretty', 'false'],
                capture_output=True,
                text=True,
                timeout=60
            )
            tsc_output = tsc_result.stdout + tsc_result.stderr
        except Exception as e:
            print(f"   ⚠️  tsc failed: {e}")
            tsc_output = ""

        return svelte_output, tsc_output

    def parse_errors(self, svelte_output: str, tsc_output: str) -> List[Dict]:
        """Parse error outputs into structured artifacts"""

        errors = []

        # Parse TSC output
        # Format: src/file.ts(123,45): error TS2339: Property 'foo' does not exist...
        tsc_pattern = r'(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)'

        for match in re.finditer(tsc_pattern, tsc_output, re.MULTILINE):
            file_path, line, col, code, message = match.groups()

            errors.append({
                'tool': 'tsc',
                'file': file_path.strip(),
                'line': int(line),
                'col': int(col),
                'code': code,
                'message': message.strip(),
                'severity': 'error'
            })

        # Parse svelte-check output (machine format)
        # Format: timestamp ERROR "file" line:col "message"
        # Example: 1767398430921 ERROR "src\\lib\\file.ts" 100:3 "',' expected."
        svelte_pattern = r'\d+\s+(ERROR|WARNING)\s+"([^"]+)"\s+(\d+):(\d+)\s+"(.+?)"'

        for match in re.finditer(svelte_pattern, svelte_output, re.MULTILINE):
            severity, file_path, line, col, message = match.groups()

            # Extract error code if present (TS2339, ts7016, etc.)
            code_match = re.search(r'(TS\d+|ts\d+)', message)
            code = code_match.group(1) if code_match else 'UNKNOWN'

            errors.append({
                'tool': 'svelte-check',
                'file': file_path.strip().replace('\\\\', '/'),
                'line': int(line),
                'col': int(col),
                'code': code.upper(),
                'message': message.strip(),
                'severity': severity.lower()
            })

        print(f"   Parsed {len(errors)} errors")
        return errors

    def build_signature_text(self, error: Dict) -> str:
        """Build signature text for clustering"""

        # Normalize message (remove file-specific details)
        message = error['message']
        message = re.sub(r"'[^']+'", "'PLACEHOLDER'", message)  # Replace quoted strings
        message = re.sub(r'\d+', 'N', message)  # Replace numbers

        return f"TOOL: {error['tool']}\nCODE: {error['code']}\nMSG: {message}"

    def cluster_errors(self, errors: List[Dict]) -> Dict[str, List[Dict]]:
        """Cluster errors by signature"""

        print("🔬 Clustering errors by signature...")

        clusters = defaultdict(list)

        for error in errors:
            signature = self.build_signature_text(error)
            signature_hash = hashlib.md5(signature.encode()).hexdigest()[:8]

            error['signature'] = signature
            error['signature_hash'] = signature_hash

            clusters[signature_hash].append(error)

        print(f"   Found {len(clusters)} unique error patterns")

        # Sort by cluster size
        sorted_clusters = dict(sorted(
            clusters.items(),
            key=lambda x: len(x[1]),
            reverse=True
        ))

        return sorted_clusters

    def generate_cluster_card(self, cluster_id: str, errors: List[Dict]) -> Dict:
        """Generate a knowledge card for an error cluster"""

        # Get representative error
        rep_error = errors[0]

        # Extract affected files
        files = list(set([e['file'] for e in errors]))

        # Build context for LLM
        context = f"""Error Cluster Analysis:

Pattern: {rep_error['code']} - {rep_error['message'][:100]}
Tool: {rep_error['tool']}
Occurrences: {len(errors)} times
Files affected: {len(files)}

Sample files:
{chr(10).join(files[:5])}

Generate a brief analysis (2-3 sentences):
- Root cause
- Suggested fix approach
- Priority (low/med/high)"""

        # Generate LLM analysis
        try:
            import requests
            response = requests.post(self.indexer.ollama_url, json={
                'model': self.indexer.model,
                'prompt': context,
                'stream': False,
                'options': {
                    'temperature': 0.3,
                    'num_predict': 150
                }
            }, timeout=30)

            if response.status_code == 200:
                analysis = response.json().get('response', '').strip()
            else:
                analysis = f"[ERROR] LLM failed (status {response.status_code})"
        except Exception as e:
            analysis = f"[ERROR] {str(e)}"

        # Auto-prioritize
        if len(errors) > 100:
            priority = 'high'
        elif len(errors) > 20:
            priority = 'med'
        else:
            priority = 'low'

        card = {
            'cluster_id': cluster_id,
            'error_code': rep_error['code'],
            'tool': rep_error['tool'],
            'pattern': rep_error['signature'],
            'occurrences': len(errors),
            'files_affected': len(files),
            'sample_files': files[:10],
            'llm_analysis': analysis,
            'priority': priority,
            'created_at': datetime.now().isoformat(),
            'run_id': self.run_id
        }

        return card

    def generate_file_card(self, file_path: str, file_errors: List[Dict]) -> Dict:
        """Generate a character card for a file with errors"""

        # Count errors by severity
        error_counts = defaultdict(int)
        for error in file_errors:
            error_counts[error['severity']] += 1

        # Get error codes
        error_codes = list(set([e['code'] for e in file_errors]))

        # Build summary
        summary = f"File has {len(file_errors)} errors: {dict(error_counts)}"

        # Auto-tag based on errors
        tags = {
            'has_errors': True,
            'error_count': len(file_errors),
            'error_severity': 'high' if error_counts['error'] > 10 else 'med' if error_counts['error'] > 0 else 'low',
            'error_codes': error_codes[:5],
            'needs_fix': True
        }

        card = {
            'file_path': file_path,
            'error_summary': summary,
            'error_counts': dict(error_counts),
            'error_codes': error_codes,
            'tags': tags,
            'run_id': self.run_id,
            'created_at': datetime.now().isoformat()
        }

        return card

    def index_cluster_cards(self, cluster_cards: List[Dict]):
        """Index cluster cards in Qdrant"""

        print(f"\n💾 Indexing {len(cluster_cards)} cluster cards in Qdrant...")

        from qdrant_client.models import PointStruct

        # Ensure collection exists
        collection_name = 'phase89_ace_cluster_cards'
        try:
            self.qdrant.get_collection(collection_name)
        except:
            from qdrant_client.models import Distance, VectorParams
            print(f"   📦 Creating {collection_name} collection...")
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=768, distance=Distance.COSINE)
            )

        # Index each card
        points = []
        for card in cluster_cards:
            # Build signature for embedding
            signature = f"{card['error_code']}: {card['pattern']}\n{card['llm_analysis']}"

            # Get embedding
            embedding = self.get_embedding(signature)

            if embedding:
                point = PointStruct(
                    id=card['cluster_id'],
                    vector=embedding,
                    payload=card
                )
                points.append(point)

        # Batch upsert
        if points:
            self.qdrant.upsert(
                collection_name=collection_name,
                points=points
            )
            print(f"   ✅ Indexed {len(points)} cluster cards")

    def index_file_cards(self, file_cards: List[Dict]):
        """Index file error cards in Qdrant"""

        print(f"\n💾 Indexing {len(file_cards)} file error cards in Qdrant...")

        from qdrant_client.models import PointStruct, Distance, VectorParams

        # Ensure collection exists
        collection_name = 'phase89_file_error_cards'
        try:
            self.qdrant.get_collection(collection_name)
        except:
            print(f"   📦 Creating {collection_name} collection...")
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=768, distance=Distance.COSINE)
            )

        # Index each card
        points = []
        for card in file_cards:
            # Build signature
            signature = f"FILE: {card['file_path']}\n{card['error_summary']}\nCODES: {', '.join(card['error_codes'])}"

            # Get embedding
            embedding = self.get_embedding(signature)

            if embedding:
                point_id = hashlib.md5(card['file_path'].encode()).hexdigest()
                point = PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=card
                )
                points.append(point)

        # Batch upsert
        if points:
            self.qdrant.upsert(
                collection_name=collection_name,
                points=points
            )
            print(f"   ✅ Indexed {len(points)} file error cards")

    def run(self, check_output_file: Optional[str] = None):
        """Run full ingestion pipeline"""

        print("="*80)
        print("🔄 ACE Check Ingest Runner")
        print(f"   Run ID: {self.run_id}")
        print("="*80)

        # Get error outputs
        if check_output_file:
            print(f"\n📂 Reading errors from {check_output_file}...")
            with open(check_output_file, 'r', encoding='utf-8') as f:
                output = f.read()
            svelte_output = output
            tsc_output = output
        else:
            svelte_output, tsc_output = self.run_checks()

        # Parse errors
        print("\n📋 Parsing errors...")
        errors = self.parse_errors(svelte_output, tsc_output)

        if not errors:
            print("   ✅ No errors found!")
            return

        # Cluster errors
        clusters = self.cluster_errors(errors)

        # Generate cluster cards
        print("\n🎴 Generating cluster cards...")
        cluster_cards = []
        for cluster_id, cluster_errors in list(clusters.items())[:20]:  # Top 20 clusters
            card = self.generate_cluster_card(cluster_id, cluster_errors)
            cluster_cards.append(card)
            print(f"   📌 {cluster_id}: {card['error_code']} ({card['occurrences']} occurrences, priority: {card['priority']})")

        # Generate file cards
        print("\n📄 Generating file error cards...")
        files_with_errors = defaultdict(list)
        for error in errors:
            files_with_errors[error['file']].append(error)

        file_cards = []
        for file_path, file_errors in list(files_with_errors.items())[:50]:  # Top 50 files
            card = self.generate_file_card(file_path, file_errors)
            file_cards.append(card)

        print(f"   Generated {len(file_cards)} file cards")

        # Index in Qdrant
        self.index_cluster_cards(cluster_cards)
        self.index_file_cards(file_cards)

        # Export summary
        summary = {
            'run_id': self.run_id,
            'total_errors': len(errors),
            'unique_patterns': len(clusters),
            'files_affected': len(files_with_errors),
            'cluster_cards': len(cluster_cards),
            'file_cards': len(file_cards),
            'created_at': datetime.now().isoformat()
        }

        summary_path = f"ace_runs/check_ingest_{self.run_id}.json"
        os.makedirs('ace_runs', exist_ok=True)
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)

        print(f"\n{'='*80}")
        print("✅ ACE Check Ingest Complete!")
        print("="*80)
        print(f"Total errors: {len(errors)}")
        print(f"Unique patterns: {len(clusters)}")
        print(f"Files affected: {len(files_with_errors)}")
        print(f"Cluster cards indexed: {len(cluster_cards)}")
        print(f"File cards indexed: {len(file_cards)}")
        print(f"\nSummary saved: {summary_path}")
        print(f"Collections: phase89_ace_cluster_cards, phase89_file_error_cards")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='ACE Check Ingest Runner')
    parser.add_argument('--input', help='Input file with check output')
    parser.add_argument('--run-checks', action='store_true', help='Run svelte-check + tsc')

    args = parser.parse_args()

    ingester = ACECheckIngester()

    if args.input:
        ingester.run(check_output_file=args.input)
    elif args.run_checks:
        ingester.run()
    else:
        print("Usage:")
        print("  python ace-check-ingest.py --run-checks")
        print("  python ace-check-ingest.py --input check_output.txt")


if __name__ == "__main__":
    main()
