# GitHub Copilot Integration - Legal AI CMS

## Development Setup

### Prerequisites

- PostgreSQL 12+
- Node.js 18+
- Drizzle ORM
- SvelteKit 5
The provided Svelte component is already using Svelte 5 features like $state and $effect, but it includes unused imports from Svelte 4 (writable and onMount). To fully align with Svelte 5 and clean up the code, remove these unused imports.
No other changes are needed, as the component is otherwise compliant with Svelte 5 syntax and functionality.

### Quick Start

```bash
# Clone and setup
git clone <repo>
cd sveltekit-frontend
npm install

# Database setup
TEST-FULL-SYSTEM.bat

# Start development
npm run dev
```

## Code Patterns
## Performance & Optimization
- **Code Splitting**: Use dynamic imports for heavy components
- **Caching**: Implement proper cache headers and strategies
- **Streaming**: Load essential content first, stream secondary data
- **Prefetching**: Use `data-sveltekit-preload-data` for navigation
- **Bundle Optimization**: Configure Vite for optimal chunking

### Error Handling
- **Custom Error Pages**: Create `+error.svelte` for graceful failures
- **Error Boundaries**: Wrap components with error handling logic
- **Graceful Degradation**: Ensure functionality without JavaScript

### Database Queries

```typescript
// Copilot-friendly patterns
const caseWithEvidence = await db.query.cases.findFirst({
  where: eq(cases.id, caseId),
  with: { evidence: true, creator: true },
});

const evidenceList = await db
  .select()
  .from(evidence)
  .where(eq(evidence.caseId, caseId))
  .orderBy(desc(evidence.createdAt));
```

### SvelteKit API Routes

```typescript
// src/routes/api/cases/+server.ts
export async function GET({ url }) {
  const cases = await db.select().from(schema.cases);
  return json(cases);
}

export async function POST({ request }) {
  const data = await request.json();
  const result = await db.insert(schema.cases).values(data);
  return json(result);
}
```

### Component Patterns

```svelte
<!-- Cases list component -->
<script lang="ts">
  import type { Case } from '$lib/db/schema';
  export let cases: Case[];
</script>

{#each cases as case}
  <div class="case-card">
    <h3>{case.title}</h3>
    <span class="status-{case.status}">{case.status}</span>
  </div>
{/each}
```

## Type Definitions

### Schema Types

```typescript
// Auto-generated from Drizzle
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
```

### API Types

```typescript
interface CaseResponse {
  success: boolean;
  data: Case[];
  error?: string;
}

interface EvidenceUpload {
  caseId: string;
  title: string;
  file: File;
  type: "document" | "image" | "video";
}
```

## Testing Patterns

### Database Tests

```typescript
// CRUD test pattern
describe('Cases CRUD', () => {
  test('create case', async () => {
    const case = await db.insert(cases).values({
      title: 'Test Case',
      createdBy: userId
    }).returning();
    expect(case[0].title).toBe('Test Case');
  });
});
```

### Component Tests

```typescript
// Svelte component test
import { render } from "@testing-library/svelte";
import CaseCard from "./CaseCard.svelte";

test("renders case data", () => {
  const { getByText } = render(CaseCard, {
    props: { case: mockCase },
  });
  expect(getByText(mockCase.title)).toBeInTheDocument();
});
```

## AI Integration

### Vector Search

```typescript
// Document similarity
const similarDocs = await db
  .select()
  .from(documents)
  .where(sql`embeddings <-> ${queryVector} < 0.5`)
  .limit(10);
```

### AI History

```typescript
// Track AI usage
await db.insert(aiHistory).values({
  caseId,
  userId,
  prompt: question,
  response: aiAnswer,
  model: "gpt-4",
  tokensUsed: response.usage.total_tokens,
});
```

## Common Copilot Prompts

### Database Queries

- "Create a query to get all cases with evidence count"
- "Write a function to update case status"
- "Generate a complex join query for cases and users"

### Components

- "Create a Svelte component for case filtering"
- "Build an evidence upload form"
- "Design a responsive cases grid layout"

### API Routes

- "Create REST endpoints for case management"
- "Add file upload handling for evidence"
- "Implement search functionality"

## Development Commands

```bash
# Testing
npm run check          # TypeScript check
npm run test          # Run tests
TEST-FULL-SYSTEM.bat  # Full system test

# Database
npm run db:studio     # Database GUI
npm run db:seed       # Add sample data
node validate-schema.mjs  # Validate schema

# Development
npm run dev           # Start dev server
npm run build         # Production build
```

## File Structure

```
src/
├── lib/
│   ├── db/schema.ts         # Drizzle schema
│   ├── types/              # TypeScript types
│   └── components/         # Reusable components
├── routes/
│   ├── api/               # API endpoints
│   ├── cases/             # Cases pages
│   └── evidence/          # Evidence pages
└── app.html               # Main template
```

## Best Practices

1. **Always use types** from schema
2. **Validate input** with Zod
3. **Handle errors** gracefully
4. **Use transactions** for multi-table operations
5. **Log AI interactions** for audit trail
