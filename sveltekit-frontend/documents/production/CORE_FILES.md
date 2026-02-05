# Core Production Files

This document lists the essential files and directories required for the `sveltekit-frontend` production build.

## Core Directories

### Routes (`src/routes`)

*   **`(app)`**: Main authenticated application.
    *   `+layout.svelte`: Core layout (Sidebar, Header, WebGPU init).
    *   `+page.svelte`: Dashboard.
    *   `cases/`: Case management.
    *   `evidence/`: Evidence library & upload.
    *   `persons-of-interest/`: Entity management.
    *   `analysis-center/`: AI analysis interface.
    *   `global-search/`: Search interface.
    *   `system-configuration/`: Admin/Config.
*   **`api`**: Backend endpoints.
    *   `auth/`: Session management.
    *   `ai/`: Ollama/LLM integration endpoints.
    *   `db/`: Database proxy endpoints.
*   **`login`**: Authentication flow.
*   **`health`**: Monitoring endpoint (`/health`).
*   **`(dev)`**: Development & Testing utilities (Excluded from prod build config theoretically, or guarded).

### Library (`src/lib`)

*   **`components/`**: UI Building Blocks.
    *   `ui/`: Bits UI / Shadcn primitives.
    *   `yorha/`: Themed components.
    *   `legal-ai/`: Business domain components.
*   **`server/`**: Server-side logic.
    *   `db/`: Drizzle client & schema.
    *   `auth/`: Lucia/Auth logic.
    *   `integrations/`: External services (MinIO, Qdrant, Ollama, Redis).
*   **`stores/`**: Svelte 5 Runes & Stores (`appState`, `userPrefs`).
*   **`types/`**: TypeScript Definitions (`enhanced-svelte5-types.ts`).
*   **`utils/`**: Helpers (`cn`, `formatters`).

## Essential Files

*   `src/app.html`: Root HTML template.
*   `src/app.d.ts`: App namespace types.
*   `src/hooks.server.ts`: Auth handles & global server hooks.
*   `src/routes/+layout.server.ts`: Auth checks for root layout.
*   `vite.config.ts`: Build configuration.
*   `svelte.config.js`: SvelteKit configuration.
*   `drizzle.config.ts`: Database migration config.

## Feature Consolidation (To-Do)

The following should be consolidated into `src/lib/features`:
*   `src/lib/ai` -> `features/ai`
*   `src/lib/analysis` -> `features/analytics`
*   `src/lib/machines` -> `features/workflows`
*   `src/lib/memory` -> `features/memory`
*   `src/lib/search` -> `features/search`
