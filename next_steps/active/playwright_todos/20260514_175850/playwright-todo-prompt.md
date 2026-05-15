# Playwright Todo Prompt

Use this as the next Playwright-focused task prompt.

## Goal
Verify the app’s route redirects and browser flows without hanging, then fix only the minimal issues blocking Playwright.

## Current findings
- `/evidenceboard` should resolve to the canonical evidence route.
- `/yorha`, `/yorha-home`, and `/yorha-command-center` should resolve to the homepage command center.
- `/admin/gpu-demo` should resolve to `/admin/gpu-evidence-graph`.
- `/api/sse/chat` was throwing a parse/runtime issue tied to `_dup` in Redis stream cleanup.
- A previous Playwright run appeared to hang during app startup or route stabilization.

## Todo sequence
1. Run a narrow Playwright smoke test first, not the full suite.
2. Confirm the legacy route redirects return 200/308 and land on the right canonical page.
3. Confirm the SSE chat route no longer throws the `_dup` parse error.
4. If a test hangs, shorten the scope and use `--grep` against one scenario only.
5. Keep fixes minimal: add redirects, remove unsupported syntax, avoid route rewrites unless required.

## Suggested commands
```bash
npx playwright test ./tests/legal-workflow.spec.ts --project=chromium --grep "Evidence Board Workflow Test|All Routes Navigation Test"
npx playwright test ./tests/e2e/route-verification.spec.ts --project=chromium --grep "should load"
```

## Notes
- Prefer redirect shims over new duplicate pages.
- Do not broaden the scope until the narrow smoke is green.
- If the app hangs at startup, inspect server logs before changing tests.
