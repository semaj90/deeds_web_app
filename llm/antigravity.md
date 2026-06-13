# Antigravity.md — Coding Assistant Guidelines

This document establishes the guidelines, constraints, and standard operating procedures for **Antigravity**, the coding assistant agent.

---

## 1. Redis/Valkey Password Configuration Pattern

> [!IMPORTANT]
> **CRITICAL HARD RULE:** Under no circumstances should any Redis client (`ioredis` or SvelteKit client) be instantiated without authentication credentials, nor should `REDIS_URL` strings be manually parsed/interpolated with inline passwords.

- **Mandatory Environment Helpers:** Always use environment helpers (e.g. SvelteKit's `$lib/server/env.server.js` or `process.env` parsing with options objects) to configure the connection.
- **Mandatory Error Event Handlers:** You **must** attach a `redis.on('error', () => {})` handler immediately upon creating a Redis instance to prevent the Node.js runtime from throwing an unhandled `NOAUTH` or `ECONNREFUSED` exception and crashing.
- **Fallback Password:** If `process.env.REDIS_PASSWORD` or `process.env.REDIS_PASS` is not provided, default to `'redis'` if authentication is required by the environment.

### Canonical Implementation Pattern
```javascript
const redis = new Redis({
  host: env.REDIS_HOST || '127.0.0.1',
  port: parseInt(env.REDIS_PORT || '6379', 10),
  password: env.REDIS_PASSWORD || env.REDIS_PASS || 'redis',
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', (err) => {
  // Gracefully log or suppress background connection errors
});
```

---

## 2. Web Application Development Constraints

- **Svelte 5 Runes Only:** Never use `export let`, `$:`, `on:click`, or `<slot>`. Use `$state`, `$derived`, `$props`, `onclick`, and modern snippets.
- **Vanilla CSS Baseline:** Maximize flexibility using curated, premium color palettes (e.g. HSL tailored colors, sleek dark modes, glassmorphism gradients, micro-animations). Avoid simple boilerplate.
- **No Placeholders:** Use `generate_image` or clean Mockups for actual visual assets.
- **Stable JSON Outputs:** API endpoints must return stable JSON schemas even on error.

---
*Maintained under Deeds Legal-AI Platform Guidelines.*
