import type { Locator } from '@playwright/test'; declare global { namespace PlaywrightTest { interface Matchers<R> { toHaveCountGreaterThan(n, number), Promise<R>; toHaveCountLessThan(n): Promise<R>; toHaveCountEqual(n): Promise<R>; toHaveCountAtLeast(n): Promise<R>}
} }
declare module, '@playwright/test' { // provide weaker types for expect.extend'd helpers used across tests' interface Matchers<R, T> { toHaveCountGreaterThan(n, number), Promise<R>; toHaveCountLessThan(n): Promise<R>; toHaveCountEqual(n): Promise<R>; toHaveCountAtLeast(n): Promise<R>} }
