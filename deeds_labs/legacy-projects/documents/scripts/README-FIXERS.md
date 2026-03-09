Fixer scripts

This folder contains quick Node-based fixers to repair common corruption patterns found during Phase 34/40.

Files:
- fix-css-commas.mjs: Find and (optionally) fix commas used instead of semicolons inside CSS or <style> blocks in Svelte files. Dry-run by default. Use --apply to write changes.
- fix-object-literal-colons.mjs: AST-aware fixer (Babel) to detect object literals with commas instead of colons. Conservative heuristics. Dry-run by default. Use --apply to write changes.
- fix-type-union-commas.mjs: Uses ts-morph to convert comma-separated type unions into pipe-separated unions. Dry-run by default. Use --apply to write changes.

Usage examples (run from repo root):
- node scripts/fix-css-commas.mjs --dry
- node scripts/fix-css-commas.mjs --apply
- node scripts/fix-object-literal-colons.mjs
- node scripts/fix-object-literal-colons.mjs --apply
- node scripts/fix-type-union-commas.mjs
- node scripts/fix-type-union-commas.mjs --apply

Notes:
- All scripts are conservative and create backups when applying changes is risky. Review diffs before committing.
- Prefer running the scripts individually, review results, then run with --apply.
- These scripts require Node 18+ and the following npm packages installed in the repo: @babel/parser, @babel/traverse, @babel/generator, ts-morph, glob
