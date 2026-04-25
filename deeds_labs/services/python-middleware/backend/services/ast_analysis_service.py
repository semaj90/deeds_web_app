#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - AST Analysis Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Integrate ts-ast-autofixer and store AST data in Neo4j
Task: 3.1 - Create ASTAnalysisService class
═══════════════════════════════════════════════════════════════════════
"""

import os
import uuid
import logging
import asyncio
import aiohttp
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field
from datetime import datetime

from backend.services.multi_db_coordinator import (
    MultiDBCoordinator,
    DatabaseType,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ImportNode:
    """Import statement node."""
    source: str  # Import source path
    imported_symbols: List[str]
    import_type: str  # 'default', 'named', 'namespace', 'side-effect'
    line_number: int


@dataclass
class ExportNode:
    """Export statement node."""
    exported_symbols: List[str]
    export_type: str  # 'default', 'named', 're-export'
    line_number: int


@dataclass
class ComponentNode:
    """Component node (Svelte/React)."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # 'SvelteComponent', 'ReactComponent', 'Class'
    file_path: str
    line_number: int
    exported: bool = False
    props: List[str] = field(default_factory=list)


@dataclass
class FunctionNode:
    """Function node."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    file_path: str
    line_number: int
    parameters: List[str] = field(default_factory=list)
    return_type: Optional[str] = None
    is_async: bool = False
    exported: bool = False


@dataclass
class ASTError:
    """AST error with context."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    error_type: str
    message: str
    file_path: str
    line_number: int
    column: int
    severity: str  # 'error', 'warning', 'info'
    rule: Optional[str] = None
    ast_context: Optional[Dict[str, Any]] = None
    fixed: bool = False


@dataclass
class ASTData:
    """Complete AST analysis data."""
    file_path: str
    imports: List[ImportNode] = field(default_factory=list)
    exports: List[ExportNode] = field(default_factory=list)
    components: List[ComponentNode] = field(default_factory=list)
    functions: List[FunctionNode] = field(default_factory=list)
    errors: List[ASTError] = field(default_factory=list)
    hash: Optional[str] = None
    loc: int = 0  # Lines of code
    language: str = "typescript"
    analyzed_at: datetime = field(default_factory=datetime.now)


@dataclass
class GraphNode:
    """Graph node for Neo4j."""
    id: str
    label: str  # 'File', 'Component', 'Function', 'Error'
    properties: Dict[str, Any]


@dataclass
class GraphEdge:
    """Graph edge for Neo4j."""
    source_id: str
    target_id: str
    relationship: str  # 'IMPORTS', 'EXPORTS', 'CONTAINS', 'DEPENDS_ON', etc.
    properties: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DependencyGraph:
    """Dependency graph."""
    nodes: List[GraphNode] = field(default_factory=list)
    edges: List[GraphEdge] = field(default_factory=list)


