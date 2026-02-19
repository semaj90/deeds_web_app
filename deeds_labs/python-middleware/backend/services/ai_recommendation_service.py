#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - AI Recommendation Engine
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Error analysis, fix recommendations, and verification
Task: 12.1 - Create recommendation service
Task: 12.2 - Create fix verification
═══════════════════════════════════════════════════════════════════════

Architecture Integration:
- Ingests diagnostics from svelte-check/tsc/eslint
- Creates error cards in phase90_error_cards collection
- Clusters errors using CUDA k-means
- Generates fix recommendations via Gemma
- Stores patterns in phase90_error_clusters collection
"""

import os
import re
import json
import logging
import asyncio
import hashlib
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict, field
import numpy as np
import aiohttp
from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams, Distance, PointStruct,
    Filter, FieldCondition, MatchValue, MatchAny
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# Data Models (matching your architecture spec)
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class DiagnosticCard:
    """
    Unified diagnostic schema for any error source.
    Maps to phase90_error_cards collection.
    """
    id: str
    kind: str = "error"
    tool: str = "tsc"  # svelte-check | tsc | eslint
    errorCode: str = ""
    severity: str = "error"
    filePath: str = ""
    line: int = 0
    col: int = 0
    message: str = ""
    signature: str = ""  # Normalized for clustering
    surface: List[str] = field(default_factory=list)
    tech: List[str] = field(default_factory=list)
    clusterId: Optional[str] = None
    runId: str = ""
    timestamp: str = ""
    embedding: Optional[List[float]] = None


@dataclass
class ErrorCluster:
    """
    Pattern card for clustered errors.
    Maps to phase90_error_clusters collection.
    """
    id: str
    kind: str = "pattern"
    name: str = ""
    dominant_code: str = ""
    top_files: List[str] = field(default_factory=list)
    representative_errors: List[str] = field(default_factory=list)
    fix_suggestion: str = ""
    member_count: int = 0
    surface: List[str] = field(default_factory=list)
    tech: List[str] = field(default_factory=list)
    runId: str = ""
    timestamp: str = ""
    coordinates: Optional[Dict[str, float]] = None
    centroid: Optional[List[float]] = None


@dataclass
class FixRecommendation:
    """Recommendation for fixing an error or cluster."""
    id: str
    target_type: str  # "error" | "cluster"
    target_id: str
    errorCode: str
    confidence: float
    fix_type: str  # "auto" | "manual" | "review"
    description: str
    code_change: Optional[str] = None
    affected_files: List[str] = field(default_factory=list)
    created_at: str = ""


@dataclass
class FixVerification:
    """Result of applying and verifying a fix."""
    recommendation_id: str
    success: bool
    errors_before: int
    errors_after: int
    files_modified: List[str]
    verification_time_ms: float
    verified_at: str


# ═══════════════════════════════════════════════════════════════════════
# AI Recommendation Service
# ═══════════════════════════════════════════════════════════════════════

class AIRecommendationService:
    """
    AI Recommendation Engine - Error analysis and fix generation.

    Pipeline:
    1. Parse diagnostics (svelte-check/tsc output)
    2. Create error cards with embeddings
    3. Cluster errors using CUDA k-means
    4. Generate fix recommendations via Gemma
    5. Store patterns for ACE routing
    """

    QDRANT_URL = "http://localhost:6333"
    OLLAMA_URL = "http://localhost:11434"
    EMBEDDING_MODEL = "embeddinggemma:latest"
    GEMMA_MODEL = "gemma3-legal:latest"

    ERROR_CARDS_COLLECTION = "phase90_error_cards"
    CLUSTER_COLLECTION = "phase90_error_clusters"
    EMBEDDING_DIM = 768

    # Surface detection patterns
    SURFACE_PATTERNS = {
        "routes": [r"/routes/", r"\+page", r"\+layout", r"\+server"],
        "components": [r"/components/", r"\.svelte$"],
        "stores": [r"/stores/", r"store\.ts"],
        "services": [r"/services/", r"service\.ts", r"service\.py"],
        "api": [r"/api/", r"endpoint"],
        "evidence": [r"evidence", r"Evidence"],
        "cases": [r"case", r"Case"],
        "admin": [r"admin", r"Admin"],
        "ui": [r"/ui/", r"Button", r"Modal", r"Card"],
    }

    # Tech detection patterns
    TECH_PATTERNS = {
        "svelte": [r"\.svelte", r"svelte"],
        "sveltekit": [r"\+page", r"\+layout", r"\+server", r"\$app/"],
        "drizzle": [r"drizzle", r"schema\.ts"],
        "qdrant": [r"qdrant", r"vector"],
        "redis": [r"redis", r"cache"],
        "postgres": [r"postgres", r"pg", r"sql"],
        "neo4j": [r"neo4j", r"cypher"],
        "typescript": [r"\.ts\b", r"\.tsx\b", r"typescript"],
    }

    def __init__(
        self,
        qdrant_url: Optional[str] = None,
        ollama_url: Optional[str] = None
    ):
        """Initialize recommendation service."""
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", self.QDRANT_URL)
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", self.OLLAMA_URL)
        self.qdrant = QdrantClient(url=self.qdrant_url)

        self._ensure_collections()
        logger.info("🧠 AIRecommendationService initialized")

    def _ensure_collections(self):
        """Ensure Qdrant collections exist with proper schema."""
        collections = [c.name for c in self.qdrant.get_collections().collections]

        # Error cards collection
        if self.ERROR_CARDS_COLLECTION not in collections:
            self.qdrant.create_collection(
                collection_name=self.ERROR_CARDS_COLLECTION,
                vectors_config=VectorParams(
                    size=self.EMBEDDING_DIM,
                    distance=Distance.COSINE
                )
            )
            logger.info(f"  ✓ Created collection: {self.ERROR_CARDS_COLLECTION}")

        # Cluster collection
        if self.CLUSTER_COLLECTION not in collections:
            self.qdrant.create_collection(
                collection_name=self.CLUSTER_COLLECTION,
                vectors_config=VectorParams(
                    size=self.EMBEDDING_DIM,
                    distance=Distance.COSINE
                )
            )
            logger.info(f"  ✓ Created collection: {self.CLUSTER_COLLECTION}")

    def _generate_id(self, *parts: str) -> str:
        """Generate deterministic UUID from parts."""
        import uuid
        combined = ":".join(str(p) for p in parts)
        # Create a UUID5 from the combined string (deterministic)
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, combined))

    def _normalize_signature(self, message: str, errorCode: str) -> str:
        """Normalize error message for clustering."""
        # Remove file-specific parts
        sig = re.sub(r"'[^']+\.(?:ts|svelte|js)'", "'FILE'", message)
        sig = re.sub(r"'[A-Z][a-zA-Z]+(?:Props|State|Store)'", "'TYPE'", sig)
        sig = re.sub(r"line \d+", "line N", sig)
        sig = re.sub(r"column \d+", "column N", sig)
        return f"{errorCode}: {sig}"

    def _detect_surface(self, filePath: str, message: str) -> List[str]:
        """Detect which surface areas this error affects."""
        surfaces = []
        combined = f"{filePath} {message}".lower()

        for surface, patterns in self.SURFACE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, combined, re.IGNORECASE):
                    surfaces.append(surface)
                    break

        return surfaces or ["unknown"]

    def _detect_tech(self, filePath: str, message: str) -> List[str]:
        """Detect which technologies this error involves."""
        techs = []
        combined = f"{filePath} {message}"

        for tech, patterns in self.TECH_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, combined, re.IGNORECASE):
                    techs.append(tech)
                    break

        return techs or ["unknown"]

    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text."""
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
            logger.warning(f"Embedding failed: {e}")
        return [0.0] * self.EMBEDDING_DIM

    async def _generate_fix_suggestion(
        self,
        errorCode: str,
        representative_errors: List[str],
        top_files: List[str]
    ) -> str:
        """Generate fix suggestion using Gemma."""
        prompt = f"""Analyze this TypeScript/Svelte error pattern and suggest a fix:

Error Code: {errorCode}
Representative Errors:
{chr(10).join(f'- {e}' for e in representative_errors[:5])}

Affected Files:
{chr(10).join(f'- {f}' for f in top_files[:5])}

Provide a concise fix suggestion (1-3 sentences) that addresses the root cause."""

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json={"model": self.GEMMA_MODEL, "prompt": prompt, "stream": False},
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("response", "")[:500]
        except Exception as e:
            logger.warning(f"Fix suggestion failed: {e}")

        return f"Review {errorCode} errors in affected files"

    # ═══════════════════════════════════════════════════════════════════
    # Signature Normalization (for clustering without TS codes)
    # ═══════════════════════════════════════════════════════════════════

    # Message-to-signature mapping for common error patterns
    SIGNATURE_PATTERNS = [
        (r"',' expected", "SYNTAX_COMMA_EXPECTED"),
        (r"';' expected", "SYNTAX_SEMICOLON_EXPECTED"),
        (r"'\)' expected", "SYNTAX_PAREN_EXPECTED"),
        (r"'\}' expected", "SYNTAX_BRACE_EXPECTED"),
        (r"'\]' expected", "SYNTAX_BRACKET_EXPECTED"),
        (r"Cannot find module", "CANNOT_FIND_MODULE"),
        (r"Cannot find name", "CANNOT_FIND_NAME"),
        (r"Cannot redeclare block-scoped variable", "REDECLARE_BLOCK_SCOPED"),
        (r"Property .+ does not exist on type", "PROPERTY_NOT_EXISTS"),
        (r"Type .+ is not assignable to type", "TYPE_NOT_ASSIGNABLE"),
        (r"Argument of type .+ is not assignable", "ARG_NOT_ASSIGNABLE"),
        (r"Object is possibly 'undefined'", "POSSIBLY_UNDEFINED"),
        (r"Object is possibly 'null'", "POSSIBLY_NULL"),
        (r"Expected \d+ arguments?, but got \d+", "WRONG_ARG_COUNT"),
        (r"has no exported member", "NO_EXPORTED_MEMBER"),
        (r"is declared but", "DECLARED_BUT_UNUSED"),
        (r"implicitly has an 'any' type", "IMPLICIT_ANY"),
        (r"Module .+ has no default export", "NO_DEFAULT_EXPORT"),
        (r"Duplicate identifier", "DUPLICATE_IDENTIFIER"),
        (r"Expression expected", "EXPRESSION_EXPECTED"),
        (r"Declaration or statement expected", "DECLARATION_EXPECTED"),
    ]

    def _infer_error_code_from_message(self, message: str) -> str:
        """Infer a semantic error code from message when TS code is missing."""
        for pattern, code in self.SIGNATURE_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return code
        return "UNKNOWN"

    # ═══════════════════════════════════════════════════════════════════
    # Diagnostic Parsing
    # ═══════════════════════════════════════════════════════════════════

    def parse_tsc_output(self, output: str, runId: str) -> List[DiagnosticCard]:
        """Parse tsc output into diagnostic cards."""
        cards = []
        timestamp = datetime.now().isoformat()

        # Pattern: file(line,col): error TSxxxx: message
        pattern = r"([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)"

        for match in re.finditer(pattern, output):
            filePath, line, col, severity, errorCode, message = match.groups()

            card = DiagnosticCard(
                id=self._generate_id(filePath, line, col, errorCode),
                kind="error",
                tool="tsc",
                errorCode=errorCode,
                severity=severity,
                filePath=filePath.strip(),
                line=int(line),
                col=int(col),
                message=message.strip(),
                signature=self._normalize_signature(message, errorCode),
                surface=self._detect_surface(filePath, message),
                tech=self._detect_tech(filePath, message),
                runId=runId,
                timestamp=timestamp
            )
            cards.append(card)

        logger.info(f"  ✓ Parsed {len(cards)} tsc diagnostics")
        return cards

    def parse_svelte_check_output(self, output: str, runId: str) -> List[DiagnosticCard]:
        """Parse svelte-check output into diagnostic cards."""
        cards = []
        timestamp = datetime.now().isoformat()

        # Pattern varies, but typically: file:line:col - error message
        pattern = r"([^:]+):(\d+):(\d+)\s*[-–]\s*(Error|Warning):\s*(.+?)(?:\n|$)"

        for match in re.finditer(pattern, output, re.MULTILINE):
            filePath, line, col, severity, message = match.groups()

            # Extract TS code if present
            ts_match = re.search(r"(TS\d+)", message)
            errorCode = ts_match.group(1) if ts_match else "SVELTE"

            card = DiagnosticCard(
                id=self._generate_id(filePath, line, col, errorCode),
                kind="error",
                tool="svelte-check",
                errorCode=errorCode,
                severity=severity.lower(),
                filePath=filePath.strip(),
                line=int(line),
                col=int(col),
                message=message.strip(),
                signature=self._normalize_signature(message, errorCode),
                surface=self._detect_surface(filePath, message),
                tech=self._detect_tech(filePath, message),
                runId=runId,
                timestamp=timestamp
            )
            cards.append(card)

        logger.info(f"  ✓ Parsed {len(cards)} svelte-check diagnostics")
        return cards

    def parse_svelte_check_event_log(self, output: str, runId: str) -> List[DiagnosticCard]:
        """
        Parse svelte-check timestamped event log format.
        Format: <epoch_ms> ERROR "<filePath>" <line>:<col> "<message>"
        """
        cards = []
        timestamp = datetime.now().isoformat()

        # Pattern for event log format
        event_pattern = re.compile(
            r'^(?P<ts>\d+)\s+ERROR\s+"(?P<file>[^"]+)"\s+(?P<line>\d+):(?P<col>\d+)\s+"(?P<msg>.*)"\s*$'
        )

        for line in output.split('\n'):
            line = line.strip()
            match = event_pattern.match(line)
            if not match:
                continue

            filePath = match.group('file').replace('\\\\', '\\').replace('\\', '/')
            lineNum = int(match.group('line'))
            col = int(match.group('col'))
            message = match.group('msg')

            # Try to extract TS code from message, otherwise infer from pattern
            ts_match = re.search(r"(TS\d+)", message)
            if ts_match:
                errorCode = ts_match.group(1)
            else:
                errorCode = self._infer_error_code_from_message(message)

            card = DiagnosticCard(
                id=self._generate_id(filePath, str(lineNum), str(col), errorCode),
                kind="error",
                tool="svelte-check",
                errorCode=errorCode,
                severity="error",
                filePath=filePath,
                line=lineNum,
                col=col,
                message=message,
                signature=self._normalize_signature(message, errorCode),
                surface=self._detect_surface(filePath, message),
                tech=self._detect_tech(filePath, message),
                runId=runId,
                timestamp=timestamp
            )
            cards.append(card)

        logger.info(f"  ✓ Parsed {len(cards)} svelte-check event log diagnostics")
        return cards

    def parse_diagnostics_auto(self, output: str, runId: str) -> List[DiagnosticCard]:
        """
        Auto-detect format and parse diagnostics.
        Tries multiple parsers and returns the one with most results.
        """
        results = []

        # Try event log format first (most specific)
        event_cards = self.parse_svelte_check_event_log(output, runId)
        if event_cards:
            results.append(('event_log', event_cards))

        # Try standard svelte-check format
        svelte_cards = self.parse_svelte_check_output(output, runId)
        if svelte_cards:
            results.append(('svelte_check', svelte_cards))

        # Try tsc format
        tsc_cards = self.parse_tsc_output(output, runId)
        if tsc_cards:
            results.append(('tsc', tsc_cards))

        if not results:
            logger.warning("No diagnostics parsed from any format")
            return []

        # Return the parser that found the most errors
        best_format, best_cards = max(results, key=lambda x: len(x[1]))
        logger.info(f"  ✓ Best parser: {best_format} with {len(best_cards)} diagnostics")
        return best_cards

    # ═══════════════════════════════════════════════════════════════════
    # Error Card Storage
    # ═══════════════════════════════════════════════════════════════════

    async def store_error_cards(
        self,
        cards: List[DiagnosticCard],
        generate_embeddings: bool = True
    ) -> int:
        """Store error cards in Qdrant."""
        if not cards:
            return 0

        points = []
        for card in cards:
            # Generate embedding if needed
            if generate_embeddings and not card.embedding:
                card.embedding = await self._generate_embedding(card.signature)

            payload = {
                "kind": card.kind,
                "tool": card.tool,
                "errorCode": card.errorCode,
                "severity": card.severity,
                "filePath": card.filePath,
                "line": card.line,
                "col": card.col,
                "message": card.message,
                "signature": card.signature,
                "surface": card.surface,
                "tech": card.tech,
                "clusterId": card.clusterId,
                "runId": card.runId,
                "timestamp": card.timestamp
            }

            points.append(PointStruct(
                id=card.id,
                vector=card.embedding or [0.0] * self.EMBEDDING_DIM,
                payload=payload
            ))

        self.qdrant.upsert(
            collection_name=self.ERROR_CARDS_COLLECTION,
            points=points
        )

        logger.info(f"  ✓ Stored {len(points)} error cards")
        return len(points)

    # ═══════════════════════════════════════════════════════════════════
    # Clustering
    # ═══════════════════════════════════════════════════════════════════

    async def cluster_errors(
        self,
        runId: str,
        k: int = 10,
        generate_suggestions: bool = True
    ) -> List[ErrorCluster]:
        """Cluster error cards and create pattern cards."""
        from sklearn.cluster import KMeans

        # Fetch all error cards for this run
        results = self.qdrant.scroll(
            collection_name=self.ERROR_CARDS_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="runId", match=MatchValue(value=runId))]
            ),
            limit=10000,
            with_vectors=True,
            with_payload=True
        )

        points, _ = results
        if len(points) < k:
            k = max(1, len(points) // 2)

        if not points:
            logger.warning("No error cards to cluster")
            return []

        # Extract vectors and metadata
        vectors = np.array([p.vector for p in points])
        cards_data = [p.payload for p in points]
        card_ids = [p.id for p in points]

        # Run k-means
        logger.info(f"🔮 Clustering {len(points)} errors into {k} clusters")
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(vectors)
        centroids = kmeans.cluster_centers_

        # Build clusters
        clusters = []
        timestamp = datetime.now().isoformat()

        for cluster_id in range(k):
            mask = labels == cluster_id
            cluster_cards = [cards_data[i] for i in range(len(cards_data)) if mask[i]]
            cluster_card_ids = [card_ids[i] for i in range(len(card_ids)) if mask[i]]

            if not cluster_cards:
                continue

            # Find dominant error code
            code_counts = {}
            for card in cluster_cards:
                code = card.get("errorCode", "UNKNOWN")
                code_counts[code] = code_counts.get(code, 0) + 1
            dominant_code = max(code_counts, key=code_counts.get)

            # Find top files
            file_counts = {}
            for card in cluster_cards:
                fp = card.get("filePath", "")
                file_counts[fp] = file_counts.get(fp, 0) + 1
            top_files = sorted(file_counts.keys(), key=lambda x: -file_counts[x])[:10]

            # Collect surfaces and techs
            all_surfaces = set()
            all_techs = set()
            for card in cluster_cards:
                all_surfaces.update(card.get("surface", []))
                all_techs.update(card.get("tech", []))

            # Representative errors (closest to centroid)
            centroid = centroids[cluster_id]
            cluster_vectors = vectors[mask]
            distances = np.linalg.norm(cluster_vectors - centroid, axis=1)
            closest_indices = np.argsort(distances)[:5]
            representative_errors = [
                cluster_cards[i].get("message", "")[:100]
                for i in closest_indices
            ]

            # Generate fix suggestion
            fix_suggestion = ""
            if generate_suggestions:
                fix_suggestion = await self._generate_fix_suggestion(
                    dominant_code, representative_errors, top_files
                )

            cluster = ErrorCluster(
                id=self._generate_id(runId, str(cluster_id)),
                kind="pattern",
                name=f"{dominant_code}_cluster_{cluster_id}",
                dominant_code=dominant_code,
                top_files=top_files,
                representative_errors=representative_errors,
                fix_suggestion=fix_suggestion,
                member_count=len(cluster_cards),
                surface=list(all_surfaces),
                tech=list(all_techs),
                runId=runId,
                timestamp=timestamp,
                centroid=centroid.tolist()
            )
            clusters.append(cluster)

            # Back-propagate clusterId to error cards
            for card_id in cluster_card_ids:
                self.qdrant.set_payload(
                    collection_name=self.ERROR_CARDS_COLLECTION,
                    payload={"clusterId": cluster.id},
                    points=[card_id]
                )

        # Store cluster cards
        await self._store_clusters(clusters)

        logger.info(f"  ✓ Created {len(clusters)} error clusters")
        return clusters

    async def _store_clusters(self, clusters: List[ErrorCluster]):
        """Store cluster cards in Qdrant."""
        points = []
        for cluster in clusters:
            payload = {
                "kind": cluster.kind,
                "name": cluster.name,
                "dominant_code": cluster.dominant_code,
                "top_files": cluster.top_files,
                "representative_errors": cluster.representative_errors,
                "fix_suggestion": cluster.fix_suggestion,
                "member_count": cluster.member_count,
                "surface": cluster.surface,
                "tech": cluster.tech,
                "runId": cluster.runId,
                "timestamp": cluster.timestamp,
                "coordinates": cluster.coordinates
            }

            points.append(PointStruct(
                id=cluster.id,
                vector=cluster.centroid or [0.0] * self.EMBEDDING_DIM,
                payload=payload
            ))

        if points:
            self.qdrant.upsert(
                collection_name=self.CLUSTER_COLLECTION,
                points=points
            )

    # ═══════════════════════════════════════════════════════════════════
    # Recommendations
    # ═══════════════════════════════════════════════════════════════════

    async def generate_recommendations(
        self,
        runId: str,
        top_k: int = 5
    ) -> List[FixRecommendation]:
        """Generate fix recommendations for top clusters."""
        # Get clusters sorted by member count
        results = self.qdrant.scroll(
            collection_name=self.CLUSTER_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="runId", match=MatchValue(value=runId))]
            ),
            limit=100,
            with_payload=True
        )

        clusters, _ = results
        clusters = sorted(clusters, key=lambda x: -x.payload.get("member_count", 0))

        recommendations = []
        timestamp = datetime.now().isoformat()

        for cluster in clusters[:top_k]:
            payload = cluster.payload
            member_count = payload.get("member_count", 0)

            # Calculate confidence based on cluster size and code specificity
            confidence = min(0.95, 0.5 + (member_count / 100) * 0.3)

            # Determine fix type
            dominant_code = payload.get("dominant_code", "")
            if dominant_code in ["TS1005", "TS1002", "TS1003"]:
                fix_type = "auto"  # Syntax errors often auto-fixable
            elif dominant_code in ["TS2307", "TS2304"]:
                fix_type = "manual"  # Import/reference errors need review
            else:
                fix_type = "review"

            rec = FixRecommendation(
                id=self._generate_id(cluster.id, "rec"),
                target_type="cluster",
                target_id=cluster.id,
                errorCode=dominant_code,
                confidence=confidence,
                fix_type=fix_type,
                description=payload.get("fix_suggestion", ""),
                affected_files=payload.get("top_files", [])[:10],
                created_at=timestamp
            )
            recommendations.append(rec)

        logger.info(f"  ✓ Generated {len(recommendations)} recommendations")
        return recommendations

    # ═══════════════════════════════════════════════════════════════════
    # Query Methods (for ACE routing)
    # ═══════════════════════════════════════════════════════════════════

    def query_errors_by_code(
        self,
        errorCode: str,
        limit: int = 100
    ) -> List[Dict]:
        """Query error cards by error code."""
        results = self.qdrant.scroll(
            collection_name=self.ERROR_CARDS_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="errorCode", match=MatchValue(value=errorCode))]
            ),
            limit=limit,
            with_payload=True
        )
        points, _ = results
        return [p.payload for p in points]

    def query_errors_by_surface(
        self,
        surfaces: List[str],
        limit: int = 100
    ) -> List[Dict]:
        """Query error cards by surface area."""
        results = self.qdrant.scroll(
            collection_name=self.ERROR_CARDS_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="surface", match=MatchAny(any=surfaces))]
            ),
            limit=limit,
            with_payload=True
        )
        points, _ = results
        return [p.payload for p in points]

    def query_clusters_by_code(
        self,
        errorCode: str,
        limit: int = 20
    ) -> List[Dict]:
        """Query cluster cards by dominant error code."""
        results = self.qdrant.scroll(
            collection_name=self.CLUSTER_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="dominant_code", match=MatchValue(value=errorCode))]
            ),
            limit=limit,
            with_payload=True
        )
        points, _ = results
        return [p.payload for p in points]

    def get_error_histogram(self, runId: str) -> Dict[str, int]:
        """Get histogram of error codes for a run."""
        results = self.qdrant.scroll(
            collection_name=self.ERROR_CARDS_COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="runId", match=MatchValue(value=runId))]
            ),
            limit=10000,
            with_payload=True
        )
        points, _ = results

        histogram = {}
        for p in points:
            code = p.payload.get("errorCode", "UNKNOWN")
            histogram[code] = histogram.get(code, 0) + 1

        return dict(sorted(histogram.items(), key=lambda x: -x[1]))


# Example usage
async def example_usage():
    """Example of using the AIRecommendationService."""
    service = AIRecommendationService()

    # Simulate tsc output
    tsc_output = """
src/routes/+page.svelte(10,5): error TS2307: Cannot find module './missing'.
src/lib/components/Button.svelte(25,10): error TS1005: ';' expected.
src/lib/stores/user.ts(15,3): error TS2304: Cannot find name 'UserType'.
"""

    runId = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # Parse diagnostics
    cards = service.parse_tsc_output(tsc_output, runId)
    print(f"\n✅ Parsed {len(cards)} error cards")

    # Store (without embeddings for speed)
    stored = await service.store_error_cards(cards, generate_embeddings=False)
    print(f"✅ Stored {stored} cards")

    # Get histogram
    histogram = service.get_error_histogram(runId)
    print(f"\n✅ Error Histogram: {histogram}")


if __name__ == "__main__":
    asyncio.run(example_usage())
