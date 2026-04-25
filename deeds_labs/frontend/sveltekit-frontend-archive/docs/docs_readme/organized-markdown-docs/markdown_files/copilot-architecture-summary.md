# Architecture Summary & Next Steps

- Use Drizzle ORM + pg_vector for backend.
- SSR all initial data in +page.server.ts.
- Hydrate Loki.js on client for fast queries.
- Use Fuse.js for fuzzy search.
- Use XState for complex UI state.
- Use shadcn-svelte + UnoCSS for beautiful, customizable UI.
- Svelte stores for UI state and displaying query results.

## Implementation Details

1. **Data Loading & Persistence**
   - Server-side: Use Drizzle ORM (with drizzle-kit migrations) to store all evidence, reports, and metadata in PostgreSQL. Store file blobs in cloud storage (S3, R2, etc.), and keep metadata (including AI embeddings via pg_vector) in your evidence table.
   - SvelteKit SSR: Centralize all initial data loading in +page.server.ts using the load function. Return all needed data (case, evidence, reports) as props.
   - Client-side: Hydrate a Loki.js database with this data on mount for instant querying/filtering/search.
2. **State & Search**
   - Loki.js: Use for client-side caching and fast queries. Replace large Svelte stores with Loki.js collections for evidence/reports.
   - Fuse.js: Use for fuzzy search over Loki.js data. On search input, update a Svelte store with results to display in the UI.
   - Svelte Stores: Use for UI state (active tab, sidebar open, notifications) and for holding filtered/search results.
   - XState: Use for complex UI workflows (evidence upload, AI report generation, autosave). Replace multiple booleans with a state machine.
3. **Mutations & Autosave**
   - Form Actions: Use SvelteKit form actions for user-initiated mutations (e.g., generate summary/strategy).
   - API Endpoints: Use dedicated API routes (+server.ts) for autosave and background tasks, validating user sessions.
4. **Styling & Components**
   - shadcn-svelte + UnoCSS: Use shadcn-svelte CLI to add headless, accessible UI components. Style and customize with UnoCSS utility classes.
   - Customize: Edit component files directly (e.g., Button, Dialog, Card) to match your brand and UX needs. You own the code—change variants, colors, sizes, etc.
5. **AI & Recommendations**
   - pg_vector: Store AI-generated vector embeddings in PostgreSQL for evidence. Use these for semantic search and recommendations.
   - Fuse.js: Use for instant client-side fuzzy search.
   - Loki.js: Use for offline/instant UI updates.

#### Example: Custom Button Variant

```ts
// src/lib/components/ui/button/index.ts
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700",
        success: "bg-green-600 text-white hover:bg-green-700",
        outline: "border border-input bg-background hover:bg-accent",
        // ...other variants
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

Use in Svelte:

```svelte
<Button>Default</Button>
<Button variant="success">Success</Button>
<Button variant="outline">Cancel</Button>
```
