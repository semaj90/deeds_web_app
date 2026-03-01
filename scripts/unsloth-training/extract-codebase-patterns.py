#!/usr/bin/env python3
"""
Advanced Codebase Pattern Extractor for Gemma 3 Training
Extracts Svelte 5, SvelteKit, TypeScript, Drizzle, bits-ui patterns
Outputs ChatML format for Unsloth training
"""

import json
import re
import os
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict

# Output directory
OUTPUT_DIR = Path("./extracted-patterns")
OUTPUT_DIR.mkdir(exist_ok=True)

# Category storage
patterns = defaultdict(list)

def create_chatml_example(system: str, user: str, assistant: str, metadata: dict) -> dict:
    """Create a ChatML format training example"""
    return {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant}
        ],
        "metadata": metadata
    }

def extract_svelte5_runes(content: str, filepath: str) -> List[Dict]:
    """Extract Svelte 5 runes patterns ($state, $derived, $effect, $props)"""
    examples = []

    # Extract $state patterns
    state_matches = re.findall(r'let\s+(\w+)\s*=\s*\$state\((.*?)\);?', content, re.DOTALL)
    for var_name, init_value in state_matches[:5]:  # Limit to 5 per file
        code_snippet = f"let {var_name} = $state({init_value});"
        example = create_chatml_example(
            system="You are an expert in Svelte 5 reactivity using runes.",
            user=f"How do I create reactive state in Svelte 5 for {var_name}?",
            assistant=f"Use the `$state` rune for reactive state:\n\n```svelte\n{code_snippet}\n```\n\nKey features:\n- Deep reactivity for objects/arrays\n- No `export let` needed\n- Direct mutation triggers updates",
            metadata={"category": "svelte5-runes", "rune": "$state", "tags": ["svelte5", "runes", "state"], "source": filepath}
        )
        examples.append(example)

    # Extract $derived patterns
    derived_matches = re.findall(r'let\s+(\w+)\s*=\s*\$derived(?:\.by)?\((.*?)\);?', content, re.DOTALL)
    for var_name, expr in derived_matches[:3]:
        code_snippet = f"let {var_name} = $derived({expr});" if len(expr) < 50 else f"let {var_name} = $derived.by(() => {expr});"
        example = create_chatml_example(
            system="You are an expert in Svelte 5 reactivity using runes.",
            user=f"How do I create derived state in Svelte 5?",
            assistant=f"Use `$derived` or `$derived.by()` for computed values:\n\n```svelte\n{code_snippet}\n```\n\nKey features:\n- Auto-updates when dependencies change\n- Use `$derived.by()` for complex computations\n- Lazy evaluation",
            metadata={"category": "svelte5-runes", "rune": "$derived", "tags": ["svelte5", "runes", "derived"], "source": filepath}
        )
        examples.append(example)

    # Extract $effect patterns
    effect_matches = re.findall(r'\$effect\(\s*\(\s*\)\s*=>\s*{(.*?)}\s*\);?', content, re.DOTALL)
    for effect_body in effect_matches[:2]:
        if len(effect_body.strip()) < 200:
            example = create_chatml_example(
                system="You are an expert in Svelte 5 reactivity using runes.",
                user="How do I create side effects in Svelte 5?",
                assistant=f"Use `$effect` for side effects:\n\n```svelte\n$effect(() => {{\n{effect_body}\n}});\n```\n\nKey features:\n- Runs when dependencies change\n- Replaces Svelte 4 reactive statements\n- Can return cleanup function",
                metadata={"category": "svelte5-runes", "rune": "$effect", "tags": ["svelte5", "runes", "effect"], "source": filepath}
            )
            examples.append(example)

    # Extract $props patterns
    props_matches = re.findall(r'let\s+{([^}]+)}\s*=\s*\$props\(\);?', content)
    for props_list in props_matches[:2]:
        example = create_chatml_example(
            system="You are an expert in Svelte 5 component props.",
            user="How do I define component props in Svelte 5?",
            assistant=f"Use `$props()` to destructure component props:\n\n```svelte\nlet {{ {props_list} }} = $props();\n```\n\nKey features:\n- Replaces `export let` from Svelte 4\n- Type-safe with TypeScript\n- Can provide defaults",
            metadata={"category": "svelte5-props", "rune": "$props", "tags": ["svelte5", "props"], "source": filepath}
        )
        examples.append(example)

    return examples

