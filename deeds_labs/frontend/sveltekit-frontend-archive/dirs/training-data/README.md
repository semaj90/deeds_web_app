# Full-Stack Training Data

Generated: 2025-12-21T03:32:06.915Z

## Datasets

| File | Examples | Description |
|------|----------|-------------|
| bits-ui-patterns.jsonl | 0 | bits-ui component usage patterns |
| svelte5-runes.jsonl | 20 | Svelte 5 runes ($state, $derived, $effect) |
| typescript-patterns.jsonl | 0 | TypeScript service patterns |
| style-guide.jsonl | 10 | CSS/styling best practices |
| fullstack-integration.jsonl | 2 | Complete API/database patterns |
| **fullstack-training-combined.jsonl** | **32** | **All examples combined** |

## Coverage

- **bits-ui**: 0 files analyzed
- **Svelte 5 Runes**: 332 components with runes
- **TypeScript**: 2010 service files
- **Styling**: 35 components with styles

## Categories

- `bits-ui`: Component library integration
- `svelte5-runes`: Reactivity patterns
- `typescript-patterns`: Type-safe service patterns
- `style-guide`: CSS/styling conventions
- `fullstack-integration`: Complete API routes with DB/cache

## Usage

### For Fine-Tuning

Upload to Google Colab or your training platform:
```python
dataset = load_dataset('json', data_files='fullstack-training-combined.jsonl')
```

### For Knowledge Base

Import to Qdrant for RAG/ACE agents:
```bash
node scripts/phase77-import-training-to-kb.mjs
```

## Example Format

```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "metadata": {
    "category": "bits-ui",
    "tags": ["svelte5", "components"],
    "source": "src/routes/..."
  }
}
```
