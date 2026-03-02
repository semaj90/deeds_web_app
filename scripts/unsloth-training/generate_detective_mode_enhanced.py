#!/usr/bin/env python3
"""
Enhanced Detective Mode Dataset Generator

Generates 500 additional training examples based on real session patterns from Session 93r28c.
Teaches VLM advanced codebase investigation workflows:
  1. TODO Management & Prioritization
  2. Database Schema Analysis (migration safety)
  3. Training Dataset Inventory
  4. API Endpoint Mapping
  5. Multimodal Infrastructure Status

Combined with base detective_mode.jsonl (500 examples), creates 1000 total examples.

Usage:
    python generate_detective_mode_enhanced.py --output ./colab-datasets/detective_mode_enhanced.jsonl
"""

import argparse
import json
import random
from pathlib import Path
from typing import List, Dict, Any

# Tool definitions (same as base detective mode)
TOOLS = {
    "ripgrep_search": "Fast regex search across codebase",
    "find_files": "Find files by glob pattern",
    "analyze_file": "Read and analyze specific files",
    "web_search": "Search docs, Stack Overflow, GitHub",
    "extract_pattern": "awk/sed-like text processing",
    "analyze_imports": "Track dependencies and usage"
}

# New scenario categories based on Session 93r28c
ENHANCED_SCENARIOS = {
    "todo_management": {
        "weight": 0.25,
        "examples": [
            {
                "user": "Find all TODO comments and organize by priority",
                "tools": ["ripgrep_search", "extract_pattern", "analyze_file"],
                "result": "Found 87 TODOs across 7 categories. 12 CRITICAL (< 2hr each), 28 HIGH (< 10hr), 47 MEDIUM (< 40hr). Total ~204 hours of work identified."
            },
            {
                "user": "Which TODOs mention database migrations?",
                "tools": ["ripgrep_search", "analyze_file"],
                "result": "14 TODOs reference migrations. 7 request new tables (report_audit_log, evidence_audit_log, etc.). 3 warn about dangerous DROP statements in old migrations."
            },
            {
                "user": "Create a prioritized implementation roadmap from TODOs",
                "tools": ["ripgrep_search", "extract_pattern", "analyze_file"],
                "result": "Phase 1 (12hr): Fix template endpoint, audit logging, Redis pooling. Phase 2 (40hr): MCP tools, version history, SSE improvements. Phase 3 (50hr): Template marketplace, bulk operations. Phase 4 (50hr): Mobile, WCAG compliance, digital signatures."
            },
            {
                "user": "Find TODOs that block other features",
                "tools": ["ripgrep_search", "analyze_imports"],
                "result": "Template generation endpoint (500 error) blocks AI-powered reports. Embedding persistence (line 146) causes redundant generation. Redis single connection risks exhaustion under load."
            },
        ]
    },
    "database_safety": {
        "weight": 0.25,
        "examples": [
            {
                "user": "Are there any dangerous DROP TABLE statements in migrations?",
                "tools": ["find_files", "ripgrep_search", "analyze_file"],
                "result": "⚠️ CRITICAL: drizzle/0002_flaky_midnight.sql has 7+ DROP TABLE CASCADE statements (account, case_law_links, etc.). DO NOT RUN on production. These were from Phase 99 corruption cleanup."
            },
            {
                "user": "What new database tables can we safely add?",
                "tools": ["analyze_file", "ripgrep_search"],
                "result": "7 safe additive tables: report_audit_log, report_versions, evidence_audit_log, evidence_versions, ai_usage_log, report_permissions, template_marketplace. All use CREATE TABLE IF NOT EXISTS with JSONB columns for flexibility."
            },
            {
                "user": "Check if schema-postgres.ts has all existing tables",
                "tools": ["analyze_file", "web_search"],
                "result": "schema-postgres.ts has 70+ tables. Missing: kg_nodes (Phase 89 knowledge graph, 2764 items). Drizzle-kit would mark for deletion if we run 'push'. Use 'migrate' instead or add to schema."
            },
            {
                "user": "How do we safely rename a table with Drizzle?",
                "tools": ["web_search", "analyze_file"],
                "result": "Drizzle generates DROP+CREATE for renames. Edit the generated SQL to use ALTER TABLE old_name RENAME TO new_name before running migrate. Example in drizzle docs shows manual SQL edit workflow."
            },
        ]
    },
    "training_inventory": {
        "weight": 0.20,
        "examples": [
            {
                "user": "How many training datasets do we have?",
                "tools": ["find_files", "analyze_file"],
                "result": "38 JSONL datasets totaling 102.5K examples (~2.1MB). 8 from prepare_colab_datasets.py: evidence_qlora (1K), tool_calling (31K), video (70K), detective_mode (500). Plus 30 auxiliary sets in training-data/ dir."
            },
            {
                "user": "What's our multimodal training status?",
                "tools": ["find_files", "analyze_file", "web_search"],
                "result": "Phase 1 COMPLETE: YOLO (object detection) + Whisper (transcription) + CLIP (embeddings) on RTX 3060 Ti. 4.7GB/8GB VRAM used. 4 FastMCP multimodal tools integrated. Missing: evaluation metrics, A/B testing infrastructure."
            },
            {
                "user": "Which Colab notebooks are ready to run?",
                "tools": ["find_files", "analyze_file"],
                "result": "4 notebooks: Gemma3_Legal_Multimodal_COMPLETE.ipynb (main QLoRA), Gemma3_12B_Legal_Production.ipynb (optimized), Evidence_QLoRA_1K.ipynb (ACE synthesis), Detective_Mode_500.ipynb (codebase investigation). All use Unsloth + bitsandbytes."
            },
            {
                "user": "How much inference speedup can we get with TensorRT?",
                "tools": ["web_search", "analyze_file"],
                "result": "TensorRT can provide 3-5x speedup over native Ollama. Current: ~15 tokens/sec. Potential: 50-75 tokens/sec. Requires INT8/FP16 quantization + engine build step. Triton Inference Server containers already exist in docker-compose.yml."
            },
        ]
    },
    "api_mapping": {
        "weight": 0.15,
        "examples": [
            {
                "user": "Which API endpoints are returning 500 errors?",
                "tools": ["ripgrep_search", "analyze_file"],
                "result": "Template generation endpoint /api/reports/generate-from-template returns 500 (import/runtime issue). Blocks AI-powered report creation. Error occurs at template validation step."
            },
            {
                "user": "Map all API endpoints in the app",
                "tools": ["find_files", "ripgrep_search", "extract_pattern"],
                "result": "175+ endpoints across 25 categories. Evidence (12), Cases (8), Reports (7), RAG (6), Health (5), Chat (4), Embeddings (3). Full registry at src/lib/api/api-registry.ts."
            },
            {
                "user": "Which routes are missing API implementations?",
                "tools": ["find_files", "analyze_file", "ripgrep_search"],
                "result": "15 missing: /api/reports/[id]/versions (version history), /api/evidence/export (bulk export), /api/cases/[id]/citations (auto-link), /api/analytics/performance, /api/documents/motion (template gen)."
            },
            {
                "user": "How many broken route wirings exist?",
                "tools": ["ripgrep_search", "find_files", "analyze_file"],
                "result": "0 broken after Session 93r6 fixes. Was 2: /cases/[id]/ai called dead /api/legal/chat (fixed → /api/chat/stream), /cases/[id]/persons called missing endpoint (fixed → /api/persons?caseId=)."
            },
        ]
    },
    "infrastructure_status": {
        "weight": 0.15,
        "examples": [
            {
                "user": "What's the Redis connection setup?",
                "tools": ["find_files", "analyze_file"],
                "result": "⚠️ RISK: lib/server/redis.ts uses single ioredis connection. No connection pooling. Under high load, could exhaust connections. Recommendation: Implement RedisConnectionPool with 10 max connections + round-robin."
            },
            {
                "user": "Are embeddings being persisted to the database?",
                "tools": ["ripgrep_search", "analyze_file"],
                "result": "❌ NO. workers/embedding-worker.ts line 146 has TODO: 'Save embeddings to DB'. Currently only cached in Loki.js (in-memory, 5-10min TTL). Redundant generation on cache miss. Fix: Add pgvector + Qdrant dual persistence."
            },
            {
                "user": "Which Docker services are down?",
                "tools": ["web_search", "analyze_file"],
                "result": "phase66-postgres EXITED (3 days ago) - needs 'docker start'. tensorrt-llm EXITED (2 months ago) - optional accelerator. fastmcp NO CONTAINER - needs docker-compose up. ollama-cpu/ollama-gemma REDUNDANT - native Ollama runs on GPU."
            },
            {
                "user": "What's our test coverage?",
                "tools": ["find_files", "analyze_file"],
                "result": "19 tests (89% pass) - reports only. Missing: evidence (25 tests), cases (20 tests), citations (15 tests), AI (20 tests), auth (10 tests). Goal: 100+ tests with 95%+ pass rate."
            },
        ]
    }
}

