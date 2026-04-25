"""
Codebase Indexer
Scans source code files and indexes them in CouchDB for graph analysis.
"""

import os
import sys
import ast
import re
import logging
from pathlib import Path
from typing import List, Dict, Any, Set
from collections import defaultdict

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.couchdb_client import get_couchdb_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CodebaseIndexer:
    """
    Index Python and TypeScript files into CouchDB for dependency graph analysis.
    """

    def __init__(self):
        self.client = get_couchdb_client()
        self.project_root = Path(__file__).parent.parent.parent
        self.stats = {
            "files_scanned": 0,
            "files_indexed": 0,
            "python_files": 0,
            "typescript_files": 0,
            "errors": 0
        }

    def scan_python_file(self, file_path: Path) -> Dict[str, Any]:
        """Extract metadata from Python file using AST"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            tree = ast.parse(content)

            imports = []
            classes = []
            functions = []

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imports.append(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        imports.append(node.module)
                elif isinstance(node, ast.ClassDef):
                    classes.append(node.name)
                elif isinstance(node, ast.FunctionDef):
                    functions.append(node.name)

            return {
                "imports": list(set(imports)),
                "exports": classes + functions,  # In Python, classes/functions are exports
                "classes": classes,
                "functions": functions,
                "language": "python",
                "lines_of_code": len(content.splitlines())
            }
        except SyntaxError as e:
            logger.warning(f"Syntax error in {file_path}: {e}")
            return {
                "imports": [],
                "exports": [],
                "classes": [],
                "functions": [],
                "language": "python",
                "error": f"SyntaxError: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Error parsing {file_path}: {e}")
            return None

    def scan_typescript_file(self, file_path: Path) -> Dict[str, Any]:
        """Extract metadata from TypeScript/Svelte file using regex"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Extract imports (simplified regex)
            import_pattern = r'import\s+.*?from\s+[\'"]([^\'"]+)[\'"]'
            imports = re.findall(import_pattern, content)

            # Extract exports
            export_pattern = r'export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)'
            exports = re.findall(export_pattern, content)

            # Extract classes
            class_pattern = r'class\s+(\w+)'
            classes = re.findall(class_pattern, content)

            # Extract functions
            function_pattern = r'function\s+(\w+)'
            functions = re.findall(function_pattern, content)

            # Svelte component detection
            is_svelte = file_path.suffix == '.svelte'

            return {
                "imports": list(set(imports)),
                "exports": list(set(exports)),
                "classes": list(set(classes)),
                "functions": list(set(functions)),
                "language": "svelte" if is_svelte else "typescript",
                "lines_of_code": len(content.splitlines()),
                "is_component": is_svelte
            }
        except Exception as e:
            logger.error(f"Error parsing {file_path}: {e}")
            return None

    def get_relative_path(self, file_path: Path) -> str:
        """Get path relative to project root"""
        try:
            return str(file_path.relative_to(self.project_root))
        except ValueError:
            return str(file_path)

    def should_skip(self, file_path: Path) -> bool:
        """Check if file should be skipped"""
        skip_dirs = {
            'node_modules', '.venv', 'venv', '__pycache__',
            'dist', 'build', '.git', '.svelte-kit', 'coverage',
            '.pytest_cache', 'reports'
        }

        # Check if any parent is in skip list
        for parent in file_path.parents:
            if parent.name in skip_dirs:
                return True

        # Skip test files for now
        if 'test' in file_path.name.lower():
            return True

        return False

    def index_file(self, file_path: Path):
        """Index a single file into CouchDB"""
        if self.should_skip(file_path):
            return

        self.stats["files_scanned"] += 1

        # Parse file based on extension
        metadata = None
        if file_path.suffix == '.py':
            metadata = self.scan_python_file(file_path)
            self.stats["python_files"] += 1
        elif file_path.suffix in {'.ts', '.js', '.svelte'}:
            metadata = self.scan_typescript_file(file_path)
            self.stats["typescript_files"] += 1
        else:
            return

        if metadata is None:
            self.stats["errors"] += 1
            return

        # Store in CouchDB
        relative_path = self.get_relative_path(file_path)

        try:
            self.client.store_file_node(
                file_path=relative_path,
                imports=metadata.get("imports", []),
                exports=metadata.get("exports", []),
                classes=metadata.get("classes", []),
                functions=metadata.get("functions", []),
                error_count=0,  # Will be updated by error analysis
                metadata={
                    "language": metadata.get("language"),
                    "lines_of_code": metadata.get("lines_of_code"),
                    "is_component": metadata.get("is_component", False),
                    "error": metadata.get("error")
                }
            )
            self.stats["files_indexed"] += 1

            if self.stats["files_indexed"] % 10 == 0:
                logger.info(f"Indexed {self.stats['files_indexed']} files...")

        except Exception as e:
            logger.error(f"Error storing {relative_path}: {e}")
            self.stats["errors"] += 1

    def index_directory(self, directory: Path):
        """Recursively index all files in a directory"""
        logger.info(f"Indexing directory: {directory}")

        for file_path in directory.rglob('*'):
            if file_path.is_file():
                self.index_file(file_path)

    def print_stats(self):
        """Print indexing statistics"""
        print("\n📊 Indexing Statistics:")
        print("═" * 50)
        print(f"Files scanned: {self.stats['files_scanned']}")
        print(f"Files indexed: {self.stats['files_indexed']}")
        print(f"Python files: {self.stats['python_files']}")
        print(f"TypeScript/Svelte files: {self.stats['typescript_files']}")
        print(f"Errors: {self.stats['errors']}")
        print("═" * 50)


def main():
    """Main indexing routine"""
    print("🚀 Codebase Indexer for CouchDB Graph Analysis")
    print("═" * 50)
    print()

    indexer = CodebaseIndexer()

    # Index key directories
    directories_to_index = [
        indexer.project_root / "backend",
        indexer.project_root / "sveltekit-frontend" / "src",
        indexer.project_root / "granite-docling-worker" / "src",
    ]

    for directory in directories_to_index:
        if directory.exists():
            indexer.index_directory(directory)
        else:
            logger.warning(f"Directory not found: {directory}")

    indexer.print_stats()

    # Show sample queries
    print("\n📝 Sample Queries:")
    print("═" * 50)

    # Top error hotspots
    hotspots = indexer.client.query_error_hotspots(limit=5)
    if hotspots:
        print("\nTop Error Hotspots:")
        for spot in hotspots:
            print(f"  - {spot['path']}: {spot['errors']} errors")
    else:
        print("\nNo error data yet. Run error analysis to populate.")

    print("\n✅ Indexing complete!")
    print("View data: http://localhost:5984/_utils/#database/codebase_graph/_all_docs")


if __name__ == "__main__":
    main()
