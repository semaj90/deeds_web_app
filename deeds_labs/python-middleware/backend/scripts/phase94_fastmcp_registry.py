#!/usr/bin/env python3
"""
Phase 94: FastMCP Tool Registry
Registry of all unified AST graph tools for MCP integration
"""

import json
from typing import Dict, List, Any
from pathlib import Path

class FastMCPToolRegistry:
    """Registry for unified AST graph tools"""

    def __init__(self):
        self.tools = self._define_tools()

    def _define_tools(self) -> Dict[str, Dict[str, Any]]:
        """Define all available FastMCP tools"""
        return {
            "unified_ast_query": {
                "name": "unified_ast_query",
                "description": "Query unified AST graph across TypeScript, Go, and Python errors",
                "category": "query",
                "params": {
                    "query": {"type": "string", "required": True, "description": "Search query"},
                    "languages": {"type": "array", "required": False, "default": ["typescript", "go", "python"]},
                    "limit": {"type": "integer", "required": False, "default": 10}
                },
                "returns": {
                    "type": "array",
                    "description": "List of matching errors with similarity scores"
                },
                "endpoint": "/api/unified-ast/query",
                "method": "POST",
                "example": {
                    "request": {
                        "query": "Cannot find module",
                        "languages": ["typescript", "go"],
                        "limit": 5
                    },
                    "response": [
                        {
                            "language": "typescript",
                            "message": "Cannot find module '@/lib/utils'",
                            "filePath": "src/lib/components/Button.svelte",
                            "similarity": 0.95
                        }
                    ]
                }
            },

            "cross_language_similarity": {
                "name": "cross_language_similarity",
                "description": "Find similar errors across different programming languages",
                "category": "analysis",
                "params": {
                    "error_message": {"type": "string", "required": True},
                    "source_language": {"type": "string", "required": True, "enum": ["typescript", "go", "python"]},
                    "target_languages": {"type": "array", "required": False, "default": ["typescript", "go", "python"]}
                },
                "returns": {
                    "type": "object",
                    "description": "Similar errors grouped by language"
                },
                "endpoint": "/api/unified-ast/similarity",
                "method": "POST",
                "example": {
                    "request": {
                        "error_message": "undefined variable x",
                        "source_language": "typescript"
                    },
                    "response": {
                        "go": [
                            {"message": "undefined: x", "file": "main.go", "similarity": 0.89}
                        ],
                        "python": [
                            {"message": "name 'x' is not defined", "file": "main.py", "similarity": 0.87}
                        ]
                    }
                }
            },

            "cuda_fix_priority": {
                "name": "cuda_fix_priority",
                "description": "GPU-accelerated computation of optimal error fix order using CUDA PageRank",
                "category": "optimization",
                "params": {
                    "cluster_id": {"type": "integer", "required": True},
                    "algorithm": {"type": "string", "required": False, "default": "pagerank", "enum": ["pagerank", "degree", "betweenness"]}
                },
                "returns": {
                    "type": "array",
                    "description": "Ordered list of error indices by fix priority"
                },
                "endpoint": "/api/unified-ast/cuda-priority",
                "method": "POST",
                "requires_gpu": True,
                "example": {
                    "request": {
                        "cluster_id": 0,
                        "algorithm": "pagerank"
                    },
                    "response": {
                        "priority_order": [45, 12, 89, 3, 67],
                        "computation_time_ms": 12.5,
                        "gpu_used": "NVIDIA GeForce RTX 3060 Ti"
                    }
                }
            },

            "glyph_metadata": {
                "name": "glyph_metadata",
                "description": "Query Redis for cached glyph tensor metadata",
                "category": "cache",
                "params": {
                    "cluster_id": {"type": "integer", "required": True},
                    "glyph_type": {"type": "string", "required": False, "default": "tensor", "enum": ["tensor", "similarity", "embedding"]}
                },
                "returns": {
                    "type": "object",
                    "description": "Glyph metadata including tensor shape, error count, representative sample"
                },
                "endpoint": "/api/unified-ast/glyph",
                "method": "GET",
                "cached": True,
                "example": {
                    "request": {
                        "cluster_id": 0,
                        "glyph_type": "tensor"
                    },
                    "response": {
                        "cluster_id": 0,
                        "error_count": 6234,
                        "tensor_shape": [6234, 384],
                        "representative": "Cannot find module '@/lib/utils'",
                        "cached_at": "2026-01-03T12:34:56Z"
                    }
                }
            },

            "neo4j_dependency_graph": {
                "name": "neo4j_dependency_graph",
                "description": "Visualize cross-language dependency graph from Neo4j",
                "category": "visualization",
                "params": {
                    "start_node": {"type": "string", "required": True, "enum": ["typescript", "go", "python", "unified"]},
                    "depth": {"type": "integer", "required": False, "default": 2, "min": 1, "max": 5}
                },
                "returns": {
                    "type": "object",
                    "description": "Graph nodes and edges in D3.js format"
                },
                "endpoint": "/api/unified-ast/neo4j-graph",
                "method": "POST",
                "example": {
                    "request": {
                        "start_node": "typescript",
                        "depth": 2
                    },
                    "response": {
                        "nodes": [
                            {"id": "typescript", "label": "TypeScript", "error_count": 10000},
                            {"id": "go", "label": "Go", "error_count": 14}
                        ],
                        "edges": [
                            {"source": "typescript", "target": "go", "weight": 0.45}
                        ]
                    }
                }
            },

            "agentic_recommendation": {
                "name": "agentic_recommendation",
                "description": "Get AI-generated fix recommendations for specific error types",
                "category": "ai",
                "params": {
                    "language": {"type": "string", "required": True, "enum": ["typescript", "go", "python"]},
                    "error_type": {"type": "string", "required": True},
                    "context": {"type": "object", "required": False, "description": "Additional context (file path, line number, etc.)"}
                },
                "returns": {
                    "type": "object",
                    "description": "Fix recommendation with strategy, affected files, estimated time"
                },
                "endpoint": "/api/unified-ast/recommend",
                "method": "POST",
                "cached": True,
                "cache_ttl": 3600,
                "example": {
                    "request": {
                        "language": "python",
                        "error_type": "missing-return-type"
                    },
                    "response": {
                        "language": "python",
                        "error_type": "missing-return-type",
                        "priority": "medium",
                        "fix_strategy": "Add return type annotations using mypy",
                        "affected_files": 274,
                        "estimated_time": "45 minutes",
                        "example_fix": "def foo(x: int) -> str:  # Add -> str"
                    }
                }
            },

            "batch_error_analysis": {
                "name": "batch_error_analysis",
                "description": "Analyze multiple errors in batch for efficiency",
                "category": "batch",
                "params": {
                    "error_ids": {"type": "array", "required": True, "description": "List of error IDs to analyze"},
                    "analysis_type": {"type": "string", "required": False, "default": "similarity", "enum": ["similarity", "dependency", "priority"]}
                },
                "returns": {
                    "type": "object",
                    "description": "Batch analysis results"
                },
                "endpoint": "/api/unified-ast/batch-analyze",
                "method": "POST",
                "example": {
                    "request": {
                        "error_ids": [1, 2, 3, 4, 5],
                        "analysis_type": "similarity"
                    },
                    "response": {
                        "similarity_matrix": [[1.0, 0.8, 0.3], [0.8, 1.0, 0.4], [0.3, 0.4, 1.0]],
                        "clusters": [0, 0, 1],
                        "computation_time_ms": 8.2
                    }
                }
            },

            "redis_cache_stats": {
                "name": "redis_cache_stats",
                "description": "Get Redis cache statistics and performance metrics",
                "category": "monitoring",
                "params": {},
                "returns": {
                    "type": "object",
                    "description": "Cache statistics including hit rate, total keys, memory usage"
                },
                "endpoint": "/api/unified-ast/redis-stats",
                "method": "GET",
                "example": {
                    "response": {
                        "total_keys": 113644,
                        "hit_rate": 0.952,
                        "total_commands": 1234567,
                        "memory_usage_mb": 245.6
                    }
                }
            },

            "system_health_check": {
                "name": "system_health_check",
                "description": "Check health status of all unified AST graph components",
                "category": "monitoring",
                "params": {},
                "returns": {
                    "type": "object",
                    "description": "Health status of Qdrant, Redis, Neo4j, and CUDA"
                },
                "endpoint": "/api/unified-ast/health",
                "method": "GET",
                "example": {
                    "response": {
                        "qdrant": {"status": "healthy", "collections": 5, "total_points": 79635},
                        "redis": {"status": "healthy", "total_keys": 113644, "hit_rate": 0.952},
                        "neo4j": {"status": "healthy", "nodes": 15, "edges": 12},
                        "cuda": {"status": "healthy", "gpu": "NVIDIA GeForce RTX 3060 Ti", "available": True}
                    }
                }
            }
        }

    def get_tool(self, name: str) -> Dict[str, Any]:
        """Get tool definition by name"""
        return self.tools.get(name)

    def get_tools_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get all tools in a category"""
        return [
            tool for tool in self.tools.values()
            if tool.get("category") == category
        ]

    def get_all_tools(self) -> Dict[str, Dict[str, Any]]:
        """Get all tool definitions"""
        return self.tools

    def export_openapi_spec(self, output_file: Path):
        """Export tool registry as OpenAPI spec"""
        spec = {
            "openapi": "3.0.0",
            "info": {
                "title": "Unified AST Graph API",
                "version": "1.0.0",
                "description": "Multi-language AST error analysis and fix recommendation system"
            },
            "servers": [
                {"url": "http://localhost:5175", "description": "Local development server"}
            ],
            "paths": {}
        }

        for tool_name, tool in self.tools.items():
            path = tool.get("endpoint", f"/api/{tool_name}")
            method = tool.get("method", "POST").lower()

            if path not in spec["paths"]:
                spec["paths"][path] = {}

            spec["paths"][path][method] = {
                "summary": tool.get("description"),
                "operationId": tool_name,
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    param_name: {
                                        "type": param_def.get("type"),
                                        "description": param_def.get("description", "")
                                    }
                                    for param_name, param_def in tool.get("params", {}).items()
                                }
                            }
                        }
                    }
                } if method == "post" else None,
                "responses": {
                    "200": {
                        "description": "Successful response",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": tool.get("returns", {}).get("type", "object")
                                }
                            }
                        }
                    }
                }
            }

        with open(output_file, 'w') as f:
            json.dump(spec, f, indent=2)

        print(f"✅ OpenAPI spec exported to {output_file}")

    def export_mcp_manifest(self, output_file: Path):
        """Export tool registry as MCP manifest"""
        manifest = {
            "name": "unified-ast-graph",
            "version": "1.0.0",
            "description": "Multi-language AST error analysis and fix recommendation system",
            "tools": [
                {
                    "name": tool_name,
                    "description": tool.get("description"),
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            param_name: {
                                "type": param_def.get("type"),
                                "description": param_def.get("description", "")
                            }
                            for param_name, param_def in tool.get("params", {}).items()
                        },
                        "required": [
                            param_name for param_name, param_def in tool.get("params", {}).items()
                            if param_def.get("required", False)
                        ]
                    }
                }
                for tool_name, tool in self.tools.items()
            ]
        }

        with open(output_file, 'w') as f:
            json.dump(manifest, f, indent=2)

        print(f"✅ MCP manifest exported to {output_file}")

    def display_tool_list(self):
        """Display formatted list of all tools"""
        print("=" * 80)
        print("🔧 FastMCP Tool Registry - Unified AST Graph")
        print("=" * 80)
        print()

        categories = set(tool.get("category") for tool in self.tools.values())

        for category in sorted(categories):
            tools_in_category = self.get_tools_by_category(category)
            print(f"\n{category.upper()} ({len(tools_in_category)} tools):")

            for tool in tools_in_category:
                print(f"  • {tool['name']}")
                print(f"    {tool['description']}")
                print(f"    Endpoint: {tool.get('method', 'POST')} {tool.get('endpoint')}")

                if tool.get('cached'):
                    print(f"    ⚡ Redis cached (TTL: {tool.get('cache_ttl', 'default')}s)")

                if tool.get('requires_gpu'):
                    print(f"    🎮 Requires CUDA GPU")

                print()


def main():
    import argparse

    parser = argparse.ArgumentParser(description="FastMCP Tool Registry")
    parser.add_argument('--list', action='store_true', help='List all tools')
    parser.add_argument('--export-openapi', type=str, help='Export OpenAPI spec to file')
    parser.add_argument('--export-mcp', type=str, help='Export MCP manifest to file')
    parser.add_argument('--tool', type=str, help='Show details for specific tool')

    args = parser.parse_args()

    registry = FastMCPToolRegistry()

    if args.list:
        registry.display_tool_list()

    if args.export_openapi:
        output_file = Path(args.export_openapi)
        registry.export_openapi_spec(output_file)

    if args.export_mcp:
        output_file = Path(args.export_mcp)
        registry.export_mcp_manifest(output_file)

    if args.tool:
        tool = registry.get_tool(args.tool)
        if tool:
            print("=" * 80)
            print(f"Tool: {tool['name']}")
            print("=" * 80)
            print(json.dumps(tool, indent=2))
        else:
            print(f"❌ Tool not found: {args.tool}")

    if not any(vars(args).values()):
        parser.print_help()


if __name__ == "__main__":
    main()
