#!/usr/bin/env python3
"""
Phase 90 - Unified Diagnostic System
Combines svelte-check + tsc + AST analysis into one enhanced tagging pipeline
"""

import os
import sys
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Literal
from dataclasses import dataclass, asdict, field
from datetime import datetime
import hashlib

@dataclass
class DiagnosticCard:
    """
    Unified diagnostic schema for any error/warning from any tool.
    This is the "single truth" layer that ACE consumes.
    """
    # Core identity
    id: str                                    # Stable hash for upserts
    kind: Literal["error", "warning"]          # Severity category

    # Source metadata
    tool: Literal["svelte-check", "tsc", "eslint", "ast-analyzer"]
    errorCode: str                             # TS1005, TS2307, etc.
    severity: Literal["error", "warning", "info"]

    # Location
    filePath: str
    line: int
    col: int

    # Content
    message: str                               # Raw diagnostic message
    signature: str                             # Normalized for clustering

    # Optional fields
    name: str = ""                             # Human readable ID
    endLine: Optional[int] = None
    endCol: Optional[int] = None    # Context (ACE filtering)
    surface: List[str] = field(default_factory=list)  # ["routes", "evidence", "ui"]
    tech: List[str] = field(default_factory=list)     # ["drizzle", "svelte", "qdrant"]

    # Clustering
    clusterId: Optional[str] = None            # Back-reference after clustering
    coordinates: Optional[Dict[str, float]] = None  # {x, y} for visualization

    # Provenance
    runId: str = ""                            # Index run identifier
    timestamp: str = ""                        # ISO8601

    def __post_init__(self):
        """Generate stable ID and normalize signature"""
        if not self.id:
            # Stable hash: tool + errorCode + filePath + line + signature
            hash_input = f"{self.tool}:{self.errorCode}:{self.filePath}:{self.line}:{self.signature}"
            self.id = hashlib.sha256(hash_input.encode()).hexdigest()[:16]

        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat() + "Z"

        if not self.signature:
            self.signature = self._normalize_message(self.message)

        if not self.name:
            filename = self.filePath.replace('\\', '/').split('/')[-1]
            self.name = f"{self.errorCode}_{filename}_{self.line}"

    @staticmethod
    def _normalize_message(msg: str) -> str:
        """
        Normalize error message for clustering.
        Example: "Cannot find name 'foo'" → "Cannot find name <ID>"
        """
        # Replace quoted identifiers with <ID>
        msg = re.sub(r"'[^']+?'", "<ID>", msg)
        msg = re.sub(r'"[^"]+?"', "<ID>", msg)

        # Replace file paths with <PATH>
        msg = re.sub(r'[a-zA-Z]:\\[^\s"]+', "<PATH>", msg)
        msg = re.sub(r'/[^\s"]+', "<PATH>", msg)

        # Replace numbers with <NUM>
        msg = re.sub(r'\b\d+\b', "<NUM>", msg)

        return msg.strip()

    def extract_surface_and_tech(self):
        """
        Auto-detect surface areas and tech stack from file path.
        Mutates self.surface and self.tech in place.
        """
        path_lower = self.filePath.lower()

        # Surface detection
        if 'routes' in path_lower:
            self.surface.append('routes')
            if '(app)' in path_lower:
                self.surface.append('app')
            if 'cases' in path_lower:
                self.surface.append('cases')
            if 'evidence' in path_lower:
                self.surface.append('evidence')
            if 'admin' in path_lower:
                self.surface.append('admin')

        if 'lib/server' in path_lower:
            self.surface.append('server')
        if 'lib/services' in path_lower:
            self.surface.append('services')
        if 'lib/stores' in path_lower:
            self.surface.append('stores')
        if 'components' in path_lower:
            self.surface.append('components')
        if 'lib/ai' in path_lower or 'lib/llm' in path_lower:
            self.surface.append('ai')

        # Tech detection
        if 'drizzle' in path_lower or 'schema' in path_lower:
            self.tech.append('drizzle')
        if 'qdrant' in path_lower:
            self.tech.append('qdrant')
        if 'redis' in path_lower:
            self.tech.append('redis')
        if 'embedding' in path_lower:
            self.tech.append('embeddings')
        if '.svelte' in path_lower:
            self.tech.append('svelte')
        if 'sveltekit' in path_lower or '+page' in path_lower or '+server' in path_lower:
            self.tech.append('sveltekit')
        if 'xstate' in path_lower or 'state-machine' in path_lower:
            self.tech.append('xstate')
        if 'phase' in path_lower:
            phase_match = re.search(r'phase(\d+)', path_lower)
            if phase_match:
                self.tech.append(f'phase{phase_match.group(1)}')

        # Deduplicate
        self.surface = list(set(self.surface))
        self.tech = list(set(self.tech))

    def to_qdrant_payload(self) -> Dict[str, Any]:
        """
        Convert to Qdrant payload with all enhanced fields.
        This is what goes into the phase90_error_cards collection.
        """
        return {
            # Core identity
            "id": self.id,
            "kind": self.kind,
            "name": self.name,

            # Source
            "tool": self.tool,
            "errorCode": self.errorCode,
            "severity": self.severity,

            # Location
            "filePath": self.filePath,
            "line": self.line,
            "col": self.col,
            "endLine": self.endLine,
            "endCol": self.endCol,

            # Content
            "message": self.message,
            "signature": self.signature,

            # Context (indexed for filtering)
            "surface": self.surface,
            "tech": self.tech,

            # Clustering
            "clusterId": self.clusterId,
            "coordinates": self.coordinates,

            # Provenance
            "runId": self.runId,
            "timestamp": self.timestamp
        }


