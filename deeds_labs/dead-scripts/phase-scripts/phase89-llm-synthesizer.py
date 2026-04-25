#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: LLM Output Synthesis for ACE Runs
Generates summaries for batch fixes using gemma3-legal
Stores in ace_runs.llm_summary and caches in Redis/Qdrant
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import os
import requests
import json
import psycopg2
import redis
import hashlib
from typing import Dict, Optional
from datetime import datetime
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

class ACELLMSynthesizer:
    """Generate and store LLM summaries for ACE batch runs"""

    def __init__(self):
        self.ollama_url = self.getOllamaEndpoint()
        self.model = os.getenv("OLLAMA_MODEL", "gemma3:270m")

        # Connect to services
        self.pg = psycopg2.connect(
            dbname="legal",
            user="user",
            password="pass",
            host="localhost",
            port="5434"
        )

        self.redis = redis.Redis(host='localhost', port=6379, decode_responses=False)
        self.qdrant = QdrantClient(url="http://localhost:6333")

        # Ensure collection exists
        self._ensure_collection()

    @staticmethod
    def getOllamaEndpoint() -> str:
        """Get Ollama endpoint from .env (supports both local and remote GPU)"""
        # Primary: OLLAMA_URL from .env
        ollama_url = os.getenv("OLLAMA_URL")
        if ollama_url:
            return f"{ollama_url}/api/generate"

        # Fallback: VITE_OLLAMA_URL
        vite_url = os.getenv("VITE_OLLAMA_URL")
        if vite_url:
            return f"{vite_url}/api/generate"

        # Default: localhost
        return "http://localhost:11434/api/generate"

    def _ensure_collection(self):
        """Create phase89_ace_summaries collection if needed"""
        try:
            self.qdrant.get_collection('phase89_ace_summaries')
            print("✅ Collection phase89_ace_summaries exists")
        except:
            print("📦 Creating phase89_ace_summaries collection...")
            self.qdrant.create_collection(
                collection_name='phase89_ace_summaries',
                vectors_config=VectorParams(
                    size=768,
                    distance=Distance.COSINE
                )
            )

    def get_embedding(self, text: str) -> list:
        """Get embedding using Ollama embeddinggemma model"""
        response = requests.post('http://localhost:11434/api/embeddings', json={
            'model': 'embeddinggemma',
            'prompt': text
        })
        return response.json()['embedding']

    def generate_summary(self, run_data: dict) -> str:
        """Generate summary using gemma3-legal"""

        # Build prompt
        improvement_pct = 0.0
        if run_data['check_errors_before'] > 0:
            errors_fixed = run_data['check_errors_before'] - run_data['check_errors_after']
            improvement_pct = (errors_fixed / run_data['check_errors_before']) * 100

        prompt = f"""Analyze this ACE (Auto-Correcting Error) batch run and provide a concise technical summary.

Batch: {run_data['batch_name']}
Files changed: {run_data['files_changed']}
Edits applied: {run_data['edits']}
Errors before: {run_data['check_errors_before']}
Errors after: {run_data['check_errors_after']}
Improvement: {improvement_pct:.2f}%
Execution time: {run_data.get('execution_time_ms', 0):.2f}ms

Top causes:
{json.dumps(run_data.get('top_causes', []), indent=2)}

Provide a brief summary (3-5 sentences) covering:
1. Main accomplishment
2. Top error patterns fixed
3. Recommended next actions

Summary:"""

        print(f"🤖 Generating summary with {self.model}...")

        try:
            response = requests.post(self.ollama_url, json={
                'model': self.model,
                'prompt': prompt,
                'stream': False,
                'options': {
                    'temperature': 0.3,  # More deterministic for technical summaries
                    'top_p': 0.9,
                    'num_predict': 256  # Max tokens
                }
            }, timeout=60)

            if response.status_code == 200:
                result = response.json()
                summary = result.get('response', '').strip()
                print(f"   ✅ Generated {len(summary)} chars")
                return summary
            else:
                print(f"   ❌ Ollama error: {response.status_code}")
                print(f"   Response: {response.text}")
                return f"[ERROR] Failed to generate summary (status {response.status_code})"

        except Exception as e:
            print(f"   ❌ Exception: {e}")
            return f"[ERROR] {str(e)}"

    def update_ace_run(self, run_id: str, summary: str):
        """Update ace_runs table with LLM summary"""
        cursor = self.pg.cursor()

        try:
            cursor.execute("""
                UPDATE ace_runs
                SET llm_summary = %s
                WHERE run_id = %s
            """, (summary, run_id))

            self.pg.commit()
            print(f"   ✅ Updated ace_runs.llm_summary for {run_id}")

        except Exception as e:
            print(f"   ❌ Failed to update ace_runs: {e}")
            self.pg.rollback()

        finally:
            cursor.close()

    def cache_in_redis(self, run_id: str, summary: str, metadata: dict):
        """Cache summary in Redis (24h TTL)"""
        cache_key = f"ace:summary:{run_id}"

        cache_data = {
            'summary': summary,
            'metadata': metadata,
            'cached_at': datetime.now().isoformat()
        }

        try:
            self.redis.setex(
                cache_key,
                86400,  # 24 hours
                json.dumps(cache_data)
            )
            print(f"   ✅ Cached in Redis: {cache_key} (TTL: 24h)")

        except Exception as e:
            print(f"   ⚠️  Redis cache failed: {e}")

    def index_in_qdrant(self, run_id: str, summary: str, run_data: dict):
        """Index summary in Qdrant for semantic search"""

        # Get embedding
        embedding = self.get_embedding(summary)

        # Calculate improvement percentage
        improvement_pct = 0.0
        if run_data['check_errors_before'] > 0:
            errors_fixed = run_data['check_errors_before'] - run_data['check_errors_after']
            improvement_pct = (errors_fixed / run_data['check_errors_before']) * 100

        # Create point
        point = PointStruct(
            id=hashlib.md5(run_id.encode()).hexdigest(),
            vector=embedding,
            payload={
                'run_id': run_id,
                'batch_name': run_data['batch_name'],
                'summary': summary,
                'files_changed': run_data['files_changed'],
                'edits': run_data['edits'],
                'improvement_pct': round(improvement_pct, 2),
                'top_causes': run_data.get('top_causes', []),
                'next_actions': run_data.get('next_actions', []),
                'created_at': run_data.get('created_at', datetime.now().isoformat())
            }
        )

        try:
            self.qdrant.upsert(
                collection_name='phase89_ace_summaries',
                points=[point]
            )
            print(f"   ✅ Indexed in Qdrant: phase89_ace_summaries")

        except Exception as e:
            print(f"   ⚠️  Qdrant indexing failed: {e}")

    def process_run(self, run_id: str):
        """Process a single ACE run: generate summary, cache, index"""

        print(f"\n{'='*70}")
        print(f"Processing ACE run: {run_id}")
        print(f"{'='*70}\n")

        # Fetch run data
        cursor = self.pg.cursor()
        cursor.execute("""
            SELECT
                run_id,
                batch_name,
                files_changed,
                edits,
                check_errors_before,
                check_errors_after,
                top_causes,
                next_actions,
                execution_time_ms,
                created_at
            FROM ace_runs
            WHERE run_id = %s
        """, (run_id,))

        row = cursor.fetchone()
        cursor.close()

        if not row:
            print(f"❌ Run not found: {run_id}")
            return

        run_data = {
            'run_id': row[0],
            'batch_name': row[1],
            'files_changed': row[2],
            'edits': row[3],
            'check_errors_before': row[4],
            'check_errors_after': row[5],
            'top_causes': row[6] if isinstance(row[6], list) else [],
            'next_actions': row[7] if isinstance(row[7], list) else [],
            'execution_time_ms': row[8],
            'created_at': row[9].isoformat() if row[9] else None
        }

        print("📋 Run data:")
        print(f"   Batch: {run_data['batch_name']}")
        print(f"   Files: {run_data['files_changed']}, Edits: {run_data['edits']}")
        print(f"   Errors: {run_data['check_errors_before']} → {run_data['check_errors_after']}")
        print()

        # Generate summary
        summary = self.generate_summary(run_data)
        print(f"\n📝 Summary:\n{summary}\n")

        # Update PostgreSQL
        self.update_ace_run(run_id, summary)

        # Cache in Redis
        self.cache_in_redis(run_id, summary, {
            'batch_name': run_data['batch_name'],
            'improvement_pct': round(
                ((run_data['check_errors_before'] - run_data['check_errors_after']) /
                 run_data['check_errors_before'] * 100) if run_data['check_errors_before'] > 0 else 0.0,
                2
            )
        })

        # Index in Qdrant
        self.index_in_qdrant(run_id, summary, run_data)

        print(f"\n✅ Processing complete for {run_id}")

    def process_all_unsummarized(self):
        """Process all ACE runs without summaries"""

        cursor = self.pg.cursor()
        cursor.execute("""
            SELECT run_id
            FROM ace_runs
            WHERE llm_summary IS NULL
            ORDER BY created_at DESC
        """)

        rows = cursor.fetchall()
        cursor.close()

        print(f"\n📊 Found {len(rows)} unsummarized runs")

        for (run_id,) in rows:
            self.process_run(run_id)

    def search_similar_fixes(self, query: str, top_k: int = 5) -> list:
        """Search for similar past fixes"""

        print(f"\n🔍 Searching for: '{query}'")

        # Get query embedding
        query_embedding = self.get_embedding(query)

        # Search Qdrant
        results = self.qdrant.search(
            collection_name='phase89_ace_summaries',
            query_vector=query_embedding,
            limit=top_k
        )

        print(f"\n📊 Top {len(results)} similar fixes:\n")

        similar = []
        for i, result in enumerate(results, 1):
            print(f"{i}. {result.payload['batch_name']} ({result.payload['improvement_pct']}% improvement)")
            print(f"   Score: {result.score:.4f}")
            print(f"   Summary: {result.payload['summary'][:100]}...")
            print()

            similar.append({
                'run_id': result.payload['run_id'],
                'batch_name': result.payload['batch_name'],
                'summary': result.payload['summary'],
                'improvement_pct': result.payload['improvement_pct'],
                'score': result.score
            })

        return similar

    def close(self):
        self.pg.close()
        self.redis.close()


