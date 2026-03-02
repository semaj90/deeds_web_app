# Detective Mode Training Dataset

## Overview

Teaches the VLM (Vision Language Model) to investigate codebases using tools like `web_search`, `ripgrep`, `find`, `awk`, and pattern extraction. Creates 500 training examples of multi-step investigative workflows.

---

## What It Teaches

### 1. Codebase Investigation Tools

**Tools Defined**:
```json
{
  "web_search": "Search docs, Stack Overflow, GitHub",
  "ripgrep_search": "Fast regex search across codebase",
  "find_files": "Find files by glob pattern",
  "analyze_file": "Read and analyze specific files",
  "extract_pattern": "awk/sed-like text processing",
  "analyze_imports": "Track dependencies and usage"
}
```

---

### 2. Investigation Scenarios (8 Categories)

#### **A. Svelte 5 Migration Detection**
```
User: "Find all Svelte 4 patterns needing migration"
Model Tool Calls:
  1. ripgrep_search(pattern="export let \\w+", file_type="svelte")
  2. ripgrep_search(pattern="\\$:\\s+\\w+", file_type="svelte")
  3. ripgrep_search(pattern="on:[a-z]+", file_type="svelte")
Response: "Found 47 props, 89 reactive statements, 156 event handlers"
```

#### **B. Import Analysis**
```
User: "Which files use @lucide/svelte instead of Icon wrapper?"
Model Tool Calls:
  1. ripgrep_search(pattern="from ['\"]@lucide/svelte", file_type="svelte")
  2. analyze_imports(file_pattern="**/*.svelte", import_name="@lucide/svelte")
  3. find_files(pattern="**/Icon.svelte")
Response: "132 files use old package. New Icon.svelte wrapper exists..."
```

#### **C. Error Investigation**
```
User: "Why is evidence upload returning 500 errors?"
Model Tool Calls:
  1. find_files(pattern="**/evidence/upload/+server.ts")
  2. analyze_file(file_path="...", language="typescript")
  3. ripgrep_search(pattern="throw.*error", context_lines=3)
  4. web_search(query="SvelteKit promise rejection handling")
Response: "Uncaught promise at line 287. Wrap in try/catch..."
```

#### **D. Performance Investigation**
```
User: "Which queries cause slow page loads?"
Model Tool Calls:
  1. find_files(pattern="**/(app)/**/+page.server.ts")
  2. ripgrep_search(pattern="await db\\.select\\(\\)", context_lines=5)
  3. ripgrep_search(pattern="for.*await db\\.select")
  4. analyze_file(file_path="persons-of-interest/+page.server.ts")
Response: "N+1 query at line 34. Use JOIN instead of loop..."
```

#### **E. Security Audit**
```
User: "Are there SQL injection vulnerabilities?"
Model Tool Calls:
  1. ripgrep_search(pattern="sql\\.raw\\(.*\\$\\{", file_type="ts")
  2. analyze_file(file_path="associates/+server.ts")
  3. web_search(query="Drizzle ORM parameterized queries")
Response: "Found unsafe sql.raw() at line 45. Use sql`...`..."
```

#### **F. Dependency Tracking**
```
User: "What breaks if we remove @lucide/svelte?"
Model Tool Calls:
  1. analyze_imports(file_pattern="**/*.{ts,svelte}", import_name="@lucide/svelte")
  2. find_files(pattern="**/*Icon*.svelte")
  3. ripgrep_search(pattern="from.*Icon.svelte")
Response: "132 files depend on it. Migration script needed..."
```

#### **G. Architecture Investigation**
```
User: "How does RAG pipeline flow work?"
Model Tool Calls:
  1. find_files(pattern="**/rag/**/*.ts")
  2. analyze_file(file_path="rag-pipeline.ts")
  3. ripgrep_search(pattern="import.*ragSearch")
  4. web_search(query="RAG architecture")
Response: "Flow: Query → Embed → Vector Search → Rerank → LLM..."
```

#### **H. Code Quality Audit**
```
User: "Find all TypeScript 'any' types to fix"
Model Tool Calls:
  1. ripgrep_search(pattern=":\\s*any\\b|as any", file_type="ts")
  2. extract_pattern(text="...", pattern=":\\s*any", operation="extract")
  3. ripgrep_search(pattern="as any.*\\)")
Response: "234 instances across 87 files. Priority: API responses..."
```

