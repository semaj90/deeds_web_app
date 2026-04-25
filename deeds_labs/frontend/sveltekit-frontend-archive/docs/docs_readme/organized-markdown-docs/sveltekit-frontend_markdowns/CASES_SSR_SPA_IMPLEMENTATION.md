# Cases SSR/SPA Implementation

This implementation provides a robust, modern approach to handling case management in a SvelteKit application using SSR/SPA hybrid architecture with URL-driven modal state management.

## 🏗️ Architecture Overview

### Core Principles

- **SSR First**: Server-side rendering for SEO and fast initial loads
- **Progressive Enhancement**: Works without JavaScript, enhanced with it
- **URL as State**: All modal/view state is driven by URL parameters
- **Type Safety**: Full TypeScript support throughout
- **Reactive Updates**: Efficient client-side updates via SvelteKit actions

### 3-Column Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                          Cases Layout                           │
├─────────────┬───────────────────────────────┬─────────────────────┤
│  Sidebar    │        Main Content         │   Evidence Panel   │
│             │                             │                     │
│ • Case List │ • Case Details             │ • Evidence List     │
│ • Filters   │ • Description              │ • Quick Actions     │
│ • Stats     │ • Metadata                 │ • Add Evidence      │
│ • Search    │ • Actions                  │ • Filter Evidence   │
│             │                             │                     │
└─────────────┴───────────────────────────────┴─────────────────────┘
```

## 🔄 Data Flow

### Server-Side (SSR)

1. **Layout Load (`+layout.server.ts`)**
   - Validates Lucia session
   - Fetches user's cases with filters
   - Provides case statistics
   - Runs for all `/cases/*` routes

2. **Page Load (`+page.server.ts`)**
   - Extends layout data
   - Fetches specific case details if `?view=caseId`
   - Loads evidence for active case

### Client-Side (SPA)

1. **Form Actions** - AJAX filtering without full page reload
2. **URL State** - Modal visibility driven by search params
3. **Reactive Stores** - Client-side state management
4. **Progressive Enhancement** - Enhanced UX with JavaScript

## 📁 File Structure

```
src/routes/cases/
├── +layout.server.ts     # SSR data loading & form actions
├── +layout.svelte        # 3-column layout with sidebar
├── +page.server.ts       # Case-specific data & evidence actions
└── +page.svelte          # Main content area & evidence modal

src/lib/components/cases/
├── CaseListItem.svelte   # Individual case list item
└── EvidenceCard.svelte   # Evidence display component

src/lib/stores/
└── casesStore.ts         # Client-side state management

src/lib/components/ui/
└── modal/
    ├── Modal.svelte      # Reusable modal component
    └── index.js          # Modal exports
```

## 🔗 URL Patterns

| URL                           | Purpose            | SSR Data              |
| ----------------------------- | ------------------ | --------------------- |
| `/cases`                      | Cases list         | All user cases        |
| `/cases?view=123`             | Case details modal | Case + evidence       |
| `/cases?search=term`          | Filtered cases     | Filtered cases        |
| `/cases?status=open`          | Status filter      | Status-filtered cases |
| `/cases?view=123&action=edit` | Edit mode          | Case + evidence       |

## 🎯 Key Features

### 1. URL-Driven Modal State

```typescript
// Modal visibility is reactive to URL
$: isModalOpen = $page.url.searchParams.has("view");
$: activeCaseId = $page.url.searchParams.get("view");

// Close modal by removing URL param
function closeModal() {
  const url = new URL($page.url);
  url.searchParams.delete("view");
  goto(url.toString(), { keepFocus: true, noScroll: true });
}
```

### 2. AJAX Filtering with Form Actions

```typescript
// Server-side filter action
export const actions = {
  filter: async ({ request, locals }) => {
    // ... filter logic
    return { success: true, cases: filteredCases };
  },
};

// Client-side enhancement
const handleFilterSubmit = () => {
  return async ({ result, update }) => {
    if (result.type === "success") {
      // Update store without full page reload
      casesStore.update((store) => ({
        ...store,
        cases: result.data.cases,
      }));
    }
  };
};
```

### 3. Evidence CRUD Operations

```typescript
// Add evidence action
addEvidence: async ({ request, locals }) => {
  const formData = await request.formData();
  const newEvidence = await db.insert(evidence).values({
    caseId: formData.get("caseId"),
    title: formData.get("title"),
    // ...
  });
  return { success: true, evidence: newEvidence[0] };
};
```

## 🔧 Technical Implementation

### Form Actions (AJAX)

- Uses SvelteKit's `use:enhance` for progressive enhancement
- Handles loading states and error feedback
- Updates client-side store for instant UI updates
- Maintains URL state for bookmarkable views

### Type Safety

- Full TypeScript support with proper type definitions
- Zod schemas for data validation
- Type-safe database operations with Drizzle ORM

### Performance Optimizations

- SSR for initial page loads
- Client-side navigation for subsequent interactions
- Efficient data fetching with proper caching
- Minimal re-renders with reactive statements

## 🚀 Usage Examples

### Opening a Case

```svelte
<!-- Navigate to case view -->
<a href="/cases?view={caseId}">View Case</a>

<!-- Or programmatically -->
<script>
  function openCase(caseId) {
    goto(`/cases?view=${caseId}`, { keepFocus: true });
  }
</script>
```

### Filtering Cases

```svelte
<!-- Form automatically enhances with AJAX -->
<form method="POST" action="?/filter" use:enhance={handleFilterSubmit}>
  <input name="search" placeholder="Search cases..." />
  <select name="status">
    <option value="all">All Status</option>
    <option value="open">Open</option>
  </select>
  <button type="submit">Filter</button>
</form>
```

### Adding Evidence

```svelte
<!-- Evidence form with proper actions -->
<form method="POST" action="?/addEvidence" use:enhance={handleEvidenceSubmit}>
  <input type="hidden" name="caseId" value={activeCase.id} />
  <input name="title" placeholder="Evidence title" required />
  <select name="type">
    <option value="document">Document</option>
    <option value="photo">Photo</option>
  </select>
  <textarea name="description" placeholder="Description"></textarea>
  <button type="submit">Add Evidence</button>
</form>
```

## 🎨 Styling & UI

### Responsive Design

- Mobile-first approach with responsive grid
- Collapsible sidebar for smaller screens
- Touch-friendly interactions

### Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- Focus management for modal interactions

## 🔒 Security

### Authentication

- Lucia session validation on all routes
- User-scoped data access
- CSRF protection via SvelteKit

### Data Validation

- Server-side validation for all inputs
- Type checking with TypeScript
- Sanitization of user inputs

## 📱 Progressive Enhancement

The implementation follows progressive enhancement principles:

1. **Base Experience**: Works without JavaScript
2. **Enhanced Experience**: AJAX updates, smooth transitions
3. **Optimal Experience**: Real-time updates, keyboard shortcuts

## 🧪 Testing

Run the test script to verify the implementation:

```bash
node test-cases-implementation.mjs
```

This will verify:

- ✅ Build success
- ✅ TypeScript compliance
- ✅ Critical files exist
- ✅ Component structure

## 🔮 Future Enhancements

- Real-time updates with WebSockets
- Drag-and-drop evidence management
- Advanced search with faceted filters
- Export functionality for cases
- Mobile app support
- Offline capabilities with service workers

## 📚 Dependencies

- **SvelteKit**: Framework and routing
- **Drizzle ORM**: Database operations
- **Lucia**: Authentication
- **Bits UI**: UI components
- **UnoCSS**: Styling
- **date-fns**: Date formatting
- **TypeScript**: Type safety

This implementation provides a solid foundation for a modern legal case management system with excellent user experience and developer experience.
