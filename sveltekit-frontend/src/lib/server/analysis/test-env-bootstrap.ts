// Loads .env.local then .env into process.env for vitest specs that hit a
// real Postgres connection directly (bypassing SvelteKit's request-scoped
// $env/dynamic/private injection, which vitest unit-test files never go
// through). dotenv's config() never overwrites an already-set process.env
// var, so .env.local takes precedence over .env, matching Vite's own
// env-file precedence convention. Import this FIRST, before any other
// import, in any spec file that transitively imports db/client.ts — ESM
// evaluates sibling static imports depth-first in declaration order, so a
// leaf import like this one (only depends on `dotenv`) finishes running
// before the next sibling import's module graph is evaluated.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../../../'); // src/lib/server/analysis -> sveltekit-frontend

config({ path: path.join(projectRoot, '.env.local') });
config({ path: path.join(projectRoot, '.env') });