def extract_sveltekit_api_routes(content: str, filepath: str) -> List[Dict]:
    """Extract SvelteKit API route patterns"""
    examples = []

    # Extract GET handlers
    get_match = re.search(r'export\s+const\s+GET[:\s]*(?:RequestHandler\s*=)?\s*async\s*\(({[^}]+})\)\s*=>\s*{(.*?)(?:\n};|\nexport)', content, re.DOTALL)
    if get_match:
        params, body = get_match.groups()
        if len(body) < 500:
            example = create_chatml_example(
                system="You are an expert in building RESTful APIs with SvelteKit.",
                user="How do I create a GET endpoint in SvelteKit?",
                assistant=f"Here's a SvelteKit GET API route:\n\n```typescript\nexport const GET = async ({params}) => {{\n{body[:400]}\n}};\n```\n\nBest practices:\n- Use `RequestHandler` type\n- Return `json()` for JSON responses\n- Handle errors gracefully",
                metadata={"category": "sveltekit-api", "method": "GET", "tags": ["sveltekit", "api", "server"], "source": filepath}
            )
            examples.append(example)

    # Extract POST handlers
    post_match = re.search(r'export\s+const\s+POST[:\s]*(?:RequestHandler\s*=)?\s*async\s*\(({[^}]+})\)\s*=>\s*{(.*?)(?:\n};|\nexport)', content, re.DOTALL)
    if post_match:
        params, body = post_match.groups()
        if len(body) < 500:
            example = create_chatml_example(
                system="You are an expert in building RESTful APIs with SvelteKit.",
                user="How do I create a POST endpoint in SvelteKit?",
                assistant=f"Here's a SvelteKit POST API route:\n\n```typescript\nexport const POST = async ({{request}}) => {{\n{body[:400]}\n}};\n```\n\nBest practices:\n- Validate input with Zod\n- Use `await request.json()` for body\n- Return appropriate status codes",
                metadata={"category": "sveltekit-api", "method": "POST", "tags": ["sveltekit", "api", "server"], "source": filepath}
            )
            examples.append(example)

    return examples

def extract_drizzle_patterns(content: str, filepath: str) -> List[Dict]:
    """Extract Drizzle ORM patterns"""
    examples = []

    # Extract table definitions
    table_matches = re.findall(r'export\s+const\s+(\w+)\s*=\s*pgTable\([\'"](\w+)[\'"],\s*{(.*?)}\);?', content, re.DOTALL)
    for table_var, table_name, fields in table_matches[:3]:
        if len(fields) < 300:
            example = create_chatml_example(
                system="You are an expert in Drizzle ORM for PostgreSQL.",
                user=f"How do I define a {table_name} table in Drizzle?",
                assistant=f"Here's a Drizzle table definition:\n\n```typescript\nexport const {table_var} = pgTable('{table_name}', {{\n{fields[:250]}\n}});\n```\n\nKey features:\n- Type-safe schema definition\n- Auto-inferred TypeScript types\n- Built-in validation",
                metadata={"category": "drizzle-orm", "subcategory": "schema", "tags": ["drizzle", "postgres", "schema"], "source": filepath}
            )
            examples.append(example)

    # Extract queries
    query_matches = re.findall(r'db\.select\(\)(.*?)(?:;|\n)', content, re.DOTALL)
    for query in query_matches[:2]:
        if len(query) < 200 and 'from(' in query:
            example = create_chatml_example(
                system="You are an expert in Drizzle ORM queries.",
                user="How do I query data with Drizzle ORM?",
                assistant=f"Here's a Drizzle query pattern:\n\n```typescript\nconst result = await db.select(){query};\n```\n\nKey features:\n- Type-safe query builder\n- Chainable methods\n- Auto-completion",
                metadata={"category": "drizzle-orm", "subcategory": "query", "tags": ["drizzle", "postgres", "query"], "source": filepath}
            )
            examples.append(example)

    return examples

def extract_typescript_patterns(content: str, filepath: str) -> List[Dict]:
    """Extract advanced TypeScript patterns"""
    examples = []

    # Extract type definitions
    type_matches = re.findall(r'export\s+type\s+(\w+)(?:<[^>]+>)?\s*=\s*({.*?});', content, re.DOTALL)
    for type_name, type_def in type_matches[:5]:
        if len(type_def) < 300 and '{' in type_def:
            example = create_chatml_example(
                system="You are an expert in TypeScript type systems.",
                user=f"Explain the {type_name} type definition",
                assistant=f"The `{type_name}` type defines:\n\n```typescript\nexport type {type_name} = {type_def};\n```\n\nThis type ensures type safety and provides IntelliSense support.",
                metadata={"category": "typescript-types", "tags": ["typescript", "types"], "source": filepath}
            )
            examples.append(example)

    # Extract interfaces
    interface_matches = re.findall(r'export\s+interface\s+(\w+)(?:<[^>]+>)?\s*{(.*?)}', content, re.DOTALL)
    for interface_name, interface_body in interface_matches[:5]:
        if len(interface_body) < 300:
            example = create_chatml_example(
                system="You are an expert in TypeScript interfaces.",
                user=f"Explain the {interface_name} interface",
                assistant=f"The `{interface_name}` interface defines:\n\n```typescript\nexport interface {interface_name} {{\n{interface_body}\n}}\n```\n\nInterfaces provide structure and type safety.",
                metadata={"category": "typescript-interfaces", "tags": ["typescript", "interface"], "source": filepath}
            )
            examples.append(example)

    return examples

