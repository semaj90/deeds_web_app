import type { App } from '../../../app.d.js'; // Correct path to app.d.ts

/**
 * A utility function to retrieve the authenticated user from SvelteKit locals.
 * It returns the user object if authenticated, otherwise null.
 * The calling code is responsible for handling the null case (e.g., returning a 401).
 *
 * @param locals The SvelteKit `App.Locals` object.
 * @returns The authenticated `User` object or `null`.
 */
export default function requireAuthentication(locals: App.Locals): App.Locals['user'] {
    return locals.user;
}
