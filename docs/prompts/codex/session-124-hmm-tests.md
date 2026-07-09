# Session 124 HMM Tool Router Tests

Test goals:

- Code-location queries route to `rg.search` or `ast_grep.search`.
- Weak packet validation blocks `gemma4.synthesize`.
- `QUARANTINE` blocks `gemma4.synthesize` even with high validation.
- The OKF contract validates against the Zod schema.

Do not add integration-service dependencies to this smoke. It must stay deterministic and local.

Run:

```bash
npm run atlas:hmm:tool-router:smoke
```

