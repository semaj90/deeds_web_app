#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Universal Code Property Graph (CPG) Builder
Knowledge-Augmented Graph for Multi-Language Codebase Analysis

Supports: TypeScript, JavaScript, Svelte, Python, Go
Uses: Tree-sitter for parsing, unified IR schema

Graph Schema:
  Nodes: Project, File, Module, Class, Function, Method, Interface, Import, Variable
  Edges: CONTAINS, DEFINES, CALLS, IMPORTS, INHERITS, IMPLEMENTS, HAS_METHOD
"""

import os
import sys
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional, Set, Tuple
from dataclasses import dataclass, asdict, field
from datetime import datetime
from enum import Enum
import asyncio
import gzip
import numpy as np

# Tree-sitter imports
try:
    import tree_sitter_typescript as ts_typescript
    import tree_sitter_python as ts_python
    import tree_sitter_javascript as ts_javascript
    from tree_sitter import Language, Parser
    TREE_SITTER_AVAILABLE = True
except ImportError:
    TREE_SITTER_AVAILABLE = False
    print("⚠️ Tree-sitter not installed. Install with: pip install tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-javascript")

# Database clients
import psycopg2
from psycopg2.extras import execute_values
import redis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import httpx

# Fix Windows encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')


class NodeType(Enum):
    """Universal IR node types"""
    PROJECT = "Project"
    FILE = "File"
    MODULE = "Module"
    CLASS = "Class"
    INTERFACE = "Interface"
    FUNCTION = "Function"
    METHOD = "Method"
    VARIABLE = "Variable"
    IMPORT = "Import"
    EXPORT = "Export"
    TYPE = "Type"
    ROUTE = "Route"  # HTTP endpoint
    COMPONENT = "Component"  # Svelte/React component
    PARAMETER = "Parameter"
    PROPERTY = "Property"


class EdgeType(Enum):
    """Universal IR edge types"""
    CONTAINS = "CONTAINS"
    DEFINES = "DEFINES"
    CALLS = "CALLS"
    IMPORTS = "IMPORTS"
    EXPORTS = "EXPORTS"
    INHERITS = "INHERITS"
    IMPLEMENTS = "IMPLEMENTS"
    HAS_METHOD = "HAS_METHOD"
    HAS_PARAMETER = "HAS_PARAMETER"
    HAS_PROPERTY = "HAS_PROPERTY"
    DEPENDS_ON = "DEPENDS_ON"
    OVERRIDES = "OVERRIDES"
    USES = "USES"


@dataclass
class IRNode:
    """Universal Intermediate Representation Node"""
    id: str
    type: str  # NodeType value
    name: str
    qualified_name: str
    language: str  # typescript, python, svelte, go, javascript
    file_path: str
    start_line: int
    end_line: int
    properties: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['properties'] = json.dumps(d['properties'])
        return d


@dataclass
class IREdge:
    """Universal Intermediate Representation Edge"""
    id: str
    type: str  # EdgeType value
    source_id: str
    target_id: str
    properties: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['properties'] = json.dumps(d['properties'])
        return d


class UniversalCPGBuilder:
    """
    Builds a Code Property Graph from multi-language source code.
    Uses Tree-sitter for parsing and creates unified IR nodes/edges.
    """

    def __init__(self, project_name: str = "deeds-web-app"):
        self.project_name = project_name
        self.nodes: Dict[str, IRNode] = {}
        self.edges: List[IREdge] = []
        self.file_index: Dict[str, str] = {}  # file_path -> node_id

        # Initialize parsers
        self._init_parsers()

        # Initialize database clients
        self._init_db_clients()

        # Create project root node
        project_id = self._make_id("project", project_name)
        self.nodes[project_id] = IRNode(
            id=project_id,
            type=NodeType.PROJECT.value,
            name=project_name,
            qualified_name=project_name,
            language="multi",
            file_path="",
            start_line=0,
            end_line=0,
            properties={"created_at": datetime.now().isoformat()}
        )
        self.project_id = project_id

    def _init_parsers(self):
        """Initialize Tree-sitter parsers for each language"""
        self.parsers: Dict[str, Parser] = {}

        if not TREE_SITTER_AVAILABLE:
            print("⚠️ Tree-sitter not available, using regex fallback")
            return

        try:
            # TypeScript parser
            ts_parser = Parser()
            ts_parser.language = Language(ts_typescript.language_typescript())
            self.parsers['typescript'] = ts_parser
            self.parsers['tsx'] = ts_parser

            # JavaScript parser
            js_parser = Parser()
            js_parser.language = Language(ts_javascript.language_javascript())
            self.parsers['javascript'] = js_parser

            # Python parser
            py_parser = Parser()
            py_parser.language = Language(ts_python.language_python())
            self.parsers['python'] = py_parser

            print(f"✅ Initialized Tree-sitter parsers: {list(self.parsers.keys())}")
        except Exception as e:
            print(f"⚠️ Tree-sitter init error: {e}")

    def _init_db_clients(self):
        """Initialize database connections"""
        try:
            self.qdrant = QdrantClient(host="localhost", port=6333)

            # Ensure collection exists
            if not self.qdrant.collection_exists("code_property_graph"):
                self.qdrant.create_collection(
                    collection_name="code_property_graph",
                    vectors_config=VectorParams(size=768, distance=Distance.COSINE)
                )
                print("✅ Created Qdrant collection: code_property_graph")
        except Exception as e:
            print(f"⚠️ Qdrant connection error: {e}")
            self.qdrant = None

        try:
            self.pg = psycopg2.connect(
                "postgresql://legal_admin:123456@localhost:5434/legal_ai_db"
            )
            self.pg.autocommit = True
            self._init_pg_schema()
            print("✅ Connected to PostgreSQL")
        except Exception as e:
            print(f"⚠️ PostgreSQL connection error: {e}")
            self.pg = None

        try:
            self.redis = redis.from_url("redis://localhost:6379/0")
            print("✅ Connected to Redis")
        except Exception as e:
            print(f"⚠️ Redis connection error: {e}")
            self.redis = None

    def _init_pg_schema(self):
        """Create PostgreSQL tables for CPG storage"""
        cursor = self.pg.cursor()

        # Nodes table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cpg_nodes (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                qualified_name TEXT,
                language TEXT,
                file_path TEXT,
                start_line INTEGER,
                end_line INTEGER,
                properties JSONB DEFAULT '{}',
                embedding vector(768),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Edges table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cpg_edges (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                source_id TEXT REFERENCES cpg_nodes(id) ON DELETE CASCADE,
                target_id TEXT REFERENCES cpg_nodes(id) ON DELETE CASCADE,
                properties JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cpg_nodes_type ON cpg_nodes(type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cpg_nodes_language ON cpg_nodes(language)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cpg_nodes_file ON cpg_nodes(file_path)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cpg_edges_type ON cpg_edges(type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cpg_edges_source ON cpg_edges(source_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cpg_edges_target ON cpg_edges(target_id)")

        cursor.close()

    def _make_id(self, type_prefix: str, name: str, context: str = "") -> str:
        """Generate unique ID for a node"""
        content = f"{type_prefix}:{context}:{name}"
        return hashlib.md5(content.encode()).hexdigest()[:16]

    def _detect_language(self, file_path: str) -> Optional[str]:
        """Detect language from file extension"""
        ext_map = {
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.mjs': 'javascript',
            '.svelte': 'svelte',
            '.py': 'python',
            '.go': 'go',
        }
        ext = Path(file_path).suffix.lower()
        return ext_map.get(ext)

    # ==================== PARSING ====================

    def parse_file(self, file_path: str) -> Optional[IRNode]:
        """Parse a single file and add it to the graph"""
        language = self._detect_language(file_path)
        if not language:
            return None

        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as e:
            print(f"⚠️ Cannot read {file_path}: {e}")
            return None

        # Create file node
        rel_path = os.path.relpath(file_path)
        file_id = self._make_id("file", rel_path)
        file_node = IRNode(
            id=file_id,
            type=NodeType.FILE.value,
            name=os.path.basename(file_path),
            qualified_name=rel_path,
            language=language,
            file_path=rel_path,
            start_line=1,
            end_line=content.count('\n') + 1,
            properties={
                "size_bytes": len(content),
                "line_count": content.count('\n') + 1
            }
        )
        self.nodes[file_id] = file_node
        self.file_index[rel_path] = file_id

        # Add CONTAINS edge from project
        self.edges.append(IREdge(
            id=self._make_id("edge", f"{self.project_id}->{file_id}"),
            type=EdgeType.CONTAINS.value,
            source_id=self.project_id,
            target_id=file_id
        ))

        # Parse with Tree-sitter if available
        if language in self.parsers:
            self._parse_with_tree_sitter(file_path, content, language, file_id)
        else:
            # Fallback to regex-based parsing
            self._parse_with_regex(file_path, content, language, file_id)

        return file_node

    def _parse_with_tree_sitter(self, file_path: str, content: str, language: str, file_id: str):
        """Parse using Tree-sitter and extract IR nodes"""
        parser = self.parsers[language]
        tree = parser.parse(bytes(content, 'utf-8'))
        root = tree.root_node

        # Extract nodes based on language
        if language in ('typescript', 'tsx', 'javascript'):
            self._extract_js_ts_nodes(root, content, language, file_path, file_id)
        elif language == 'python':
            self._extract_python_nodes(root, content, file_path, file_id)

    def _extract_js_ts_nodes(self, root, content: str, language: str, file_path: str, file_id: str):
        """Extract nodes from TypeScript/JavaScript AST"""

        def walk(node, parent_id: str = None):
            node_type = node.type

            # Function declarations
            if node_type in ('function_declaration', 'arrow_function', 'method_definition'):
                name = ""
                for child in node.children:
                    if child.type == 'identifier':
                        name = content[child.start_byte:child.end_byte]
                        break

                if name:
                    func_id = self._make_id("function", file_path + ":" + name)
                    func_type = NodeType.METHOD.value if parent_id and self.nodes.get(parent_id, {}).type == NodeType.CLASS.value else NodeType.FUNCTION.value

                    self.nodes[func_id] = IRNode(
                        id=func_id,
                        type=func_type,
                        name=name,
                        qualified_name=f"{file_path}:{name}",
                        language=language,
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        properties={"async": "async" in content[node.start_byte:node.start_byte+10]}
                    )

                    # Add edge
                    edge_type = EdgeType.HAS_METHOD if parent_id else EdgeType.DEFINES
                    self.edges.append(IREdge(
                        id=self._make_id("edge", f"{parent_id or file_id}->{func_id}"),
                        type=edge_type.value,
                        source_id=parent_id or file_id,
                        target_id=func_id
                    ))

            # Class declarations
            elif node_type == 'class_declaration':
                name = ""
                for child in node.children:
                    if child.type == 'identifier' or child.type == 'type_identifier':
                        name = content[child.start_byte:child.end_byte]
                        break

                if name:
                    class_id = self._make_id("class", file_path + ":" + name)
                    self.nodes[class_id] = IRNode(
                        id=class_id,
                        type=NodeType.CLASS.value,
                        name=name,
                        qualified_name=f"{file_path}:{name}",
                        language=language,
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1
                    )

                    self.edges.append(IREdge(
                        id=self._make_id("edge", f"{file_id}->{class_id}"),
                        type=EdgeType.DEFINES.value,
                        source_id=file_id,
                        target_id=class_id
                    ))

                    # Parse class body
                    for child in node.children:
                        if child.type == 'class_body':
                            walk(child, class_id)

            # Interface declarations (TypeScript)
            elif node_type == 'interface_declaration':
                name = ""
                for child in node.children:
                    if child.type == 'type_identifier':
                        name = content[child.start_byte:child.end_byte]
                        break

                if name:
                    iface_id = self._make_id("interface", file_path + ":" + name)
                    self.nodes[iface_id] = IRNode(
                        id=iface_id,
                        type=NodeType.INTERFACE.value,
                        name=name,
                        qualified_name=f"{file_path}:{name}",
                        language=language,
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1
                    )

                    self.edges.append(IREdge(
                        id=self._make_id("edge", f"{file_id}->{iface_id}"),
                        type=EdgeType.DEFINES.value,
                        source_id=file_id,
                        target_id=iface_id
                    ))

            # Import statements
            elif node_type == 'import_statement':
                import_text = content[node.start_byte:node.end_byte]
                # Extract source
                source = ""
                for child in node.children:
                    if child.type == 'string':
                        source = content[child.start_byte+1:child.end_byte-1]  # Remove quotes
                        break

                if source:
                    import_id = self._make_id("import", file_path + ":" + source)
                    self.nodes[import_id] = IRNode(
                        id=import_id,
                        type=NodeType.IMPORT.value,
                        name=source,
                        qualified_name=source,
                        language=language,
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        properties={"source": source, "raw": import_text[:200]}
                    )

                    self.edges.append(IREdge(
                        id=self._make_id("edge", f"{file_id}->{import_id}"),
                        type=EdgeType.IMPORTS.value,
                        source_id=file_id,
                        target_id=import_id
                    ))

            # Export statements
            elif node_type in ('export_statement', 'export_declaration'):
                export_text = content[node.start_byte:node.end_byte]
                is_default = 'default' in export_text[:50]

                export_id = self._make_id("export", file_path + ":" + str(node.start_point[0]))
                self.nodes[export_id] = IRNode(
                    id=export_id,
                    type=NodeType.EXPORT.value,
                    name="default" if is_default else "named",
                    qualified_name=f"{file_path}:export:{node.start_point[0]}",
                    language=language,
                    file_path=file_path,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                    properties={"is_default": is_default}
                )

                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{file_id}->{export_id}"),
                    type=EdgeType.EXPORTS.value,
                    source_id=file_id,
                    target_id=export_id
                ))

            # Recurse into children
            for child in node.children:
                walk(child, parent_id)

        walk(root)

    def _extract_python_nodes(self, root, content: str, file_path: str, file_id: str):
        """Extract nodes from Python AST"""

        def walk(node, parent_id: str = None):
            node_type = node.type

            # Function definitions
            if node_type == 'function_definition':
                name = ""
                for child in node.children:
                    if child.type == 'identifier':
                        name = content[child.start_byte:child.end_byte]
                        break

                if name:
                    func_id = self._make_id("function", file_path + ":" + name)
                    is_method = parent_id and self.nodes.get(parent_id, IRNode("", "", "", "", "", "", 0, 0)).type == NodeType.CLASS.value

                    self.nodes[func_id] = IRNode(
                        id=func_id,
                        type=NodeType.METHOD.value if is_method else NodeType.FUNCTION.value,
                        name=name,
                        qualified_name=f"{file_path}:{name}",
                        language="python",
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1
                    )

                    self.edges.append(IREdge(
                        id=self._make_id("edge", f"{parent_id or file_id}->{func_id}"),
                        type=EdgeType.HAS_METHOD.value if is_method else EdgeType.DEFINES.value,
                        source_id=parent_id or file_id,
                        target_id=func_id
                    ))

            # Class definitions
            elif node_type == 'class_definition':
                name = ""
                for child in node.children:
                    if child.type == 'identifier':
                        name = content[child.start_byte:child.end_byte]
                        break

                if name:
                    class_id = self._make_id("class", file_path + ":" + name)
                    self.nodes[class_id] = IRNode(
                        id=class_id,
                        type=NodeType.CLASS.value,
                        name=name,
                        qualified_name=f"{file_path}:{name}",
                        language="python",
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1
                    )

                    self.edges.append(IREdge(
                        id=self._make_id("edge", f"{file_id}->{class_id}"),
                        type=EdgeType.DEFINES.value,
                        source_id=file_id,
                        target_id=class_id
                    ))

                    # Parse class body
                    for child in node.children:
                        if child.type == 'block':
                            for subchild in child.children:
                                walk(subchild, class_id)

            # Import statements
            elif node_type in ('import_statement', 'import_from_statement'):
                import_text = content[node.start_byte:node.end_byte]

                import_id = self._make_id("import", file_path + ":" + str(node.start_point[0]))
                self.nodes[import_id] = IRNode(
                    id=import_id,
                    type=NodeType.IMPORT.value,
                    name=import_text.split()[1] if len(import_text.split()) > 1 else import_text,
                    qualified_name=import_text,
                    language="python",
                    file_path=file_path,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                    properties={"raw": import_text[:200]}
                )

                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{file_id}->{import_id}"),
                    type=EdgeType.IMPORTS.value,
                    source_id=file_id,
                    target_id=import_id
                ))

            # Recurse
            for child in node.children:
                walk(child, parent_id)

        walk(root)

    def _parse_with_regex(self, file_path: str, content: str, language: str, file_id: str):
        """Fallback regex-based parsing when Tree-sitter not available"""
        import re

        lines = content.split('\n')

        if language == 'svelte':
            # Parse Svelte component
            self._parse_svelte_regex(file_path, content, file_id, lines)
        elif language in ('typescript', 'javascript', 'tsx'):
            self._parse_js_ts_regex(file_path, content, language, file_id, lines)
        elif language == 'python':
            self._parse_python_regex(file_path, content, file_id, lines)

    def _parse_svelte_regex(self, file_path: str, content: str, file_id: str, lines: List[str]):
        """Parse Svelte component with regex"""
        import re

        # Mark as component
        comp_id = self._make_id("component", file_path)
        self.nodes[comp_id] = IRNode(
            id=comp_id,
            type=NodeType.COMPONENT.value,
            name=os.path.basename(file_path).replace('.svelte', ''),
            qualified_name=file_path,
            language="svelte",
            file_path=file_path,
            start_line=1,
            end_line=len(lines)
        )

        self.edges.append(IREdge(
            id=self._make_id("edge", f"{file_id}->{comp_id}"),
            type=EdgeType.DEFINES.value,
            source_id=file_id,
            target_id=comp_id
        ))

        # Detect if it's a SvelteKit route
        if '+page' in file_path or '+server' in file_path or '+layout' in file_path:
            route_path = os.path.dirname(file_path).replace('src/routes', '').replace('\\', '/')
            if not route_path:
                route_path = '/'

            route_id = self._make_id("route", file_path)
            self.nodes[route_id] = IRNode(
                id=route_id,
                type=NodeType.ROUTE.value,
                name=route_path,
                qualified_name=file_path,
                language="svelte",
                file_path=file_path,
                start_line=1,
                end_line=len(lines),
                properties={"route": route_path, "type": "page" if "+page" in file_path else "server"}
            )

            self.edges.append(IREdge(
                id=self._make_id("edge", f"{comp_id}->{route_id}"),
                type=EdgeType.DEFINES.value,
                source_id=comp_id,
                target_id=route_id
            ))

        # Extract exported functions (Svelte 5 runes, props)
        prop_pattern = re.compile(r'export\s+let\s+(\w+)')
        for i, line in enumerate(lines):
            match = prop_pattern.search(line)
            if match:
                prop_name = match.group(1)
                prop_id = self._make_id("property", file_path + ":" + prop_name)
                self.nodes[prop_id] = IRNode(
                    id=prop_id,
                    type=NodeType.PROPERTY.value,
                    name=prop_name,
                    qualified_name=f"{file_path}:{prop_name}",
                    language="svelte",
                    file_path=file_path,
                    start_line=i + 1,
                    end_line=i + 1,
                    properties={"kind": "prop"}
                )

                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{comp_id}->{prop_id}"),
                    type=EdgeType.HAS_PROPERTY.value,
                    source_id=comp_id,
                    target_id=prop_id
                ))

    def _parse_js_ts_regex(self, file_path: str, content: str, language: str, file_id: str, lines: List[str]):
        """Parse JS/TS with regex fallback"""
        import re

        # Function patterns
        func_patterns = [
            re.compile(r'(?:export\s+)?(?:async\s+)?function\s+(\w+)'),
            re.compile(r'(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>'),
            re.compile(r'(?:export\s+)?const\s+(\w+)\s*:\s*\w+\s*=\s*(?:async\s+)?function'),
        ]

        # Class pattern
        class_pattern = re.compile(r'(?:export\s+)?class\s+(\w+)')

        # Interface pattern
        interface_pattern = re.compile(r'(?:export\s+)?interface\s+(\w+)')

        # Import pattern
        import_pattern = re.compile(r"import\s+.*?from\s+['\"]([^'\"]+)['\"]")

        for i, line in enumerate(lines):
            # Functions
            for pattern in func_patterns:
                match = pattern.search(line)
                if match:
                    name = match.group(1)
                    func_id = self._make_id("function", file_path + ":" + name)
                    self.nodes[func_id] = IRNode(
                        id=func_id,
                        type=NodeType.FUNCTION.value,
                        name=name,
                        qualified_name=f"{file_path}:{name}",
                        language=language,
                        file_path=file_path,
                        start_line=i + 1,
                        end_line=i + 1
                    )
                    self.edges.append(IREdge(
                        id=self._make_id("edge", f"{file_id}->{func_id}"),
                        type=EdgeType.DEFINES.value,
                        source_id=file_id,
                        target_id=func_id
                    ))
                    break

            # Classes
            match = class_pattern.search(line)
            if match:
                name = match.group(1)
                class_id = self._make_id("class", file_path + ":" + name)
                self.nodes[class_id] = IRNode(
                    id=class_id,
                    type=NodeType.CLASS.value,
                    name=name,
                    qualified_name=f"{file_path}:{name}",
                    language=language,
                    file_path=file_path,
                    start_line=i + 1,
                    end_line=i + 1
                )
                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{file_id}->{class_id}"),
                    type=EdgeType.DEFINES.value,
                    source_id=file_id,
                    target_id=class_id
                ))

            # Interfaces
            match = interface_pattern.search(line)
            if match:
                name = match.group(1)
                iface_id = self._make_id("interface", file_path + ":" + name)
                self.nodes[iface_id] = IRNode(
                    id=iface_id,
                    type=NodeType.INTERFACE.value,
                    name=name,
                    qualified_name=f"{file_path}:{name}",
                    language=language,
                    file_path=file_path,
                    start_line=i + 1,
                    end_line=i + 1
                )
                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{file_id}->{iface_id}"),
                    type=EdgeType.DEFINES.value,
                    source_id=file_id,
                    target_id=iface_id
                ))

            # Imports
            match = import_pattern.search(line)
            if match:
                source = match.group(1)
                import_id = self._make_id("import", file_path + ":" + source)
                self.nodes[import_id] = IRNode(
                    id=import_id,
                    type=NodeType.IMPORT.value,
                    name=source,
                    qualified_name=source,
                    language=language,
                    file_path=file_path,
                    start_line=i + 1,
                    end_line=i + 1
                )
                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{file_id}->{import_id}"),
                    type=EdgeType.IMPORTS.value,
                    source_id=file_id,
                    target_id=import_id
                ))

    def _parse_python_regex(self, file_path: str, content: str, file_id: str, lines: List[str]):
        """Parse Python with regex fallback"""
        import re

        func_pattern = re.compile(r'^(?:async\s+)?def\s+(\w+)\s*\(')
        class_pattern = re.compile(r'^class\s+(\w+)')
        import_pattern = re.compile(r'^(?:from\s+(\S+)\s+)?import\s+')

        for i, line in enumerate(lines):
            # Functions
            match = func_pattern.match(line)
            if match:
                name = match.group(1)
                func_id = self._make_id("function", file_path + ":" + name)
                self.nodes[func_id] = IRNode(
                    id=func_id,
                    type=NodeType.FUNCTION.value,
                    name=name,
                    qualified_name=f"{file_path}:{name}",
                    language="python",
                    file_path=file_path,
                    start_line=i + 1,
                    end_line=i + 1
                )
                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{file_id}->{func_id}"),
                    type=EdgeType.DEFINES.value,
                    source_id=file_id,
                    target_id=func_id
                ))

            # Classes
            match = class_pattern.match(line)
            if match:
                name = match.group(1)
                class_id = self._make_id("class", file_path + ":" + name)
                self.nodes[class_id] = IRNode(
                    id=class_id,
                    type=NodeType.CLASS.value,
                    name=name,
                    qualified_name=f"{file_path}:{name}",
                    language="python",
                    file_path=file_path,
                    start_line=i + 1,
                    end_line=i + 1
                )
                self.edges.append(IREdge(
                    id=self._make_id("edge", f"{file_id}->{class_id}"),
                    type=EdgeType.DEFINES.value,
                    source_id=file_id,
                    target_id=class_id
                ))

    # ==================== DIRECTORY PARSING ====================

    def parse_directory(self, root_dir: str, extensions: List[str] = None):
        """Parse all files in a directory"""
        if extensions is None:
            extensions = ['.ts', '.tsx', '.js', '.jsx', '.svelte', '.py']

        print(f"\n📁 Parsing directory: {root_dir}")

        file_count = 0
        for root, dirs, files in os.walk(root_dir):
            # Skip common non-source directories
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist', 'build', '.svelte-kit', '__pycache__', '.venv']]

            for file in files:
                if any(file.endswith(ext) for ext in extensions):
                    file_path = os.path.join(root, file)
                    self.parse_file(file_path)
                    file_count += 1

        print(f"   ✅ Parsed {file_count} files")
        print(f"   📊 Graph: {len(self.nodes)} nodes, {len(self.edges)} edges")

    # ==================== STORAGE ====================

    def save_to_postgres(self):
        """Save graph to PostgreSQL"""
        if not self.pg:
            return

        print("\n💾 Saving to PostgreSQL...")
        cursor = self.pg.cursor()

        # Clear existing data
        cursor.execute("DELETE FROM cpg_edges")
        cursor.execute("DELETE FROM cpg_nodes")

        # Insert nodes
        node_values = []
        for node in self.nodes.values():
            node_values.append((
                node.id,
                node.type,
                node.name,
                node.qualified_name,
                node.language,
                node.file_path,
                node.start_line,
                node.end_line,
                json.dumps(node.properties),
                node.embedding
            ))

        if node_values:
            execute_values(
                cursor,
                """
                INSERT INTO cpg_nodes (id, type, name, qualified_name, language, file_path, start_line, end_line, properties, embedding)
                VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    type = EXCLUDED.type,
                    name = EXCLUDED.name,
                    qualified_name = EXCLUDED.qualified_name,
                    language = EXCLUDED.language,
                    file_path = EXCLUDED.file_path,
                    start_line = EXCLUDED.start_line,
                    end_line = EXCLUDED.end_line,
                    properties = EXCLUDED.properties,
                    embedding = EXCLUDED.embedding,
                    updated_at = NOW()
                """,
                node_values,
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)"
            )

        # Insert edges
        edge_values = []
        for edge in self.edges:
            edge_values.append((
                edge.id,
                edge.type,
                edge.source_id,
                edge.target_id,
                json.dumps(edge.properties)
            ))

        if edge_values:
            execute_values(
                cursor,
                """
                INSERT INTO cpg_edges (id, type, source_id, target_id, properties)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
                """,
                edge_values
            )

        cursor.close()
        print(f"   ✅ Saved {len(self.nodes)} nodes, {len(self.edges)} edges")

    async def save_to_qdrant(self):
        """Save node embeddings to Qdrant"""
        if not self.qdrant:
            return

        print("\n📦 Saving to Qdrant...")

        points = []
        for node in self.nodes.values():
            if node.embedding:
                points.append(PointStruct(
                    id=hash(node.id) % (2**63),  # Qdrant needs int IDs
                    vector=node.embedding,
                    payload={
                        "node_id": node.id,
                        "type": node.type,
                        "name": node.name,
                        "qualified_name": node.qualified_name,
                        "language": node.language,
                        "file_path": node.file_path
                    }
                ))

        if points:
            self.qdrant.upsert(collection_name="code_property_graph", points=points)

        print(f"   ✅ Saved {len(points)} vectors")

    def get_stats(self) -> Dict[str, Any]:
        """Get graph statistics"""
        node_types = {}
        edge_types = {}
        languages = {}

        for node in self.nodes.values():
            node_types[node.type] = node_types.get(node.type, 0) + 1
            languages[node.language] = languages.get(node.language, 0) + 1

        for edge in self.edges:
            edge_types[edge.type] = edge_types.get(edge.type, 0) + 1

        return {
            "total_nodes": len(self.nodes),
            "total_edges": len(self.edges),
            "node_types": node_types,
            "edge_types": edge_types,
            "languages": languages
        }


def main():
    """Entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Build Code Property Graph")
    parser.add_argument("root_dir", nargs="?", default="src", help="Root directory to parse")
    parser.add_argument("--project", default="deeds-web-app", help="Project name")
    args = parser.parse_args()

    print("=" * 60)
    print("🏗️  Universal Code Property Graph Builder")
    print("=" * 60)

    builder = UniversalCPGBuilder(project_name=args.project)

    # Parse directory
    builder.parse_directory(args.root_dir)

    # Save to databases
    builder.save_to_postgres()
    asyncio.run(builder.save_to_qdrant())

    # Print stats
    stats = builder.get_stats()
    print("\n" + "=" * 60)
    print("📊 GRAPH STATISTICS")
    print("=" * 60)
    print(f"   Total Nodes: {stats['total_nodes']}")
    print(f"   Total Edges: {stats['total_edges']}")
    print("\n   Node Types:")
    for t, c in sorted(stats['node_types'].items(), key=lambda x: -x[1]):
        print(f"      {t}: {c}")
    print("\n   Languages:")
    for l, c in sorted(stats['languages'].items(), key=lambda x: -x[1]):
        print(f"      {l}: {c}")


if __name__ == "__main__":
    main()