@dataclass
class ClusterCard:
    """
    Pattern/cluster card representing a group of similar diagnostics.
    Stored in phase90_error_clusters collection.
    """
    # Core identity
    id: str                                    # cluster_0, cluster_1, ...
    kind: Literal["pattern"] = "pattern"
    name: str = ""                             # "TS1005_missing_comma_in_objects"

    # Cluster metadata
    cluster_id: str = ""                       # Same as id
    dominant_code: str = ""                    # "TS1005"
    member_count: int = 0

    # Representative examples
    top_files: List[str] = field(default_factory=list)
    top_messages: List[str] = field(default_factory=list)
    representative_errors: List[str] = field(default_factory=list)  # Error IDs

    # LLM-generated insights
    summary: str = ""                          # Natural language description
    fix_suggestion: str = ""                   # Automated fix rule

    # Context aggregation
    surface: List[str] = field(default_factory=list)  # All surfaces affected
    tech: List[str] = field(default_factory=list)     # All tech involved

    # Visualization
    coordinates: Optional[Dict[str, float]] = None  # {x, y} centroid projection
    centroid_embedding: List[float] = field(default_factory=list)  # 768d

    # Provenance
    runId: str = ""
    timestamp: str = ""

    def __post_init__(self):
        if not self.cluster_id:
            self.cluster_id = self.id
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat() + "Z"

    def to_qdrant_payload(self) -> Dict[str, Any]:
        """Enhanced cluster card payload"""
        return {
            "id": self.id,
            "kind": self.kind,
            "name": self.name,
            "cluster_id": self.cluster_id,
            "errorCode": self.dominant_code,
            "count": self.member_count,
            "top_files": self.top_files[:10],
            "top_messages": self.top_messages[:5],
            "representative_errors": self.representative_errors[:10],
            "summary": self.summary,
            "fix_suggestion": self.fix_suggestion,
            "surface": self.surface,
            "tech": self.tech,
            "coordinates": self.coordinates,
            "runId": self.runId,
            "timestamp": self.timestamp
        }


