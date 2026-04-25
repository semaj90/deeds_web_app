# Route testing

This document explains how to start required services and test SvelteKit routes to avoid common
runtime errors.

Prerequisites

- Redis must be running and reachable at the configured URL (default: redis://localhost:6379).
- Node.js and npm installed.

Start services

1. Start Redis (if not already running):
   ```bash
   redis-server
   ```
2. Install project dependencies:
   ```bash
   npm install
   ```
3. Start the SvelteKit dev server:
   ```bash
   npm run dev
   ```

Environment variables

- Create a .env (or set system env vars) with required values. Example:
  ```
  REDIS_URL=redis://localhost:6379
  # Client-side vars should be prefixed with VITE_ if used in Svelte components:
  VITE_API_BASE=http://localhost:5173
  ```

Basic route checks

- Health endpoint (example):
  ```bash
  curl -v http://localhost:5173/api/health
  ```
- Visit pages in the browser (default dev port 5173): http://localhost:5173/

Troubleshooting

- If you see connection errors related to Redis, confirm REDIS_URL matches the running Redis
  instance and that Redis is running on port 6379.
- If environment variables are missing, add them to .env and restart the dev server.
- Check the terminal logs for specific stack traces and address missing imports or undefined
  variables reported there.
