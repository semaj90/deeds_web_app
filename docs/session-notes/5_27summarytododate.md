Summary to Date

- Qdrant: reachable and `atlas_component_profiles_768` collection exists.
- Embedding service: reachable (Ollama/embedding endpoint). Models observed include `embeddinggemma:latest` and others.
- Indexer updates: `scripts/atlas/index-component-profiles-qdrant.mjs` was patched to:
  - derive `repoRoot` from the script location (avoid process.cwd()).
  - accept `--embedding-model`, `--preflight-only`, `--dry-run-report`, `--vector-size` flags.
  - include `model` in embedding POSTs and perform a preflight embedding test that validates vector length.
  - implement `--dry-run-report` to write sample texts without calling embedding/Qdrant.
- NPM wrapper caveat: passing CLI flags through `npm run` can be parsed incorrectly on Windows; use direct `node` invocation for reliable flag handling.

Recommended next commands (run from repo root):

```powershell
cd "C:\Users\james\Videos\deeds-web-app"
# preflight test (safe)
node .\scripts\atlas\index-component-profiles-qdrant.mjs --preflight-only --embedding-model embeddinggemma

# if preflight passes, run full index (limit 0 == no limit)
node .\scripts\atlas\index-component-profiles-qdrant.mjs --limit 0
```

If the preflight reports `model not found`, list available models and retry with the exact model name:

```bash
curl http://127.0.0.1:11434/v1/models | jq .
# then rerun with the exact model id:
node .\scripts\atlas\index-component-profiles-qdrant.mjs --preflight-only --embedding-model "EXACT_MODEL_NAME"
```

Notes:
- Reports and failure details are written to `.tmp/` and `reports/` (see script defaults: `atlas-component-qdrant-index-report.json`, `atlas-component-qdrant-index-report.md`, `.tmp/atlas-component-qdrant-failures.jsonl`).
- The script defaults to `embeddinggemma:latest` and vector size 768; adjust with `--embedding-model` and `--vector-size` if necessary.
