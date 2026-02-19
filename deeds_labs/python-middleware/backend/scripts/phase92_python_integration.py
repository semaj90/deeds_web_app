#!/usr/bin/env python3
"""
Phase 92: Python ML Pipeline AST Integration
Analyzes Python files for type hints, errors, and integrates into Qdrant
"""

import ast
import json
import sys
from pathlib import Path
from typing import List, Dict
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from sentence_transformers import SentenceTransformer

class PythonASTAnalyzer:
    def __init__(self, workspace: Path):
        self.workspace = workspace
        self.qdrant = QdrantClient(host="localhost", port=6333)
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.collection_name = "phase92_python_errors"
        self.errors = []

    def analyze_file(self, file_path: Path) -> List[Dict]:
        """Analyze single Python file for errors"""
        errors = []

        try:
            content = file_path.read_text(encoding='utf-8')
            tree = ast.parse(content, filename=str(file_path))
        except SyntaxError as e:
            return [{
                "filePath": str(file_path),
                "line": e.lineno or 0,
                "col": e.offset or 0,
                "message": e.msg,
                "errorType": "syntax-error",
                "severity": "error",
                "language": "python"
            }]
        except Exception as e:
            return [{
                "filePath": str(file_path),
                "line": 0,
                "col": 0,
                "message": str(e),
                "errorType": "parse-error",
                "severity": "error",
                "language": "python"
            }]

        # Analyze AST
        for node in ast.walk(tree):
            # Check for missing type hints on functions
            if isinstance(node, ast.FunctionDef):
                # Skip __init__ and private methods
                if node.name.startswith('_'):
                    continue

                # Check return type
                if node.returns is None:
                    errors.append({
                        "filePath": str(file_path),
                        "line": node.lineno,
                        "col": node.col_offset,
                        "message": f"Function '{node.name}' missing return type annotation",
                        "errorType": "missing-return-type",
                        "severity": "info",
                        "language": "python"
                    })

                # Check parameter types
                for arg in node.args.args:
                    if arg.annotation is None and arg.arg != "self" and arg.arg != "cls":
                        errors.append({
                            "filePath": str(file_path),
                            "line": arg.lineno,
                            "col": arg.col_offset,
                            "message": f"Parameter '{arg.arg}' in '{node.name}' missing type annotation",
                            "errorType": "missing-param-type",
                            "severity": "info",
                            "language": "python"
                        })

        return errors

    def analyze_workspace(self) -> List[Dict]:
        """Analyze all Python files in backend/"""
        backend_dir = self.workspace / "backend"

        if not backend_dir.exists():
            print(f"⚠️  Backend directory not found: {backend_dir}")
            return []

        all_errors = []
        python_files = list(backend_dir.rglob("*.py"))

        # Filter out venv and node_modules
        python_files = [
            f for f in python_files
            if ".venv" not in str(f) and "node_modules" not in str(f)
        ]

        print(f"🔍 Found {len(python_files)} Python files")

        for i, py_file in enumerate(python_files, 1):
            if i % 10 == 0:
                print(f"   Analyzed {i}/{len(python_files)} files...")

            errors = self.analyze_file(py_file)
            all_errors.extend(errors)

        return all_errors

    def create_collection(self):
        """Create Qdrant collection for Python errors"""
        try:
            self.qdrant.get_collection(self.collection_name)
            print(f"✅ Collection {self.collection_name} already exists")
        except:
            self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE)
            )
            print(f"✅ Created collection: {self.collection_name}")

    def embed_errors(self, errors: List[Dict]):
        """Embed Python errors into Qdrant"""
        if not errors:
            print("⚠️  No errors to embed")
            return

        points = []

        for i, error in enumerate(errors):
            # Create semantic signature
            signature = f"Python {error['errorType']}: {error['message']}"

            # Embed with sentence-transformers
            embedding = self.model.encode(signature)

            # Create Qdrant point
            points.append(PointStruct(
                id=i,
                vector=embedding.tolist(),
                payload=error
            ))

        # Batch upsert
        self.qdrant.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True
        )

        print(f"✅ Embedded {len(points)} Python errors into Qdrant")

    def run(self):
        print("=" * 80)
        print("🐍 Phase 92: Python ML Pipeline AST Integration")
        print("=" * 80)
        print()

        # Step 1: Analyze Python files
        errors = self.analyze_workspace()

        if not errors:
            print("\n✅ No Python errors found!")
            return []

        # Step 2: Create collection
        print(f"\n📊 Creating Qdrant collection...")
        self.create_collection()

        # Step 3: Embed errors
        print(f"\n🧠 Embedding Python errors...")
        self.embed_errors(errors)

        # Step 4: Summary
        print("\n" + "=" * 80)
        print("📊 Phase 92 Summary:")
        print(f"   Total Python errors: {len(errors)}")

        # Group by error type
        by_type = {}
        for error in errors:
            error_type = error.get('errorType', 'unknown')
            by_type[error_type] = by_type.get(error_type, 0) + 1

        print("\n   Errors by type:")
        for error_type, count in sorted(by_type.items(), key=lambda x: -x[1]):
            print(f"      {error_type}: {count}")

        print("\n✅ Phase 92 complete!")
        print("=" * 80)

        return errors


def main():
    workspace = Path(__file__).parent.parent.parent
    analyzer = PythonASTAnalyzer(workspace)
    errors = analyzer.run()

    # Write results to file
    output_file = workspace / "reports" / "phase92_python_errors.json"
    output_file.parent.mkdir(exist_ok=True)

    with open(output_file, 'w') as f:
        json.dump(errors, f, indent=2)

    print(f"\n💾 Errors saved to: {output_file}")

    sys.exit(0)


if __name__ == "__main__":
    main()
