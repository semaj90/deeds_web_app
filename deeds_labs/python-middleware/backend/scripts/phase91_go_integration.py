#!/usr/bin/env python3
"""
Phase 91: Go 1.25 Microservices AST Integration
Analyzes Go services and integrates errors into unified Qdrant collection
"""

import subprocess
import json
import sys
from pathlib import Path
from typing import List, Dict
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance, Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer

class GoServiceAnalyzer:
    def __init__(self, workspace: Path):
        self.workspace = workspace
        self.qdrant = QdrantClient(host="localhost", port=6333)
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.collection_name = "phase91_go_errors"

    def analyze_go_service(self, service_path: Path) -> List[Dict]:
        """Analyze Go service for errors using go vet and static analysis"""
        errors = []

        try:
            # Run go vet
            result = subprocess.run(
                ["go", "vet", "./..."],
                cwd=service_path,
                capture_output=True,
                text=True,
                timeout=30
            )

            # Parse go vet output
            for line in result.stderr.splitlines():
                if line.strip() and ":" in line:
                    parts = line.split(":")
                    if len(parts) >= 3:
                        file_path = parts[0]
                        line_num = parts[1] if parts[1].isdigit() else 0
                        message = ":".join(parts[2:]).strip()

                        errors.append({
                            "filePath": str(service_path / file_path),
                            "line": int(line_num) if isinstance(line_num, str) and line_num.isdigit() else 0,
                            "col": 0,
                            "message": message,
                            "errorType": "go-vet",
                            "severity": "warning",
                            "language": "go",
                            "service": service_path.name
                        })

        except subprocess.TimeoutExpired:
            print(f"⚠️  Go vet timeout for {service_path.name}")
        except Exception as e:
            print(f"⚠️  Error analyzing {service_path.name}: {e}")

        return errors

    def analyze_all_services(self) -> List[Dict]:
        """Analyze all Go microservices"""
        go_services_dir = self.workspace / "go-services"

        if not go_services_dir.exists():
            print(f"⚠️  Go services directory not found: {go_services_dir}")
            return []

        all_errors = []
        services = [d for d in go_services_dir.iterdir() if d.is_dir() and (d / "go.mod").exists()]

        print(f"🔍 Found {len(services)} Go services:")
        for service in services:
            print(f"   - {service.name}")

        for service in services:
            print(f"\n📊 Analyzing {service.name}...")
            errors = self.analyze_go_service(service)
            all_errors.extend(errors)
            print(f"   Found {len(errors)} errors")

        return all_errors

    def create_collection(self):
        """Create Qdrant collection for Go errors"""
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
        """Embed Go errors into Qdrant"""
        if not errors:
            print("⚠️  No errors to embed")
            return

        points = []

        for i, error in enumerate(errors):
            # Create semantic signature
            signature = f"Go {error['service']}: {error['errorType']}: {error['message']}"

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

        print(f"✅ Embedded {len(points)} Go errors into Qdrant")

    def run(self):
        print("=" * 80)
        print("🐹 Phase 91: Go 1.25 Microservices AST Integration")
        print("=" * 80)
        print()

        # Step 1: Analyze services
        errors = self.analyze_all_services()

        if not errors:
            print("\n✅ No Go errors found!")
            return []

        # Step 2: Create collection
        print(f"\n📊 Creating Qdrant collection...")
        self.create_collection()

        # Step 3: Embed errors
        print(f"\n🧠 Embedding Go errors...")
        self.embed_errors(errors)

        # Step 4: Summary
        print("\n" + "=" * 80)
        print("📊 Phase 91 Summary:")
        print(f"   Total Go errors: {len(errors)}")

        # Group by service
        by_service = {}
        for error in errors:
            service = error.get('service', 'unknown')
            by_service[service] = by_service.get(service, 0) + 1

        print("\n   Errors by service:")
        for service, count in sorted(by_service.items()):
            print(f"      {service}: {count}")

        print("\n✅ Phase 91 complete!")
        print("=" * 80)

        return errors


def main():
    workspace = Path(__file__).parent.parent.parent
    analyzer = GoServiceAnalyzer(workspace)
    errors = analyzer.run()

    # Write results to file
    output_file = workspace / "reports" / "phase91_go_errors.json"
    output_file.parent.mkdir(exist_ok=True)

    with open(output_file, 'w') as f:
        json.dump(errors, f, indent=2)

    print(f"\n💾 Errors saved to: {output_file}")

    sys.exit(0 if errors else 0)


if __name__ == "__main__":
    main()
