#!/usr/bin/env python3
"""
Generate Detective Mode Training Dataset for VLM

Creates tool-use examples for code analysis, codebase investigation, and pattern detection.
Teaches the model to use: web_search, ripgrep, find, awk, sed, grep patterns.

Output: detective_mode.jsonl (tool calling format for Gemma 3 VLM)

Usage:
    python generate_detective_mode_dataset.py --output ./colab-datasets/detective_mode.jsonl
"""

import argparse
import json
from pathlib import Path
from typing import List, Dict
import random

# Detective mode tool definitions
DETECTIVE_TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for documentation, Stack Overflow answers, GitHub issues, and technical references",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "domain": {"type": "string", "enum": ["stackoverflow", "github", "docs", "all"], "description": "Domain to search"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "ripgrep_search",
        "description": "Search codebase using ripgrep (fast regex search). Returns matching files and line numbers.",
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Regex pattern to search for"},
                "file_type": {"type": "string", "description": "File type filter (e.g., 'ts', 'py', 'svelte')"},
                "context_lines": {"type": "integer", "description": "Number of context lines before/after match"}
            },
            "required": ["pattern"]
        }
    },
    {
        "name": "find_files",
        "description": "Find files by name pattern or path. Supports glob patterns.",
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob pattern (e.g., '**/*.svelte', '**/+page.ts')"},
                "path": {"type": "string", "description": "Starting directory path"}
            },
            "required": ["pattern"]
        }
    },
    {
        "name": "analyze_file",
        "description": "Read and analyze a specific file. Returns file contents with syntax highlighting.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Path to file to analyze"},
                "language": {"type": "string", "description": "Programming language for syntax highlighting"}
            },
            "required": ["file_path"]
        }
    },
    {
        "name": "extract_pattern",
        "description": "Extract specific patterns from text using awk/sed-like operations",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Input text to process"},
                "pattern": {"type": "string", "description": "Pattern to extract (regex)"},
                "operation": {"type": "string", "enum": ["extract", "replace", "count"], "description": "Operation type"}
            },
            "required": ["text", "pattern", "operation"]
        }
    },
    {
        "name": "analyze_imports",
        "description": "Analyze import statements in a codebase. Finds dependencies and usage patterns.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_pattern": {"type": "string", "description": "File pattern to analyze"},
                "import_name": {"type": "string", "description": "Specific import to track (optional)"}
            },
            "required": ["file_pattern"]
        }
    }
]

