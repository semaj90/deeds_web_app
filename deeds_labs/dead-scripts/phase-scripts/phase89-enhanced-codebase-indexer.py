#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: Enhanced Codebase Indexer with Comment Extraction
Combines ripgrep comments + LLM summaries + embeddinggemma + auto-tagging
Stores in Qdrant with Redis caching for ACE contextual vector search
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import os
import json
import subprocess
import hashlib
import re
import requests
import redis
from typing import Dict, List, Optional
from datetime import datetime
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

class EnhancedCodebaseIndexer:
    """
    Ripgrep comment extraction + LLM summary + embeddinggemma + Qdrant indexing
    """

    def __init__(self):
        self.qdrant = QdrantClient(url="http://localhost:6333")
        self.redis = redis.Redis(host='localhost', port=6379, decode_responses=False)
        self.model = os.getenv("OLLAMA_MODEL", "gemma3:270m")
        self.ollama_url = self.getOllamaEndpoint()
        self.embedding_model = "embeddinggemma:latest"

        # Ensure collection exists
        self._ensure_collection()

    @staticmethod
    def getOllamaEndpoint() -> str:
        """Get Ollama endpoint from .env"""
        ollama_url = os.getenv("OLLAMA_URL", os.getenv("VITE_OLLAMA_URL", "http://localhost:11434"))
        return f"{ollama_url}/api/generate"

    def _ensure_collection(self):
        """Create phase89_codebase_index collection"""
        collection_name = 'phase89_codebase_index'
        try:
            self.qdrant.get_collection(collection_name)
            print(f"✅ Collection {collection_name} exists")
        except:
            print(f"📦 Creating {collection_name} collection...")
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=768, distance=Distance.COSINE)
            )

    def extract_comments_ripgrep(self, file_path: str) -> List[str]:
        """Extract comments using ripgrep with AWK-style processing"""

        comments = []

        # Patterns for different comment styles
        patterns = [
            r'//\s*(.+)',          # Single-line // comments
            r'/\*\*?\s*(.+?)\s*\*/',  # Block /** */ comments (single line)
            r'<!--\s*(.+?)\s*-->',  # HTML/Svelte comments
            r'#\s*(.+)',           # Python/shell comments
        ]

        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()

            # Extract single-line comments
            for pattern in patterns:
                matches = re.findall(pattern, content, re.MULTILINE)
                comments.extend([m.strip() for m in matches if len(m.strip()) > 5])

            # Extract multi-line block comments
            block_pattern = r'/\*\*(.*?)\*/'
            block_matches = re.findall(block_pattern, content, re.DOTALL)
            for block in block_matches:
                lines = [line.strip().lstrip('*').strip() for line in block.split('\n')]
                clean_block = ' '.join([l for l in lines if l and not l.startswith('@')])
                if len(clean_block) > 10:
                    comments.append(clean_block)

        except Exception as e:
            print(f"   ⚠️  Error extracting comments from {file_path}: {e}")

        return comments[:10]  # Limit to top 10 comments

    def generate_llm_summary(self, file_path: str, code_snippet: str, comments: List[str]) -> str:
        """Generate LLM summary combining code + comments"""

        # Build context with comments
        comments_text = "\n".join([f"// {c}" for c in comments[:3]]) if comments else "(no comments found)"

        # Truncate code
        max_code_len = 800
        if len(code_snippet) > max_code_len:
            code_snippet = code_snippet[:max_code_len] + "\n... (truncated)"

        prompt = f"""Analyze this file and generate a concise technical summary (2-3 sentences).

File: {file_path}

Comments extracted:
{comments_text}

Code sample:
```
{code_snippet}
```

Summary (focus on purpose, key exports, and role in the system):"""

        try:
            response = requests.post(self.ollama_url, json={
                'model': self.model,
                'prompt': prompt,
                'stream': False,
                'options': {
                    'temperature': 0.3,
                    'top_p': 0.9,
                    'num_predict': 120
                }
            }, timeout=30)

            if response.status_code == 200:
                result = response.json()
                return result.get('response', '').strip()
            else:
                return f"[ERROR] LLM failed (status {response.status_code})"

        except Exception as e:
            return f"[ERROR] {str(e)}"

    def get_embedding(self, text: str, cache_key: Optional[str] = None) -> Optional[List[float]]:
        """Get embedding with Redis caching"""

        # Check cache first
        if cache_key:
            cached = self.redis.get(f"emb:{cache_key}")
            if cached:
                return json.loads(cached)

        # Generate embedding
        try:
            response = requests.post('http://localhost:11434/api/embeddings', json={
                'model': self.embedding_model,
                'prompt': text
            }, timeout=30)

            if response.status_code == 200:
                embedding = response.json()['embedding']

                # Cache it
                if cache_key:
                    self.redis.setex(
                        f"emb:{cache_key}",
                        86400 * 7,  # 7 days
                        json.dumps(embedding)
                    )

                return embedding

        except Exception as e:
            print(f"   ⚠️  Embedding error: {e}")

        return None

    def auto_tag_file(self, file_path: str, summary: str, comments: List[str]) -> Dict[str, List[str]]:
        """Auto-tag based on file path, summary, and comments"""

        tags = {
            'role': [],
            'surface': [],
            'tech': [],
            'risk': 'low',
            'change_frequency': 'cold'
        }

        # Role detection
        if '+page.svelte' in file_path or '+page.server' in file_path:
            tags['role'].append('route')
        elif '.svelte' in file_path:
            tags['role'].append('ui_component')
        elif '/api/' in file_path or '+server.ts' in file_path:
            tags['role'].append('api_endpoint')
        elif 'schema' in file_path or 'db/' in file_path:
            tags['role'].append('db_schema')
        elif 'service' in file_path or 'client' in file_path:
            tags['role'].append('service')
        elif 'worker' in file_path or 'queue' in file_path:
            tags['role'].append('worker')

        # Surface area detection
        text = f"{file_path} {summary} {' '.join(comments)}".lower()

        if any(x in text for x in ['rag', 'retrieval', 'search', 'vector']):
            tags['surface'].append('rag')
        if any(x in text for x in ['kag', 'knowledge', 'graph']):
            tags['surface'].append('kag')
        if any(x in text for x in ['ace', 'error', 'fix', 'cluster']):
            tags['surface'].append('ace')
        if any(x in text for x in ['ui', 'component', 'svelte']):
            tags['surface'].append('ui')
        if any(x in text for x in ['api', 'endpoint', 'route']):
            tags['surface'].append('api')

        # Tech stack
        if 'qdrant' in text:
            tags['tech'].append('qdrant')
        if 'redis' in text:
            tags['tech'].append('redis')
        if 'postgres' in text or 'drizzle' in text:
            tags['tech'].append('postgres')
        if 'ollama' in text or 'embedding' in text:
            tags['tech'].append('llm')
        if 'svelte' in text or 'rune' in text:
            tags['tech'].append('svelte5')

        # Risk assessment
        if any(x in text for x in ['deprecated', 'legacy', 'todo', 'fixme', 'hack']):
            tags['risk'] = 'high'
        elif any(x in text for x in ['experimental', 'wip', 'draft']):
            tags['risk'] = 'med'

        # Change frequency (heuristic based on file type)
        if '/routes/' in file_path or 'ui/' in file_path:
            tags['change_frequency'] = 'hot'
        elif '/lib/services/' in file_path:
            tags['change_frequency'] = 'warm'

        return tags

    def index_file(self, file_path: str) -> Optional[Dict]:
        """Index a single file: extract comments + generate summary + embed + tag"""

        print(f"\n📄 Indexing: {file_path}")

        # Read file
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                code = f.read()
        except Exception as e:
            print(f"   ❌ Cannot read file: {e}")
            return None

        if len(code.strip()) < 20:
            print(f"   ⏭️  Skipped (too short)")
            return None

        # Extract comments
        print(f"   💬 Extracting comments...")
        comments = self.extract_comments_ripgrep(file_path)
        print(f"      Found {len(comments)} comments")

        # Generate summary
        print(f"   🤖 Generating summary with {self.model}...")
        summary = self.generate_llm_summary(file_path, code[:1500], comments)
        print(f"      {summary[:80]}...")

        # Auto-tag
        print(f"   🏷️  Auto-tagging...")
        tags = self.auto_tag_file(file_path, summary, comments)
        print(f"      Role: {tags['role']}, Surface: {tags['surface']}, Risk: {tags['risk']}")

        # Build signature text for embedding
        signature_parts = [
            f"FILE: {file_path}",
            f"ROLE: {','.join(tags['role']) if tags['role'] else 'unknown'}",
            f"SUMMARY: {summary}",
        ]

        if comments:
            signature_parts.append(f"COMMENTS: {' | '.join(comments[:2])}")

        signature_text = "\n".join(signature_parts)

        # Generate embedding (with caching)
        cache_key = hashlib.md5(signature_text.encode()).hexdigest()
        print(f"   🔢 Generating embedding (cache_key: {cache_key[:12]}...)...")
        embedding = self.get_embedding(signature_text, cache_key)

        if not embedding:
            print(f"   ❌ Embedding failed")
            return None

        print(f"      ✅ Embedding: {len(embedding)}d")

        # Create point
        point_id = hashlib.md5(file_path.encode()).hexdigest()

        point = PointStruct(
            id=point_id,
            vector=embedding,
            payload={
                'file_path': file_path,
                'role': tags['role'],
                'surface': tags['surface'],
                'tech': tags['tech'],
                'risk': tags['risk'],
                'change_frequency': tags['change_frequency'],
                'comments': comments[:5],  # Top 5 comments
                'comments_count': len(comments),
                'llm_summary': summary,
                'signature_text': signature_text,
                'indexed_at': datetime.now().isoformat(),
                'model_used': self.model,
                'code_length': len(code)
            }
        )

        # Upsert to Qdrant
        print(f"   💾 Upserting to Qdrant...")
        self.qdrant.upsert(
            collection_name='phase89_codebase_index',
            points=[point]
        )

        print(f"   ✅ Indexed successfully!")

        return {
            'file_path': file_path,
            'point_id': point_id,
            'summary': summary,
            'tags': tags,
            'comments_count': len(comments)
        }

    def index_directory(self, root_dir: str, file_patterns: List[str] = None, limit: int = 50):
        """Index multiple files from directory using ripgrep to find candidates"""

        if file_patterns is None:
            file_patterns = ['*.ts', '*.svelte', '*.js', '*.py']

        print(f"\n🔍 Finding files in {root_dir}...")
        print(f"   Patterns: {file_patterns}")

        # Use ripgrep to find files
        rg_pattern = '|'.join([p.replace('*', '.*') for p in file_patterns])

        try:
            result = subprocess.run(
                ['rg', '--files', '-g', '*.{ts,svelte,js,py}', root_dir],
                capture_output=True,
                text=True,
                timeout=10
            )

            files = result.stdout.strip().split('\n')
            files = [f for f in files if f and not any(x in f for x in [
                'node_modules', '.svelte-kit', 'dist', 'build', '.git'
            ])]

        except Exception as e:
            print(f"   ⚠️  Ripgrep failed, falling back to glob: {e}")
            import glob
            files = []
            for pattern in file_patterns:
                files.extend(glob.glob(f"{root_dir}/**/{pattern}", recursive=True))

        print(f"   Found {len(files)} files")

        # Process files
        indexed = []
        for i, file_path in enumerate(files[:limit], 1):
            print(f"\n[{i}/{min(limit, len(files))}]")
            result = self.index_file(file_path)
            if result:
                indexed.append(result)

        return indexed

    def search_similar_files(self, query: str, top_k: int = 5) -> List[Dict]:
        """Search for similar files using vector similarity"""

        print(f"\n🔍 Searching for: '{query}'")

        # Get query embedding
        query_embedding = self.get_embedding(query)
        if not query_embedding:
            print("   ❌ Failed to generate query embedding")
            return []

        # Search Qdrant
        results = self.qdrant.search(
            collection_name='phase89_codebase_index',
            query_vector=query_embedding,
            limit=top_k
        )

        print(f"\n📊 Top {len(results)} results:\n")

        similar = []
        for i, result in enumerate(results, 1):
            print(f"{i}. {result.payload['file_path']}")
            print(f"   Score: {result.score:.4f}")
            print(f"   Role: {', '.join(result.payload.get('role', []))}")
            print(f"   Surface: {', '.join(result.payload.get('surface', []))}")
            print(f"   Summary: {result.payload.get('llm_summary', '')[:100]}...")
            print()

            similar.append({
                'file_path': result.payload['file_path'],
                'score': result.score,
                'summary': result.payload.get('llm_summary', ''),
                'role': result.payload.get('role', []),
                'surface': result.payload.get('surface', [])
            })

        return similar


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Enhanced Codebase Indexer')
    parser.add_argument('--file', help='Index specific file')
    parser.add_argument('--dir', help='Index directory', default='src')
    parser.add_argument('--limit', type=int, default=20, help='Max files to index')
    parser.add_argument('--search', help='Search for similar files')

    args = parser.parse_args()

    print("="*80)
    print("🚀 Phase 89: Enhanced Codebase Indexer")
    print("   Ripgrep + Comments + LLM Summary + Embedding + Auto-tagging")
    print("="*80)

    indexer = EnhancedCodebaseIndexer()

    if args.file:
        # Index single file
        indexer.index_file(args.file)

    elif args.search:
        # Search for similar files
        indexer.search_similar_files(args.search, top_k=5)

    else:
        # Index directory
        indexed = indexer.index_directory(args.dir, limit=args.limit)

        print(f"\n{'='*80}")
        print(f"📊 Summary")
        print(f"{'='*80}")
        print(f"Files indexed: {len(indexed)}")

        # Group by role
        by_role = {}
        for item in indexed:
            for role in item['tags']['role']:
                if role not in by_role:
                    by_role[role] = []
                by_role[role].append(item['file_path'])

        print(f"\nBy role:")
        for role, files in sorted(by_role.items()):
            print(f"   {role}: {len(files)} files")

        print(f"\n✅ Indexing complete!")
        print(f"   Collection: phase89_codebase_index")
        print(f"   Embeddings cached in Redis")


if __name__ == "__main__":
    main()