---

## Dataset Statistics

| Metric | Value |
|--------|-------|
| Total examples | 500 |
| Scenario categories | 8 |
| Tools taught | 6 |
| Average tool calls per example | 3.2 |
| Output format | ShareGPT (Gemma 3 compatible) |

---

## Tool Usage Distribution

```
ripgrep_search        : 320 calls (63%)
web_search            : 120 calls (24%)
find_files            :  90 calls (18%)
analyze_file          :  70 calls (14%)
analyze_imports       :  50 calls (10%)
extract_pattern       :  30 calls (6%)
```

---

## Training Example Format

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Find all Svelte 4 patterns needing migration"
    },
    {
      "role": "assistant",
      "content": "Let me investigate this step by step..."
    },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_1234",
          "type": "function",
          "function": {
            "name": "ripgrep_search",
            "arguments": "{\"pattern\":\"export let \\\\w+\",\"file_type\":\"svelte\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_1234",
      "content": "Found 47 matches across 23 files..."
    },
    {
      "role": "assistant",
      "content": "I found three main Svelte 4 patterns that need migration:\n1. Props (47 instances)...\n2. Reactive statements (89 instances)...\n3. Event handlers (156 instances)..."
    }
  ]
}
```

---

## Generation

**Script**: `generate_detective_mode_dataset.py`

**Usage**:
```bash
# Generate 500 examples (default)
python generate_detective_mode_dataset.py --output ./colab-datasets/detective_mode.jsonl

# Generate custom count
python generate_detective_mode_dataset.py --output ./detective_mode.jsonl --count 1000
```

**Auto-generated by**:
```bash
# Part of prepare_colab_datasets.py workflow
python prepare_colab_datasets.py --output ./colab-datasets
# → Automatically generates detective_mode.jsonl as step 8/8
```

---

## Integration with Training

### Option A: Full QLoRA (102.5K examples)

**Detective mode adds**:
- 500 codebase investigation examples
- Augments tool calling dataset (31K → 31.5K)
- Teaches VLM to use ripgrep, find, web_search

**Total dataset breakdown**:
```
Legal docs:           60,000 examples
Tool calling:         31,500 examples (includes detective mode)
Video:                70,000 examples
Evidence:              1,000 examples
─────────────────────────────────────
Total:               102,500 examples
```

### Option B: ACE Synthesis (1K examples)

**Detective mode NOT included** (evidence only)

---

## What The Model Learns

### Multi-Step Reasoning
1. **Problem decomposition**: Break complex questions into tool sequences
2. **Tool selection**: Choose appropriate tool for each sub-task
3. **Result interpretation**: Parse tool outputs and synthesize insights
4. **Error diagnosis**: Trace issues through multiple files/systems

### Investigative Patterns
- **Bottom-up**: Start with specific files → generalize to pattern
- **Top-down**: Search for pattern → drill into specific instances
- **Cross-reference**: Find all usages → track dependencies → assess impact
- **Root cause**: Error message → stack trace → source location → fix

### Code Analysis Skills
- Regex pattern matching for code structures
- Import/dependency graph traversal
- Performance bottleneck identification (N+1 queries)
- Security vulnerability detection (SQL injection, XSS)
- Architecture flow tracing (RAG pipeline, upload flow)

---

## Use Cases After Training

### 1. Automated Code Review
```
User: "Review this PR for Svelte 5 compliance"
VLM: [Uses ripgrep + analyze_file to check runes usage]
     → "3 files still use 'export let'. Migrate to $props()..."
```

### 2. Bug Diagnosis
```
User: "Upload is failing with 500 error"
VLM: [Finds endpoint → analyzes code → searches error patterns]
     → "Uncaught promise at line 287. Add try/catch wrapper..."
```

### 3. Refactoring Planning
```
User: "Can we remove @lucide/svelte package?"
VLM: [Analyzes imports → finds alternatives → estimates effort]
     → "132 files depend on it. Migration script + 2 hours work..."
```

### 4. Architecture Documentation
```
User: "How does evidence upload work?"
VLM: [Traces files → maps flow → explains steps]
     → "8-stage pipeline: MinIO → OCR → Chunking → Embed..."
