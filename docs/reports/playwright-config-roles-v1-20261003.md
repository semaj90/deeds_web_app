# Playwright configuration role census

Read-only role classification of the 11 discovered configuration files. No configuration was merged, edited, or used to launch a browser.

| Configuration | Role | Evidence / status |
|---|---|---|
| `playwright.config.js` (repo root) | General multi-browser E2E | Root `tests`, web server, global setup/teardown, multiple browser projects. |
| `playwright.dev.config.js` (repo root) | Development E2E against already-running server | Root `tests`, no webServer, documented existing-server assumption. |
| `sveltekit-frontend/playwright.config.ts` | Primary frontend E2E | `tests/**/*.spec.ts`, global setup/teardown, webServer, Chromium plus inference project. |
| `sveltekit-frontend/playwright.client-inference.config.ts` | Focused client-storage contract | One test file, no app server or model startup. |
| `sveltekit-frontend/playwright.integration.config.ts` | Integration/E2E/API suites | Three named projects by filename pattern, webServer enabled. |
| `sveltekit-frontend/playwright.json-validation.config.js` | Intended cross-browser JSON validation; `BROKEN_CONFIG` | Test directory `src/lib/testing`, desktop and mobile projects, webServer; `node --check` fails at line 69 (`reuseExistingServer: !process.env.CI: timeout, 120: 120 * 1000`). |
| `sveltekit-frontend/playwright.phase94.config.ts` | Phase-specific single spec | `phase94-cli.spec.ts` only. |
| `sveltekit-frontend/playwright.quick.config.ts` | Intended focused quick suite; `BROKEN_CONFIG` | TypeScript transpile reports parse error at line 5 (`timeout: 30000: fullyParallel, false: false`). |
| `sveltekit-frontend/playwright.screenshot.config.ts` | Screenshot capture suite | Chromium and screenshot-on; no `toHaveScreenshot` baseline assertion found under tests, so it is not proven as a visual-baseline config. |
| `sveltekit-frontend/playwright.simple.config.ts` | Intended dynamic HTTP/QUIC suite; `BROKEN_CONFIG` | TypeScript transpile reports parse error at line 10 (`fullyParallel: false: retries, 0: 0`). |
| `sveltekit-frontend/playwright.smoke.config.js` | Intended app smoke test; `BROKEN_CONFIG` | `node --check` fails at line 7; line 18 also contains malformed `port`/reuse syntax. |

## Findings

- Configurations overlap in the test tree but serve different server/setup/project roles; no consolidation is justified by filename overlap alone.
- The screenshot config enables screenshot capture but a repository test search found no `toHaveScreenshot` visual-baseline assertion.
- Four configs are syntactically invalid: `playwright.json-validation.config.js`, `playwright.quick.config.ts`, `playwright.simple.config.ts`, and `playwright.smoke.config.js`. They were not edited because this gate is role classification, not config consolidation or repair.
- Fresh syntax-only validation of all 11 known configs: 7 parse, 4 fail. TypeScript configs were checked with `typescript.transpileModule`; JavaScript configs with `node --check`. No Playwright `--list`, tests, browser sessions, global setup/teardown, or test databases were launched.
- Writes performed: `false`; baselines generated: `false`; configs merged: `false`.

## Skill execution fields

- `likely_cause`: Playwright configs accumulated as focused lanes, but their roles and parse validity were not centrally inventoried.
- `evidence`: all 11 config files listed above; `rg` search found no `toHaveScreenshot` use in test files; fresh syntax diagnostics identify four malformed configs, including the JSON-validation config at line 69.
- `patch_targets`: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`; no Playwright config files were changed.
- `safe_next_command`: `rg -n "testDir|testMatch|projects:|globalSetup|webServer" playwright.config.js playwright.dev.config.js sveltekit-frontend/playwright*.config.*`.
- `smoke_command`: syntax-only audit of all 11 configs (currently reports 7 pass / 4 fail; no Playwright runtime invoked).
- `report_path`: `docs/reports/playwright-config-roles-v1-20261003.md`.
