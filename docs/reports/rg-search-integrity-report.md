# Ripgrep Search Integrity Report (Phase 9A)

**Status:** PASS
**Violations:** 0
**Generated:** 2026-05-16T18:51:28.999Z

| Script | Category | Line | Match | Status | Reason |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `scripts\atlas\analyze-directory-roles.mjs` | `other` | 83 | `'rg -u required'` | PASS | Safe. |
| `scripts\atlas\analyze-directory-roles.mjs` | `other` | 85 | `'rg -u preferred'` | PASS | Safe. |
| `scripts\atlas\analyze-directory-roles.mjs` | `other` | 110 | `'rg -u required'` | PASS | Safe. |
| `scripts\atlas\audit-contract-map.mjs` | `other` | 53 | `spawnSync('rg', [pattern, path, '--no-heading', '-n', '-u', ...flags]` | PASS | Safe. |
| `scripts\atlas\audit-contract-map.mjs` | `other` | 57 | `spawnSync('rg', [pattern, path, '-l', '-u', ...flags]` | PASS | Safe. |
| `scripts\atlas\audit-drizzle-postgres-contracts.mjs` | `contract_audit` | 75 | `spawnSync('rg', [pattern, path, '-u', '--no-heading', '-n', ...flags]` | PASS | Safe. |
| `scripts\atlas\audit-rg-search-integrity.mjs` | `other` | 93 | ``rg -u ...`` | PASS | Safe. |
| `scripts\atlas\audit-rg-search-integrity.mjs` | `other` | 95 | `"rg -u"` | PASS | Safe. |
| `scripts\atlas\audit-rg-search-integrity.mjs` | `other` | 94 | `spawnSync('rg', [...]` | PASS | Safe. |
| `scripts\atlas\audit-rg-search-integrity.mjs` | `other` | 110 | `spawnSync('rg', [...]` | PASS | Safe. |
| `scripts\atlas\audit-sveltekit-form-contracts.mjs` | `contract_audit` | 41 | `spawnSync('rg', [
    '-u', '--no-heading', '-n', '--color=never', pattern, path, ...extraArgs,
  ]` | PASS | Safe. |
| `scripts\atlas\audit-sveltekit-form-contracts.mjs` | `contract_audit` | 48 | `spawnSync('rg', [
    '-u', '-l', '--color=never', pattern, path, ...extraArgs,
  ]` | PASS | Safe. |
| `scripts\atlas\lib\reference-verifier.mjs` | `other` | 49 | `spawnSync(
      'rg', ['--files', '--type-add', 'srcweb:*.{ts,tsx,svelte,svelte.ts,js,mjs,cjs}', '-tsrcweb', 'src']` | PASS | Safe. |
| `scripts\phase3-file-inventory.mjs` | `other` | 34 | `'rg \'` | PASS | Safe. |
| `scripts\phase3-file-inventory.mjs` | `other` | 42 | `'rg \'` | PASS | Safe. |
| `scripts\phase76-mcp-server.mjs` | `other` | 345 | `"rg -n \"` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\agent\tools\ripgrep-search.ts` | `other` | 243 | `spawn('rg', ['--version']` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\agent\tools\web-search.ts` | `other` | 243 | `'rg command'` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\ai\hermes\skills\codebase.ts` | `other` | 39 | ``rg --files src/${input.directory || '` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\ai\hermes\skills\codebase.ts` | `other` | 48 | `'rg --files src/routes'` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\ai\hermes\skills\codebase.ts` | `other` | 88 | `'rg -i "` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\analytics\codebase-research.ts` | `other` | 84 | ``rg ${caseFlag} --json --max-count ${maxResults} --glob "` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\features\feature-map-compiler.ts` | `other` | 263 | ``rg -l "` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\indexer\rg-search-utility.ts` | `other` | 31 | ``rg -n --column --no-heading --color never "` | PASS | Safe. |
| `sveltekit-frontend\src\lib\server\tools\handlers\scanRepo.ts` | `other` | 67 | ``rg ${args.join('` | PASS | Safe. |