def extract_bits_ui_patterns(content: str, filepath: str) -> List[Dict]:
    """Extract bits-ui component usage patterns"""
    examples = []

    # Find Dialog usage
    if 'Dialog.Root' in content or 'Dialog.Content' in content:
        dialog_snippet = re.search(r'(<Dialog\.Root.*?>.*?</Dialog\.Root>)', content, re.DOTALL)
        if dialog_snippet and len(dialog_snippet.group(1)) < 400:
            example = create_chatml_example(
                system="You are an expert in bits-ui component library for Svelte 5.",
                user="How do I use the Dialog component from bits-ui?",
                assistant=f"Here's a bits-ui Dialog pattern:\n\n```svelte\n{dialog_snippet.group(1)[:350]}\n```\n\nKey features:\n- Headless accessible components\n- Built for Svelte 5 runes\n- Fully customizable",
                metadata={"category": "bits-ui", "component": "Dialog", "tags": ["bits-ui", "svelte5", "dialog"], "source": filepath}
            )
            examples.append(example)

    # Find Select usage
    if 'Select.Root' in content:
        example = create_chatml_example(
            system="You are an expert in bits-ui component library for Svelte 5.",
            user="How do I use the Select component from bits-ui?",
            assistant="Here's a bits-ui Select pattern:\n\n```svelte\n<Select.Root bind:value={selectedValue}>\n  <Select.Trigger>Select option</Select.Trigger>\n  <Select.Content>\n    <Select.Item value=\"1\">Option 1</Select.Item>\n  </Select.Content>\n</Select.Root>\n```\n\nKey features:\n- Accessible keyboard navigation\n- Customizable styling\n- Built-in state management",
            metadata={"category": "bits-ui", "component": "Select", "tags": ["bits-ui", "svelte5", "select"], "source": filepath}
        )
        examples.append(example)

    return examples

def scan_codebase(base_path: Path):
    """Scan codebase and extract patterns"""
    print(f"Scanning codebase at {base_path}...")

    # Scan .svelte files
    svelte_files = list(base_path.glob('**/*.svelte'))
    print(f"Found {len(svelte_files)} .svelte files")

    for file in svelte_files:
        if 'node_modules' in str(file) or '.svelte-kit' in str(file):
            continue
        try:
            content = file.read_text(encoding='utf-8')
            rel_path = str(file.relative_to(base_path))

            # Extract Svelte 5 patterns
            patterns["svelte5-runes"].extend(extract_svelte5_runes(content, rel_path))
            patterns["bits-ui"].extend(extract_bits_ui_patterns(content, rel_path))

        except Exception as e:
            print(f"Error processing {file}: {e}")

    # Scan +server.ts files (API routes)
    server_files = list(base_path.glob('**/+server.ts'))
    print(f"Found {len(server_files)} API route files")

    for file in server_files:
        if 'node_modules' in str(file):
            continue
        try:
            content = file.read_text(encoding='utf-8')
            rel_path = str(file.relative_to(base_path))
            patterns["sveltekit-api"].extend(extract_sveltekit_api_routes(content, rel_path))
        except Exception as e:
            print(f"Error processing {file}: {e}")

    # Scan schema files
    schema_files = list(base_path.glob('**/schema*.ts'))
    print(f"Found {len(schema_files)} schema files")

    for file in schema_files:
        if 'node_modules' in str(file):
            continue
        try:
            content = file.read_text(encoding='utf-8')
            rel_path = str(file.relative_to(base_path))
            patterns["drizzle-orm"].extend(extract_drizzle_patterns(content, rel_path))
        except Exception as e:
            print(f"Error processing {file}: {e}")

    # Scan .ts files for TypeScript patterns
    ts_files = list(base_path.glob('src/**/*.ts'))
    print(f"Found {len(ts_files)} TypeScript files")

    for file in ts_files[:100]:  # Limit to 100 files
        if 'node_modules' in str(file) or '.svelte-kit' in str(file):
            continue
        try:
            content = file.read_text(encoding='utf-8')
            rel_path = str(file.relative_to(base_path))
            patterns["typescript"].extend(extract_typescript_patterns(content, rel_path))
        except Exception as e:
            print(f"Error processing {file}: {e}")

def save_patterns():
    """Save extracted patterns to JSONL files"""
    total = 0
    for category, examples in patterns.items():
        if examples:
            output_file = OUTPUT_DIR / f"{category}-extracted.jsonl"
            with open(output_file, 'w', encoding='utf-8') as f:
                for example in examples:
                    f.write(json.dumps(example, ensure_ascii=False) + '\n')
            print(f"[OK] Saved {len(examples)} examples to {output_file}")
            total += len(examples)

    print(f"\n[SUCCESS] Total extracted: {total} examples")
    print(f"[DIR] Output directory: {OUTPUT_DIR}")

if __name__ == "__main__":
    # Scan from sveltekit-frontend directory
    base_path = Path(__file__).parent.parent.parent / "sveltekit-frontend"

    if not base_path.exists():
        print(f"❌ Base path not found: {base_path}")
        exit(1)

    scan_codebase(base_path)
    save_patterns()

    print("\n" + "="*50)
    print("Pattern extraction complete!")
    print("="*50)
