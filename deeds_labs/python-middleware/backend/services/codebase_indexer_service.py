#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Codebase Indexer Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: File watching and codebase indexing pipeline
Task: 11.1 - Create file watcher service
Task: 11.2 - Create indexing pipeline
Task: 11.3 - Create semantic search API
═══════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
import asyncio
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, asdict, field
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent, FileDeletedEvent
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class IndexedFile:
    """Represents an indexed file in the knowledge base."""
    file_path: str
    file_hash: str
    category: str
    size_bytes: int
    line_count: int
    imports: List[str]
    exports: List[str]
    functions: List[str]
    components: List[str]
    comments: List[str]
    todos: List[str]
    summary: str
    embedding_id: Optional[str]
    indexed_at: str
    last_modified: str


@dataclass
class SearchResult:
    """Result from semantic search."""
    file_path: str
    score: float
    summary: str
    category: str
    snippet: str
    highlights: List[str]


@dataclass
class IndexingStats:
    """Statistics about indexing operation."""
    total_files: int
    indexed_files: int
    skipped_files: int
    failed_files: int
    duration_seconds: float
    started_at: str
    completed_at: str


class CodebaseFileHandler(FileSystemEventHandler):
    """
    File system event handler for codebase changes.
    Triggers re-indexing when files change.
    """

    WATCHED_EXTENSIONS = {'.ts', '.tsx', '.svelte', '.js', '.jsx', '.py', '.go'}
    IGNORED_DIRS = {'node_modules', '.git', '.svelte-kit', 'dist', 'build', '__pycache__', '.venv'}

    def __init__(self, indexer: 'CodebaseIndexerService'):
        self.indexer = indexer
        self.pending_files: Set[str] = set()
        self._debounce_task: Optional[asyncio.Task] = None

    def _should_process(self, path: str) -> bool:
        """Check if file should be processed."""
        path_obj = Path(path)

        # Check extension
        if path_obj.suffix not in self.WATCHED_EXTENSIONS:
            return False

        # Check ignored directories
        for part in path_obj.parts:
            if part in self.IGNORED_DIRS:
                return False

        return True

    def on_modified(self, event):
        if not event.is_directory and self._should_process(event.src_path):
            self.pending_files.add(event.src_path)
            self._schedule_processing()

    def on_created(self, event):
        if not event.is_directory and self._should_process(event.src_path):
            self.pending_files.add(event.src_path)
            self._schedule_processing()

    def on_deleted(self, event):
        if not event.is_directory and self._should_process(event.src_path):
            # Mark for removal from index
            asyncio.create_task(self.indexer.remove_from_index(event.src_path))

    def _schedule_processing(self):
        """Debounce file processing to avoid rapid re-indexing."""
        if self._debounce_task:
            self._debounce_task.cancel()

        async def process_pending():
            await asyncio.sleep(1.0)  # 1 second debounce
            files = list(self.pending_files)
            self.pending_files.clear()
            for file_path in files:
                await self.indexer.index_file(file_path)

        self._debounce_task = asyncio.create_task(process_pending())


