#!/usr/bin/env zx
import 'zx/globals'

// Run drizzle-kit generate, then start the frontend dev server.
// This script is intended for local development. It will run codegen first
// and then start the existing dev script. It respects CI by not running
// when CI env var is set.

if (process.env.CI) {
  console.log('CI environment detected, skipping dev-db-gen helper.');
  process.exit(0);
}

try {
  console.log('Running drizzle-kit generate...')
  await $`npx drizzle-kit generate`
  console.log('drizzle-kit generate completed.')
} catch (err) {
  console.error('drizzle-kit generate failed:', err?.message ?? err)
  process.exit(1)
}

// Start the frontend dev server (use npm run dev)
console.log('Starting frontend dev server...')
await $`npm run dev`
