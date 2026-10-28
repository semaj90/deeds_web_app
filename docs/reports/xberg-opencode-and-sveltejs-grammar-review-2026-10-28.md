# Xberg OpenCode Plugin and Svelte Grammar Review

Date: 2026-10-28

## Xberg document-extraction plugin

- Root `opencode.json` pins `@xberg-io/opencode-xberg@1.3.11`; `opencode debug config` resolves that plugin entry, and the package is present in OpenCode's package cache.
- Static inspection of the cached plugin declares three tools: `xberg_extract`, `xberg_detect`, and `xberg_formats`. They invoke the separate `xberg` executable.
- The `xberg` executable is not installed (`CLI_NOT_INSTALLED`). Therefore, the plugin's presence/configuration is verified, but runtime tool discovery and successful document extraction are **not** verified. No document extraction was attempted and no CLI/package was installed.
- This plugin extracts documents; it is not the source-code Tree-sitter language pack, does not parse Svelte, and does not integrate with the Python `:8095` sidecar.

## Svelte-maintained Tree-sitter grammar

The comparison uses existing checksummed parser receipts on the same frozen ten-file cohort; this audit did not rerun either parser. The official grammar receipt identifies `sveltejs/tree-sitter-svelte` at commit `e36b60c145a4fd52a29e8b40a75174638d61f170`, metadata version `2.0.0`, marked `WORK_IN_PROGRESS_FORK`.

- Official grammar: **191/203 exact compiler spans**, zero parser-error files, and deterministic replay with equal digests.
- Xberg language-pack grammar: **202/203** exact spans, but its receipt does not identify the bundled grammar source, so this is a numeric baseline, not a provenance-qualified grammar comparison.
- The official grammar recovers `{@render children?.()}` in `CommandCenterShell.svelte` at bytes `[3448, 3470)`, matching the compiler span. It does not meet the 202-span acceptance floor.
- Its 12 extent disagreements are concentrated in `+page.svelte` (27/29), `SuggestionsList.svelte` (7/8), and `AnalysisPanel.svelte` (104/113). Counts alone do not establish that all mismatches are `else-if`; the previous receipt describes 12 `else-if` extent disagreements, while this aggregate exposes per-file compiler-only/CST-only counts but no individual range pairs.
- The official receipt records 45/45 grammar corpus tests and deterministic replay, but does not include newline-fixture results or cohort-wide raw-byte-slice validation. Those remain unproven.

## Decision

Keep the Svelte compiler AST as template/span authority. Do not integrate the official grammar into the sidecar, ast-grep, or canonical pipeline yet. Keep the Xberg document plugin separate; it is not a Svelte parser. Canonical Gate V2 remains `FAIL`, and no relation or Graphify promotion follows from parser parity.

## Receipt and limits

- Comparison receipt: `.tmp/atlas/svelte-maintained-vs-xberg-grammar-comparison-20261028T033104893Z-v2.json`
- Receipt SHA-256: `sha256:f47bd9bb3fdde00c9f20390650911cc96f113d23a12a9d79cde1bdf7307c9141`
- The receipt compares existing evidence (`parserRunsPerformed: false`). It reports all 10 current worktree files still match the frozen cohort hashes.
- No plugin tool was invoked, no document was extracted, and no CLI, dependency, service, source file, or canonical store was changed.

```yaml
likely_cause: The official Svelte grammar recognizes the needed structures but has 12 compiler-span extent disagreements in the frozen cohort.
evidence: Checksummed official/Xberg comparison receipt; resolved OpenCode plugin configuration and cached plugin source; xberg CLI is absent.
patch_targets: []
safe_next_command: Install or provision the Xberg CLI only through a verified official method, then invoke xberg_formats before attempting document extraction.
smoke_command: After verified CLI provisioning, call xberg_formats and perform one bounded extraction on a disposable fixture.
report_path: docs/reports/xberg-opencode-and-sveltejs-grammar-review-2026-10-28.md
```