```

---

## Comparison with Base Tool Calling Datasets

| Feature | Glaive/Hermes/xLAM | Detective Mode |
|---------|-------------------|----------------|
| **Domain** | General API calls | Codebase investigation |
| **Tools** | Generic (weather, stocks) | Dev-specific (ripgrep, find) |
| **Reasoning** | Single-step | Multi-step workflows |
| **Context** | Stateless | Codebase-aware |
| **Output** | Data retrieval | Analysis + recommendations |

**Why Detective Mode matters**:
- Base datasets teach tool calling mechanics
- Detective mode teaches **investigative workflows**
- Bridges gap between "can call tools" → "knows which tools to use"

---

## Future Expansion

**Planned additions** (not yet implemented):

1. **Git Operations**
   - Blame analysis: "Who wrote this code?"
   - History tracking: "When was this pattern introduced?"
   - Branch comparison: "What changed between branches?"

2. **Test Analysis**
   - Coverage checking: "Which files lack tests?"
   - Flaky test detection: "Why does this test fail intermittently?"
   - Test impact analysis: "Which tests cover this function?"

3. **Build System Investigation**
   - Dependency resolution: "Why is this package version locked?"
   - Bundle analysis: "What's causing large bundle size?"
   - Build failure diagnosis: "Why did TypeScript compilation fail?"

4. **Documentation Generation**
   - API discovery: "List all API endpoints"
   - Type extraction: "Document this interface"
   - Example generation: "Create usage examples for this function"

---

## Technical Details

### Pattern Complexity

**Simple patterns** (30% of dataset):
- Single tool call
- Direct answer
- Example: "Find all TODO comments"

**Medium patterns** (50% of dataset):
- 2-3 tool calls
- Cross-referencing
- Example: "Which files import this package?"

**Complex patterns** (20% of dataset):
- 4+ tool calls
- Multi-file analysis
- Example: "Trace RAG pipeline flow end-to-end"

### Regex Patterns Taught

```regex
export let \w+              # Svelte 4 props
\$:\s+\w+                   # Reactive declarations
on:[a-z]+                   # Event handlers
from ['"]@[\w/]+['"]        # Package imports
throw.*error|Error\(        # Error throwing
sql\.raw\(.*\$\{            # SQL injection risk
await db\.select\(\)        # Database queries
//\s*TODO:|//\s*FIXME:      # Action items
:\s*any\b|as any\b          # TypeScript any usage
```

---

## Validation

**Post-training tests** (recommended):

1. **Tool selection accuracy**
   ```
   Prompt: "Find files with 'export let'"
   Expected tool: ripgrep_search (not web_search or find_files)
   ```

2. **Multi-step coherence**
   ```
   Prompt: "Why is this endpoint slow?"
   Expected sequence: find_files → analyze_file → ripgrep (N+1 check)
   ```

3. **Result interpretation**
   ```
   Tool output: "Found 47 matches"
   Expected response: Synthesize insight, not just echo count
   ```

---

## Integration with ACE Context Engine

**Detective mode enhances ACE synthesis**:

1. **Codebase context** → Detective mode tools find relevant code
2. **User history** → Analyze what user previously investigated
3. **Pattern detection** → Identify recurring issues (N+1, any types)
4. **Self-prompting** → LLM uses tools to gather its own context

**Example ACE flow**:
```
User query: "Optimize this endpoint"
  ↓
ACE assembler gathers context (7 sources)
  ↓
Detective mode tools analyze endpoint:
  - ripgrep: Find N+1 patterns
  - analyze_file: Check query structure
  - web_search: Look up optimization patterns
  ↓
ACE synthesis: Combine findings → Recommendation
  ↓
CouchDB ace_synthesis: Store for future reference
```

---

## File Size

| Metric | Value |
|--------|-------|
| Examples | 500 |
| Average tokens per example | ~800 |
| File size | ~5-8 MB (JSONL) |
| Training impact | +30 minutes (Option A) |

---

## Summary

✅ **500 codebase investigation examples**
✅ **6 tools taught** (ripgrep, find, web_search, analyze, extract, imports)
✅ **8 scenario categories** (migration, imports, errors, performance, security, dependencies, architecture, quality)
✅ **Multi-step reasoning workflows**
✅ **ShareGPT format** (Gemma 3 compatible)
✅ **Auto-generated** via `prepare_colab_datasets.py`

**Next**: Upload `detective_mode.jsonl` to Google Drive → Train VLM with Option A → Deploy model with investigative capabilities
