# Library Consolidation Status

## Moves Complete

### Features
| Feature | Source | Destination | Status |
|---------|--------|-------------|--------|
| **POI** | `src/lib/services/poi.ts` | `src/lib/features/poi/services/poi.ts` | ✅ Moved |
| **AI** | `src/lib/services/ai-service.ts` | `src/lib/features/ai/services/` | ✅ Moved |
| **AI** | `src/lib/services/ollama-client.ts` | `src/lib/features/ai/services/` | ✅ Moved |
| **AI** | `src/lib/services/gemma*.ts` | `src/lib/features/ai/services/` | ✅ Moved |
| **Evidence** | `src/lib/services/evidence-*.ts` | `src/lib/features/evidence/services/` | ✅ Moved |
| **Evidence** | `src/lib/services/legal-document-graph.ts` | `src/lib/features/evidence/services/` | ✅ Moved |

## Next Steps
1.  **Update Imports**: The moves above have broken imports in consumer files. We need to run `fix-imports` or manually update routes.
2.  **Continue Consolidation**: Move `search-*.ts` into `features/search`.
3.  **Run Tests**: Verify core routes still load (they might fail now due to broken imports).

## Rollback Plan
If tests fail catastrophically, we can move files back using the reverse commands.
