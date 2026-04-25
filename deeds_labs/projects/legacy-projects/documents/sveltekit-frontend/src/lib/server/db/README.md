Use this folder for centralized DB helpers.

Import commonly used Drizzle operators and the `db` instance from `src/lib/server/db/utils.ts` to ensure consistent modular imports (Drizzle v0.44+).

Example:

import { db, eq, and } from '$lib/server/db/utils';

This avoids importing from 'drizzle-orm/expressions' across the codebase and keeps a single upgrade surface.
