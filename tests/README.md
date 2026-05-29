## Tests and Smoke Checks

This folder holds smoke and schema verification helpers for the Atlas glyph training pipeline.

Usage:

1. Run the smoke script (node):

```bash
node scripts/atlas/smoke-glyph-schema.mjs
```

2. Run repository smoke scripts:

```bash
npm run smoke:opencode
npm run smoke:tool-schema
```

Policy:
- Do NOT run DB migrations or apply manual SQL without operator approval.
- All ingestion scripts default to dry-run; use `--write` to apply after approvals.