class DiagnosticParser:
    """
    Unified parser for svelte-check, tsc, and other tools.
    Outputs DiagnosticCard objects.
    """

    # Event Log format: <epoch_ms> ERROR "<filePath>" <line>:<col> "<message>"
    # Example: 1767398430921 ERROR "src\lib\file.ts" 100:3 "',' expected."
    EVENT_ERR = re.compile(
        r'^(?P<ts>\d+)\s+ERROR\s+"(?P<file>[^"]+)"\s+(?P<line>\d+):(?P<col>\d+)\s+"(?P<msg>.*)"\s*$',
        re.MULTILINE
    )

    # svelte-check format: 1767398430921 ERROR "src\\lib\\file.ts" 100:3 "',' expected."
    SVELTE_CHECK_PATTERN = re.compile(
        r'^\d+\s+(ERROR|WARN)\s+"([^"]+)"\s+(\d+):(\d+)\s+"(.+)"$',
        re.MULTILINE
    )

    # tsc format: src/file.ts(42,15): error TS2304: Cannot find name 'foo'.
    TSC_PATTERN = re.compile(
        r'^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$',
        re.MULTILINE
    )

    # Old format: c:\path\to\file.ts:42:15 - error TS2304: Cannot find name 'foo'.
    OLD_PATTERN = re.compile(
        r'^([^:]+):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$',
        re.MULTILINE
    )

    def parse(self, output: str, tool: str, run_id: str = "") -> List[DiagnosticCard]:
        """
        Parse diagnostics from tool output.
        Args:
            output: Raw tool output
            tool: Tool name
            run_id: Run provenance
        """
        cards = []

        # 1. Try robust Event Log format (svelte-check)
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue

            match = self.EVENT_ERR.match(line)
            if match:
                file_path = match.group("file").replace("\\\\", "\\")
                line_num = int(match.group("line"))
                col_num = int(match.group("col"))
                message = match.group("msg")

                # Smart Error Code Detection
                error_code = "UNKNOWN"
                ts_match = re.search(r'TS(\d+)', message)
                if ts_match:
                    error_code = f"TS{ts_match.group(1)}"
                elif "expected" in message and ("'" in message or '"' in message):
                    error_code = "SYNTAX"
                elif "Cannot find name" in message:
                    error_code = "TS2304"
                elif "Cannot find module" in message:
                    error_code = "TS2307"

                card = DiagnosticCard(
                    id="",  # Auto-generated
                    kind="error",
                    tool=tool,
                    errorCode=error_code,
                    severity="error",
                    filePath=file_path,
                    line=line_num,
                    col=col_num,
                    message=message.strip(),
                    signature="", # Auto-normalized
                    runId=run_id
                )
                card.extract_surface_and_tech()
                cards.append(card)

        if cards:
            return cards

        # 2. Fallback to other patterns if Event Log matched nothing
        # Try svelte-check format
        for match in self.SVELTE_CHECK_PATTERN.finditer(output):
            severity_str, file_path, line, col, message = match.groups()

            error_code = "TS0000"
            ts_match = re.search(r'(TS\d+)', message)
            if ts_match:
                error_code = ts_match.group(1)

            card = DiagnosticCard(
                id="",
                kind="error" if severity_str == "ERROR" else "warning",
                tool=tool,
                errorCode=error_code,
                severity="error" if severity_str == "ERROR" else "warning",
                filePath=file_path.replace('\\\\', '\\'),
                line=int(line),
                col=int(col),
                message=message.strip(),
                signature="",
                runId=run_id
            )
            card.extract_surface_and_tech()
            cards.append(card)

        # Try tsc format
        if not cards:
            for match in self.TSC_PATTERN.finditer(output):
                file_path, line, col, severity_str, error_code, message = match.groups()

                card = DiagnosticCard(
                    id="",
                    kind="error" if severity_str == "error" else "warning",
                    tool=tool,
                    errorCode=error_code,
                    severity=severity_str,
                    filePath=file_path.strip(),
                    line=int(line),
                    col=int(col),
                    message=message.strip(),
                    signature="",
                    runId=run_id
                )
                card.extract_surface_and_tech()
                cards.append(card)

        # Try old format
        if not cards:
            for match in self.OLD_PATTERN.finditer(output):
                file_path, line, col, severity_str, error_code, message = match.groups()

                card = DiagnosticCard(
                    id="",
                    kind="error" if severity_str == "error" else "warning",
                    tool=tool,
                    errorCode=error_code,
                    severity=severity_str,
                    filePath=file_path.strip(),
                    line=int(line),
                    col=int(col),
                    message=message.strip(),
                    signature="",
                    runId=run_id
                )
                card.extract_surface_and_tech()
                cards.append(card)

        return cards


def generate_run_id() -> str:
    """Generate run ID: index_2026-01-02_1810"""
    now = datetime.utcnow()
    return f"index_{now.strftime('%Y-%m-%d_%H%M')}"


if __name__ == "__main__":
    # Test the unified diagnostic schema
    parser = DiagnosticParser()

    # Test data
    svelte_check_output = '''
1767398430921 ERROR "src\\lib\\server\\db\\schema-postgres.ts" 1136:14 "Cannot redeclare block-scoped variable 'documentChunks'."
1767398430947 ERROR "src\\lib\\ClientEmbeddingGemma.ts" 100:3 "',' expected."
'''

    run_id = generate_run_id()
    cards = parser.parse(svelte_check_output, "svelte-check", run_id)

    print(f"✅ Parsed {len(cards)} diagnostic cards")
    for card in cards[:2]:
        print(f"\n📊 Card: {card.name}")
        print(f"   Error: {card.errorCode}")
        print(f"   Surface: {card.surface}")
        print(f"   Tech: {card.tech}")
        print(f"   Signature: {card.signature}")
        print(f"   Payload keys: {list(card.to_qdrant_payload().keys())}")
