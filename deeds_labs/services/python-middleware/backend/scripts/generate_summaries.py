"""
LLM Summary Generator
=====================

Generates AI summaries for code files using Ollama (gemma3-legal).
Stores summaries in CouchDB for RAG retrieval.

Week 2 Features:
- Targets top error files from by_error_count view
- Caches summaries with 7-day TTL
- Extracts key entities (classes, functions, patterns)
- CLI arguments for customization

Usage:
    python scripts/generate_summaries.py --limit 50 --model gemma3-legal:latest
    python scripts/generate_summaries.py --force  # Regenerate all
"""

import os
import sys
import logging
import time
import argparse
import re
import httpx
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.couchdb_client import get_couchdb_client

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SummaryGenerator:
    """Generate LLM summaries for code files using Ollama"""

    def __init__(self, model: str = "gemma3-legal:latest", cache_days: int = 7):
        self.client = get_couchdb_client()
        self.model = model
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.cache_days = cache_days
        self.project_root = Path(__file__).parent.parent.parent  # deeds-web-app
        self.stats = {
            "files_processed": 0,
            "summaries_generated": 0,
            "cached": 0,
            "errors": 0,
            "skipped": 0,
            "total_tokens": 0
        }

    def get_top_error_files(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get files with most errors from CouchDB
        Falls back to all files if no error files found

        Args:
            limit: Maximum number of files to retrieve

        Returns:
            List of file metadata sorted by error count (descending)
        """
        try:
            files = []

            # Get all file documents
            for doc_id in self.client.codebase_graph:
                if doc_id.startswith('_design'):
                    continue

                doc = self.client.codebase_graph[doc_id]
                if doc.get('type') == 'file':
                    files.append({
                        'path': doc.get('path', ''),
                        'errors': doc.get('error_count', 0),
                        'classes': doc.get('classes', []),
                        'functions': doc.get('functions', []),
                        'imports': doc.get('imports', []),
                        'language': doc.get('metadata', {}).get('language', 'unknown'),
                        'lines_of_code': doc.get('metadata', {}).get('lines_of_code', 0)
                    })

                    if len(files) >= limit * 2:  # Get more to sort
                        break

            # Sort by error count (descending)
            files.sort(key=lambda x: x['errors'], reverse=True)

            # Take top N
            files = files[:limit]

            error_count = sum(1 for f in files if f['errors'] > 0)
            logger.info(f"Retrieved {len(files)} files ({error_count} with errors)")
            return files

        except Exception as e:
            logger.error(f"Failed to get files: {e}")
            return []

    def check_summary_cache(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Check if summary exists and is not expired

        Args:
            file_path: Path to file

        Returns:
            Cached summary or None if expired/missing
        """
        try:
            existing = self.client.get_llm_summary(file_path)

            if existing:
                created_at_str = existing.get('created_at', '2000-01-01T00:00:00')
                created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                age_days = (datetime.utcnow() - created_at).days

                if age_days < self.cache_days:
                    logger.info(f"Using cached summary for {file_path} (age: {age_days} days)")
                    return existing
                else:
                    logger.info(f"Summary expired for {file_path} (age: {age_days} days)")

            return None

        except Exception as e:
            logger.warning(f"Failed to check cache for {file_path}: {e}")
            return None

    def extract_key_entities(self, content: str, summary: str, metadata: Dict[str, Any]) -> List[str]:
        """
        Extract key entities from code and summary

        Args:
            content: Source code
            summary: LLM summary
            metadata: File metadata with classes/functions

        Returns:
            List of key entities (classes, functions, patterns)
        """
        entities = set()

        # Add from metadata (highest priority)
        entities.update(metadata.get('classes', [])[:5])
        entities.update(metadata.get('functions', [])[:5])

        # Extract patterns from content
        # Svelte 5 runes
        runes = re.findall(r'\$(?:state|derived|props|effect|inspect)\b', content)
        if runes:
            entities.add('Svelte 5 Runes')

        # React hooks
        hooks = re.findall(r'use[A-Z]\w+', content)
        entities.update(hooks[:3])

        # Extract from summary (capitalized technical terms)
        summary_entities = re.findall(r'\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b', summary)
        entities.update(summary_entities[:5])

        return list(entities)[:15]  # Cap at 15 entities

    def generate_summary(self, file_path: str, content: str, metadata: Dict[str, Any]) -> Optional[str]:
        """
        Generate LLM summary for a code file using Ollama

        Args:
            file_path: Path to file
            content: File content
            metadata: File metadata (classes, functions, imports, error count)

        Returns:
            Summary text or None if error
        """
        try:
            # Truncate content if too long (max 8000 chars for context)
            if len(content) > 8000:
                content = content[:8000] + "\n... (truncated)"

            # Build prompt
            language = metadata.get("language", "unknown")
            functions = metadata.get("functions", [])
            classes = metadata.get("classes", [])
            imports = metadata.get("imports", [])
            error_count = metadata.get("errors", 0)

            prompt = f"""Analyze this {language} code file and provide a concise technical summary.

File: {file_path}
Language: {language}
Error Count: {error_count}
Classes: {', '.join(classes[:10]) if classes else 'None'}
Functions: {', '.join(functions[:15]) if functions else 'None'}
Imports: {', '.join(imports[:10]) if imports else 'None'}

Code:
```{language}
{content}
```

Provide a 3-4 sentence summary covering:
1. Main purpose of this file
2. Key classes/functions and their roles
3. Why this file has {error_count} errors (if applicable)
4. Suggested fixes or improvements

Keep response under 200 words. SUMMARY:"""

            # Generate with Ollama
            response = httpx.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "num_predict": 500,
                        "temperature": 0.3,
                    }
                },
                timeout=120.0
            )

            if response.status_code != 200:
                logger.warning(f"Ollama error for {file_path}: {response.status_code}")
                return None

            data = response.json()
            summary = data.get('response', '').strip()

            if not summary:
                logger.warning(f"Empty summary for {file_path}")
                return None

            # Track tokens
            token_count = data.get('eval_count', 0)
            if token_count:
                self.stats["total_tokens"] += token_count

            logger.info(f"Generated summary for {file_path} ({len(summary)} chars, {token_count} tokens)")
            return summary

        except Exception as e:
            logger.error(f"Failed to generate summary for {file_path}: {e}")
            return None

    def store_summary(
        self,
        file_path: str,
        summary: str,
        key_entities: List[str],
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Store summary in CouchDB llm_summaries database

        Args:
            file_path: Path to file
            summary: LLM summary
            key_entities: Extracted entities
            metadata: Original file metadata

        Returns:
            True if successful
        """
        try:
            self.client.store_llm_summary(
                file_path=file_path,
                summary=summary,
                key_entities=key_entities,
                llm_provider=self.model,  # Store model name as provider
                metadata={
                    'error_count': metadata.get('errors', 0),
                    'classes': metadata.get('classes', []),
                    'functions': metadata.get('functions', []),
                    'language': metadata.get('language', 'unknown'),
                    'lines_of_code': metadata.get('lines_of_code', 0),
                    'generated_at': datetime.utcnow().isoformat()
                }
            )

            logger.info(f"Stored summary for {file_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to store summary for {file_path}: {e}")
            return False

    def run(self, limit: int = 50, force: bool = False) -> Dict[str, Any]:
        """
        Generate summaries for top error files

        Args:
            limit: Number of files to process
            force: Ignore cache and regenerate all summaries

        Returns:
            Statistics dictionary
        """
        logger.info(f"Generating summaries for up to {limit} files...")
        logger.info(f"Model: {self.model}, Cache: {self.cache_days} days, Force: {force}")

        # Get top error files from CouchDB view
        top_files = self.get_top_error_files(limit)
        self.stats['files_processed'] = len(top_files)

        if not top_files:
            logger.warning("No files found in by_error_count view")
            return self.stats

        for i, file_meta in enumerate(top_files, 1):
            file_path = file_meta.get('path', '')

            if not file_path:
                logger.warning(f"Skipping file with no path: {file_meta}")
                self.stats['skipped'] += 1
                continue

            logger.info(f"[{i}/{len(top_files)}] Processing: {file_path}")

            # Check cache
            if not force:
                cached = self.check_summary_cache(file_path)
                if cached:
                    self.stats['cached'] += 1
                    continue

            # Resolve file path
            abs_path = self.project_root / file_path if not Path(file_path).is_absolute() else Path(file_path)

            # Get file content
            try:
                if abs_path.exists():
                    with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                else:
                    # Fallback to content in CouchDB doc
                    content = file_meta.get('content', '')

                if not content:
                    logger.warning(f"Skipping {file_path} - no content")
                    self.stats['skipped'] += 1
                    continue

            except Exception as e:
                logger.warning(f"Failed to read {file_path}: {e}")
                self.stats['skipped'] += 1
                continue

            # Generate summary
            summary = self.generate_summary(str(abs_path), content, file_meta)
            if not summary:
                self.stats['errors'] += 1
                continue

            # Extract entities
            key_entities = self.extract_key_entities(content, summary, file_meta)

            # Store summary
            if self.store_summary(str(file_path), summary, key_entities, file_meta):
                self.stats['summaries_generated'] += 1
            else:
                self.stats['errors'] += 1

            # Rate limit (avoid overwhelming LLM)
            if i % 5 == 0:
                logger.info(f"Progress: {self.stats['summaries_generated']} generated, {self.stats['cached']} cached...")
                time.sleep(0.5)

        return self.stats



def main():
    parser = argparse.ArgumentParser(description='Generate LLM summaries for error-prone files')
    parser.add_argument(
        '--limit',
        type=int,
        default=int(os.getenv('SUMMARY_LIMIT', '50')),
        help='Number of files to process (default: 50)'
    )
    parser.add_argument(
        '--model',
        type=str,
        default='gemma3-legal:latest',
        help='Ollama model to use (default: gemma3-legal:latest)'
    )
    parser.add_argument(
        '--cache-days',
        type=int,
        default=7,
        help='Cache expiry in days (default: 7)'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Force regenerate all summaries (ignore cache)'
    )

    args = parser.parse_args()

    # Create generator
    generator = SummaryGenerator(
        model=args.model,
        cache_days=args.cache_days
    )

    # Run generation
    print("=" * 80)
    print("LLM Summary Generator - Week 2 Agentic RAG")
    print("=" * 80)
    print(f"Model: {args.model}")
    print(f"Limit: {args.limit}")
    print(f"Cache: {args.cache_days} days")
    print(f"Force: {args.force}")
    print(f"Ollama URL: {generator.ollama_url}")
    print("=" * 80)
    print()

    # Check Ollama availability
    try:
        test_response = httpx.get(f"{generator.ollama_url}/api/tags", timeout=5)
        if test_response.status_code == 200:
            models = [m["name"] for m in test_response.json().get("models", [])]
            print(f"✅ Ollama available, models: {', '.join(models[:5])}")
            if args.model not in models:
                print(f"⚠️  Warning: Model '{args.model}' not found in Ollama")
        else:
            print("❌ Ollama not responding")
            return 1
        print()
    except Exception as e:
        print(f"❌ Error: Cannot connect to Ollama: {e}")
        print("Tip: Check that Ollama is running (http://localhost:11434)")
        return 1

    # Run generation
    stats = generator.run(limit=args.limit, force=args.force)

    # Print results
    print()
    print("=" * 80)
    print("RESULTS:")
    print("=" * 80)
    print(f"  Total files: {stats['files_processed']}")
    print(f"  Cached: {stats['cached']}")
    print(f"  Generated: {stats['summaries_generated']}")
    print(f"  Failed: {stats['errors']}")
    print(f"  Skipped: {stats['skipped']}")
    print(f"  Total tokens: {stats['total_tokens']}")
    print("=" * 80)

    # Check CouchDB database
    try:
        info = generator.client.llm_summaries.info()
        print(f"\nLLM Summaries in CouchDB: {info['doc_count']} documents")
    except Exception as e:
        print(f"\nWarning: Could not check CouchDB: {e}")

    if stats['errors'] > 0:
        print(f"\n⚠️  {stats['errors']} files failed - check logs above")
        return 1

    print("\n✅ Summary generation complete!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