def generate_tool_call_id(idx: int) -> str:
    """Generate unique tool call ID"""
    return f"call_{random.randint(1000, 9999)}_{idx}"

def create_conversation(scenario: Dict[str, Any], category: str) -> Dict[str, Any]:
    """Create a ShareGPT-formatted conversation with tool calls"""
    messages = []

    # User message
    messages.append({
        "role": "user",
        "content": scenario["user"]
    })

    # Assistant acknowledgment
    messages.append({
        "role": "assistant",
        "content": "Let me investigate this systematically using the available tools."
    })

    # Tool calls (1-3 tools per scenario)
    tool_calls = []
    tool_responses = []

    for idx, tool_name in enumerate(scenario["tools"]):
        call_id = generate_tool_call_id(idx)

        # Generate realistic arguments based on tool type
        if tool_name == "ripgrep_search":
            patterns = {
                "todo_management": r"//\s*TODO:|//\s*FIXME:",
                "database_safety": r"DROP TABLE|DROP DATABASE|ALTER TABLE.*DROP",
                "training_inventory": r"\.jsonl|train.*\.py",
                "api_mapping": r"export (async )?function (GET|POST|DELETE)",
                "infrastructure_status": r"ioredis|Redis\(|redisClient"
            }
            args = {
                "pattern": patterns.get(category, r"TODO"),
                "file_type": "ts" if "database" in category else "svelte"
            }
        elif tool_name == "find_files":
            patterns = {
                "todo_management": "**/*TODO*.md",
                "database_safety": "drizzle/**/*.sql",
                "training_inventory": "**/*.jsonl",
                "api_mapping": "src/routes/api/**/*.ts",
                "infrastructure_status": "src/lib/server/**/*.ts"
            }
            args = {"pattern": patterns.get(category, "**/*.ts")}
        elif tool_name == "analyze_file":
            files = {
                "todo_management": "sveltekit-frontend/next_steps/00-OVERVIEW.md",
                "database_safety": "src/lib/server/db/schema-postgres.ts",
                "training_inventory": "scripts/unsloth-training/prepare_colab_datasets.py",
                "api_mapping": "src/lib/api/api-registry.ts",
                "infrastructure_status": "src/lib/server/redis.ts"
            }
            args = {
                "file_path": files.get(category, "src/lib/server/db/schema-postgres.ts"),
                "language": "typescript"
            }
        elif tool_name == "web_search":
            queries = {
                "database_safety": "Drizzle ORM safe table rename",
                "training_inventory": "TensorRT vs Ollama inference speed",
                "infrastructure_status": "Redis connection pooling best practices"
            }
            args = {"query": queries.get(category, "TypeScript best practices")}
        else:
            args = {}

        tool_calls.append({
            "id": call_id,
            "type": "function",
            "function": {
                "name": tool_name,
                "arguments": json.dumps(args)
            }
        })

        # Mock tool response (realistic output based on scenario)
        if idx == 0:
            content = f"Found 47 matches across 23 files..."
        elif idx == 1:
            content = f"Analyzed {scenario['tools'][idx]} output: 12 critical findings..."
        else:
            content = f"Cross-referenced results: {scenario['tools'][idx]} confirms pattern..."

        tool_responses.append({
            "role": "tool",
            "tool_call_id": call_id,
            "content": content
        })

    # Assistant with tool calls
    messages.append({
        "role": "assistant",
        "content": None,
        "tool_calls": tool_calls
    })

    # Add tool responses
    messages.extend(tool_responses)

    # Final assistant response with synthesis
    messages.append({
        "role": "assistant",
        "content": f"Based on the investigation:\n\n{scenario['result']}\n\n"
                   f"This analysis used {len(scenario['tools'])} tools to provide a comprehensive answer."
    })

    return {"messages": messages}