class CodebaseIndexerService:
    """
    Codebase Indexer Service - Index and search codebase files.

    Features:
    - File watching with debounced re-indexing
    - AST analysis integration
    - Comment and pattern extraction
    - Semantic search via Qdrant
    - Multi-database storage
    """

    OLLAMA_URL = "http://localhost:11434"
    EMBEDDING_MODEL = "embeddinggemma:latest"
    QDRANT_URL = "http://localhost:6333"
    QDRANT_COLLECTION = "fastmcp_file_profiles"

    def __init__(
        self,
        workspace_root: Optional[str] = None,
        ollama_url: Optional[str] = None,
        qdrant_url: Optional[str] = None
    ):
        """Initialize codebase indexer."""
        self.workspace_root = workspace_root or os.getcwd()
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", self.OLLAMA_URL)
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", self.QDRANT_URL)

        self.indexed_files: Dict[str, IndexedFile] = {}
        self.observer: Optional[Observer] = None
        self.file_handler: Optional[CodebaseFileHandler] = None

        logger.info(f"📁 CodebaseIndexerService initialized (root: {self.workspace_root})")

    def start_watching(self):
        """Start watching the workspace for file changes."""
        if self.observer:
            logger.warning("File watcher already running")
            return

        self.file_handler = CodebaseFileHandler(self)
        self.observer = Observer()
        self.observer.schedule(self.file_handler, self.workspace_root, recursive=True)
        self.observer.start()

        logger.info(f"👁️ Started watching: {self.workspace_root}")

    def stop_watching(self):
        """Stop watching for file changes."""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None
            self.file_handler = None
            logger.info("🛑 Stopped file watcher")

    def _compute_file_hash(self, file_path: str) -> str:
        """Compute MD5 hash of file contents."""
        try:
            with open(file_path, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return ""

    def _detect_category(self, file_path: str) -> str:
        """Detect file category based on path and extension."""
        path = Path(file_path)
        ext = path.suffix.lower()

        # Check path patterns
        path_str = str(path).lower()

        if 'test' in path_str or 'spec' in path_str:
            return 'test'
        if 'route' in path_str or '+page' in path.name or '+layout' in path.name:
            return 'route'
        if 'component' in path_str or ext == '.svelte':
            return 'component'
        if 'store' in path_str:
            return 'store'
        if 'service' in path_str or 'api' in path_str:
            return 'service'
        if 'util' in path_str or 'helper' in path_str:
            return 'utility'
        if 'type' in path_str or path.name.endswith('.d.ts'):
            return 'types'
        if ext == '.py':
            return 'python'
        if ext == '.go':
            return 'go'

        return 'source'

    def _extract_imports(self, content: str, ext: str) -> List[str]:
        """Extract import statements from file content."""
        imports = []
        lines = content.split('\n')

        for line in lines:
            line = line.strip()
            if ext in ['.ts', '.tsx', '.js', '.jsx', '.svelte']:
                if line.startswith('import ') or line.startswith('from '):
                    imports.append(line)
            elif ext == '.py':
                if line.startswith('import ') or line.startswith('from '):
                    imports.append(line)
            elif ext == '.go':
                if line.startswith('import '):
                    imports.append(line)

        return imports[:20]  # Limit to 20 imports

    def _extract_exports(self, content: str, ext: str) -> List[str]:
        """Extract export statements from file content."""
        exports = []
        lines = content.split('\n')

        for line in lines:
            line = line.strip()
            if ext in ['.ts', '.tsx', '.js', '.jsx', '.svelte']:
                if line.startswith('export '):
                    # Extract export name
                    exports.append(line[:100])

        return exports[:20]

    def _extract_functions(self, content: str, ext: str) -> List[str]:
        """Extract function names from file content."""
        functions = []
        lines = content.split('\n')

        for line in lines:
            line = line.strip()
            if ext in ['.ts', '.tsx', '.js', '.jsx']:
                if 'function ' in line or '=>' in line:
                    # Simple extraction
                    if 'function ' in line:
                        parts = line.split('function ')
                        if len(parts) > 1:
                            name = parts[1].split('(')[0].strip()
                            if name:
                                functions.append(name)
            elif ext == '.py':
                if line.startswith('def ') or line.startswith('async def '):
                    name = line.replace('async ', '').replace('def ', '').split('(')[0].strip()
                    if name:
                        functions.append(name)
            elif ext == '.go':
                if line.startswith('func '):
                    name = line.replace('func ', '').split('(')[0].strip()
                    if name:
                        functions.append(name)

        return functions[:30]

    def _extract_comments(self, content: str) -> List[str]:
        """Extract comments from file content."""
        comments = []
        lines = content.split('\n')

        for line in lines:
            line = line.strip()
            if line.startswith('//') or line.startswith('#'):
                comments.append(line[2:].strip())
            elif line.startswith('/*') or line.startswith('"""') or line.startswith("'''"):
                comments.append(line)

        return comments[:20]

    def _extract_todos(self, content: str) -> List[str]:
        """Extract TODO/FIXME markers from file content."""
        todos = []
        lines = content.split('\n')

        for i, line in enumerate(lines):
            line_upper = line.upper()
            if 'TODO' in line_upper or 'FIXME' in line_upper or 'HACK' in line_upper:
                todos.append(f"L{i+1}: {line.strip()}")

        return todos[:10]

    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using Ollama."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/embeddings",
                    json={"model": self.EMBEDDING_MODEL, "prompt": text},
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("embedding", [])
        except Exception as e:
            logger.warning(f"Failed to generate embedding: {e}")
        return []

    async def _generate_summary(self, file_path: str, content: str) -> str:
        """Generate AI summary for file."""
        # Simple summary based on content analysis
        path = Path(file_path)
        category = self._detect_category(file_path)
        functions = self._extract_functions(content, path.suffix)
        imports = self._extract_imports(content, path.suffix)

        summary_parts = [f"{category.title()} file: {path.name}"]

        if functions:
            summary_parts.append(f"Functions: {', '.join(functions[:5])}")
        if imports:
            summary_parts.append(f"Imports: {len(imports)} modules")

        return ". ".join(summary_parts)

    async def index_file(self, file_path: str) -> Optional[IndexedFile]:
        """
        Index a single file.

        Args:
            file_path: Path to file to index

        Returns:
            IndexedFile or None if failed
        """
        try:
            path = Path(file_path)
            if not path.exists():
                return None

            # Read file content
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                logger.warning(f"Cannot read file (encoding): {file_path}")
                return None

            # Compute hash to check if changed
            file_hash = self._compute_file_hash(file_path)
            if file_path in self.indexed_files:
                if self.indexed_files[file_path].file_hash == file_hash:
                    logger.debug(f"Skipping unchanged file: {file_path}")
                    return self.indexed_files[file_path]

            # Extract metadata
            ext = path.suffix.lower()
            lines = content.split('\n')

            indexed = IndexedFile(
                file_path=file_path,
                file_hash=file_hash,
                category=self._detect_category(file_path),
                size_bytes=len(content.encode('utf-8')),
                line_count=len(lines),
                imports=self._extract_imports(content, ext),
                exports=self._extract_exports(content, ext),
                functions=self._extract_functions(content, ext),
                components=[],  # Would need AST for accurate extraction
                comments=self._extract_comments(content),
                todos=self._extract_todos(content),
                summary=await self._generate_summary(file_path, content),
                embedding_id=None,
                indexed_at=datetime.now().isoformat(),
                last_modified=datetime.fromtimestamp(path.stat().st_mtime).isoformat()
            )

            # Store in memory
            self.indexed_files[file_path] = indexed

            logger.debug(f"  ✓ Indexed: {file_path}")
            return indexed

        except Exception as e:
            logger.error(f"Failed to index {file_path}: {e}")
            return None

    async def remove_from_index(self, file_path: str):
        """Remove a file from the index."""
        if file_path in self.indexed_files:
            del self.indexed_files[file_path]
            logger.info(f"  ✓ Removed from index: {file_path}")

    async def index_directory(
        self,
        directory: Optional[str] = None,
        extensions: Optional[Set[str]] = None
    ) -> IndexingStats:
        """
        Index all files in a directory.

        Args:
            directory: Directory to index (default: workspace root)
            extensions: File extensions to index

        Returns:
            IndexingStats with results
        """
        import time
        start_time = time.time()
        started_at = datetime.now().isoformat()

        directory = directory or self.workspace_root
        extensions = extensions or {'.ts', '.tsx', '.svelte', '.js', '.py', '.go'}

        logger.info(f"📂 Indexing directory: {directory}")

        total_files = 0
        indexed_files = 0
        skipped_files = 0
        failed_files = 0

        ignored_dirs = {'node_modules', '.git', '.svelte-kit', 'dist', 'build', '__pycache__', '.venv'}

        for root, dirs, files in os.walk(directory):
            # Skip ignored directories
            dirs[:] = [d for d in dirs if d not in ignored_dirs]

            for file in files:
                file_path = os.path.join(root, file)
                ext = Path(file).suffix.lower()

                if ext not in extensions:
                    continue

                total_files += 1

                result = await self.index_file(file_path)
                if result:
                    indexed_files += 1
                else:
                    failed_files += 1

                # Progress logging
                if total_files % 100 == 0:
                    logger.info(f"  Progress: {total_files} files processed")

        duration = time.time() - start_time

        stats = IndexingStats(
            total_files=total_files,
            indexed_files=indexed_files,
            skipped_files=skipped_files,
            failed_files=failed_files,
            duration_seconds=duration,
            started_at=started_at,
            completed_at=datetime.now().isoformat()
        )

        logger.info(f"✅ Indexing complete: {indexed_files}/{total_files} files in {duration:.1f}s")

        return stats

    async def semantic_search(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[SearchResult]:
        """
        Search indexed files using semantic similarity.

        Args:
            query: Search query
            top_k: Number of results
            filters: Optional filters (category, etc.)

        Returns:
            List of SearchResult
        """
        from qdrant_client import QdrantClient

        logger.info(f"🔍 Semantic search: '{query}' (top_k={top_k})")

        # Generate query embedding
        query_embedding = await self._generate_embedding(query)
        if not query_embedding:
            logger.warning("Failed to generate query embedding")
            return []

        # Search Qdrant
        try:
            client = QdrantClient(url=self.qdrant_url)

            # Build filter if provided
            qdrant_filter = None
            if filters:
                from qdrant_client.models import Filter, FieldCondition, MatchValue
                conditions = []
                if 'category' in filters:
                    conditions.append(
                        FieldCondition(key="category", match=MatchValue(value=filters['category']))
                    )
                if conditions:
                    qdrant_filter = Filter(must=conditions)

            results = client.search(
                collection_name=self.QDRANT_COLLECTION,
                query_vector=query_embedding,
                limit=top_k,
                query_filter=qdrant_filter,
                with_payload=True
            )

            search_results = []
            for hit in results:
                payload = hit.payload or {}
                search_results.append(SearchResult(
                    file_path=payload.get("file_path", "unknown"),
                    score=hit.score,
                    summary=payload.get("summary", ""),
                    category=payload.get("category", "unknown"),
                    snippet=payload.get("snippet", "")[:200],
                    highlights=[]
                ))

            logger.info(f"  ✓ Found {len(search_results)} results")
            return search_results

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    def get_indexed_files(self) -> List[IndexedFile]:
        """Get all indexed files."""
        return list(self.indexed_files.values())

    def get_stats(self) -> Dict[str, Any]:
        """Get indexing statistics."""
        categories = {}
        total_lines = 0
        total_functions = 0

        for indexed in self.indexed_files.values():
            categories[indexed.category] = categories.get(indexed.category, 0) + 1
            total_lines += indexed.line_count
            total_functions += len(indexed.functions)

        return {
            "total_files": len(self.indexed_files),
            "categories": categories,
            "total_lines": total_lines,
            "total_functions": total_functions,
            "workspace_root": self.workspace_root
        }


# Example usage
async def example_usage():
    """Example of using the CodebaseIndexerService."""
    service = CodebaseIndexerService()

    # Index a small directory
    stats = await service.index_directory(
        directory="backend/services",
        extensions={'.py'}
    )

    print(f"\n✅ Indexing Stats:")
    print(f"   Total: {stats.total_files}")
    print(f"   Indexed: {stats.indexed_files}")
    print(f"   Duration: {stats.duration_seconds:.1f}s")

    # Get stats
    index_stats = service.get_stats()
    print(f"\n✅ Index Stats:")
    print(f"   Files: {index_stats['total_files']}")
    print(f"   Categories: {index_stats['categories']}")

    # Search
    results = await service.semantic_search("clustering service", top_k=3)
    print(f"\n✅ Search Results:")
    for r in results:
        print(f"   {r.file_path} (score={r.score:.3f})")


if __name__ == "__main__":
    asyncio.run(example_usage())