# Detective scenarios (investigative questions + multi-step tool use)
DETECTIVE_SCENARIOS = [
    # Svelte 5 migration investigation
    {
        "user_query": "Find all Svelte 4 patterns in the codebase that need migration to Svelte 5 runes",
        "reasoning": "I need to search for Svelte 4 patterns like 'export let', '$:', and 'on:click' that should be migrated to Svelte 5 runes.",
        "tool_calls": [
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "export let \\w+", "file_type": "svelte", "context_lines": 2},
                "result": "Found 47 matches across 23 files. Example: src/lib/components/ChatPanel.svelte:15: export let messages = []"
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "\\$:\\s+\\w+\\s*=", "file_type": "svelte", "context_lines": 2},
                "result": "Found 89 reactive declarations using '$:' syntax in 34 files"
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "on:[a-z]+={", "file_type": "svelte"},
                "result": "Found 156 event handlers using on:click, on:submit, etc. across 45 files"
            }
        ],
        "assistant_response": "I found three main Svelte 4 patterns that need migration:\\n\\n1. **Props (47 instances)**: 'export let' declarations should be migrated to '$props()' runes\\n2. **Reactive statements (89 instances)**: '$:' reactive declarations should be migrated to '$derived()' or '$effect()' runes\\n3. **Event handlers (156 instances)**: 'on:click' directives should be migrated to 'onclick' (lowercase, no prefix)\\n\\nI recommend migrating files incrementally, starting with leaf components that have no dependencies."
    },

    # Import analysis
    {
        "user_query": "Which components import the old @lucide/svelte package instead of the new Icon wrapper?",
        "reasoning": "Need to find all imports of @lucide/svelte and check if they should use the new Icon.svelte wrapper instead.",
        "tool_calls": [
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "from ['\"]@lucide/svelte['\"]", "file_type": "svelte"},
                "result": "Found 132 files importing from @lucide/svelte"
            },
            {
                "tool": "analyze_imports",
                "args": {"file_pattern": "**/*.svelte", "import_name": "@lucide/svelte"},
                "result": "132 files use @lucide/svelte. Common imports: Check, X, ChevronDown, Search, Upload"
            },
            {
                "tool": "find_files",
                "args": {"pattern": "**/Icon.svelte"},
                "result": "Found: src/lib/components/ui/Icon.svelte (new UnoCSS wrapper)"
            }
        ],
        "assistant_response": "Found 132 files still using the old @lucide/svelte package. They should be migrated to the new Icon.svelte wrapper which uses UnoCSS icon classes for SSR safety.\\n\\nMigration pattern:\\n```svelte\\n// Before\\nimport { Check, X } from '@lucide/svelte'\\n<Check />\\n\\n// After\\nimport Icon from '$lib/components/ui/Icon.svelte'\\n<Icon name=\"check\" />\\n```"
    },

    # Error investigation
    {
        "user_query": "Why is the evidence upload endpoint returning 500 errors?",
        "reasoning": "Need to find the upload endpoint, check error logs, and analyze the implementation for issues.",
        "tool_calls": [
            {
                "tool": "find_files",
                "args": {"pattern": "**/evidence/upload/+server.ts"},
                "result": "Found: src/routes/api/evidence/upload/+server.ts"
            },
            {
                "tool": "analyze_file",
                "args": {"file_path": "src/routes/api/evidence/upload/+server.ts", "language": "typescript"},
                "result": "POST handler at line 45. Uses embedGate concurrency limiter. Calls extractEntities(), detectForensicPatterns(), autoTagDocument()."
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "throw.*error|Error\\(", "file_type": "ts", "context_lines": 3},
                "result": "Found uncaught promise rejection in autoTagDocument() at line 287"
            },
            {
                "tool": "web_search",
                "args": {"query": "SvelteKit API route promise rejection handling", "domain": "docs"},
                "result": "SvelteKit docs: Unhandled promise rejections in API routes return 500. Wrap in try/catch or use .catch()"
            }
        ],
        "assistant_response": "The 500 error is caused by an uncaught promise rejection in autoTagDocument() at line 287. The upload endpoint doesn't have proper error handling for this async operation.\\n\\nFix: Wrap autoTagDocument() call in try/catch:\\n```typescript\\ntry {\\n  await autoTagDocument({ documentId, text, maxTags: 20 });\\n} catch (err) {\\n  console.warn('Auto-tagging failed (non-fatal):', err);\\n  // Continue upload without tags\\n}\\n```"
    },

    # Performance investigation
    {
        "user_query": "Which database queries are causing the slow page load times?",
        "reasoning": "Need to find all database queries in page load functions and check for missing indexes or N+1 queries.",
        "tool_calls": [
            {
                "tool": "find_files",
                "args": {"pattern": "**/(app)/**/+page.server.ts"},
                "result": "Found 23 page server files"
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "await db\\.select\\(\\)", "file_type": "ts", "context_lines": 5},
                "result": "Found 47 db.select() calls across 23 files"
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "for.*await db\\.select", "file_type": "ts"},
                "result": "Found N+1 query pattern in persons-of-interest/+page.server.ts line 34 (loop over cases, then query evidence for each)"
            },
            {
                "tool": "analyze_file",
                "args": {"file_path": "src/routes/(app)/persons-of-interest/+page.server.ts"},
                "result": "Load function queries persons, then loops over each to fetch related cases individually"
            }
        ],
        "assistant_response": "Found N+1 query issue in persons-of-interest page (line 34). The load function queries persons, then makes a separate DB call for each person to fetch related cases.\\n\\nFix: Use SQL JOIN or Drizzle relations:\\n```typescript\\n// Before (N+1)\\nfor (const person of persons) {\\n  person.cases = await db.select().from(cases).where(eq(cases.personId, person.id));\\n}\\n\\n// After (single query)\\nconst personsWithCases = await db.select()\\n  .from(persons)\\n  .leftJoin(cases, eq(cases.personId, persons.id));\\n```"
    },

    # Security audit
    {
        "user_query": "Are there any SQL injection vulnerabilities in the codebase?",
        "reasoning": "Need to search for raw SQL queries with string interpolation or concatenation.",
        "tool_calls": [
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "sql\\.raw\\(.*\\$\\{", "file_type": "ts"},
                "result": "Found 3 instances of sql.raw() with template literals"
            },
            {
                "tool": "analyze_file",
                "args": {"file_path": "src/routes/api/persons-of-interest/[id]/associates/+server.ts"},
                "result": "Line 45: sql.raw() uses template literal with user input 'caseId' parameter"
            },
            {
                "tool": "web_search",
                "args": {"query": "Drizzle ORM sql.raw parameterized queries", "domain": "docs"},
                "result": "Drizzle docs: Use sql`...${param}` (tagged template) for automatic escaping, NOT sql.raw()"
            }
        ],
        "assistant_response": "Found potential SQL injection in associates endpoint (line 45). It uses sql.raw() with template literals instead of parameterized queries.\\n\\nVulnerable code:\\n```typescript\\nsql.raw(`caseIds && ARRAY[${caseId}]::text[]`)  // UNSAFE\\n```\\n\\nSecure fix:\\n```typescript\\nsql`caseIds && ARRAY[${caseId}]::text[]`  // Safe (parameterized)\\n```"
    },

    # Dependency tracking
    {
        "user_query": "What would break if we remove the @lucide/svelte package?",
        "reasoning": "Need to find all dependencies on @lucide/svelte to assess impact of removal.",
        "tool_calls": [
            {
                "tool": "analyze_imports",
                "args": {"file_pattern": "**/*.{ts,svelte}", "import_name": "@lucide/svelte"},
                "result": "132 files import @lucide/svelte. Most common: Check (45 uses), X (38 uses), ChevronDown (29 uses)"
            },
            {
                "tool": "find_files",
                "args": {"pattern": "**/*Icon*.svelte"},
                "result": "Found Icon.svelte wrapper (replacement), plus IconButton.svelte, IconBadge.svelte (both use Icon.svelte)"
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "from.*Icon.svelte", "file_type": "svelte"},
                "result": "Only 23 files use the new Icon.svelte wrapper"
            }
        ],
        "assistant_response": "Removing @lucide/svelte would break 132 files. However, Icon.svelte wrapper exists as a replacement but is only used in 23 files.\\n\\nImpact assessment:\\n- **High risk**: 109 files still depend on @lucide/svelte\\n- **Migration needed**: Replace all @lucide/svelte imports with Icon.svelte\\n- **Estimated effort**: ~2 hours (automated script + manual verification)\\n\\nRecommendation: Run migration script first, then remove package."
    },

    # Architecture investigation
    {
        "user_query": "How does the RAG pipeline flow from user query to final response?",
        "reasoning": "Need to trace the data flow through multiple files and understand the architecture.",
        "tool_calls": [
            {
                "tool": "find_files",
                "args": {"pattern": "**/rag/**/*.ts"},
                "result": "Found: rag-pipeline.ts, rag/search/+server.ts, rag/validate/+server.ts, rag/answer/+server.ts"
            },
            {
                "tool": "analyze_file",
                "args": {"file_path": "src/lib/server/rag-pipeline.ts"},
                "result": "Exports ragSearch() orchestrator. Calls: 1) embedding generation, 2) Qdrant vector search, 3) reranking, 4) context assembly"
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "import.*ragSearch", "file_type": "ts"},
                "result": "Used in /api/rag/search/+server.ts (line 12) and /api/evidence/search/+server.ts (line 28)"
            },
            {
                "tool": "web_search",
                "args": {"query": "RAG retrieval augmented generation architecture", "domain": "all"},
                "result": "RAG: 1) Query embedding, 2) Vector similarity search, 3) Context retrieval, 4) LLM generation with context"
            }
        ],
        "assistant_response": "RAG pipeline flow:\\n\\n1. **User query** → `/api/rag/search` endpoint\\n2. **Embedding** → generateEmbeddings() converts query to 768-dim vector\\n3. **Vector search** → Qdrant searches legal_documents collection\\n4. **Reranking** → MultiModalRanker scores results (5 signals)\\n5. **Context assembly** → Top chunks assembled with metadata\\n6. **LLM generation** → Ollama gemma3-legal generates response\\n\\nKey files:\\n- Orchestrator: src/lib/server/rag-pipeline.ts\\n- Search API: src/routes/api/rag/search/+server.ts\\n- Vector DB: src/lib/server/vector/qdrant-manager.ts"
    },

    # Code quality investigation
    {
        "user_query": "Find all TypeScript 'any' types that should be properly typed",
        "reasoning": "Need to find all usages of 'any' type and assess which can be replaced with proper types.",
        "tool_calls": [
            {
                "tool": "ripgrep_search",
                "args": {"pattern": ":\\s*any\\b|as any\\b|<any>", "file_type": "ts", "context_lines": 1},
                "result": "Found 234 instances of 'any' type across 87 files"
            },
            {
                "tool": "extract_pattern",
                "args": {"text": "const result: any = await fetchData()", "pattern": ":\\s*any", "operation": "extract"},
                "result": "Extracted 234 'any' type annotations"
            },
            {
                "tool": "ripgrep_search",
                "args": {"pattern": "as any.*\\)", "file_type": "ts"},
                "result": "Found 67 type assertions to 'any' - likely workarounds for type errors"
            }
        ],
        "assistant_response": "Found 234 'any' types across 87 files:\\n\\n1. **Type annotations** (167 instances): Variables/parameters typed as 'any'\\n2. **Type assertions** (67 instances): 'as any' casts (code smells)\\n\\nPriority fixes:\\n- Replace 'any' in API responses with proper interfaces\\n- Remove 'as any' casts by fixing root type issues\\n- Add generic constraints instead of 'any' in utility functions\\n\\nEstimated effort: ~4 hours for high-priority fixes"
    }
]