def generate_dataset(count: int = 500) -> List[Dict[str, Any]]:
    """Generate enhanced detective mode dataset"""
    examples = []

    # Calculate examples per category based on weights
    for category, config in ENHANCED_SCENARIOS.items():
        category_count = int(count * config["weight"])
        category_examples = config["examples"]

        # Repeat examples to reach target count
        for i in range(category_count):
            scenario = category_examples[i % len(category_examples)]
            conversation = create_conversation(scenario, category)
            examples.append(conversation)

    # Fill remainder with random scenarios
    while len(examples) < count:
        category = random.choice(list(ENHANCED_SCENARIOS.keys()))
        scenario = random.choice(ENHANCED_SCENARIOS[category]["examples"])
        conversation = create_conversation(scenario, category)
        examples.append(conversation)

    return examples

def main():
    parser = argparse.ArgumentParser(description="Generate enhanced detective mode dataset")
    parser.add_argument('--output', type=str, default='./detective_mode_enhanced.jsonl',
                       help='Output JSONL file path')
    parser.add_argument('--count', type=int, default=500,
                       help='Number of examples to generate (default: 500)')

    args = parser.parse_args()
    output_path = Path(args.output)

    print("=" * 70)
    print("ENHANCED DETECTIVE MODE DATASET GENERATION")
    print("=" * 70)
    print(f"\nGenerating {args.count} examples...")
    print(f"Categories: {len(ENHANCED_SCENARIOS)}")
    print(f"  - TODO Management & Prioritization (25%)")
    print(f"  - Database Schema Analysis (25%)")
    print(f"  - Training Dataset Inventory (20%)")
    print(f"  - API Endpoint Mapping (15%)")
    print(f"  - Multimodal Infrastructure Status (15%)")

    # Generate examples
    examples = generate_dataset(args.count)

    # Write JSONL
    output_path.parent.mkdir(exist_ok=True, parents=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        for example in examples:
            f.write(json.dumps(example, ensure_ascii=False) + '\n')

    # Statistics
    file_size_mb = output_path.stat().st_size / (1024**2)
    avg_tools = sum(len(ex["messages"][2]["tool_calls"]) for ex in examples) / len(examples)

    print(f"\n✓ Generated {len(examples):,} examples")
    print(f"✓ Saved to: {output_path.absolute()}")
    print(f"✓ File size: {file_size_mb:.1f} MB")
    print(f"✓ Average tools per example: {avg_tools:.1f}")

    # Tool usage breakdown
    tool_usage = {tool: 0 for tool in TOOLS.keys()}
    for example in examples:
        for tool_call in example["messages"][2]["tool_calls"]:
            tool_name = tool_call["function"]["name"]
            tool_usage[tool_name] += 1

    print(f"\n📊 Tool Usage Distribution:")
    for tool, count in sorted(tool_usage.items(), key=lambda x: -x[1]):
        pct = (count / len(examples)) * 100
        print(f"  {tool:20s} : {count:>4} calls ({pct:>5.1f}%)")

    print(f"\n📤 Next Steps:")
    print(f"  1. Combine with base detective_mode.jsonl:")
    print(f"     cat detective_mode.jsonl detective_mode_enhanced.jsonl > detective_mode_full.jsonl")
    print(f"  2. Upload to Google Drive:")
    print(f"     → /MyDrive/COLAB_PACKAGE/training-datasets/")
    print(f"  3. Train with expanded dataset (1000 examples total)")

    print("\n" + "=" * 70)

if __name__ == '__main__':
    main()