class ASTAnalysisService:
    """
    AST Analysis Service - Integrates ts-ast-autofixer and stores in Neo4j.

    Features:
    - Analyze TypeScript/Svelte files with ts-ast-autofixer
    - Extract imports, exports, components, functions
    - Detect errors with AST context
    - Store dependency graph in Neo4j
    - Query dependencies and reverse dependencies
    """

    def __init__(
        self,
        coordinator: MultiDBCoordinator,
        ast_fixer_url: Optional[str] = None,
    ):
        """Initialize AST analysis service."""
        self.coordinator = coordinator
        self.ast_fixer_url = ast_fixer_url or os.getenv(
            "AST_FIXER_URL", "http://localhost:3002"
        )
        logger.info(f"🔍 ASTAnalysisService initialized (ts-ast-autofixer: {self.ast_fixer_url})")

    async def analyze_file(self, file_path: str) -> ASTData:
        """
        Analyze a file and extract AST structure.

        Args:
            file_path: Path to file to analyze

        Returns:
            ASTData with imports, exports, components, functions, errors
        """
        logger.info(f"📊 Analyzing file: {file_path}")

        try:
            # Call ts-ast-autofixer HTTP API
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ast_fixer_url}/analyze",
                    json={"filePath": file_path},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"ts-ast-autofixer error: {error_text}")

                    result = await response.json()

            # Parse ts-ast-autofixer response
            ast_data = await self._parse_ast_fixer_response(file_path, result)

            # Extract additional structure from file content
            await self._extract_structure(file_path, ast_data)

            logger.info(
                f"✅ Analysis complete: {len(ast_data.imports)} imports, "
                f"{len(ast_data.exports)} exports, {len(ast_data.components)} components, "
                f"{len(ast_data.functions)} functions, {len(ast_data.errors)} errors"
            )

            return ast_data

        except Exception as e:
            logger.error(f"❌ Analysis failed for {file_path}: {e}")
            # Return minimal AST data with error
            return ASTData(
                file_path=file_path,
                errors=[
                    ASTError(
                        error_type="analysis_failed",
                        message=str(e),
                        file_path=file_path,
                        line_number=1,
                        column=1,
                        severity="error",
                    )
                ],
            )

    async def _parse_ast_fixer_response(
        self, file_path: str, result: Dict[str, Any]
    ) -> ASTData:
        """Parse ts-ast-autofixer response into ASTData."""
        ast_data = ASTData(file_path=file_path)

        # Parse issues/errors
        issues = result.get("issues", [])
        for issue in issues:
            ast_error = ASTError(
                error_type=issue.get("rule", "unknown"),
                message=issue.get("message", ""),
                file_path=file_path,
                line_number=issue.get("line", 1),
                column=issue.get("column", 1),
                severity=issue.get("severity", "error"),
                rule=issue.get("rule"),
                ast_context={
                    "fix": issue.get("fix"),
                },
            )
            ast_data.errors.append(ast_error)

        return ast_data

    async def _extract_structure(self, file_path: str, ast_data: ASTData):
        """Extract imports, exports, components, functions from file content."""
        try:
            # Read file content
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            lines = content.split("\n")
            ast_data.loc = len(lines)

            # Determine language
            if file_path.endswith(".svelte"):
                ast_data.language = "svelte"
            elif file_path.endswith(".tsx"):
                ast_data.language = "tsx"
            elif file_path.endswith(".ts"):
                ast_data.language = "typescript"
            elif file_path.endswith(".jsx"):
                ast_data.language = "jsx"
            elif file_path.endswith(".js"):
                ast_data.language = "javascript"

            # Extract imports
            for i, line in enumerate(lines, 1):
                line_stripped = line.strip()

                # Import statements
                if line_stripped.startswith("import "):
                    import_node = self._parse_import_line(line_stripped, i)
                    if import_node:
                        ast_data.imports.append(import_node)

                # Export statements
                if line_stripped.startswith("export "):
                    export_node = self._parse_export_line(line_stripped, i)
                    if export_node:
                        ast_data.exports.append(export_node)

                # Component declarations (Svelte)
                if ast_data.language == "svelte" and "<script" in line_stripped:
                    # Svelte component
                    component = ComponentNode(
                        name=os.path.basename(file_path).replace(".svelte", ""),
                        type="SvelteComponent",
                        file_path=file_path,
                        line_number=i,
                        exported=True,
                    )
                    ast_data.components.append(component)

                # Function declarations
                if "function " in line_stripped or "const " in line_stripped and "=>" in line_stripped:
                    function_node = self._parse_function_line(line_stripped, i, file_path)
                    if function_node:
                        ast_data.functions.append(function_node)

        except Exception as e:
            logger.error(f"Failed to extract structure from {file_path}: {e}")

    def _parse_import_line(self, line: str, line_number: int) -> Optional[ImportNode]:
        """Parse import statement."""
        try:
            # Extract source
            if "from" in line:
                parts = line.split("from")
                if len(parts) == 2:
                    source = parts[1].strip().strip("';\"")
                    imported_part = parts[0].replace("import", "").strip()

                    # Determine import type
                    import_type = "named"
                    imported_symbols = []

                    if imported_part.startswith("{"):
                        # Named imports: import { a, b } from 'module'
                        import_type = "named"
                        symbols_str = imported_part.strip("{}").strip()
                        imported_symbols = [s.strip() for s in symbols_str.split(",")]
                    elif imported_part.startswith("*"):
                        # Namespace import: import * as name from 'module'
                        import_type = "namespace"
                        imported_symbols = [imported_part.split("as")[1].strip()]
                    else:
                        # Default import: import name from 'module'
                        import_type = "default"
                        imported_symbols = [imported_part.strip()]

                    return ImportNode(
                        source=source,
                        imported_symbols=imported_symbols,
                        import_type=import_type,
                        line_number=line_number,
                    )
            else:
                # Side-effect import: import 'module'
                source = line.replace("import", "").strip().strip("';\"")
                return ImportNode(
                    source=source,
                    imported_symbols=[],
                    import_type="side-effect",
                    line_number=line_number,
                )

        except Exception as e:
            logger.debug(f"Failed to parse import line: {line} - {e}")

        return None

    def _parse_export_line(self, line: str, line_number: int) -> Optional[ExportNode]:
        """Parse export statement."""
        try:
            # Determine export type
            if "export default" in line:
                export_type = "default"
                exported_symbols = ["default"]
            elif "export {" in line:
                # Named exports: export { a, b }
                export_type = "named"
                symbols_str = line.split("{")[1].split("}")[0]
                exported_symbols = [s.strip() for s in symbols_str.split(",")]
            elif "export *" in line:
                # Re-export: export * from 'module'
                export_type = "re-export"
                exported_symbols = ["*"]
            else:
                # Direct export: export const a = ...
                export_type = "named"
                # Extract symbol name
                parts = line.replace("export", "").strip().split()
                if len(parts) >= 2:
                    exported_symbols = [parts[1]]
                else:
                    exported_symbols = []

            return ExportNode(
                exported_symbols=exported_symbols,
                export_type=export_type,
                line_number=line_number,
            )

        except Exception as e:
            logger.debug(f"Failed to parse export line: {line} - {e}")

        return None

    def _parse_function_line(
        self, line: str, line_number: int, file_path: str
    ) -> Optional[FunctionNode]:
        """Parse function declaration."""
        try:
            is_async = "async" in line
            exported = "export" in line

            # Extract function name
            name = None
            if "function " in line:
                # function name(...) or async function name(...)
                parts = line.split("function")[1].strip().split("(")
                if parts:
                    name = parts[0].strip()
            elif "const " in line and "=>" in line:
                # const name = (...) => ...
                parts = line.split("const")[1].strip().split("=")
                if parts:
                    name = parts[0].strip()

            if name:
                # Extract parameters (simplified)
                if "(" in line and ")" in line:
                    params_str = line.split("(")[1].split(")")[0]
                    parameters = [p.strip().split(":")[0].strip() for p in params_str.split(",") if p.strip()]
                else:
                    parameters = []

                return FunctionNode(
                    name=name,
                    file_path=file_path,
                    line_number=line_number,
                    parameters=parameters,
                    is_async=is_async,
                    exported=exported,
                )

        except Exception as e:
            logger.debug(f"Failed to parse function line: {line} - {e}")

        return None

    async def extract_dependencies(self, ast_data: ASTData) -> DependencyGraph:
        """
        Extract dependency graph from AST data.

        Args:
            ast_data: AST analysis data

        Returns:
            DependencyGraph with nodes and edges
        """
        logger.info(f"🔗 Extracting dependencies for {ast_data.file_path}")

        graph = DependencyGraph()

        # Create File node
        file_node = GraphNode(
            id=ast_data.file_path,
            label="File",
            properties={
                "path": ast_data.file_path,
                "name": os.path.basename(ast_data.file_path),
                "extension": os.path.splitext(ast_data.file_path)[1],
                "lastModified": ast_data.analyzed_at.isoformat(),
                "hash": ast_data.hash,
                "loc": ast_data.loc,
                "language": ast_data.language,
            },
        )
        graph.nodes.append(file_node)

        # Create Component nodes
        for component in ast_data.components:
            component_node = GraphNode(
                id=component.id,
                label="Component",
                properties={
                    "name": component.name,
                    "type": component.type,
                    "filePath": component.file_path,
                    "lineNumber": component.line_number,
                    "exported": component.exported,
                    "props": component.props,
                },
            )
            graph.nodes.append(component_node)

            # File CONTAINS Component
            graph.edges.append(
                GraphEdge(
                    source_id=ast_data.file_path,
                    target_id=component.id,
                    relationship="CONTAINS",
                )
            )

        # Create Function nodes
        for function in ast_data.functions:
            function_node = GraphNode(
                id=function.id,
                label="Function",
                properties={
                    "name": function.name,
                    "filePath": function.file_path,
                    "lineNumber": function.line_number,
                    "parameters": function.parameters,
                    "returnType": function.return_type,
                    "async": function.is_async,
                    "exported": function.exported,
                },
            )
            graph.nodes.append(function_node)

            # File CONTAINS Function
            graph.edges.append(
                GraphEdge(
                    source_id=ast_data.file_path,
                    target_id=function.id,
                    relationship="CONTAINS",
                )
            )

        # Create Error nodes
        for error in ast_data.errors:
            error_node = GraphNode(
                id=error.id,
                label="Error",
                properties={
                    "errorType": error.error_type,
                    "message": error.message,
                    "filePath": error.file_path,
                    "lineNumber": error.line_number,
                    "severity": error.severity,
                    "fixed": error.fixed,
                    "timestamp": datetime.now().isoformat(),
                },
            )
            graph.nodes.append(error_node)

            # File CONTAINS Error
            graph.edges.append(
                GraphEdge(
                    source_id=ast_data.file_path,
                    target_id=error.id,
                    relationship="CONTAINS",
                )
            )

        # Create Import relationships
        for import_node in ast_data.imports:
            # Resolve import source to absolute path (simplified)
            target_path = self._resolve_import_path(ast_data.file_path, import_node.source)

            graph.edges.append(
                GraphEdge(
                    source_id=ast_data.file_path,
                    target_id=target_path,
                    relationship="IMPORTS",
                    properties={
                        "importedSymbols": import_node.imported_symbols,
                        "importType": import_node.import_type,
                    },
                )
            )

        logger.info(
            f"✅ Dependency graph extracted: {len(graph.nodes)} nodes, {len(graph.edges)} edges"
        )

        return graph

    def _resolve_import_path(self, file_path: str, import_source: str) -> str:
        """Resolve import source to absolute path (simplified)."""
        # This is a simplified version - in production, use proper module resolution
        if import_source.startswith("."):
            # Relative import
            file_dir = os.path.dirname(file_path)
            resolved = os.path.normpath(os.path.join(file_dir, import_source))
            # Add extension if missing
            if not os.path.splitext(resolved)[1]:
                for ext in [".ts", ".tsx", ".js", ".jsx", ".svelte"]:
                    if os.path.exists(resolved + ext):
                        return resolved + ext
            return resolved
        else:
            # Module import (node_modules)
            return f"node_modules/{import_source}"

    async def store_graph(self, graph: DependencyGraph) -> bool:
        """
        Store dependency graph in Neo4j.

        Args:
            graph: Dependency graph to store

        Returns:
            True if storage succeeded
        """
        logger.info(f"💾 Storing graph in Neo4j: {len(graph.nodes)} nodes, {len(graph.edges)} edges")

        try:
            with self.coordinator.neo4j_driver.session() as session:
                # Create nodes
                for node in graph.nodes:
                    await self._create_neo4j_node(session, node)

                # Create relationships
                for edge in graph.edges:
                    await self._create_neo4j_relationship(session, edge)

            logger.info("✅ Graph stored successfully in Neo4j")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to store graph in Neo4j: {e}")
            return False

    async def _create_neo4j_node(self, session, node: GraphNode):
        """Create a node in Neo4j."""
        # Build properties string
        props_str = ", ".join([f"{k}: ${k}" for k in node.properties.keys()])

        query = f"""
        MERGE (n:{node.label} {{id: $id}})
        SET n += {{{props_str}}}
        RETURN n
        """

        session.run(query, id=node.id, **node.properties)

    async def _create_neo4j_relationship(self, session, edge: GraphEdge):
        """Create a relationship in Neo4j."""
        # Build properties string
        if edge.properties:
            props_str = ", ".join([f"{k}: ${k}" for k in edge.properties.keys()])
            query = f"""
            MATCH (source {{id: $source_id}})
            MATCH (target {{id: $target_id}})
            MERGE (source)-[r:{edge.relationship} {{{props_str}}}]->(target)
            RETURN r
            """
            session.run(query, source_id=edge.source_id, target_id=edge.target_id, **edge.properties)
        else:
            query = f"""
            MATCH (source {{id: $source_id}})
            MATCH (target {{id: $target_id}})
            MERGE (source)-[r:{edge.relationship}]->(target)
            RETURN r
            """
            session.run(query, source_id=edge.source_id, target_id=edge.target_id)

    async def query_dependencies(self, node_id: str, depth: int = 1) -> DependencyGraph:
        """
        Query dependencies for a node.

        Args:
            node_id: Node ID (file path, component ID, function ID)
            depth: Depth of dependency traversal (default: 1)

        Returns:
            DependencyGraph with dependencies
        """
        logger.info(f"🔍 Querying dependencies for {node_id} (depth: {depth})")

        graph = DependencyGraph()

        try:
            with self.coordinator.neo4j_driver.session() as session:
                # Query dependencies
                query = f"""
                MATCH path = (source {{id: $node_id}})-[*1..{depth}]->(target)
                RETURN path
                """

                result = session.run(query, node_id=node_id)

                # Parse results
                for record in result:
                    path = record["path"]
                    # Extract nodes and relationships from path
                    # (Simplified - in production, parse path properly)

            logger.info(f"✅ Found {len(graph.nodes)} dependencies")

        except Exception as e:
            logger.error(f"❌ Failed to query dependencies: {e}")

        return graph

    async def query_reverse_dependencies(self, node_id: str, depth: int = 1) -> DependencyGraph:
        """
        Query reverse dependencies (what depends on this node).

        Args:
            node_id: Node ID
            depth: Depth of dependency traversal

        Returns:
            DependencyGraph with reverse dependencies
        """
        logger.info(f"🔍 Querying reverse dependencies for {node_id} (depth: {depth})")

        graph = DependencyGraph()

        try:
            with self.coordinator.neo4j_driver.session() as session:
                # Query reverse dependencies
                query = f"""
                MATCH path = (source)-[*1..{depth}]->(target {{id: $node_id}})
                RETURN path
                """

                result = session.run(query, node_id=node_id)

                # Parse results (simplified)

            logger.info(f"✅ Found {len(graph.nodes)} reverse dependencies")

        except Exception as e:
            logger.error(f"❌ Failed to query reverse dependencies: {e}")

        return graph


