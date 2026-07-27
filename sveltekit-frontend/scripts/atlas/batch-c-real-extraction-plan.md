# Batch C Real Extraction — Implementation Plan

**Objective**: Replace metadata reformatting with genuine 5-lane extraction using proper tools.

## Lane Implementation Plan

### Lane 1: Lexical (ast-grep)
**Current**: String split + `path.extname()`  
**Target**: Real pattern matching on source code

**Implementation**:
```bash
# Install ast-grep
npm install -D @ast-grep/cli

# Or use native bindings
npm install -D ast-grep
```

**TypeScript integration**:
```typescript
import { runAstGrep, parse } from 'ast-grep';

async function extractLexical(sourceRef: string, filePath: string): Promise<string[]> {
  const patterns = [
    'function $FUNC() {}',
    'const $VAR = ',
    'class $CLASS {}',
    'export $EXPORT'
  ];
  
  const results: string[] = [];
  for (const pattern of patterns) {
    const matches = await runAstGrep(filePath, pattern);
    results.push(...matches.map(m => `pattern:${m.text}`));
  }
  
  return results;
}
```

**Status**: ⏳ Need to wire ast-grep bindings

---

### Lane 2: AST (tree-sitter)
**Current**: Read `metadata.tree_depth` from DB  
**Target**: Real tree-sitter parsing for full AST metadata

**Implementation**:
```bash
npm install -D tree-sitter tree-sitter-typescript tree-sitter-python
```

**TypeScript integration**:
```typescript
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

async function extractAST(filePath: string): Promise<Record<string, any>[]> {
  const parser = new Parser();
  parser.setLanguage(TypeScript);
  
  const source = fs.readFileSync(filePath, 'utf-8');
  const tree = parser.parse(source);
  
  const observations: Record<string, any>[] = [];
  
  function walk(node: any, depth = 0) {
    observations.push({
      type: node.type,
      depth,
      startRow: node.startRow,
      endRow: node.endRow,
      text: source.substring(node.startIndex, node.endIndex).slice(0, 50),
      childCount: node.childCount
    });
    
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
  
  walk(tree.rootNode);
  return observations;
}
```

**Status**: ⏳ Need native bindings (Windows MSVC)

---

### Lane 3: LangExtract (Python Sidecar)
**Current**: Keyword substring matching  
**Target**: Structured entity extraction via Python LangExtract

**Implementation**:

1. **Miniforge setup** (free-threaded Python 3.13):
```bash
# Install Miniforge (Python 3.13 free-threaded)
# https://github.com/conda-forge/miniforge/releases
# Download Miniforge3-Windows-x86_64.exe

# Create environment
conda create -n langextract python=3.13.0t -y
conda activate langextract
pip install langextract transformers torch --no-cache-dir
```

2. **Python sidecar service** (`scripts/sidecars/langextract-server.py`):
```python
#!/usr/bin/env python3
import json
import sys
from fastapi import FastAPI, HTTPException
from langextract import extract_entities
from pydantic import BaseModel

app = FastAPI()

class ExtractionRequest(BaseModel):
    text: str
    entity_types: list[str] = ["PER", "ORG", "LOC", "MISC"]

@app.post("/extract")
async def extract(req: ExtractionRequest):
    try:
        entities = extract_entities(req.text, req.entity_types)
        return {"entities": entities, "status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
```

3. **TypeScript caller** (`src/lib/server/extraction/langextract-client.ts`):
```typescript
async function extractEntities(text: string): Promise<string[]> {
  const response = await fetch('http://127.0.0.1:8765/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      entity_types: ["AUTH", "DATA", "UI", "SERVICE", "UTIL"]
    })
  });
  
  const result = await response.json();
  return result.entities.map((e: any) => `${e.type}:${e.text}`);
}
```

**Status**: ⏳ Need Miniforge + sidecar wiring

---