# Web search scenarios (documentation lookups)
WEB_SEARCH_SCENARIOS = [
    {
        "query": "How do I use Svelte 5 $effect rune for side effects?",
        "tool": "web_search",
        "args": {"query": "Svelte 5 $effect rune documentation", "domain": "docs"},
        "result": "Svelte 5 docs: $effect(() => { ... }) runs when dependencies change. Use for DOM operations, subscriptions, side effects.",
        "response": "$effect() in Svelte 5 replaces $: reactive statements for side effects. Example:\\n```svelte\\n$effect(() => {\\n  console.log('count changed:', count);\\n  document.title = `Count: ${count}`;\\n});\\n```"
    },
    {
        "query": "What's the correct way to handle file uploads in SvelteKit?",
        "tool": "web_search",
        "args": {"query": "SvelteKit form actions file upload superforms", "domain": "docs"},
        "result": "SvelteKit docs: Use formData.get('file') in form actions. For Superforms, set dataType: 'form' and use fileProxy().",
        "response": "SvelteKit file uploads using Superforms:\\n```typescript\\n// +page.server.ts\\nexport const actions = {\\n  upload: async ({ request }) => {\\n    const formData = await request.formData();\\n    const file = formData.get('file') as File;\\n    return { success: true };\\n  }\\n};\\n\\n// +page.svelte\\nconst { form, enhance } = superForm(data.form, {\\n  dataType: 'form'  // Required for files\\n});\\nconst file = fileProxy(form, 'file');\\n```"
    }
]

