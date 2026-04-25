# SvelteKit Legal AI App Best Practices

**Generated: 2025-08-03**

---

## SvelteKit + Svelte 5 Component Best Practices

- Use Svelte 5 runes for state and props:
  - `$state()` for reactive variables
  - `$props()` for props
  - `$derived()` for computed values
  - Avoid deprecated patterns like `export let` and `$:`
- Event Handling:
  - Use arrow functions for event handlers
  - Always close handler blocks properly
  - Prefer `<button>` for clickable actions (accessibility)
- Component Imports/Exports:
  - All Svelte components should have a default export (implicit)
  - Import UI components from correct paths (e.g., `bits-ui`)
- Accessibility:
  - Use ARIA attributes and roles for interactive elements
  - Add keyboard support (e.g., `on:keydown` for Enter/Escape)

---

## TypeScript & API Patterns

- Strict Typing:
  - Use interfaces for props, API responses, and custom types
  - Avoid `any` unless absolutely necessary
- Error Handling:
  - Use try/catch in async functions
  - Return structured error objects in API endpoints
- SvelteKit API Routes:
  - Always check `locals.user` for authentication
  - Use `json()` and `error()` from `@sveltejs/kit` for responses

---

## Drizzle ORM & Database

- Schema Definition:
  - Use Drizzle’s `pgTable` and type-safe columns
  - Reference foreign keys with `.references(() => ...)`
- Query Patterns:
  - Use `.select()`, `.insert()`, `.update()` with error handling
  - Return paginated results and total counts for list endpoints

---

## AI & Semantic Search

- Ollama Integration:
  - Use local endpoints for generation and embeddings
  - Handle API errors gracefully and log failures
- Context7 & Enhanced Index:
  - Prioritize enhanced index results for code suggestions
  - Use semantic clustering and pattern recognition for relevance

---

## UI/UX & Performance

- Responsive Design:
  - Use Tailwind/UnoCSS for utility classes
  - Test layouts on mobile and desktop
- Performance:
  - Use SIMD JSON parsing and vector embeddings for fast search
  - Optimize index size with compression and caching

---

## Development Workflow

- Type Checking:
  - Run `npm run check` and `npx svelte-kit sync` regularly
  - Fix critical Svelte syntax errors first, then import/export, then type errors
- Testing:
  - Use Svelte Testing Library and Vitest for component and API tests
  - Test state machines (XState) for complex flows

---

## Legal Domain Specific

- Audit Trails:
  - Always log actions (create, update, delete) with user and timestamp
- Chain of Custody:
  - Track evidence movement and analysis
- Role-Based Access:
  - Implement prosecutor/admin roles for sensitive actions

---

These practices will help maintain code quality, accessibility, and performance in your SvelteKit Legal AI app.