### Lane 4: Semantic (Gemma4 Classification)
**Current**: Raw feature_label pass-through  
**Target**: Gemma4 semantic classification

**Implementation**:
```typescript
async function classifySemanticMeaning(featureLabel: string, sourceRef: string): Promise<string> {
  const prompt = `Classify the semantic meaning of this code feature in 1-2 words:
Feature: ${featureLabel}
Source: ${sourceRef}

Classification (short, single concept):`;

  const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-legal-iq4xs-direct.gguf',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 16,
      stream: false
    })
  });
  
  const data = await response.json();
  return data.choices[0].message.content.trim();
}
```

**Status**: ✅ Gemma4 :8090 available

---

### Lane 5: Ontology Tuple (Schema Validation)
**Current**: JSON triple assembly  
**Target**: Validate against formal ontology (RDF/OWL)

**Implementation**:
```typescript
import { z } from 'zod';

// Formal ontology schema
const OntologyTupleSchema = z.object({
  entity: z.string().regex(/^[a-z0-9._-]+$/, 'Invalid feature_id format'),
  source: z.string().regex(/^src\/.*\.(ts|js|svelte)$/, 'Invalid source_ref'),
  label: z.string().min(3).max(200),
  // Optional ontology properties
  domain: z.enum(['auth', 'data', 'ui', 'service', 'util']).optional(),
  cardinality: z.enum(['one', 'many', 'variable']).optional(),
  lifecycle: z.enum(['creation', 'read', 'update', 'delete']).optional(),
}).strict();

async function validateOntologyTuple(tuple: any): Promise<boolean> {
  try {
    OntologyTupleSchema.parse(tuple);
    return true;
  } catch (err) {
    console.error('Ontology validation failed:', err);
    return false;
  }
}
```

**Status**: ⏳ Need RDF/OWL schema definition

---

## Implementation Phases

### Phase 1: Wire ast-grep + tree-sitter (Week 1)
- Install npm packages
- Test on 100-node sample
- Validate lexical + AST extraction quality
- Update Batch C to use real extraction

### Phase 2: Python Sidecar (Week 2)
- Install Miniforge + free-threaded Python 3.13
- Build langextract HTTP server
- Integrate into Batch C
- Benchmark sidecar latency

### Phase 3: Gemma4 Semantic (Week 3)
- Wire TurboQuant :8090 calls
- Implement semantic classification
- Add confidence calibration
- Test end-to-end

### Phase 4: Ontology Schema (Week 4)
- Define RDF/OWL ontology
- Build Zod validators
- Implement tuple validation
- Update gates to check schema compliance

---

## Gate Updates

Once real extraction is wired, gates will measure:

| Gate | Metric | Current | Real |
|---|---|---|---|
| **C1** | Extraction coverage | 100% (metadata) | ≥90% (real patterns) |
| **C2** | Confidence variance | 0.080 (hardcoded) | <0.15 (learned) |
| **C3** | Lane agreement | 100% (forced) | ≥85% (natural) |
| **C4** | Determinism | ✅ Yes | ✅ Yes (same tools) |
| **C5** | Schema compliance | N/A | ≥95% (ontology) |

---

## Effort Estimate

- **ast-grep wiring**: 2-3 hours
- **tree-sitter bindings**: 4-6 hours (native build)
- **Miniforge + sidecar**: 3-4 hours
- **Gemma4 integration**: 1-2 hours
- **Ontology schema**: 2-3 hours
- **Testing + validation**: 4-5 hours

**Total**: 16-23 hours (2-3 days of focused work)

---

## Decision Gates

- **Gate 1**: Can we build tree-sitter on Windows (MSVC)? If no, use WASM fallback.
- **Gate 2**: Is Miniforge Python 3.13 free-threaded stable? If no, use 3.12 + threading.
- **Gate 3**: Does Gemma4 :8090 have sufficient context for semantic classification? If no, use cheaper heuristics.

**Proceed?** ✅ YES / ❌ NO
