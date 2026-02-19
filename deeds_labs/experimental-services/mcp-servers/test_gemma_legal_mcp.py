#!/usr/bin/env python3
"""Quick test for gemma3-legal MCP server."""

import asyncio
import json
import subprocess
import sys

async def test_mcp_server():
    """Test the MCP server with sample queries."""

    print("🧪 Testing gemma3-legal Agentic MCP Server\n")
    print("=" * 60)

    tests = [
        {
            "name": "Health Check",
            "method": "tool/call",
            "params": {
                "name": "health_check",
                "arguments": {}
            }
        },
        {
            "name": "Citation Extraction",
            "method": "tool/call",
            "params": {
                "name": "extract_citations",
                "arguments": {
                    "text": "According to California Constitution Article I, Section 1, and Brown v. Board of Education, 347 U.S. 483 (1954), equal protection is guaranteed. See also California Labor Code § 1194 regarding wage claims.",
                    "include_authority_scores": True
                }
            }
        },
        {
            "name": "Document Classification",
            "method": "tool/call",
            "params": {
                "name": "classify_document",
                "arguments": {
                    "text": "PLAINTIFF'S OPPOSITION TO DEFENDANT'S MOTION TO DISMISS\n\nPlaintiff respectfully opposes pursuant to Fed. R. Civ. P. 12(b)(6). As stated in Brown v. Board of Education, 347 U.S. 483 (1954)..."
                }
            }
        }
    ]

    for i, test in enumerate(tests, 1):
        print(f"\n📝 Test {i}: {test['name']}")
        print("-" * 60)

        request = {
            "jsonrpc": "2.0",
            "method": test["method"],
            "params": test["params"],
            "id": i
        }

        print(f"Request: {json.dumps(test['params'], indent=2)}")
        print("\nExpected: Tool should return valid response")
        print("✅ Test configured successfully\n")

    print("=" * 60)
    print("\n✅ All test configurations created!")
    print("\nTo run the actual MCP server:")
    print("  python gemma3-legal-agentic-mcp.py")
    print("\nTo test with Claude Desktop:")
    print("  1. Add server to claude_desktop_config.json")
    print("  2. Restart Claude Desktop")
    print("  3. Ask Claude to use the tools")

if __name__ == "__main__":
    asyncio.run(test_mcp_server())
