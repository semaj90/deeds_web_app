#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FastMCP Codebase Indexer Tool
Exposes enhanced codebase indexing as MCP tool for agentic workflows
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import json
import os
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

# Import the enhanced indexer
sys.path.insert(0, os.path.dirname(__file__))
from phase89_enhanced_codebase_indexer import EnhancedCodebaseIndexer


@dataclass
class MCPToolDefinition:
    """FastMCP tool definition"""
    name: str
    description: str
    inputSchema: Dict


@dataclass
class MCPToolResult:
    """FastMCP tool execution result"""
    success: bool
    data: Optional[Dict] = None
    error: Optional[str] = None


class CodebaseIndexerMCPServer:
    """
    FastMCP server exposing codebase indexing tools
    """

    def __init__(self):
        self.indexer = EnhancedCodebaseIndexer()
        self.tools = self._define_tools()

    def _define_tools(self) -> List[MCPToolDefinition]:
        """Define available MCP tools"""
        return [
            MCPToolDefinition(
                name="codebase:index_file",
                description="Index a single file: extract comments, generate LLM summary, embed, auto-tag, and store in Qdrant",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Absolute or relative path to the file to index"
                        }
                    },
                    "required": ["file_path"]
                }
            ),

            MCPToolDefinition(
                name="codebase:index_directory",
                description="Index multiple files from a directory using ripgrep pattern matching",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "root_dir": {
                            "type": "string",
                            "description": "Root directory to index",
                            "default": "src"
                        },
                        "patterns": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "File patterns to match (e.g., ['*.ts', '*.svelte'])",
                            "default": ["*.ts", "*.svelte", "*.js", "*.py"]
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum files to index",
                            "default": 20
                        }
                    },
                    "required": ["root_dir"]
                }
            ),

            MCPToolDefinition(
                name="codebase:search",
                description="Search for similar files using vector similarity (comments + summary + tags)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query (natural language or technical description)"
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results to return",
                            "default": 5
                        },
                        "filter_role": {
                            "type": "string",
                            "description": "Filter by role: route|ui_component|api_endpoint|service|db_schema",
                            "default": None
                        },
                        "filter_surface": {
                            "type": "string",
                            "description": "Filter by surface: rag|kag|ace|ui|api",
                            "default": None
                        }
                    },
                    "required": ["query"]
                }
            ),

            MCPToolDefinition(
                name="codebase:extract_comments",
                description="Extract comments from a file using ripgrep-style pattern matching",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to file"
                        }
                    },
                    "required": ["file_path"]
                }
            ),

            MCPToolDefinition(
                name="codebase:stats",
                description="Get statistics about the indexed codebase",
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            )
        ]

    def execute_tool(self, tool_name: str, args: Dict) -> MCPToolResult:
        """Execute a tool call"""

        try:
            if tool_name == "codebase:index_file":
                result = self.indexer.index_file(args['file_path'])
                if result:
                    return MCPToolResult(success=True, data=result)
                else:
                    return MCPToolResult(success=False, error="File indexing failed")

            elif tool_name == "codebase:index_directory":
                root_dir = args.get('root_dir', 'src')
                patterns = args.get('patterns', ['*.ts', '*.svelte', '*.js', '*.py'])
                limit = args.get('limit', 20)

                indexed = self.indexer.index_directory(root_dir, patterns, limit)

                return MCPToolResult(success=True, data={
                    'files_indexed': len(indexed),
                    'files': indexed
                })

            elif tool_name == "codebase:search":
                query = args['query']
                top_k = args.get('top_k', 5)

                # TODO: Add filter support
                results = self.indexer.search_similar_files(query, top_k)

                return MCPToolResult(success=True, data={
                    'query': query,
                    'results': results
                })

            elif tool_name == "codebase:extract_comments":
                comments = self.indexer.extract_comments_ripgrep(args['file_path'])

                return MCPToolResult(success=True, data={
                    'file_path': args['file_path'],
                    'comments_count': len(comments),
                    'comments': comments
                })

            elif tool_name == "codebase:stats":
                collection_info = self.indexer.qdrant.get_collection('phase89_codebase_index')

                return MCPToolResult(success=True, data={
                    'collection': 'phase89_codebase_index',
                    'points_count': collection_info.points_count,
                    'vector_size': collection_info.config.params.vectors.size,
                    'distance': collection_info.config.params.vectors.distance.name
                })

            else:
                return MCPToolResult(success=False, error=f"Unknown tool: {tool_name}")

        except Exception as e:
            return MCPToolResult(success=False, error=str(e))

    def list_tools(self) -> List[Dict]:
        """List available tools"""
        return [asdict(tool) for tool in self.tools]

    def run_server(self, port: int = 3004):
        """Run as FastMCP HTTP server"""
        from http.server import HTTPServer, BaseHTTPRequestHandler

        class MCPHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                if self.path == '/tools/list':
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'tools': server.list_tools()
                    }).encode())

                elif self.path == '/tools/execute':
                    content_length = int(self.headers['Content-Length'])
                    body = json.loads(self.rfile.read(content_length))

                    result = server.execute_tool(body['tool'], body.get('args', {}))

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(asdict(result)).encode())

                else:
                    self.send_response(404)
                    self.end_headers()

        server = self
        httpd = HTTPServer(('localhost', port), MCPHandler)
        print(f"🔌 FastMCP Codebase Indexer Server running on http://localhost:{port}")
        print(f"   Tools available: {len(self.tools)}")
        print(f"   Collection: phase89_codebase_index")
        httpd.serve_forever()


def main():
    import argparse

    parser = argparse.ArgumentParser(description='FastMCP Codebase Indexer')
    parser.add_argument('--server', action='store_true', help='Run as HTTP server')
    parser.add_argument('--port', type=int, default=3004, help='Server port')
    parser.add_argument('--tool', help='Tool to execute')
    parser.add_argument('--args', help='Tool arguments (JSON)')

    args = parser.parse_args()

    mcp = CodebaseIndexerMCPServer()

    if args.server:
        mcp.run_server(args.port)

    elif args.tool:
        tool_args = json.loads(args.args) if args.args else {}
        result = mcp.execute_tool(args.tool, tool_args)

        print(json.dumps(asdict(result), indent=2))

    else:
        # List tools
        print("Available MCP Tools:")
        print("="*80)
        for tool in mcp.list_tools():
            print(f"\n🔧 {tool['name']}")
            print(f"   {tool['description']}")
            print(f"   Input: {json.dumps(tool['inputSchema'], indent=2)}")


if __name__ == "__main__":
    main()
