# Gemini To-Do List: Stabilizing the Web App (SvelteKit 2, Drizzle, PostgreSQL, pg_vector)

This to-do list outlines the steps to get the application to a stable, working state with minimal errors, adhering to best practices for SvelteKit 2, Drizzle-kit, PostgreSQL, and pg_vector.

## Phase 1: Environment and Configuration

1.  [ ] **Verify Environment Setup:** Ensure that Docker, Node.js, and other dependencies are correctly installed and configured for optimal performance with SvelteKit 2.
2.  [ ] **Review Docker Configuration:** Inspect `docker-compose.yml` and related files (`docker-compose.override.yml`, etc.) for correctness. Ensure all services (especially PostgreSQL) are correctly defined, networked, and optimized for production.
3.  [ ] **Standardize Scripts:** Consolidate the numerous fix scripts (`.ps1`, `.bat`, `.mjs`) into a smaller, more manageable set of scripts with clear purposes, focusing on automated fixes for common issues.

## Phase 2: Database and Data (Drizzle-kit, PostgreSQL, pg_vector)

1.  [ ] **Fix Drizzle Schema & Migrations:**
    *   Analyze `drizzle.config.ts` and schema files in `src/lib/db/schema` to ensure they accurately reflect the desired PostgreSQL schema.
    *   Use `drizzle-kit generate` and `drizzle-kit migrate` to manage schema changes. Resolve any migration conflicts or errors using `check-migrations.mjs` and `fix-migration.mjs`.
    *   Ensure `pg_vector` extension is enabled and correctly utilized for vector embeddings in the schema, if applicable.
2.  [ ] **PostgreSQL Configuration & Performance:**
    *   Review PostgreSQL configurations within Docker for best practices (e.g., connection pooling, resource allocation).
    *   Optimize database queries and ensure proper indexing for performance, especially for vector searches using `pg_vector`.
3.  [ ] **Validate Seeding:** Check `seed.ts` and `seed-enhanced.ts` for errors. Ensure the database can be seeded with consistent, valid data, including any necessary vector data.

## Phase 3: Backend and API (SvelteKit 2, Drizzle)

1.  [ ] **Fix TypeScript Errors & Type Safety:** Systematically address all TypeScript errors across the backend and frontend. Ensure strict type checking is enabled and adhered to, especially for Drizzle ORM interactions.
2.  [ ] **SvelteKit 2 Routing & Endpoints:**
    *   Review `src/routes` for adherence to SvelteKit 2 routing conventions.
    *   Resolve any API route conflicts (as indicated by `fix-route-conflict-and-db.ps1`) and ensure API endpoints (`+server.ts`) are correctly implemented and handle data fetching/mutations efficiently.
    *   Implement proper error handling and data validation for all API endpoints.
3.  [ ] **Drizzle ORM Integration:** Ensure all database interactions use Drizzle ORM correctly, leveraging its type safety and query builder for efficient and secure data operations.
4.  [ ] **Review Backend Logic:** Inspect all backend code for potential bugs, security vulnerabilities, and performance bottlenecks.

## Phase 4: Frontend/UI (SvelteKit 2)

1.  [ ] **SvelteKit 2 Component Best Practices:**
    *   Review Svelte components (`.svelte` files) for adherence to SvelteKit 2 best practices (e.g., proper use of `load` functions, stores, actions, and component lifecycle).
    *   Address any component-related issues, including export conflicts (`UI_EXPORT_CONFLICTS_RESOLVED.md`).
2.  [ ] **Resolve UI/CSS Errors:** Fix any styling or CSS-related problems, ensuring a consistent and responsive user interface.
3.  [ ] **Client-Side Data Handling:** Ensure efficient client-side data fetching and state management, leveraging SvelteKit's built-in features.
4.  [ ] **Ensure Proper Component Rendering:** Verify that all UI components render correctly without errors in the browser across different devices and browsers.

## Phase 5: Testing and Validation

1.  [ ] **Comprehensive Testing:** Execute all available test suites (e.g., `RUN-SYSTEM-TESTS.bat`, `aitests`, unit tests for Svelte components and backend logic) to ensure the application is working as expected.
2.  [ ] **End-to-End Testing:** Implement and run end-to-end tests to verify critical user flows and system integrations.
3.  [ ] **Performance Profiling:** Profile the application to identify and resolve any performance bottlenecks, especially related to database queries and large data transfers.
4.  [ ] **Final Error Check:** Run a final error check using a script like `web-app-status-check.bat` and monitor logs to confirm that the application is stable and error-free.