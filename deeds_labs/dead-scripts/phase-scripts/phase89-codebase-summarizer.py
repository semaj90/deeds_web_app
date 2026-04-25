#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: Codebase File Summarizer
Generates LLM summaries for all indexed code files in Qdrant
Stores summaries for knowledge graph context
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import os
import requests
import json
from typing import Dict, List
from datetime import datetime
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

class CodebaseSummarizer:
    """Generate LLM summaries for indexed codebase files"""

    def __init__(self):
        self.qdrant = QdrantClient(url="http://localhost:6333")
        self.model = os.getenv("OLLAMA_MODEL", "gemma3:270m")
        self.ollama_url = self.getOllamaEndpoint()

    @staticmethod
    def getOllamaEndpoint() -> str:
        """Get Ollama endpoint from .env"""
        ollama_url = os.getenv("OLLAMA_URL")
        if ollama_url:
            return f"{ollama_url}/api/generate"

        vite_url = os.getenv("VITE_OLLAMA_URL")
        if vite_url:
            return f"{vite_url}/api/generate"

        return "http://localhost:11434/api/generate"

    def get_all_collections(self) -> List[str]:
        """Get all Qdrant collections"""
        collections = self.qdrant.get_collections()
        return [c.name for c in collections.collections]

    def get_code_collections(self) -> List[str]:
        """Get code-related collections only"""
        all_collections = self.get_all_collections()
        code_keywords = ['code', 'ast', 'svelte', 'component', 'route', 'error']

        return [
            name for name in all_collections
            if any(keyword in name.lower() for keyword in code_keywords)
        ]

    def summarize_file_content(self, file_path: str, code_snippet: str, node_type: str = "unknown") -> str:
        """Generate summary for a code file using LLM"""

        # Truncate code snippet if too long
        max_snippet_len = 1000
        if len(code_snippet) > max_snippet_len:
            code_snippet = code_snippet[:max_snippet_len] + "\n... (truncated)"

        prompt = f"""Analyze this {node_type} code file and provide a brief technical summary (2-3 sentences):

File: {file_path}
Type: {node_type}

Code:
```
{code_snippet}
```

Summary (focus on purpose, key functions, dependencies):"""

        try:
            response = requests.post(self.ollama_url, json={
                'model': self.model,
                'prompt': prompt,
                'stream': False,
                'options': {
                    'temperature': 0.3,
                    'top_p': 0.9,
                    'num_predict': 150  # Keep summaries concise
                }
            }, timeout=30)

            if response.status_code == 200:
                result = response.json()
                return result.get('response', '').strip()
            else:
                return f"[ERROR] Failed to generate summary (status {response.status_code})"

        except Exception as e:
            return f"[ERROR] {str(e)}"

    def process_collection(self, collection_name: str, limit: int = 50):
        """Process files from a Qdrant collection"""

        print(f"\n{'='*70}")
        print(f"📦 Collection: {collection_name}")
        print(f"{'='*70}\n")

        try:
            # Get collection info
            collection_info = self.qdrant.get_collection(collection_name)
            total_points = collection_info.points_count

            print(f"Total points: {total_points}")
            print(f"Processing: {min(limit, total_points)} files\n")

            # Scroll through collection
            offset = None
            processed = 0
            summaries = []

            while processed < limit:
                batch_size = min(10, limit - processed)

                scroll_result = self.qdrant.scroll(
                    collection_name=collection_name,
                    limit=batch_size,
                    offset=offset,
                    with_payload=True,
                    with_vectors=False
                )

                points, next_offset = scroll_result

                if not points:
                    break

                for point in points:
                    payload = point.payload
                    file_path = payload.get('file_path', payload.get('path', 'unknown'))
                    node_type = payload.get('type', payload.get('node_type', 'code'))

                    # Get code content
                    code_content = payload.get('code', payload.get('content', payload.get('text', '')))

                    if not code_content or len(code_content.strip()) < 10:
                        print(f"   ⏭️  Skipped: {file_path} (no content)")
                        processed += 1
                        continue

                    print(f"   🤖 Summarizing: {file_path}")
                    summary = self.summarize_file_content(file_path, code_content, node_type)

                    summaries.append({
                        'collection': collection_name,
                        'file_path': file_path,
                        'node_type': node_type,
                        'summary': summary,
                        'point_id': str(point.id),
                        'code_length': len(code_content)
                    })

                    print(f"      ✅ {summary[:80]}...")
                    print()

                    processed += 1

                offset = next_offset
                if offset is None:
                    break

            return summaries

        except Exception as e:
            print(f"   ❌ Error processing collection: {e}")
            return []

    def export_summaries(self, summaries: List[Dict], output_path: str = 'ace_runs/codebase_summaries.json'):
        """Export summaries to JSON"""

        summary_data = {
            'generated_at': datetime.now().isoformat(),
            'model': self.model,
            'total_files': len(summaries),
            'summaries': summaries,
            'collections': list(set(s['collection'] for s in summaries))
        }

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(summary_data, f, indent=2)

        print(f"\n💾 Exported {len(summaries)} summaries to {output_path}")

    def generate_collection_report(self, summaries: List[Dict]):
        """Generate summary report by collection"""

        print(f"\n{'='*70}")
        print("📊 Summary Report")
        print(f"{'='*70}\n")

        # Group by collection
        by_collection = {}
        for s in summaries:
            col = s['collection']
            if col not in by_collection:
                by_collection[col] = []
            by_collection[col].append(s)

        # Print stats
        for collection, items in sorted(by_collection.items()):
            print(f"Collection: {collection}")
            print(f"   Files: {len(items)}")

            # Count by node type
            type_counts = {}
            for item in items:
                node_type = item['node_type']
                type_counts[node_type] = type_counts.get(node_type, 0) + 1

            print(f"   Types:")
            for node_type, count in sorted(type_counts.items(), key=lambda x: x[1], reverse=True):
                print(f"      - {node_type}: {count}")
            print()

        print(f"Total files summarized: {len(summaries)}")
        print(f"Total collections: {len(by_collection)}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Codebase File Summarizer')
    parser.add_argument('--collection', help='Specific collection to process')
    parser.add_argument('--limit', type=int, default=50, help='Max files per collection')
    parser.add_argument('--all', action='store_true', help='Process all code collections')

    args = parser.parse_args()

    summarizer = CodebaseSummarizer()

    print("🚀 Phase 89: Codebase File Summarizer")
    print(f"Model: {summarizer.model}")
    print(f"Endpoint: {summarizer.ollama_url}")
    print("="*70)

    all_summaries = []

    if args.collection:
        # Process specific collection
        summaries = summarizer.process_collection(args.collection, args.limit)
        all_summaries.extend(summaries)

    elif args.all:
        # Process all code collections
        code_collections = summarizer.get_code_collections()
        print(f"\n📦 Found {len(code_collections)} code collections:")
        for col in code_collections:
            print(f"   - {col}")
        print()

        for collection in code_collections:
            summaries = summarizer.process_collection(collection, args.limit)
            all_summaries.extend(summaries)

    else:
        # Default: show available collections
        code_collections = summarizer.get_code_collections()
        print(f"\n📦 Available code collections ({len(code_collections)}):\n")
        for col in code_collections:
            info = summarizer.qdrant.get_collection(col)
            print(f"   {col.ljust(40)} {info.points_count} points")

        print(f"\nUsage:")
        print(f"   --collection <name>    Process specific collection")
        print(f"   --all                  Process all code collections")
        print(f"   --limit N              Max files per collection (default: 50)")
        return

    # Export and report
    if all_summaries:
        summarizer.export_summaries(all_summaries)
        summarizer.generate_collection_report(all_summaries)

        print(f"\n✅ Summary generation complete!")
        print(f"   Output: ace_runs/codebase_summaries.json")
    else:
        print(f"\n⚠️  No files were summarized")


if __name__ == "__main__":
    main()