# Ripgrep pattern scenarios
RIPGREP_SCENARIOS = [
    {
        "query": "Find all TODO comments in TypeScript files",
        "tool": "ripgrep_search",
        "args": {"pattern": "//\\s*TODO:|//\\s*FIXME:", "file_type": "ts"},
        "result": "Found 47 TODO comments and 12 FIXME comments",
        "response": "Found 59 action items in TypeScript files:\\n- TODO: 47 instances (planned improvements)\\n- FIXME: 12 instances (known bugs)\\n\\nTop files:\\n1. src/lib/server/analysis/entity-extraction.ts (8 TODOs)\\n2. src/routes/api/evidence/upload/+server.ts (6 TODOs)"
    }
]

def generate_tool_call_example(scenario: Dict) -> Dict:
    """Generate a single tool calling training example"""

    # Build conversation with tool calls
    messages = [
        {"role": "user", "content": scenario["user_query"]}
    ]

    # Add assistant's reasoning (optional)
    if "reasoning" in scenario:
        messages.append({
            "role": "assistant",
            "content": f"Let me investigate this step by step. {scenario['reasoning']}"
        })

    # Add tool calls
    tool_calls = []
    for call in scenario.get("tool_calls", []):
        tool_calls.append({
            "id": f"call_{random.randint(1000, 9999)}",
            "type": "function",
            "function": {
                "name": call["tool"],
                "arguments": json.dumps(call["args"])
            }
        })

    if tool_calls:
        messages.append({
            "role": "assistant",
            "content": None,
            "tool_calls": tool_calls
        })

        # Add tool results
        for i, call in enumerate(scenario["tool_calls"]):
            messages.append({
                "role": "tool",
                "tool_call_id": tool_calls[i]["id"],
                "content": call["result"]
            })

    # Add final assistant response
    messages.append({
        "role": "assistant",
        "content": scenario["assistant_response"]
    })

    return {"messages": messages}

