# Svelte 5 — First steps for migration

This document contains a short, pragmatic checklist to get a SvelteKit project started when
migrating to Svelte 5 and to avoid common errors.

## Before you start

- Commit or stash any uncommitted changes.
- Read your app's tests and ensure they run locally.
- Review third-party libraries for Svelte 5 compatibility.

## Quick checklist

1. Update dependencies
   - Update Svelte and related tooling in package.json (run a local test after upgrading). Example:
   ```bash
   npm install svelte@latest @sveltejs/kit@latest
   ```
2. Update your Svelte configuration
   - Check your svelte.config.js or svelte.config.cjs for deprecated options and adapter
     compatibility with SvelteKit.
3. Replace deprecated APIs
   - Search the codebase for warnings about removed or renamed APIs and adapt to the new
     equivalents.
4. Test components incrementally
   - Run the dev server and fix compiler errors per-file; start with shared components and routes
     with many imports.
5. Run linters and tests
   - Fix issues reported by TypeScript, ESLint, or other static tools.

## Common fixes

- If imports fail, ensure paths are correct and update any changed export names.
- If the compiler reports a changed lifecycle or store API, consult the official migration notes for
  exact replacements.
- For SvelteKit routing changes, update route filenames and the server/client load function
  signatures as needed.

## Troubleshooting tips

- Start the dev server with verbose output to see full compiler diagnostics:
  ```bash
  npm run dev
  ```
- When encountering an unfamiliar error, create a minimal reproduction (single-component) to isolate
  the cause.
- Consult upstream changelogs and migration guides for libraries you depend on.

## Example minimal component change

If a lifecycle name or import changed, update the component like this:

Before:
