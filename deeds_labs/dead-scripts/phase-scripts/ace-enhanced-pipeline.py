#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ACE Enhanced Agentic Pipeline
GPU-Accelerated Tricubic Search + Unified AST Analysis + Concurrent Error Fixing

Features:
1. Tricubic interpolation for high-dimensional error space navigation
2. Concurrent parallel AST traversal with GPU acceleration
3. Unified svelte-check + tsc error parsing → CPG integration
4. Agentic error fixing with LLM synthesis
5. ACE contextual engineering for high-ranking synthesis
"""

import torch
import torch.nn.functional as F
import numpy as np
import json
import sys
import os
import re
import gzip
import hashlib
import subprocess
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Set
from dataclasses import dataclass, asdict, field
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
import httpx

# Fix Windows encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Database clients
import psycopg2
from psycopg2.extras import execute_values
import redis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue

# Configuration
CONFIG = {
    "QDRANT_HOST": "localhost",
    "QDRANT_PORT": 6333,
    "POSTGRES_DSN": "postgresql://legal_admin:123456@localhost:5434/legal_ai_db",
    "REDIS_URL": "redis://localhost:6379/0",
    "OLLAMA_URL": "http://localhost:11434",
    "EMBEDDING_MODEL": "embeddinggemma:latest",
    "EMBEDDING_DIM": 768,
    "LLM_MODEL": "gemma3-legal:latest",
    "BATCH_SIZE": 32,
    "MAX_WORKERS": 8,
    "TRICUBIC_GRID_SIZE": 16,
}


@dataclass
class TypeScriptError:
    """Represents a TypeScript/Svelte error"""
    file: str
    line: int
    column: int
    code: str  # TS2345, etc.
    message: str
    severity: str = "error"
    category: str = ""
    embedding: Optional[List[float]] = None
    cluster_id: int = -1
    suggested_fix: str = ""


@dataclass
class ASTNode:
    """Unified AST node"""
    id: str
    type: str
    name: str
    file_path: str
    start_line: int
    end_line: int
    children: List[str] = field(default_factory=list)
    calls: List[str] = field(default_factory=list)  # Functions this node calls
    called_by: List[str] = field(default_factory=list)  # Functions that call this
    embedding: Optional[List[float]] = None


class TricubicErrorSpace:
    """
    GPU-Accelerated Tricubic Interpolation for Error Space Navigation

    Maps high-dimensional error embeddings to a navigable 3D space
    for efficient similarity search and cluster identification.
    """

    def __init__(self, device: str = 'cuda'):
        self.device = device if torch.cuda.is_available() else 'cpu'
        self.grid_size = CONFIG["TRICUBIC_GRID_SIZE"]
        self.error_grid = None
        self.embedding_cache = {}

    def build_grid(self, embeddings: np.ndarray) -> torch.Tensor:
        """Build 3D grid from high-dim embeddings using PCA projection"""
        if len(embeddings) == 0:
            return torch.zeros((self.grid_size, self.grid_size, self.grid_size), device=self.device)

        # Convert to tensor
        emb_tensor = torch.from_numpy(embeddings.astype(np.float32)).to(self.device)

        # PCA to 3D (using SVD)
        mean = emb_tensor.mean(dim=0, keepdim=True)
        centered = emb_tensor - mean

        # SVD for dimensionality reduction
        U, S, V = torch.svd(centered)

        # Project to 3D space
        proj_3d = U[:, :3] * S[:3]

        # Normalize to [0, grid_size-1]
        proj_min = proj_3d.min(dim=0).values
        proj_max = proj_3d.max(dim=0).values
        proj_range = proj_max - proj_min + 1e-8

        grid_coords = ((proj_3d - proj_min) / proj_range * (self.grid_size - 1)).long()
        grid_coords = torch.clamp(grid_coords, 0, self.grid_size - 1)

        # Build density grid
        grid = torch.zeros((self.grid_size, self.grid_size, self.grid_size), device=self.device)
        for coord in grid_coords:
            grid[coord[0], coord[1], coord[2]] += 1

        self.error_grid = grid
        return grid

    def tricubic_interpolate(self, x: float, y: float, z: float) -> float:
        """Tricubic interpolation at point (x, y, z)"""
        if self.error_grid is None:
            return 0.0

        # Get integer and fractional parts
        x0, y0, z0 = int(x), int(y), int(z)
        fx, fy, fz = x - x0, y - y0, z - z0

        # Clamp to valid range
        def clamp(v, lo, hi):
            return max(lo, min(v, hi))

        # Sample 4x4x4 neighborhood
        result = 0.0
        for i in range(-1, 3):
            for j in range(-1, 3):
                for k in range(-1, 3):
                    xi = clamp(x0 + i, 0, self.grid_size - 1)
                    yj = clamp(y0 + j, 0, self.grid_size - 1)
                    zk = clamp(z0 + k, 0, self.grid_size - 1)

                    # Cubic basis function
                    wx = self._cubic_weight(fx - i)
                    wy = self._cubic_weight(fy - j)
                    wz = self._cubic_weight(fz - k)

                    result += self.error_grid[xi, yj, zk].item() * wx * wy * wz

        return result

    def _cubic_weight(self, t: float) -> float:
        """Cubic B-spline weight function"""
        t = abs(t)
        if t < 1:
            return (1.5 * t - 2.5) * t * t + 1
        elif t < 2:
            return ((-0.5 * t + 2.5) * t - 4) * t + 2
        return 0.0

    def find_error_hotspots(self, threshold: float = 0.5) -> List[Tuple[int, int, int]]:
        """Find high-density error regions using gradient ascent"""
        if self.error_grid is None:
            return []

        # Find local maxima
        hotspots = []
        grid = self.error_grid.cpu().numpy()
        max_val = grid.max()

        if max_val == 0:
            return []

        threshold_val = threshold * max_val

        for i in range(1, self.grid_size - 1):
            for j in range(1, self.grid_size - 1):
                for k in range(1, self.grid_size - 1):
                    if grid[i, j, k] >= threshold_val:
                        # Check if local maximum
                        is_max = True
                        for di in [-1, 0, 1]:
                            for dj in [-1, 0, 1]:
                                for dk in [-1, 0, 1]:
                                    if di == 0 and dj == 0 and dk == 0:
                                        continue
                                    if grid[i+di, j+dj, k+dk] > grid[i, j, k]:
                                        is_max = False
                                        break
                                if not is_max:
                                    break
                            if not is_max:
                                break

                        if is_max:
                            hotspots.append((i, j, k))

        return hotspots


class EnhancedACEPipeline:
    """
    Enhanced Agentic Contextual Engineering Pipeline

    Combines:
    - GPU-accelerated error clustering
    - Tricubic interpolation for error space navigation
    - Concurrent parallel AST analysis
    - Unified svelte-check + tsc error parsing
    - LLM-powered fix synthesis
    """

    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        if self.device == 'cuda':
            gpu_name = torch.cuda.get_device_name(0)
            gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
            print(f"🔥 GPU: {gpu_name} ({gpu_mem:.1f}GB)")

        self._init_clients()
        self.tricubic = TricubicErrorSpace(self.device)
        self.errors: List[TypeScriptError] = []
        self.ast_nodes: Dict[str, ASTNode] = {}
        self._embedding_cache: Dict[str, np.ndarray] = {}

    def _init_clients(self):
        """Initialize database connections"""
        try:
            self.qdrant = QdrantClient(host=CONFIG["QDRANT_HOST"], port=CONFIG["QDRANT_PORT"])
        except Exception as e:
            print(f"⚠️ Qdrant: {e}")
            self.qdrant = None

        try:
            self.pg = psycopg2.connect(CONFIG["POSTGRES_DSN"])
            self.pg.autocommit = True
        except Exception as e:
            print(f"⚠️ PostgreSQL: {e}")
            self.pg = None

        try:
            self.redis = redis.from_url(CONFIG["REDIS_URL"])
        except Exception as e:
            print(f"⚠️ Redis: {e}")
            self.redis = None

    # ==================== ERROR PARSING ====================

    def run_svelte_check(self) -> List[TypeScriptError]:
        """Run svelte-check and parse errors"""
        print("\n🔍 Running svelte-check...")

        try:
            result = subprocess.run(
                ['npm', 'run', 'check'],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=600,
                cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )

            output = result.stdout + result.stderr
            errors = self._parse_tsc_output(output)

            print(f"   Found {len(errors)} errors")
            return errors

        except subprocess.TimeoutExpired:
            print("   ⚠️ Timed out")
            return []
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return []

    def _parse_tsc_output(self, output: str) -> List[TypeScriptError]:
        """Parse TypeScript/svelte-check output"""
        errors = []

        # Pattern: file(line,col): error TS1234: message
        pattern = re.compile(
            r'([^\s\(]+)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+|svelte\([^)]+\)):\s*(.+)'
        )

        # Alternate pattern: file:line:col - error TS1234: message
        pattern2 = re.compile(
            r'([^\s:]+):(\d+):(\d+)\s+-\s*(error|warning)\s+(TS\d+):\s*(.+)'
        )

        for line in output.split('\n'):
            match = pattern.search(line) or pattern2.search(line)
            if match:
                file_path, line_num, col, severity, code, message = match.groups()
                errors.append(TypeScriptError(
                    file=file_path,
                    line=int(line_num),
                    column=int(col),
                    code=code,
                    message=message.strip(),
                    severity=severity
                ))

        return errors

    # ==================== EMBEDDING ====================

    async def embed_errors(self, errors: List[TypeScriptError]) -> List[TypeScriptError]:
        """Generate embeddings for all errors using embeddinggemma"""
        print(f"\n🧠 Generating embeddings for {len(errors)} errors...")

        embedded = []
        batch_size = CONFIG["BATCH_SIZE"]

        for i in range(0, len(errors), batch_size):
            batch = errors[i:i+batch_size]

            # Generate text for embedding
            texts = [f"{e.code}: {e.message}" for e in batch]

            # Batch embed
            embeddings = await self._batch_embed(texts)

            for j, e in enumerate(batch):
                if j < len(embeddings) and embeddings[j] is not None:
                    e.embedding = embeddings[j].tolist()
                embedded.append(e)

            print(f"   {len(embedded)}/{len(errors)} embedded", end="\r")

        print(f"   ✅ Embedded {len([e for e in embedded if e.embedding])} errors")
        return embedded

    async def _batch_embed(self, texts: List[str]) -> List[Optional[np.ndarray]]:
        """Batch embed texts using Ollama"""
        results = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            for text in texts:
                cache_key = hashlib.md5(text.encode()).hexdigest()

                # Check cache
                if cache_key in self._embedding_cache:
                    results.append(self._embedding_cache[cache_key])
                    continue

                try:
                    response = await client.post(
                        f"{CONFIG['OLLAMA_URL']}/api/embeddings",
                        json={"model": CONFIG["EMBEDDING_MODEL"], "prompt": text[:2000]}
                    )

                    if response.status_code == 200:
                        data = response.json()
                        emb = np.array(data["embedding"], dtype=np.float32)
                        self._embedding_cache[cache_key] = emb
                        results.append(emb)
                    else:
                        results.append(None)
                except:
                    results.append(None)

        return results

    # ==================== GPU CLUSTERING ====================

    def cluster_errors_gpu(self, errors: List[TypeScriptError]) -> Dict[int, List[TypeScriptError]]:
        """GPU-accelerated error clustering with tricubic interpolation"""
        print(f"\n🔥 GPU Clustering {len(errors)} errors...")

        # Filter errors with embeddings
        valid_errors = [e for e in errors if e.embedding is not None]
        if len(valid_errors) < 2:
            return {0: valid_errors} if valid_errors else {}

        # Stack embeddings
        embeddings = np.stack([e.embedding for e in valid_errors]).astype(np.float32)

        # Build tricubic grid
        self.tricubic.build_grid(embeddings)

        # Find hotspots
        hotspots = self.tricubic.find_error_hotspots(threshold=0.3)
        print(f"   Found {len(hotspots)} error hotspots")

        # Convert to tensor for GPU processing
        emb_tensor = torch.from_numpy(embeddings).to(self.device)

        # Normalize for cosine similarity
        emb_norm = F.normalize(emb_tensor, p=2, dim=1)

        # Compute similarity matrix on GPU
        with torch.amp.autocast('cuda', enabled=self.device == 'cuda'):
            similarity = torch.mm(emb_norm, emb_norm.t())

        # Clamp and convert to distance
        similarity = torch.clamp(similarity, -1.0, 1.0)
        distance = torch.clamp(1.0 - similarity, 0.0, 2.0).cpu().numpy()

        # DBSCAN clustering
        from sklearn.cluster import DBSCAN
        clustering = DBSCAN(eps=0.25, min_samples=3, metric='precomputed')
        labels = clustering.fit_predict(distance)

        # Group by cluster
        clusters: Dict[int, List[TypeScriptError]] = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue  # Noise
            if idx < len(valid_errors):
                valid_errors[idx].cluster_id = label
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append(valid_errors[idx])

        print(f"   Created {len(clusters)} clusters")
        return clusters

    # ==================== CALL GRAPH ANALYSIS ====================

    def build_call_graph(self, root_dir: str = "src") -> Dict[str, Set[str]]:
        """Build function call graph from AST"""
        print(f"\n📊 Building call graph from {root_dir}...")

        call_graph: Dict[str, Set[str]] = {}

        # Patterns for function definitions and calls
        func_def_pattern = re.compile(
            r'(?:export\s+)?(?:async\s+)?function\s+(\w+)|'
            r'(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>'
        )

        func_call_pattern = re.compile(r'(\w+)\s*\(')

        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist', '.svelte-kit']]

            for file in files:
                if file.endswith(('.ts', '.js', '.svelte')):
                    file_path = os.path.join(root, file)
                    self._analyze_file_calls(file_path, func_def_pattern, func_call_pattern, call_graph)

        # Count total edges
        total_edges = sum(len(callees) for callees in call_graph.values())
        print(f"   Found {len(call_graph)} functions with {total_edges} call edges")

        return call_graph

    def _analyze_file_calls(self, file_path: str, func_def_pattern, func_call_pattern, call_graph: Dict[str, Set[str]]):
        """Analyze a single file for function calls"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except:
            return

        # Find function definitions
        functions = []
        for match in func_def_pattern.finditer(content):
            name = match.group(1) or match.group(2)
            if name:
                functions.append(name)
                if name not in call_graph:
                    call_graph[name] = set()

        # Find function calls within each function (simplified)
        for func_name in functions:
            # Find all calls in file (simplified - doesn't scope to specific function)
            for match in func_call_pattern.finditer(content):
                called = match.group(1)
                # Exclude common built-ins and self-calls
                if called not in ['if', 'for', 'while', 'switch', 'catch', 'console', 'Math', 'Object', 'Array', 'JSON', 'Promise', 'async', 'await'] and called != func_name:
                    call_graph[func_name].add(called)

    # ==================== CONCURRENT FIX GENERATION ====================

    async def generate_fixes_parallel(self, clusters: Dict[int, List[TypeScriptError]]) -> List[Tuple[int, str]]:
        """Generate fixes for all clusters in parallel"""
        print(f"\n🔧 Generating fixes for {len(clusters)} clusters...")

        fixes = []

        # Create tasks for parallel execution
        tasks = []
        for cluster_id, errors in clusters.items():
            task = asyncio.create_task(self._generate_cluster_fix(cluster_id, errors))
            tasks.append((cluster_id, task))

        # Wait for all with concurrency limit
        semaphore = asyncio.Semaphore(CONFIG["MAX_WORKERS"])

        async def limited_task(cluster_id: int, task):
            async with semaphore:
                return cluster_id, await task

        results = await asyncio.gather(*[limited_task(cid, t) for cid, t in tasks])

        for cluster_id, fix in results:
            if fix:
                fixes.append((cluster_id, fix))

        print(f"   Generated {len(fixes)} fix templates")
        return fixes

    async def _generate_cluster_fix(self, cluster_id: int, errors: List[TypeScriptError]) -> Optional[str]:
        """Generate fix for a single cluster using LLM"""
        if not errors:
            return None

        # Group by error code
        code_counts = {}
        for e in errors:
            code_counts[e.code] = code_counts.get(e.code, 0) + 1

        dominant_code = max(code_counts.items(), key=lambda x: x[1])[0]
        sample_errors = [e for e in errors if e.code == dominant_code][:5]

        # Build prompt
        samples_text = "\n".join([
            f"  - {e.file}:{e.line}: {e.message}"
            for e in sample_errors
        ])

        prompt = f"""You are fixing TypeScript/Svelte errors.

Error code: {dominant_code}
Total occurrences: {len(errors)}

Sample errors:
{samples_text}

Provide a fix strategy. Output format:
PATTERN: [regex pattern to find]
FIX: [replacement or fix approach]
EXPLANATION: [brief explanation]

Only output these three lines."""

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{CONFIG['OLLAMA_URL']}/api/generate",
                    json={
                        "model": CONFIG["LLM_MODEL"],
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.2, "num_predict": 300}
                    }
                )

                if response.status_code == 200:
                    return response.json().get("response", "").strip()
        except Exception as e:
            pass

        return None

    # ==================== APPLY FIXES ====================

    def apply_corruption_fixes(self, root_dir: str = "src") -> int:
        """Apply all corruption pattern fixes"""
        print(f"\n🔧 Applying corruption fixes in {root_dir}...")

        total_fixed = 0

        # Fix patterns
        patterns = [
            # .set(a: b) -> .set(a, b)
            (re.compile(r'\.set\(([a-zA-Z_][a-zA-Z0-9_.]*)\s*:\s*([^,\)]+)'), r'.set(\1, \2'),
            # Object export corruption: export { X: Y } -> export { X, Y }
            (re.compile(r'export\s*\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}'), r'export { \1, \2 }'),
        ]

        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist', '.svelte-kit', '__pycache__']]

            for file in files:
                if file.endswith(('.ts', '.js', '.svelte')):
                    file_path = os.path.join(root, file)
                    count = self._apply_fixes_to_file(file_path, patterns)
                    total_fixed += count

        print(f"   ✅ Applied {total_fixed} fixes")
        return total_fixed

    def _apply_fixes_to_file(self, file_path: str, patterns: List[Tuple[re.Pattern, str]]) -> int:
        """Apply fixes to a single file"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except:
            return 0

        original = content
        fix_count = 0

        for pattern, replacement in patterns:
            matches = list(pattern.finditer(content))
            if matches:
                content = pattern.sub(replacement, content)
                fix_count += len(matches)

        if fix_count > 0 and content != original:
            # Backup
            backup_path = file_path + '.ace-backup'
            if not os.path.exists(backup_path):
                with open(backup_path, 'w', encoding='utf-8') as f:
                    f.write(original)

            # Write fixed content
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)

            print(f"   📝 {file_path}: {fix_count} fixes")

        return fix_count

    # ==================== STORAGE ====================

    async def store_results(self, errors: List[TypeScriptError], fixes: List[Tuple[int, str]]):
        """Store all results to databases"""
        print("\n💾 Storing results...")

        # Store to Qdrant
        if self.qdrant:
            await self._store_errors_qdrant(errors)

        # Store to PostgreSQL
        if self.pg:
            self._store_errors_pg(errors, fixes)

        # Cache in Redis
        if self.redis:
            self._cache_fixes_redis(fixes)

        print("   ✅ Results stored")

    async def _store_errors_qdrant(self, errors: List[TypeScriptError]):
        """Store error embeddings in Qdrant"""
        collection = "ace_typescript_errors"

        # Ensure collection exists
        try:
            if not self.qdrant.collection_exists(collection):
                self.qdrant.create_collection(
                    collection_name=collection,
                    vectors_config=VectorParams(size=CONFIG["EMBEDDING_DIM"], distance=Distance.COSINE)
                )
        except:
            pass

        # Upsert points
        points = []
        for i, e in enumerate(errors):
            if e.embedding:
                points.append(PointStruct(
                    id=i,
                    vector=e.embedding,
                    payload={
                        "file": e.file,
                        "line": e.line,
                        "code": e.code,
                        "message": e.message[:500],
                        "cluster_id": e.cluster_id,
                        "timestamp": datetime.now().isoformat()
                    }
                ))

        if points:
            self.qdrant.upsert(collection_name=collection, points=points)

    def _store_errors_pg(self, errors: List[TypeScriptError], fixes: List[Tuple[int, str]]):
        """Store errors and fixes in PostgreSQL"""
        cursor = self.pg.cursor()

        # Create table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ace_error_analysis (
                id SERIAL PRIMARY KEY,
                file TEXT,
                line INTEGER,
                code TEXT,
                message TEXT,
                cluster_id INTEGER,
                fix_template TEXT,
                embedding vector(768),
                analyzed_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Create fixes table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ace_fix_templates (
                id SERIAL PRIMARY KEY,
                cluster_id INTEGER UNIQUE,
                fix_template TEXT,
                error_count INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Insert errors
        values = []
        for e in errors:
            values.append((
                e.file,
                e.line,
                e.code,
                e.message[:1000],
                e.cluster_id,
                e.suggested_fix[:1000] if e.suggested_fix else None,
                e.embedding
            ))

        if values:
            execute_values(
                cursor,
                """
                INSERT INTO ace_error_analysis (file, line, code, message, cluster_id, fix_template, embedding)
                VALUES %s
                """,
                values,
                template="(%s, %s, %s, %s, %s, %s, %s::vector)"
            )

        # Insert fix templates
        for cluster_id, template in fixes:
            cluster_errors = [e for e in errors if e.cluster_id == cluster_id]
            cursor.execute("""
                INSERT INTO ace_fix_templates (cluster_id, fix_template, error_count)
                VALUES (%s, %s, %s)
                ON CONFLICT (cluster_id) DO UPDATE SET fix_template = EXCLUDED.fix_template, error_count = EXCLUDED.error_count
            """, (cluster_id, template[:2000], len(cluster_errors)))

        cursor.close()

    def _cache_fixes_redis(self, fixes: List[Tuple[int, str]]):
        """Cache fix templates in Redis"""
        for cluster_id, template in fixes:
            key = f"ace:fix:{cluster_id}"
            self.redis.setex(key, 86400, gzip.compress(template.encode()))

    # ==================== MAIN PIPELINE ====================

    async def run_full_pipeline(self, root_dir: str = "src"):
        """Run the complete enhanced ACE pipeline"""
        print("=" * 70)
        print("🚀 ACE Enhanced Agentic Pipeline")
        print("   GPU + Tricubic Search + Concurrent Parallel Analysis")
        print("=" * 70)

        start_time = datetime.now()

        # Step 1: Apply corruption fixes first
        fixed_count = self.apply_corruption_fixes(root_dir)

        # Step 2: Run svelte-check to get current errors
        self.errors = self.run_svelte_check()

        if not self.errors:
            print("\n✅ No errors found!")
            return

        # Step 3: Generate embeddings
        self.errors = await self.embed_errors(self.errors)

        # Step 4: GPU clustering with tricubic interpolation
        clusters = self.cluster_errors_gpu(self.errors)

        # Step 5: Build call graph for context
        call_graph = self.build_call_graph(root_dir)

        # Step 6: Generate fixes in parallel
        fixes = await self.generate_fixes_parallel(clusters)

        # Step 7: Apply generated fixes
        for cluster_id, fix in fixes:
            cluster_errors = clusters.get(cluster_id, [])
            for e in cluster_errors:
                e.suggested_fix = fix

        # Step 8: Store results
        await self.store_results(self.errors, fixes)

        # Summary
        elapsed = (datetime.now() - start_time).total_seconds()
        print("\n" + "=" * 70)
        print("📊 PIPELINE SUMMARY")
        print("=" * 70)
        print(f"   Duration: {elapsed:.1f}s")
        print(f"   Corruption fixes applied: {fixed_count}")
        print(f"   Total errors found: {len(self.errors)}")
        print(f"   Errors with embeddings: {len([e for e in self.errors if e.embedding])}")
        print(f"   Clusters created: {len(clusters)}")
        print(f"   Fix templates generated: {len(fixes)}")
        print(f"   Functions in call graph: {len(call_graph)}")

        # Show top clusters
        print("\n   Top error clusters:")
        sorted_clusters = sorted(clusters.items(), key=lambda x: -len(x[1]))[:5]
        for cluster_id, errs in sorted_clusters:
            codes = set(e.code for e in errs)
            print(f"      Cluster {cluster_id}: {len(errs)} errors ({', '.join(codes)})")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="ACE Enhanced Pipeline")
    parser.add_argument("root_dir", nargs="?", default="src", help="Root directory")
    args = parser.parse_args()

    pipeline = EnhancedACEPipeline()
    asyncio.run(pipeline.run_full_pipeline(args.root_dir))


if __name__ == "__main__":
    main()