def generate_dataset(output_path: Path, count: int = 500):
    """Generate detective mode training dataset"""

    print(f"Generating detective mode dataset ({count} examples)...")

    examples = []

    # Base scenarios (multiply to reach target count)
    base_scenarios = DETECTIVE_SCENARIOS + WEB_SEARCH_SCENARIOS + RIPGREP_SCENARIOS

    # Generate variations
    for i in range(count):
        scenario = base_scenarios[i % len(base_scenarios)]
        example = generate_tool_call_example(scenario)
        examples.append(example)

    # Write JSONL
    with open(output_path, 'w', encoding='utf-8') as f:
        for example in examples:
            f.write(json.dumps(example) + '\n')

    print(f"✅ Generated {len(examples)} detective mode examples")
    print(f"   Saved to: {output_path}")

    # Summary
    tool_usage = {}
    for example in examples:
        for msg in example["messages"]:
            if msg.get("tool_calls"):
                for call in msg["tool_calls"]:
                    tool_name = call["function"]["name"]
                    tool_usage[tool_name] = tool_usage.get(tool_name, 0) + 1

    print(f"\n📊 Tool usage distribution:")
    for tool, count in sorted(tool_usage.items(), key=lambda x: x[1], reverse=True):
        print(f"   {tool:20s}: {count:4d} calls")

    return examples

def main():
    parser = argparse.ArgumentParser(description="Generate detective mode training dataset")
    parser.add_argument('--output', type=str, default='./colab-datasets/detective_mode.jsonl', help='Output JSONL file')
    parser.add_argument('--count', type=int, default=500, help='Number of examples to generate')

    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print("="*70)
    print("DETECTIVE MODE DATASET GENERATOR")
    print("="*70)
    print(f"\nOutput: {output_path.absolute()}")
    print(f"Count: {args.count} examples")
    print()

    # Generate dataset
    examples = generate_dataset(output_path, args.count)

    print("\n" + "="*70)
    print("DATASET GENERATION COMPLETE")
    print("="*70)

    # Show example
    print("\n📝 Example training instance:")
    print(json.dumps(examples[0], indent=2)[:500] + "...")

    print(f"\n📤 Next steps:")
    print(f"   1. Upload {output_path.name} to Google Drive")
    print(f"   2. Add to Colab notebook training datasets")
    print(f"   3. Train VLM with detective mode capabilities")

    print("\n" + "="*70)

if __name__ == '__main__':
    main()