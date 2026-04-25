# Empty Directories Archived — April 16, 2026

These 5 directories were empty (0 `.ts`/`.svelte` files) and had no live import consumers.

| Directory | Reason Archived |
|-----------|----------------|
| `server/agents/` | Empty placeholder — agent logic lives in `server/agent/` (11 files) |
| `server/chat/` | Empty — chat logic lives in routes (`/api/chat/`, `/api/sse/chat/`) + `server/streaming/` (2 files) |
| `server/monitoring/` | Empty — observability logic lives in `server/observability/` (3 files) |
| `server/redis/` | Empty dir — Redis singleton is `server/redis.ts` (file at root, not dir). Cache layer in `server/cache/` (8 files) |
| `components/headless/` | Empty — bits-ui v2.16.2 serves as the headless component layer. 237 styled wrappers in `components/ui/` sit on top of bits-ui primitives (41 headless components: Dialog, Select, Tabs, etc.). No separate headless abstraction needed. |

## Headless Component Analysis

bits-ui v2.16.2 already provides a complete headless layer with Svelte 5 rune support:
- **Covered**: Dialog, Accordion, Select, Checkbox, ScrollArea, Tabs, Popover, DropdownMenu, Tooltip, Collapsible, etc.
- **Not covered** (use purpose-built packages): Toast (svelte-sonner), Data Table (@tanstack/svelte-table), Carousel (embla-carousel-svelte)
- **Svelte 5 patterns replace traditional headless**: `{#snippet child()}` replaces `<slot let:>`, `$state()` replaces renderless stores, callback props replace `createEventDispatcher()`