def main():
    import argparse

    parser = argparse.ArgumentParser(description='ACE LLM Synthesis')
    parser.add_argument('--run-id', help='Process specific run')
    parser.add_argument('--all', action='store_true', help='Process all unsummarized runs')
    parser.add_argument('--search', help='Search for similar fixes')
    parser.add_argument('--demo', action='store_true', help='Run demo')

    args = parser.parse_args()

    synthesizer = ACELLMSynthesizer()

    try:
        if args.demo:
            print("🎭 ACE LLM Synthesizer Demo")
            print("="*70)

            # Process latest run
            cursor = synthesizer.pg.cursor()
            cursor.execute("SELECT run_id FROM ace_runs ORDER BY created_at DESC LIMIT 1")
            row = cursor.fetchone()
            cursor.close()

            if row:
                synthesizer.process_run(row[0])

                # Test search
                synthesizer.search_similar_fixes("Svelte 5 runes state management", top_k=3)
            else:
                print("❌ No ACE runs found")

        elif args.run_id:
            synthesizer.process_run(args.run_id)

        elif args.all:
            synthesizer.process_all_unsummarized()

        elif args.search:
            synthesizer.search_similar_fixes(args.search)

        else:
            parser.print_help()

    finally:
        synthesizer.close()


if __name__ == "__main__":
    main()
