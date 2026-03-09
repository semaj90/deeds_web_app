bits-ui wrapper components

Purpose
- Provide a thin compatibility layer over `bits-ui` primitives so the repository can progressively migrate away from direct `bits-ui` imports.
- Wrappers re-export `bits-ui` primitives by default but allow runtime overrides for local dev or testing.

How it works
- Each wrapper attempts to read overrides via `getBitsOverrides()` (global `__BITS_OVERRIDES__`) and uses the override implementation when provided.
- If no override is registered, the wrapper dynamically imports `bits-ui` and uses the expected primitive, falling back to a minimal markup version if `bits-ui` is unavailable.

Usage
- Replace direct imports like `import { Button } from 'bits-ui'` with `import { Button } from '$lib/components/ui/wrappers/bits'`.
- Wrappers accept the same props and render contract (prefer Snippet children). They try to keep parity.

Runtime overrides (for testing/dev)
- In tests or local dev, register an override by setting `globalThis.__BITS_OVERRIDES__ = { Button: MyButtonImpl }` or use the `registerOverride` helper exported from `bits-overrides`.

Notes
- Keep wrappers minimal; the goal is parity, not reimplementation.
- Add tests for wrappers before switching imports for critical flows.
