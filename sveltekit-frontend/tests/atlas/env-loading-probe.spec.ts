// @vitest-environment node
/**
 * Diagnostic probe for the route-import-infra-isolation G8 regression
 * (openspec/changes/route-import-infra-isolation/tasks.md, "G8 deep audit").
 *
 * Documents the env-plumbing gap that causes ~24 route tests to fail at import
 * time: `vite dev`/`vite build` CLI entrypoints merge `.env` into `process.env`
 * before app code runs, but the `vitest` CLI entrypoint does not — only Vite's
 * plugin-level virtual modules (SvelteKit's `$env/*`) see the loaded values.
 * `src/lib/server/env.server.ts:20` reads raw `process.env` directly, so
 * `ENV.ROTORQUANT_MODEL_PATH` is undefined under vitest and
 * `src/lib/server/llm/runtime-contract.ts`'s module-level throw fires.
 *
 * Expected today (2026-09-05, no fix applied):
 *   process.env.ROTORQUANT_MODEL_PATH        -> undefined
 *   $env/dynamic/private ROTORQUANT_MODEL_PATH -> the real .env value
 *
 * If the recommended `import 'dotenv/config'` setupFiles fix is ever applied,
 * the first value becomes defined too — this probe is the fastest way to
 * confirm that, so keep it rather than re-deriving the diagnosis.
 */
import { describe, it, expect } from 'vitest';

describe('env loading probe (diagnostic, not a gate)', () => {
  it('reports whether .env reaches process.env vs $env/dynamic/private under vitest', async () => {
    const fromProcessEnv = process.env.ROTORQUANT_MODEL_PATH;
    // Dynamic + cast: `$env/dynamic/private` is a Vite virtual module declared in
    // src/global.d.ts, which does not cover files under tests/ — it resolves fine
    // at runtime under vitest, it just has no static type from here.
    const mod = (await import('$env/dynamic/private' as string)) as { env: Record<string, string | undefined> };
    const fromSvelteKitEnv = mod.env.ROTORQUANT_MODEL_PATH;

    console.log('process.env.ROTORQUANT_MODEL_PATH        =', JSON.stringify(fromProcessEnv));
    console.log('$env/dynamic/private ROTORQUANT_MODEL_PATH =', JSON.stringify(fromSvelteKitEnv));

    // Deliberately not asserting either value — this is a reporting probe, and
    // asserting "process.env is undefined" would turn the current broken state
    // into a gate that fails once the env-loading fix lands.
    expect(typeof fromProcessEnv === 'string' || fromProcessEnv === undefined).toBe(true);
  });
});