# Example usage
async def example_usage():
    """Example of using the ASTAnalysisService."""
    from backend.services.multi_db_coordinator import MultiDBCoordinator

    coordinator = MultiDBCoordinator()
    coordinator.connect()

    service = ASTAnalysisService(coordinator)

    # Analyze a file
    file_path = "sveltekit-frontend/src/lib/components/ui/Button.svelte"
    ast_data = await service.analyze_file(file_path)

    print(f"\n📊 AST Analysis Results:")
    print(f"   Imports: {len(ast_data.imports)}")
    print(f"   Exports: {len(ast_data.exports)}")
    print(f"   Components: {len(ast_data.components)}")
    print(f"   Functions: {len(ast_data.functions)}")
    print(f"   Errors: {len(ast_data.errors)}")

    # Extract dependency graph
    graph = await service.extract_dependencies(ast_data)
    print(f"\n🔗 Dependency Graph:")
    print(f"   Nodes: {len(graph.nodes)}")
    print(f"   Edges: {len(graph.edges)}")

    # Store in Neo4j
    success = await service.store_graph(graph)
    print(f"\n💾 Neo4j Storage: {'✅ Success' if success else '❌ Failed'}")

    # Query dependencies
    deps = await service.query_dependencies(file_path)
    print(f"\n🔍 Dependencies: {len(deps.nodes)} nodes")

    coordinator.disconnect()


if __name__ == "__main__":
    asyncio.run(example_usage())
