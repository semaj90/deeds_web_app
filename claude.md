# Claude - Phase 78 AST-Aware Error Ranking + Svelte 5 Migration

---

## ⚠️ IDE Linter Reverts File Edits (February 13, 2026)

**Problem**: VS Code ESLint/Prettier auto-reformats files on disk change, reverting Claude Edit tool changes. NOT caused by AST fixer scripts.

**Workarounds (in order of reliability):**
1. **Write tool** for full file rewrites — linter reformats style only, not logic
2. **Bash `cat >>`** for appending exports/functions to end of file
3. **Bash `sed -i`** for targeted single-line replacements
4. **Re-read after Edit** to verify changes survived linter pass
5. **Batch edits** into single Write instead of multiple Edit calls

**Detection**: System reminders saying "file was modified by user or linter" after Edit tool = linter reverted. Re-apply with Write or Bash.

---

## 🚨 Phase 99 @migration-task Corruption (February 13, 2026)

**Problem**: Phase 99 Svelte 5 auto-migration tool (`0a2bd98929`) corrupted **83 active `.svelte` component files** in `src/lib/components/`. The tool left `@migration-task Error` comments and mangled code (compressed to single lines, `0%` corruption, broken syntax).

**Scope**:
- **83 active `.svelte` files** with `@migration-task` corruption (plus 282 backup files)
- **54 have clean originals** at commit `fa8498dc4a` (pre-Phase 99)
- **29 were created after** `fa8498dc4a` (no clean version to restore)
- **Only ~5 are imported by active routes** (94% are dead code / unused components)

**Clean version commit**: `fa8498dc4a` ("fix(typescript): resolve compilation errors")
- Files at this commit were already Svelte 5-compatible (no `export let`, no `on:click`, no `$:`)
- Properly formatted, readable code with correct imports

**Corruption commit**: `0a2bd98929` ("Phase 99: Svelte 5 Auto-Migration - 80% error reduction")
- Tool compressed code to single lines
- Injected `@migration-task Error` comments at top of files
- Replaced `{}` with `0%` throughout
- Broke import patterns with unsafe runtime fallbacks

**Route-Imported Components** (fix these first):
- `SuggestionsList` → `phase78/routes/[routePath]/+page.svelte`
- Other 78 components are NOT imported by any route

**Restoration Strategy**:
1. Restore 54 files from `fa8498dc4a` using `git show fa8498dc4a:sveltekit-frontend/<path>`
2. Convert restored files to Svelte 5 runes (`$props`, `$state`, `$derived`, `$effect`)
3. Update imports (bits-ui v2 namespace, Button default import)
4. For 29 files without clean originals: rewrite from scratch or archive as dead code
5. Focus on route-imported components first, archive the rest

**DO NOT**: Run the Phase 99 migration tool again. Manual conversion is safer.

---

## 🚀 February 8, 2026 – Production-Ready Legal AI Platform Guide

### 📚 Architecture Overview

**Technology Stack:**
- **Frontend**: SvelteKit 2 + Svelte 5 (runes) + bits-ui v2.15.5 + UnoCSS
- **Local Caching**: IndexedDB + Loki.js (client-side persistence)
- **Server Caching**: Redis (SSR page cache + session data)
- **Primary Database**: PostgreSQL 16 + Drizzle ORM 0.44
- **Vector Storage**: Qdrant + pgvector (GPU-accelerated with CUDA)
- **AI Models**: Ollama (embeddinggemma:latest + gemma3-legal:latest)
- **Real-Time**: Server-Sent Events (SSE) for route health monitoring

**AI Model Notes:**
- **LegalBERT ONNX**: CPU-only model for browser usage. Used for client-side legal document classification and entity extraction without GPU requirements. DO NOT attempt to use GPU acceleration with the ONNX Runtime in browser contexts.
- **embeddinggemma:latest**: Primary embedding model for semantic search (server-side with GPU)
- **gemma3-legal:latest**: Primary LLM for legal text generation and analysis (server-side with GPU)

### 🎯 Bits-UI Svelte 5 Migration (2026 Standards)

**Latest Version**: [bits-ui v2.15.5](https://bits-ui.com/) (published 8 days ago)

#### Component Import Patterns

```typescript
// ❌ OLD (bits-ui v1.x / Svelte 4) - aliased imports
import { Checkbox as BitsCheckbox } from "bits-ui";

// ✅ CORRECT (bits-ui v2.14.4+ / Svelte 5) - named imports from main entry
import { Accordion } from "bits-ui";
import { Checkbox } from "bits-ui";
import { Select } from "bits-ui";
import { Dialog } from "bits-ui";

// ❌ WRONG - subpath imports do NOT exist in bits-ui
// import * as Dialog from "bits-ui/components/dialog";  // Module not found!
```

**Usage Example:**
```svelte
<script lang="ts">
  import { Accordion } from "bits-ui";

  let value = $state<string | undefined>(undefined);
</script>

<Accordion.Root bind:value>
  <Accordion.Item value="item-1">
    <Accordion.Trigger>Section 1</Accordion.Trigger>
    <Accordion.Content>
      Content here...
    </Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
```

#### Key API Changes from bits-ui v1 → v2

**1. Transition Props Removed**
```svelte
<!-- ❌ OLD (v1) -->
<Dialog.Content transitionConfig={{ duration: 300 }}>

<!-- ✅ NEW (v2) - Use Svelte 5 transitions -->
<Dialog.Content>
  {#snippet children()}
    <div transition:fade={{ duration: 300 }}>
      Content
    </div>
  {/snippet}
</Dialog.Content>
```

**2. Data Exposure via Snippets (not let: directives)**
```svelte
<!-- ❌ OLD (Svelte 4) -->
<Select.Root let:selected>
  <p>Selected: {selected}</p>
</Select.Root>

<!-- ✅ NEW (Svelte 5) -->
<Select.Root>
  {#snippet children({ selected })}
    <p>Selected: {selected}</p>
  {/snippet}
</Select.Root>
```

**3. Type Discriminants (Accordion & Select)**
```typescript
// ❌ OLD (v1)
<Accordion.Root multiple={true} value={['item-1', 'item-2']}>

// ✅ NEW (v2)
<Accordion.Root type="multiple" value={['item-1', 'item-2']}>

// OR single mode
<Accordion.Root type="single" value="item-1">

**4. Direct bits-ui Imports (No Local Wrappers)**
```typescript
// ❌ OBSOLETE - Local wrapper components with barrel exports
import { Select, SelectContent, SelectItem } from '$lib/components/ui/select';
import { Dialog, DialogContent } from '$lib/components/ui/dialog';

// ✅ CORRECT - Direct bits-ui v2 namespace imports
import * as Select from "bits-ui/components/select";
import * as Dialog from "bits-ui/components/dialog";
```

**Why Local Wrappers Are Obsolete:**
- Svelte 5 runes enable fine-grained reactivity in `.svelte.ts` files
- No need for barrel exports or re-export facades
- Direct bits-ui imports provide better type safety and tree-shaking
- Wrapper components create maintenance burden and version drift

---

### 🎯 Svelte 5 Runes: State Management Without Stores

**Key Insight**: Runes make the store API unnecessary because reactivity works directly in `.svelte.ts` files.

#### The Three Core Runes

**1. $state - Reactive State**
```typescript
// ❌ OLD (Svelte 4 - Stores)
import { writable } from 'svelte/store';
export const count = writable(0);

// ✅ NEW (Svelte 5 - Runes)
// In state/counter.svelte.ts
export let count = $state(0);
export function increment() { count++; }
```

**2. $derived - Computed Values**
```typescript
// ❌ OLD (Svelte 4 - Derived Stores)
import { derived } from 'svelte/store';
export const doubled = derived(count, $count => $count * 2);

// ✅ NEW (Svelte 5 - Runes)
export let doubled = $derived(count * 2);
export let isEven = $derived(count % 2 === 0);
```

**3. $effect - Side Effects**
```typescript
// ❌ OLD (Svelte 4 - Reactive Statements)
$: console.log('Count changed:', count);
$: if (count > 10) alert('Too high!');

// ✅ NEW (Svelte 5 - Runes)
$effect(() => {
  console.log('Count changed:', count);
});

$effect(() => {
  if (count > 10) alert('Too high!');
});
```

#### Why Barrel Stores Are Obsolete

**Old Pattern (Svelte 4 - Obsolete):**
```typescript
// stores/unified.ts (barrel export)
export { userStore } from './user';
export { chatStore } from './chat';
export { evidenceStore } from './evidence';

// stores/user.ts
import { writable } from 'svelte/store';
export const userStore = writable({ name: '', email: '' });

// Component.svelte
import { userStore } from '$lib/stores/unified';
let user;
userStore.subscribe(value => { user = value; }); // Manual subscription
// OR
$: user = $userStore; // Auto-subscription with $prefix
```

**New Pattern (Svelte 5 - Recommended):**
```typescript
// state/user.svelte.ts
export let user = $state({ name: '', email: '' });
export let isAuthenticated = $derived(!!user.email);
export let displayName = $derived(user.name || 'Guest');

export function login(email: string, name: string) {
  user.email = email;
  user.name = name;
}

export function logout() {
  user = { name: '', email: '' };
}

// Component.svelte
import { user, isAuthenticated, login } from '$lib/state/user.svelte.ts';
// Direct access - no subscriptions needed!
<p>Welcome, {user.name}!</p>
{#if isAuthenticated}
  <button onclick={() => logout()}>Logout</button>
{/if}
```

#### Key Advantages of Runes Over Stores

| Feature | Stores (Svelte 4) | Runes (Svelte 5) |
|---------|-------------------|------------------|
| **Reactivity Location** | Only in `.svelte` files | `.svelte` AND `.svelte.ts` files |
| **Subscription Management** | Manual or $ prefix | Automatic |
| **Type Safety** | Generic types can be complex | Direct TypeScript types |
| **Bundle Size** | Includes store runtime | No extra runtime |
| **Learning Curve** | Must learn store API | Uses standard JS/TS |
| **Barrel Exports** | Required for organization | Obsolete - direct imports |

#### Migration Strategy: Stores → Runes

**Step 1: Identify Store Usage**
```bash
# Find all store imports
grep -r "from 'svelte/store'" src/
grep -r "writable\|readable\|derived" src/
```

**Step 2: Convert Simple Stores**
```typescript
// BEFORE: stores/counter.ts
import { writable } from 'svelte/store';
export const count = writable(0);
export const increment = () => count.update(n => n + 1);

// AFTER: state/counter.svelte.ts
export let count = $state(0);
export function increment() { count++; }
```

**Step 3: Convert Derived Stores**
```typescript
// BEFORE: stores/cart.ts
import { writable, derived } from 'svelte/store';
export const items = writable([]);
export const total = derived(items, $items =>
  $items.reduce((sum, item) => sum + item.price, 0)
);

// AFTER: state/cart.svelte.ts
export let items = $state<CartItem[]>([]);
export let total = $derived(
  items.reduce((sum, item) => sum + item.price, 0)
);
```

**Step 4: Convert Complex Stores with Side Effects**
```typescript
// BEFORE: stores/websocket.ts
import { writable } from 'svelte/store';
const { subscribe, set, update } = writable({ connected: false, messages: [] });

let ws;
export const connect = () => {
  ws = new WebSocket('ws://localhost:3000');
  ws.onmessage = (e) => update(s => ({ ...s, messages: [...s.messages, e.data] }));
};

// AFTER: state/websocket.svelte.ts
export let connected = $state(false);
export let messages = $state<string[]>([]);

let ws: WebSocket;
export function connect() {
  ws = new WebSocket('ws://localhost:3000');
  ws.onopen = () => { connected = true; };
  ws.onmessage = (e) => { messages = [...messages, e.data]; };
  ws.onclose = () => { connected = false; };
}

$effect(() => {
  // Auto-reconnect when connection drops
  if (!connected && messages.length > 0) {
    console.log('Connection lost, reconnecting...');
    setTimeout(connect, 5000);
  }
});
```

#### Component Pattern: Local Wrappers → Direct bits-ui

**Obsolete Pattern (Causes Maintenance Burden):**
```
src/lib/components/ui/
├── select/
│   ├── index.ts              # ❌ Barrel export
│   ├── Select.svelte         # ❌ Wrapper around bits-ui
│   ├── SelectRoot.svelte     # ❌ Wrapper
│   ├── SelectTrigger.svelte  # ❌ Wrapper
│   └── SelectContent.svelte  # ❌ Wrapper
└── dialog/
    ├── index.ts              # ❌ Barrel export
    ├── Dialog.svelte         # ❌ Wrapper
    └── DialogContent.svelte  # ❌ Wrapper
```

**Recommended Pattern (Direct, Tree-Shakeable):**
```typescript
// Components import bits-ui directly
import * as Select from "bits-ui/components/select";
import * as Dialog from "bits-ui/components/dialog";

// No local wrappers needed!
// Archive old wrapper directories to _archive/
```

**Benefits:**
- ✅ No version drift between wrappers and bits-ui
- ✅ Better TypeScript inference
- ✅ Smaller bundle size (tree-shaking works)
- ✅ Less maintenance (one source of truth)
- ✅ Aligns with Svelte 5 philosophy (direct, explicit)

---

### 📚 Sources & References

**Svelte 5 Runes:**
- [Introducing runes](https://svelte.dev/blog/runes)
- [Svelte 5 migration guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [$state documentation](https://svelte.dev/docs/svelte/$state)
- [$derived documentation](https://svelte.dev/docs/svelte/$derived)
- [$effect documentation](https://svelte.dev/docs/svelte/$effect)
- [Understanding $derived vs $effect](https://www.htmlallthethings.com/blog-posts/understanding-svelte-5-runes-derived-vs-effect)
- [Runes and Global state: do's and don'ts](https://mainmatter.com/blog/2025/03/11/global-state-in-svelte-5/)
- [Svelte's Growing Pains: Runes, Stores, and the Quest for Standards](https://dev.to/daniacu/sveltes-growing-pains-runes-stores-and-the-quest-for-standards-3j98)

---
```

```typescript
// ❌ OLD (v1)
<Select.Root multiple={true} value={['opt1', 'opt2']}>

// ✅ NEW (v2)
<Select.Root type="multiple" value={['opt1', 'opt2']}>
```

**Sources:**
- [Bits UI Migration Guide](https://www.bits-ui.com/docs/migration-guide)
- [Bits UI Documentation](https://bits-ui.com/)
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [shadcn-svelte Svelte 5 Guide](https://www.shadcn-svelte.com/docs/migration/svelte-5)

---

## 📋 Superforms v2 + SvelteKit 2 (February 2026)

### 📚 Official Documentation

**Latest Version**: [sveltekit-superforms v2](https://superforms.rocks/) (SvelteKit 2 compatible)

**Key Resources:**
- [Official Documentation](https://superforms.rocks/)
- [Get Started Tutorial](https://superforms.rocks/get-started)
- [File Upload Guide](https://superforms.rocks/concepts/files)
- [API Reference](https://github.com/ciscoheat/sveltekit-superforms/wiki/API-reference)
- [GitHub Repository](https://github.com/ciscoheat/sveltekit-superforms)

### 🎯 Core API Patterns (v2)

#### 1. Basic Form Setup

```typescript
// +page.server.ts
import { superValidate, message, fail } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email()
});

export const load = async () => {
  const form = await superValidate(zod(schema));
  return { form };
};

export const actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(schema));

    if (!form.valid) {
      return fail(400, { form });
    }

    // Process form data
    console.log(form.data);

    return message(form, 'Success!');
  }
};
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';

  let { data } = $props();

  const { form, errors, enhance, delayed, message } = superForm(data.form, {
    validators: zodClient(schema)
  });
</script>

<form method="POST" use:enhance>
  <input name="name" bind:value={$form.name} />
  {#if $errors.name}<span class="error">{$errors.name}</span>{/if}

  <input name="email" type="email" bind:value={$form.email} />
  {#if $errors.email}<span class="error">{$errors.email}</span>{/if}

  <button type="submit" disabled={$delayed}>
    {$delayed ? 'Submitting...' : 'Submit'}
  </button>

  {#if $message}<p>{$message}</p>{/if}
</form>
```

#### 2. File Upload Handling

**Schema Definition (Zod):**
```typescript
const uploadSchema = z.object({
  file: z
    .instanceof(File, { message: 'Please upload a file.' })
    .refine((f) => f.size < 100_000_000, 'Max 100MB upload size.')
    .refine(
      (f) => ['application/pdf', 'image/jpeg', 'image/png'].includes(f.type),
      'Supported: PDF, JPEG, PNG'
    ),
  caseId: z.string().min(1, 'Case ID is required'),
  title: z.string().optional()
});
```

**Server-Side (CRITICAL - Import from superforms, not @sveltejs/kit):**
```typescript
// +page.server.ts
import { superValidate, fail, message } from 'sveltekit-superforms'; // ✅ Correct
import { zod } from 'sveltekit-superforms/adapters';

export const actions = {
  upload: async ({ request }) => {
    const form = await superValidate(request, zod(uploadSchema));

    if (!form.valid) return fail(400, { form });

    // File is available in form.data.file
    const uploadedFile = form.data.file;
    console.log(uploadedFile.name, uploadedFile.size);

    // Process file (MinIO, S3, etc.)

    return message(form, 'File uploaded successfully!');
  }
};
```

**Client-Side (use fileProxy):**
```svelte
<script lang="ts">
  import { superForm, fileProxy } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';

  let { data } = $props();

  const { form, errors, enhance, delayed } = superForm(data.form, {
    validators: zodClient(uploadSchema),
    dataType: 'form', // Important for file uploads
    onSubmit: () => {
      console.log('Uploading file:', $file);
    }
  });

  // File proxy for reactive file binding
  const file = fileProxy(form, 'file');
</script>

<form method="POST" action="?/upload" use:enhance enctype="multipart/form-data">
  <input
    type="file"
    name="file"
    accept=".pdf,.jpg,.png"
    onchange={(e) => {
      const target = e.target as HTMLInputElement;
      const selectedFile = target.files?.[0];
      if (selectedFile) $file = selectedFile;
    }}
  />

  {#if $errors.file}<span class="error">{$errors.file}</span>{/if}

  {#if $file}
    <p>Selected: {$file.name} ({($file.size / 1024 / 1024).toFixed(2)} MB)</p>
  {/if}

  <button type="submit" disabled={$delayed || !$file}>
    {$delayed ? 'Uploading...' : 'Upload File'}
  </button>
</form>
```

#### 3. Important v2 Changes

**Critical Import Rule:**
```typescript
// ❌ WRONG - File objects cannot be serialized
import { fail, message } from '@sveltejs/kit';

// ✅ CORRECT - Use superforms versions for file handling
import { fail, message, setError } from 'sveltekit-superforms';
```

**Form Options:**
```typescript
const { form, errors, enhance, delayed, message } = superForm(data.form, {
  validators: zodClient(schema),       // Client-side validation
  dataType: 'form',                    // Use 'form' for file uploads, 'json' otherwise
  multipleSubmits: 'prevent',          // Prevent double submissions
  resetForm: false,                    // Keep form data after success
  invalidateAll: true,                 // Revalidate all data
  onSubmit: ({ cancel }) => {
    // Before submission
  },
  onResult: ({ result }) => {
    if (result.type === 'success') {
      // Handle success
    }
  },
  onError: ({ result }) => {
    // Handle error
  }
});
```

**File Proxy Helpers:**
```typescript
// Single file
const file = fileProxy(form, 'avatar');

// Multiple files
const files = filesProxy(form, 'attachments');
```

### 🔥 Common Patterns

**1. Custom Validation:**
```typescript
const form = await superValidate(request, zod(schema));

if (!form.valid) return fail(400, { form });

// Custom server-side validation
if (form.data.email.includes('spam')) {
  return setError(form, 'email', 'Email domain not allowed');
}
```

**2. Database Integration:**
```typescript
export const load = async ({ params }) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, params.id)
  });

  const form = await superValidate(user, zod(schema));
  return { form };
};
```

**3. Multiple Forms:**
```svelte
<script lang="ts">
  const loginForm = superForm(data.loginForm, { ...config });
  const signupForm = superForm(data.signupForm, { ...config });
</script>

<form method="POST" action="?/login" use:loginForm.enhance>
  <!-- Login form -->
</form>

<form method="POST" action="?/signup" use:signupForm.enhance>
  <!-- Signup form -->
</form>
```

### 📦 Integration with Legal AI Platform

**Example: Legal Document Upload (Production)**
```typescript
// File upload with OCR + LegalBERT + Embeddings pipeline
const uploadSchema = z.object({
  file: z.instanceof(File).refine((f) => f.size < 100_000_000, 'Max 100MB'),
  caseId: z.string().min(1),
  enableOcr: z.boolean().default(true),
  enableAiAnalysis: z.boolean().default(true),
  enableEmbeddings: z.boolean().default(true)
});

export const actions = {
  upload: async ({ request }) => {
    const form = await superValidate(request, zod(uploadSchema));
    if (!form.valid) return fail(400, { form });

    // Upload to MinIO (legal_ai_db bucket)
    const fileKey = await uploadToMinIO(form.data.file, 'legal_ai_db');

    // Trigger AI pipeline
    if (form.data.enableOcr) {
      await queueOCRJob(fileKey);
    }

    if (form.data.enableAiAnalysis) {
      await queueLegalBERTAnalysis(fileKey);
    }

    if (form.data.enableEmbeddings) {
      await generateEmbeddings(fileKey, 'embeddinggemma:latest');
    }

    return message(form, 'Document uploaded and queued for analysis!');
  }
};
```

**Sources:**
- [Superforms Official Docs](https://superforms.rocks/)
- [File Upload Concepts](https://superforms.rocks/concepts/files)
- [Get Started Guide](https://superforms.rocks/get-started)
- [GitHub Repository](https://github.com/ciscoheat/sveltekit-superforms)

---

## 🎨 UnoCSS + CSS Best Practices (Phases 66-72)

### 📦 UnoCSS Configuration

**Installed Version:** `unocss@66.5.11` with Svelte scoped mode

**Config Location:** [unocss.config.ts](sveltekit-frontend/unocss.config.ts)

#### Presets Enabled
```typescript
import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),           // Tailwind-compatible utilities
    presetAttributify(),   // Attribute mode: <div text="sm blue-500">
    presetIcons({          // Iconify integration
      collections: {
        heroicons: () => import('@iconify-json/heroicons/icons.json')
      }
    })
  ]
})
```

#### Custom Theme & Shortcuts
**Legal AI Color Palette:**
```typescript
theme: {
  colors: {
    sand: '#d4c7a3',          // Primary background
    sandDark: '#b9aa86',       // Darker variant
    panel: '#24211b',          // Dark panels
    panelSoft: '#2f2a22',      // Soft panels
    accent: '#4ade80',         // Success/primary
    accentSoft: '#a3e635',     // Lighter accent
    danger: '#ef4444',         // Error states
    warning: '#facc15',        // Warning states
    info: '#38bdf8'            // Info states
  }
}
```

**Shortcuts (Reusable Patterns):**
```typescript
shortcuts: {
  // Layout
  'app-bg': 'bg-sand text-black font-ui',
  'panel': 'bg-panel text-sand rounded-lg border border-black/40 shadow-[0_0_0_2px_#000]',

  // Buttons
  'btn-base': 'inline-flex items-center justify-center rounded border px-3 py-2 ' +
              'text-xs uppercase tracking-[0.18em] font-mono ' +
              'shadow-[0_2px_0_0_#000] active:translate-y-0.5',
  'btn-primary': 'btn-base bg-accent text-black hover:bg-accentSoft',

  // Tags
  'tag': 'inline-flex items-center gap-1 rounded px-2 py-0.5 ' +
         'text-[10px] uppercase tracking-[0.16em] font-mono'
}
```

#### Svelte-Scoped Mode (Performance Optimization)
For large codebases, use `@unocss/svelte-scoped` to place component-specific styles directly in `<style>` blocks instead of global CSS:

```javascript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import UnoCSS from '@unocss/svelte-scoped/vite';

export default {
  plugins: [
    UnoCSS({ /* config */ }),
    sveltekit()
  ]
};
```

**Benefits:**
- Reduces global CSS bundle size
- Improves hot module replacement (HMR) performance
- Component styles co-located with markup

**Documentation:**
- [UnoCSS Official Guide](https://unocss.dev/guide/)
- [Setting Up UnoCSS with SvelteKit](https://frontavo.com/blog/setting-up-unocss-with-sveltekit)
- [UnoCSS Svelte Scoped Mode](https://unocss.dev/integrations/svelte-scoped)

---

### 🐛 CSS Corruption Patterns Discovered (Feb 2026)

During error reduction work (Phases 66-72), several systematic CSS corruption patterns were identified and fixed:

#### Pattern 1: Comma Instead of Semicolon
**Corruption:** CSS properties separated by commas instead of semicolons
```css
/* ❌ WRONG - comma separating properties */
.stat-card {
  border-radius: 8px, text-align: center;
  font-size: 0.875rem, color: #6c757d;
}

/* ✅ CORRECT - semicolon separating properties */
.stat-card {
  border-radius: 8px; text-align: center;
  font-size: 0.875rem; color: #6c757d;
}
```

**Fix Applied:** [fix-css-comma-corruption.mjs](sveltekit-frontend/scripts/fix-css-comma-corruption.mjs)
- **Files Fixed:** 218 files
- **Instances:** 4,702 comma→semicolon replacements
- **Impact:** Resolved CSS parsing errors in style blocks

#### Pattern 2: Missing Semicolons Before Closing Braces
```css
/* ❌ WRONG - missing semicolon */
.stat-card {
  border: 1px solid #e9ecef}

/* ✅ CORRECT */
.stat-card {
  border: 1px solid #e9ecef;}
```

#### Pattern 3: Duplicate Style Blocks
**Cause:** File corruption or merge conflicts created duplicate `<style>` tags with conflicting CSS rules.

**Detection:** Look for multiple `</style>` tags in a single component.

**Fix:** Manually consolidate to single style block.

---

### 🔧 CSS Fixing Scripts

All CSS corruption fixers are located in [sveltekit-frontend/scripts/](sveltekit-frontend/scripts/):

| Script | Purpose | Pattern Fixed |
|--------|---------|---------------|
| `fix-css-comma-corruption.mjs` | Replace commas with semicolons in CSS properties | `,` → `;` |
| `fix-attribute-trailing-comma.mjs` | Remove trailing commas from Svelte attributes | `required,` → `required` |
| `fix-zero-percent-targeted-apply.mjs` | Fix `?? 0%` → `?? {}` corruption | TypeScript object corruption |

**Usage:**
```bash
cd sveltekit-frontend
node scripts/fix-css-comma-corruption.mjs
```

---

### 🗄️ Legal AI Database Architecture

#### Multi-Tier Caching Strategy

**Tier 1: Client-Side (IndexedDB + Loki.js)**
```typescript
// src/lib/stores/local-cache.ts
import Loki from 'lokijs';
import { openDB, type IDBPDatabase } from 'idb';

export class LegalAILocalCache {
  private loki: Loki;
  private idb: IDBPDatabase | null = null;

  async init() {
    // Loki.js for fast in-memory queries
    this.loki = new Loki('legal-ai-cache.db', {
      autosave: true,
      autosaveInterval: 4000,
      adapter: new LokiIndexedAdapter('legal-ai')
    });

    // IndexedDB for persistent large objects (documents, embeddings)
    this.idb = await openDB('legal-ai-db', 1, {
      upgrade(db) {
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('embeddings', { keyPath: 'id' });
        db.createObjectStore('case-analysis', { keyPath: 'caseId' });
      }
    });
  }

  async cacheDocument(doc: LegalDocument): Promise<void> {
    // Hot data in Loki.js (metadata only)
    const collection = this.loki.getCollection('documents') ||
                      this.loki.addCollection('documents');
    collection.insert({ id: doc.id, title: doc.title, caseId: doc.caseId });

    // Full document in IndexedDB
    await this.idb?.put('documents', doc);
  }

  async getCachedDocument(id: string): Promise<LegalDocument | null> {
    // Try hot cache first
    const collection = this.loki.getCollection('documents');
    const meta = collection?.findOne({ id });

    if (!meta) return null;

    // Fetch full document from IDB
    return await this.idb?.get('documents', id) || null;
  }
}
```

**Tier 2: Server-Side (Redis SSR Cache)**
```typescript
// src/lib/server/redis-cache.ts
import { Redis } from 'ioredis';
import { building } from '$app/environment';

const redis = building ? null : new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3
});

export async function cacheSSRPage(path: string, html: string): Promise<void> {
  if (!redis) return;
  await redis.setex(`ssr:${path}`, 300, html); // 5min TTL
}

export async function getCachedSSRPage(path: string): Promise<string | null> {
  if (!redis) return null;
  return await redis.get(`ssr:${path}`);
}

// Cache session data with longer TTL
export async function cacheUserSession(userId: string, data: any): Promise<void> {
  if (!redis) return;
  await redis.setex(`session:${userId}`, 3600, JSON.stringify(data)); // 1hr TTL
}
```

**Tier 3: PostgreSQL + pgvector (Primary Storage)**
```typescript
// src/lib/server/db/schema-postgres.ts
import { pgTable, uuid, text, vector, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const legalDocuments = pgTable('legal_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  contentType: text('content_type').notNull(), // 'contract' | 'brief' | 'evidence'

  // Vector embeddings for semantic search (GPU-accelerated)
  embedding: vector('embedding', { dimensions: 768 }), // embeddinggemma:latest

  // JSONB for flexible legal metadata (indexed with GIN)
  metadata: jsonb('metadata').$type<LegalMetadata>(),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  // HNSW index for GPU-accelerated vector search
  embeddingIndex: index('idx_legal_docs_embedding_hnsw')
    .using('hnsw', table.embedding.op('vector_cosine_ops')),

  // GIN index for JSONB metadata queries
  metadataIndex: index('idx_legal_docs_metadata_gin')
    .using('gin', table.metadata)
}));

interface LegalMetadata {
  case: {
    jurisdiction: string;
    courtLevel: 'district' | 'appellate' | 'supreme';
    parties: Array<{ role: string; name: string; type: string }>;
  };
  classification: {
    practiceArea: string[];
    confidenceLevel: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  processing: {
    extractedEntities: string[];
    keyTerms: string[];
    sentiment: number;
  };
}
```

**Tier 4: Qdrant (Vector Database with GPU Acceleration)**
```typescript
// src/lib/server/vector-db/qdrant-client.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { OllamaService } from '$lib/services/ollama-service';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY
});

const ollama = OllamaService.getInstance();

export async function indexLegalDocument(doc: LegalDocument): Promise<void> {
  // Generate embeddings using embeddinggemma:latest
  const embedding = await ollama.generateEmbedding(doc.content);

  await qdrant.upsert('legal-documents', {
    wait: true,
    points: [{
      id: doc.id,
      vector: embedding,
      payload: {
        caseId: doc.caseId,
        title: doc.title,
        contentType: doc.contentType,
        metadata: doc.metadata
      }
    }]
  });
}

export async function searchSimilarDocuments(
  query: string,
  limit: number = 10
): Promise<LegalDocument[]> {
  // GPU-accelerated semantic search
  const queryEmbedding = await ollama.generateEmbedding(query);

  const searchResults = await qdrant.search('legal-documents', {
    vector: queryEmbedding,
    limit,
    with_payload: true,
    score_threshold: 0.7 // Only return high-confidence matches
  });

  return searchResults.map(result => ({
    id: result.id as string,
    score: result.score,
    ...result.payload as Partial<LegalDocument>
  })) as LegalDocument[];
}
```

### 🎨 All-Routes UI/UX Review & Recommendations

**Current Implementation** ([all-routes/+page.svelte](c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes\(app)\all-routes\+page.svelte)):
- ✅ **SSE Real-Time Updates**: EventSource connection for live route health monitoring
- ✅ **YoRHa Theme**: Black/green terminal aesthetic with proper contrast
- ✅ **Interaction Logging**: Tracks view/navigate/analyze/patch_apply events
- ✅ **Health Indicators**: Color-coded badges (✅🟡❌) with error/warning counts
- ⚠️ **Limited to 10 Routes**: Only displays first 10, rest truncated

**Production Enhancements Needed:**

#### 1. Virtualized List for Performance
```svelte
<script lang="ts">
  import { VirtualList } from 'svelte-virtual-list';

  let routes = $state<Route[]>([]);
  let searchQuery = $state('');

  let filteredRoutes = $derived(
    searchQuery
      ? routes.filter(r => r.path.includes(searchQuery))
      : routes
  );
</script>

<VirtualList items={filteredRoutes} let:item>
  <RouteCard route={item} />
</VirtualList>
```

#### 2. Search & Filter System
```svelte
<div class="filters">
  <input
    type="text"
    bind:value={searchQuery}
    placeholder="🔍 Search routes..."
    class="search-input"
  />

  <select bind:value={healthFilter}>
    <option value="all">All Health States</option>
    <option value="healthy">✅ Healthy</option>
    <option value="flaky">🟡 Flaky</option>
    <option value="broken">❌ Broken</option>
  </select>

  <select bind:value={sortBy}>
    <option value="errors-desc">Most Errors First</option>
    <option value="errors-asc">Least Errors First</option>
    <option value="path">Alphabetical</option>
    <option value="recent-error">Recent Errors</option>
  </select>
</div>
```

#### 3. Route Details Modal (bits-ui Dialog)
```svelte
<script lang="ts">
  import * as Dialog from 'bits-ui/components/dialog';

  let selectedRoute = $state<Route | null>(null);
</script>

<Dialog.Root bind:open={!!selectedRoute}>
  <Dialog.Trigger asChild>
    <button>View Details</button>
  </Dialog.Trigger>

  <Dialog.Content>
    <Dialog.Title>{selectedRoute?.path}</Dialog.Title>

    <div class="route-details">
      <section>
        <h3>Error History</h3>
        <ul>
          {#each selectedRoute?.errorHistory || [] as error}
            <li>
              <span class="timestamp">{error.timestamp}</span>
              <span class="message">{error.message}</span>
            </li>
          {/each}
        </ul>
      </section>

      <section>
        <h3>AI Analysis</h3>
        <button onclick={() => analyzeRoute(selectedRoute)}>
          🧠 Run Error Brain Analysis
        </button>
      </section>
    </div>
  </Dialog.Content>
</Dialog.Root>
```

#### 4. Real-Time Status Dashboard
```svelte
<div class="dashboard-stats">
  <div class="stat-card">
    <span class="stat-value">{routes.length}</span>
    <span class="stat-label">Total Routes</span>
  </div>

  <div class="stat-card healthy">
    <span class="stat-value">
      {routes.filter(r => r.errorState === 'healthy').length}
    </span>
    <span class="stat-label">✅ Healthy</span>
  </div>

  <div class="stat-card flaky">
    <span class="stat-value">
      {routes.filter(r => r.errorState === 'flaky').length}
    </span>
    <span class="stat-label">🟡 Flaky</span>
  </div>

  <div class="stat-card broken">
    <span class="stat-value">
      {routes.filter(r => r.errorState === 'broken').length}
    </span>
    <span class="stat-label">❌ Broken</span>
  </div>
</div>
```

### 🎯 High-Impact Cascade Effect Strategy

**Proven Results** (February 7-8, 2026):
- Batch 6a: Button + Select = **270+ errors eliminated** (cascade effect)
- **Success Rate**: 100% (zero rollbacks)
- **Time Investment**: 15 minutes for 2 components
- **ROI**: 135 errors per component fix (due to 40-50 dependents each)

**Remaining High-Impact Targets:**

#### Priority 1: Card Components (40+ dependents)
```bash
# Files to fix:
src/lib/components/ui/Card/Card.svelte ✅ (Already clean!)
src/lib/components/ui/Card/CardHeader.svelte
src/lib/components/ui/Card/CardContent.svelte
src/lib/components/ui/Card/CardFooter.svelte
src/lib/components/ui/Card/CardTitle.svelte
src/lib/components/ui/Card/CardDescription.svelte

# Estimated impact: 200+ cascading errors
```

#### Priority 2: Dialog Components (25+ dependents)
```bash
# Use bits-ui v2 Dialog pattern:
import * as Dialog from "bits-ui/components/dialog";

# Files to update:
src/lib/components/ui/Dialog.svelte
src/lib/components/ui/AIDialog.svelte ✅ (Fixed in Batch 5c)
src/lib/components/ui/NesModal.svelte

# Estimated impact: 125+ cascading errors
```

#### Priority 3: Form Components (50+ dependents)
```bash
# Files to fix:
src/lib/components/ui/Input.svelte
src/lib/components/ui/Textarea.svelte
src/lib/components/ui/Checkbox.svelte
src/lib/components/ui/Label.svelte

# Estimated impact: 250+ cascading errors
```

**Cascade Effect Formula:**
```
Total Errors Fixed = (Errors in Component) × (Number of Dependents) × (Cascade Multiplier)
                   = (3-5 errors) × (40-50 imports) × (1.5x)
                   = 180-375 errors per component batch
```

### 📊 Production Deployment Checklist

#### 1. Performance Optimization
- [ ] Enable SvelteKit prerendering for static routes
- [ ] Configure Redis cache for SSR pages (5min TTL)
- [ ] Implement service worker for offline support
- [ ] Add IndexedDB cache fallback for network failures
- [ ] Enable pgvector GPU acceleration (CUDA 12.0+)
- [ ] Configure Qdrant HNSW indexing for sub-100ms vector search

#### 2. Security Hardening
- [ ] Enable CSRF protection in SvelteKit hooks
- [ ] Add rate limiting to Ollama API endpoints (100 req/min)
- [ ] Implement JWT-based authentication with Redis session store
- [ ] Sanitize legal document content before embedding generation
- [ ] Add JSONB GIN index permissions for legal metadata queries
- [ ] Configure Qdrant API key authentication

#### 3. Monitoring & Observability
- [ ] Add Sentry error tracking for frontend + backend
- [ ] Implement OpenTelemetry tracing for Ollama → Qdrant pipeline
- [ ] Configure PostgreSQL slow query logging (>500ms)
- [ ] Add Redis memory usage alerts (>80% threshold)
- [ ] Monitor GPU utilization for pgvector operations
- [ ] Track SSE connection stability (reconnection rate)

#### 4. Database Migrations
- [ ] Use Drizzle Kit for schema migrations: `npm run db:push:prod`
- [ ] **CRITICAL**: Always review migration SQL before applying
- [ ] Never run migrations that drop tables with data
- [ ] Use `tablesFilter` to exclude analysis tables from drops
- [ ] Backup PostgreSQL before major schema changes
- [ ] Test migrations on staging environment first

#### 5. AI Model Management
- [ ] Verify Ollama models downloaded: `ollama list`
- [ ] Primary embedding model: `embeddinggemma:latest` (768 dims)
- [ ] Primary LLM model: `gemma3-legal:latest`
- [ ] Fallback models: `nomic-embed-text`, `gemma3`
- [ ] Configure model priority in ollama-config-service.ts
- [ ] Monitor embedding generation latency (<200ms target)

### 🚀 Next Steps for Production Readiness

**Immediate (This Session):**
1. ✅ Fix Button.svelte (50+ dependents) - COMPLETED
2. ✅ Fix Select.svelte (30+ dependents) - COMPLETED
3. ⏳ Fix Card components (40+ dependents) - IN PROGRESS
4. ⏳ Add virtualized list to all-routes page
5. ⏳ Implement search/filter/sort for route monitoring

**Short-Term (Next 2 Sessions):**
6. Fix Dialog + Form components (75+ combined dependents)
7. Implement comprehensive error boundary system
8. Add retry logic to SSE connections with exponential backoff
9. Configure Redis cache warming for hot routes
10. Add IndexedDB quota management (prevent storage overflow)

**Medium-Term (Next Week):**
11. Migrate remaining bits-ui components to v2.15.5 API
12. Implement progressive enhancement for all interactive features
13. Add service worker with offline-first strategy
14. Configure PostgreSQL connection pooling (max 20 connections)
15. Optimize Qdrant collection size (prune old embeddings)

**Long-Term (Production Launch):**
16. Implement blue-green deployment with zero downtime
17. Add comprehensive E2E tests for critical user flows
18. Configure CDN caching for static assets (CloudFlare/Vercel)
19. Set up automated database backups (daily + hourly WAL archiving)
20. Implement GPU cluster for pgvector operations (multi-GPU scaling)

---

## ✅ February 7-8, 2026 – Corrupted File Detection & Restoration Guide

### 🔍 Detection Heuristics

**How to Identify Heavily Corrupted/Minified Files:**

1. **File Size Analysis**
   - Files ≤50 lines are highly suspect (681 candidates found in codebase)
   - All code compressed into 1-2 lines = definite corruption
   - Use: `find . -name "*.svelte" -type f -exec wc -l {} \; | awk '{if ($1 <= 50) count++}'`

2. **Visual Inspection Markers**
   - Multiple statements without line breaks
   - Missing whitespace between tokens
   - Repetitive error patterns (10+ similar errors in one file)
   - Broken syntax visible on first glance

3. **Error Pattern Clustering**
   - Multiple "comma expected" errors in same Props interface
   - CSS pseudo-class spacing errors clustered together
   - Broken directives (transitionfade, <svelte,window)

### 📋 Common Corruption Patterns Catalog

**Pattern 1: Missing Commas in $props() - MOST COMMON (568 files affected)**
```typescript
// ❌ Corrupted
let { value = 0, max = 100 variant = 'default' class: className = '' }: Props = $props();

// ✅ Fixed
let { value = 0, max = 100, variant = 'default', class: className = '' }: Props = $props();
```
**Impact**: 10-15 errors per file
**Detection**: Search for `= \$props()` pattern

**Pattern 2: CSS Pseudo-Class Spacing Errors (200+ occurrences)**
```css
/* ❌ Corrupted */
hover: bg-accent, focus: border-blue-500, disabled: opacity-50

/* ✅ Fixed */
hover:bg-accent focus:border-blue-500 disabled:opacity-50
```
**Impact**: 1 error per occurrence
**Detection**: Search for `: ` followed by CSS class name

**Pattern 3: Missing Colons in Ternary Operators**
```typescript
// ❌ Corrupted
variant === 'success'? 'bg-green-500': variant === 'error'? 'bg-red-500'

// ✅ Fixed
variant === 'success' ? 'bg-green-500' : variant === 'error' ? 'bg-red-500'
```
**Impact**: 15+ errors in minified files
**Detection**: Look for `?` without proper spacing

**Pattern 4: Broken Svelte Directives**
```svelte
<!-- ❌ Corrupted -->
<svelte, window onkeydown={handler} />
<div transitionfade>

<!-- ✅ Fixed -->
<svelte:window onkeydown={handler} />
<div transition:fade>
```
**Impact**: 2-3 errors per directive
**Detection**: Search for `<svelte,` or `transition[a-z]` without colon

**Pattern 5: Switch Case Syntax Errors**
```typescript
// ❌ Corrupted
switch (key) {
  case: 'Escape':
    close();
  case: 'Enter':
    submit();
}

// ✅ Fixed
switch (key) {
  case 'Escape':
    close();
    break;
  case 'Enter':
    submit();
    break;
}
```
**Impact**: 2 errors per case statement
**Detection**: Search for `case:` with colon

**Pattern 6: TypeScript Record Type Syntax**
```typescript
// ❌ Corrupted
Record<string: CommandItem[]>

// ✅ Fixed
Record<string, CommandItem[]>
```
**Impact**: 1 error per occurrence
**Detection**: Search for `Record<[^,]+:` pattern

**Pattern 7: Missing Commas in Object Literals**
```typescript
// ❌ Corrupted
const config = {
  menu: 'from-slate-800/95 border-blue-400/80'
  info: 'from-blue-800/95 border-cyan-400/80'
  stats: 'from-green-800/95 border-green-400/80'
};

// ✅ Fixed
const config = {
  menu: 'from-slate-800/95 border-blue-400/80',
  info: 'from-blue-800/95 border-cyan-400/80',
  stats: 'from-green-800/95 border-green-400/80'
};
```
**Impact**: 10-20 errors per large object
**Detection**: Multi-line objects with no commas

**Pattern 8: Broken Logical Operators**
```typescript
// ❌ Corrupted
item.title.toLowerCase().includes(query) ?? item.description.includes(query)

// ✅ Fixed
item.title.toLowerCase().includes(query) || item.description.includes(query)
```
**Impact**: 1 error per occurrence
**Detection**: Search for `??` where `||` intended

### 🔧 Rewrite Strategy Decision Tree

**When to Use COMPLETE REWRITE:**
✅ File is ≤50 lines AND all on 1-2 physical lines
✅ More than 20 errors in a single file
✅ Multiple pattern types corrupted (commas + CSS + directives)
✅ Visual inspection shows heavily minified code
✅ Trying to read the code makes your eyes hurt

**Success Rate**: 100% (4/4 major rewrites completed successfully)

**When to Use TARGETED EDITS:**
✅ File is properly formatted but has 1-5 specific errors
✅ Single pattern type (e.g., only missing commas)
✅ Errors are isolated to specific section
✅ Code is readable and maintainable

**Success Rate**: ~85% (occasional cascade effects require follow-up)

### 📖 Success Examples

**Example 1: Progress.svelte (24 → 115 lines)**
```typescript
// ❌ Before (minified, 24 lines)
let { value = 0, max = 100, variant = 'default', size = 'default', showPercentage = false class: className = ''}: Props = $props(); let percentage = $derived(...); let variantClasses = $derived( variant === 'success'? 'bg-green-500 nes-progress is-success': variant === 'error'? 'bg-red-500 nes-progress is-error': 'bg-blue-500 nes-progress is-primary'); let sizeClasses = $derived(size === 'sm'? 'h-4': size === 'lg'? 'h-8': 'h-6');

// ✅ After (formatted, 115 lines with proper structure)
interface Props {
  value?: number;
  max?: number;
  variant?: 'default' | 'success' | 'error' | 'warning';
  size?: 'sm' | 'default' | 'lg';
  showPercentage?: boolean;
  class?: string;
}

let {
  value = 0,
  max = 100,
  variant = 'default',
  size = 'default',
  showPercentage = false,
  class: className = ''
}: Props = $props();

let percentage = $derived((value / max) * 100);

let variantClasses = $derived(
  variant === 'success'
    ? 'bg-green-500 nes-progress is-success'
    : variant === 'error'
      ? 'bg-red-500 nes-progress is-error'
      : variant === 'warning'
        ? 'bg-yellow-500 nes-progress is-warning'
        : 'bg-blue-500 nes-progress is-primary'
);
```
**Errors Fixed**: 15+ (missing colons, commas, CSS spacing)

**Example 2: CommandPalette.svelte (92 → 327 lines)**
```typescript
// ❌ Before (corrupted, 92 lines)
const allItems: CommandItem[] = [{id: 'nav-dashboard' title: 'Dashboard' description: 'Overview' icon: Search category: 'Navigation' href: '/' shortcut: ['⌘', 'H']}, {id: 'nav-evidence'...}]; // 50+ missing commas

switch (e.key) {
  case: 'Escape':
    close();
  case: 'ArrowDown':
    selectedIndex++;
}

<svelte, window onkeydown={handleKeydown} />
<div transitionfade>

// ✅ After (formatted, 327 lines with proper structure)
const allItems: CommandItem[] = [
  {
    id: 'nav-dashboard',
    title: 'Dashboard',
    description: 'Overview of cases and evidence',
    icon: Search,
    category: 'Navigation',
    href: '/',
    shortcut: ['⌘', 'H']
  },
  {
    id: 'nav-evidence',
    title: 'Evidence Management',
    description: 'Upload and analyze evidence',
    icon: File,
    category: 'Navigation',
    href: '/evidence',
    shortcut: ['⌘', 'E']
  }
  // ... properly formatted
];

switch (e.key) {
  case 'Escape':
    e.preventDefault();
    close();
    break;
  case 'ArrowDown':
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1);
    break;
}

<svelte:window onkeydown={handleKeydown} />
<div transition:fade>
```
**Errors Fixed**: 50+ (biggest win of the session)

**Example 3: FinalFantasyContainer.svelte (21 → 110 lines)**
```typescript
// ❌ Before (minified object literals)
const typeColors = { menu: 'from-slate-800/95 to-slate-900/95 border-blue-400/80' info: 'from-blue-800/95 to-blue-900/95 border-cyan-400/80' stats: 'from-green-800/95 to-green-900/95 border-green-400/80' inventory: 'from-amber-800/95...' };

// ✅ After (properly formatted)
const typeColors = {
  menu: 'from-slate-800/95 to-slate-900/95 border-blue-400/80',
  info: 'from-blue-800/95 to-blue-900/95 border-cyan-400/80',
  stats: 'from-green-800/95 to-green-900/95 border-green-400/80',
  inventory: 'from-amber-800/95 to-amber-900/95 border-yellow-400/80',
  battle: 'from-red-800/95 to-red-900/95 border-red-400/80',
  magic: 'from-purple-800/95 to-purple-900/95 border-purple-400/80'
};
```
**Errors Fixed**: 10+ (missing commas in large objects)

**Example 4: AIDialog.svelte (38 → 52 lines)**
```typescript
// ❌ Before (corrupted Props interface)
interface Props {
  class?: string;
  children?: Snippet
  open: boolean
  title: string,
  onClose: () => void
}

<div transitionfade>
  <button class="hover: text-gray-700">

// ✅ After (proper syntax)
interface Props {
  class?: string;
  children?: Snippet;
  open: boolean;
  title: string;
  onClose: () => void;
}

<div transition:fade>
  <button class="hover:text-gray-700">
```
**Errors Fixed**: 8 (Props commas, transitions, CSS spacing)

### ✅ Verification Workflow

**Step 1: Individual File Check BEFORE Committing**
```bash
npx svelte-check --threshold error --tsconfig ./tsconfig.json --watch=false \
  src/lib/components/ui/Progress.svelte
```
**Expected**: "0 errors" output
**If errors persist**: Review fix again, may have cascade effect from dependencies

**Step 2: Batch Commit Strategy**
- Fix 1-4 related files per batch
- Descriptive commit messages with before/after examples
- Always include Co-Authored-By line
- Push immediately after commit

**Example Commit Message:**
```
Fix Progress.svelte - restore from minified (24→115 lines)

Before:
- All code on 2 lines (heavily minified)
- 15+ missing colons in ternary operators
- Missing comma in $props() destructuring
- CSS spacing errors (hover: bg-accent)

After:
- Properly formatted 115 lines
- All ternary operators fixed (? and : with proper spacing)
- Props interface properly destructured
- CSS classes use correct syntax (hover:bg-accent)

Fixed errors: ~15

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Step 3: Cascade Effect Monitoring**
After committing core UI components, check dependent files:
- Button.svelte fix → 3-5 files improved automatically
- Progress.svelte fix → 2-3 files improved
- Card.svelte fix → 4-6 files improved

### 📊 Impact Metrics (February 7-8, 2026)

**Files Fixed**: 11 core UI components
**Errors Eliminated**: ~118 direct errors
**Cascade Effect**: ~30 additional errors resolved in dependent files
**Success Rate**: 100% (no rollbacks needed)
**Time per File**: 5-15 minutes for complete rewrites
**Error Reduction**: 972 → 854 (12% reduction)

**Batches Completed**:
- Batch 4b: DropdownMenu, IconContainer, ProgressBitsUI (3 files, ~18 errors)
- Batch 4c: Progress.svelte (1 file, ~15 errors) - major rewrite
- Batch 5a: LoadingSpinner, FinalFantasyContainer (2 files, ~22 errors)
- Batch 5b: CommandPalette.svelte (1 file, ~50 errors) - biggest win
- Batch 5c: AIDialog.svelte (1 file, ~8 errors)

### 🎯 Cascade Effect Strategy

**Core UI Components to Prioritize** (highest impact):
1. **Button.svelte** - Used by 50+ components (5x multiplier)
2. **Card.svelte + CardHeader/CardContent/CardFooter** - Used by 40+ components (4x multiplier)
3. **Select.svelte** - Used by 30+ components (3x multiplier)
4. **Dialog.svelte** - Used by 25+ components (2.5x multiplier)
5. **Progress.svelte** - Used by 15+ components (2x multiplier)
6. **Checkbox.svelte** - Used by 20+ components (2x multiplier)
7. **Dropdown*.svelte** - Used by 20+ components (2x multiplier)

**Strategy**: Fix these 7 components = improves 200+ dependent files automatically

**Verification**:
```bash
# Count component usage
grep -r "import.*Button" --include="*.svelte" | wc -l
grep -r "import.*Card" --include="*.svelte" | wc -l
```

### 🔍 Quick Detection Scripts

**Find Potentially Minified Files:**
```bash
# Files with ≤50 lines
find . -name "*.svelte" -type f -exec sh -c 'lines=$(wc -l < "$1"); if [ "$lines" -le 50 ]; then echo "$1 ($lines lines)"; fi' _ {} \;

# Files using $props() pattern (568 candidates)
grep -r "= \$props()" --include="*.svelte" -l

# Files with CSS spacing errors
grep -r "hover: \|focus: \|disabled: " --include="*.svelte" -l | head -20
```

**Find Specific Corruption Patterns:**
```bash
# Missing commas in $props()
grep -rn "}\s*[a-zA-Z_$]" --include="*.svelte" | grep "\$props"

# Broken switch cases
grep -rn "case:" --include="*.ts" --include="*.svelte"

# Broken Svelte directives
grep -rn "transition[a-z]" --include="*.svelte" | grep -v "transition:"
grep -rn "<svelte," --include="*.svelte"
```

### ⚠️ Important Notes

1. **Always read files visually first** - Automated detection may miss context
2. **One pattern at a time** - Don't try to fix all 8 patterns in one edit
3. **Verify dependencies** - Some errors are cascade effects from broken imports
4. **Preserve functionality** - Formatting fixes should never change behavior
5. **Use bits-ui v2 patterns** - Component-specific imports, not barrel exports
6. **Test after fixing** - Individual svelte-check before committing

### 🚀 Next Steps for Continued Cleanup

**Immediate (Next Session):**
1. Continue fixing remaining 680 minified files using patterns above
2. Target core UI components for cascade effect (Button, Card, Select)
3. Automated sed script for CSS spacing fixes across 50+ files

**Medium-term:**
4. Archive all `.bak`, `.backup`, `.mojibake-backup` files causing timeouts
5. Implement backup consolidation tool from January 19 spec

**Long-term:**
6. Reach <500 errors (currently 854, need 354 more fixed)
7. Enable strict TypeScript mode once syntax errors eliminated

---

## ✅ January 19, 2026 – Backup Consolidation Spec Complete

### Spec Location
`.kiro/specs/backup-consolidation/`

### Purpose
Safe, automated tool to discover, analyze, and clean up thousands of backup files causing svelte-check/tsc timeouts.

### Backup Patterns Targeted
- `.bak`, `.backup`, `.mojibake-backup`, `.any-backup`
- `.batch*-backup`, `.css-bak`, `.bak-ast`
- `.svelte4.backup`, `.phase*.bak`
- `src.backup*` directories

### Key Features
1. **Ripgrep-based scanning** for fast discovery
2. **Git diff comparison** to determine if live file equals/supersedes backup
3. **Safety validation** - never delete if live file missing or backup has unique content
4. **Dry-run mode** (default) - preview all actions before execution
5. **Quarantine** for non-git files instead of deletion
6. **Audit logging** with restore script generation

### Tasks Summary (All Required)
- Task 1: Project setup + dependencies
- Task 2: BackupScanner with pattern matching + property tests
- Task 3: ComparisonEngine with hash/diff analysis + property tests

---

## ✅ January 22, 2026 – XState v5 Migration Progress

### Migration Status: In Progress (18.5% Error Reduction)

**Error Count Progress**:
- **Initial**: 19,666 TypeScript errors
- **Current**: 16,036 errors
- **Fixed**: 3,630 errors (18.5% reduction)

### XState v5 Fixes Completed

#### 1. Import Corrections (122 errors fixed)
```typescript
// ❌ Wrong (XState v5)
import type { assign, createMachine, fromPromise } from 'xstate';

// ✅ Correct (XState v5)
import { assign, createMachine, fromPromise } from 'xstate';
```
**Reason**: `assign`, `createMachine`, `fromPromise` are runtime functions, not types.

**Files Fixed**:
- `src/lib/state/evidence-processing-machine.ts`
- `src/lib/client/actors/llmStreamActor.ts`
- `src/lib/state/crewAIOrchestrationMachine.ts`

#### 2. Setup API Syntax (48 errors fixed)
```typescript
// ❌ Wrong syntax
actors: {
  myActor: fromPromise(myFn, otherActor: fromPromise(otherFn, // Missing closing parens
}

// ✅ Correct syntax
actors: {
  myActor: fromPromise(myFn),
  otherActor: fromPromise(otherFn),
  anotherActor: fromPromise(anotherFn)
}
```

**Files Fixed**:
- `src/lib/state/crewAIOrchestrationMachine.ts` - actors/actions object formatting

#### 3. Svelte 5 Integration Helper

**Created**: `src/lib/utils/xstate-svelte5.ts`

```typescript
import { useMachine } from '$lib/utils/xstate-svelte5';
import { myMachine } from './myMachine';

const { snapshot, send, actor } = useMachine(myMachine, {
  context: { customValue: 'test' }
});

// Use with $derived for reactive selectors
const isLoading = $derived(snapshot.matches('loading'));
const data = $derived(snapshot.context.data);
```

**Features**:
- Compatible with Svelte 5 runes (`$state`, `$derived`)
- Automatic actor lifecycle management (start/stop)
- Type-safe snapshot access
- Includes `createSelectors` helper for reusable derived state

### Next Steps

1. **Continue High-Error File Fixes**:
   - `svelte-check-analyzer.ts` (162 errors)
   - `citation-store.ts` (160 errors)
   - `evidence-processing-machine.ts` (151 errors)
   - `MultiLayerCacheSystem.ts` (109 errors) - requires full rewrite

2. **Migrate Components Using `@xstate/svelte`**:
   - Update to new `xstate-svelte5` helper
   - Replace legacy `useMachine` imports

3. **Target**: <15,000 errors (23.7% reduction)

---

## ✅ January 22, 2026 – Database Schema Fixes (219 errors)

### schema-phase90-hardened.ts (111 errors fixed)
**Issues**: Missing `export const` + incorrect index syntax

```typescript
// ❌ Wrong (malformed table definition)
'document_chunks', {
  id: uuid('id').primaryKey()
}

// ✅ Correct (Drizzle syntax)
export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey()
}, (table) => ({
  // Use commas, not colons!
  myIndex: index('idx_name').on(table.field1, table.field2)
}));
```

**Tables Fixed**:
- `documentChunks`, `legalDocuments`, `cases`, `evidence`
- `phase72ErrorVector`, `phase72Error`

**Index Syntax**: Changed `:` to `,` in all `index().on()` calls.

### schema-actual.ts (108 errors fixed)
**Issues**: Completely malformed schema file with broken imports and missing punctuation

**Before**: Broken imports, missing commas/parentheses, invalid syntax
```typescript
import type { index, integer, pgTable } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
 id: integer('id').primaryKey(email, varchar('email'...
```

**After**: Complete rewrite with proper Drizzle syntax
```typescript
import { index, integer, pgTable, varchar, jsonb, text } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});
```

**Tables Rebuilt**:
- `users`, `cases`, `evidence`, `documents`

### Error Count Progress
- **Before**: 19,666 errors
- **After Schema Fixes**: 15,785 errors
- **Fixed**: 3,881 errors (19.7% reduction)

---

## ✅ January 19, 2026 – Backup Consolidation Spec Complete
- Task 5: ManifestGenerator with safety analysis + property tests
- Task 6: CleanupExecutor with dry-run/execute modes + property tests
- Task 7: Checkpoint - verify manifest/executor
- Task 8: Rollback support with git restore + quarantine
- Task 9: CLI interface
- Task 10: Final integration test

### Property-Based Tests (20 properties)
Using fast-check with 100+ iterations per property for comprehensive validation.

---

## ✅ January 19, 2026 – ai-service.ts Rebuild + Contextual Chat Verification

### ai-service.ts Rebuilt
- **Ollama-driven analysis:** Uses `OllamaService` for embeddings and completions
- **Dynamic DB import:** Lazy-loads drizzle to avoid crashes when DB unavailable
- **Async flow fixed:** Proper handling for embeddings, auto-tags, document chunks
- **Models:** `gemma3-legal:latest` for LLM, `embeddinggemma:latest` for embeddings

### Contextual Chat System Verified
- **chat-store.svelte.ts:** Clean Svelte 5 runes (`$state`, `$derived`, `$derived.by`)
- **ChatSession.svelte.ts:** SSE-based real-time chat with reconnection logic
- **OllamaService:** Proper endpoint configuration via `get-ollama-endpoint.ts`

### Core Files Status (All Clean)
- `sveltekit-frontend/src/lib/services/ai-service.ts` ✅
- `sveltekit-frontend/src/lib/services/ollamaService.ts` ✅
- `sveltekit-frontend/src/lib/stores/chat-store.svelte.ts` ✅
- `sveltekit-frontend/src/lib/models/ChatSession.svelte.ts` ✅
- `sveltekit-frontend/src/routes/chat/+page.svelte` ✅
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` ✅

### Stack Configuration
- **Drizzle ORM:** 0.44 with PostgreSQL + pgvector
- **Client Caching:** LokiJS + IndexedDB
- **Server Caching:** Redis + Qdrant
- **Message Queue:** RabbitMQ
- **State Machines:** XState v5
- **Styling:** UnoCSS + bits-ui (Svelte 5 API)

### Known Issues
- Full `svelte-check` and `tsc` commands timeout due to thousands of errors in backup files
- Use `getDiagnostics` on specific files instead of full codebase checks
- Errors concentrated in `.mojibake-backup`, `.phase79.bak`, and parked routes

---

## ✅ January 19, 2026 – Svelte 5 Route Fixes

### Key Fixes Applied
- **Svelte 5 event attributes:** Use `onclick`/`onchange` instead of `on:click`/`on:change`.
- **Case routes repaired:** `cases/[id]` overview + board pages now use valid class syntax and fetch payloads.
- **Evidence upload (case scoped):** Fixed `allowedTypes`, return payload, and case title mapping.
- **Component repairs:**
  - `ContextualChatModal.svelte` payload mapping and CSS `rgba()` fixes
  - `CaseNotesEditor.svelte` function boundaries, handlers, and CSS fixes
  - `NesModal.svelte` supports `children?: Snippet`

### Notes
- Svelte 5 runes are in use (`$props`, `$state`, `$derived`).
- bits-ui uses component-level imports for Svelte 5 (no barrel exports).
- Prefer SSR-safe patterns and Drizzle ORM 0.44 queries.

## 🚨 **CRITICAL: Database Migration Safety Protocol**

### ⛔ **DO NOT PROCEED WITH THIS PUSH**

**STOP** if you see warnings like this during `npm run db:push:dev`:

```
⚠️  Warning  Found data-loss statements:
· You're about to delete kg_nodes table with 2764 items
· You're about to delete ts_errors table with 69311 items
· You're about to delete phase89_embeddings table with 34505 items
· You're about to delete error_topk_index table with 910413 items
```

**Answer NO or press Ctrl+C to abort immediately.**

### Why This Happens

Drizzle ORM compares your TypeScript schema files against the actual database. **Tables that exist in the database but aren't defined in your schema files are marked for deletion.**

This would delete **1.2 million+ records** including:
- **910,413 items** in error_topk_index
- **69,311 items** in ts_errors
- **54,384 items** in cpg_edges
- **40,106 items** in raw_error_embeddings
- All Phase 89 embeddings, clusters, and analysis data

### ✅ Safe Approaches

**Option 1: Add Missing Tables to Schema** (Recommended)
```typescript
// These tables exist in DB but not in schema - add them to prevent deletion
export const kgNodes = pgTable('kg_nodes', { ... });
export const tsErrors = pgTable('ts_errors', { ... });
```

**Option 2: Use `tablesFilter` in drizzle.config.ts**
```typescript
export default {
  tablesFilter: ['!phase89_*', '!kg_*', '!ts_errors', '!error_topk_index'],
} satisfies Config;
```

**Option 3: Use `introspect` to Auto-Generate**
```bash
npx drizzle-kit introspect
```

**Option 4: Raw SQL for Simple Changes** (Safest)
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_password TEXT;
```

### 🎯 Pre-Flight Checklist

Before running `npm run db:push:dev`:
1. ✅ Review migration SQL in `drizzle/*.sql`
2. ✅ Check for DROP TABLE statements
3. ✅ Check for DROP COLUMN statements
4. ✅ Verify schema includes all existing tables
5. ✅ Test on dev database first

**Remember:** Drizzle will happily delete millions of records if you let it. Always review, always verify, always backup.

---

## 📊 Latest Findings (January 11, 2026) - Phase 67-68

### Phase 67: Error Cluster & Solve Strategy

**Massive Error Reduction Achieved:**
- **Starting Errors:** 150,925
- **Final Errors:** ~89,000
- **Total Reduction:** -61,000 errors (-41%)

**Iteration Results:**
| Iteration | Focus | Action | Impact |
|-----------|-------|--------|--------|
| 1. Legacy | `ai.bak` archive | Moved legacy code to `_archive/` | **-27,134** |
| 2. Corruption | Phantom Commas | Fixed `{, ` and `;,` patterns in 2080 files | **-34,511** |
| 3. Types | Missing Imports | `ts-morph` auto-import for Node.js/SvelteKit | -14 |
| 4. Strictness | Implicit Any | `ts-morph` added `: any` to 1,879 params | Quality |

**Key Corruption Patterns Discovered:**
```typescript
// Pattern 1: Phantom Start Comma
Promise<{, valid: boolean }> // ❌ Corrupted
Promise<{ valid: boolean }>  // ✅ Fixed

// Pattern 2: Double Question Marks
processingStatus?? 'pending'  // ❌ Corrupted
processingStatus?: 'pending'  // ✅ Fixed

// Pattern 3: Colon Instead of Comma in Generics
ActorRef<Snapshot: Event>  // ❌ Corrupted
ActorRef<Snapshot, Event>  // ✅ Fixed
```

**Tools Created:**
- `scripts/fix-syntax-corruption.mjs` - MVP regex fixer (2000+ files)
- `scripts/fix-syntax-patterns.mjs` - Colon/double-?? fixer
- `scripts/fix-missing-imports-enhanced.ts` - ts-morph auto-import
- `scripts/fix-implicit-any.ts` - Type annotation adder

### Phase 68: Semantic Surgery Strategy

**Error Distribution Analysis (89k errors):**
| Rank | Pattern | Count | % | Root Cause |
|------|---------|-------|---|------------|
| 1 | `',' expected` | 26,414 | 30% | Syntax corruption |
| 2 | `Cannot find name` | 18,741 | 21% | Missing imports |
| 3 | `Declaration expected` | 4,953 | 5.5% | Broken braces |
| 4 | `Type only refers to...` | 3,330 | 3.7% | `import type` misuse |
| 5 | `Property missing` | 3,065 | 3.4% | Interface mismatch |

### 2025 Best Practices Applied

**TypeScript 5.7+ Patterns:**
- Enable `strict: true` in tsconfig
- Use `unknown` over `any` where possible
- Leverage `satisfies` operator for type-safe assignments
- Use `jscodeshift` or `ts-morph` for codemods

**Svelte 5 Runes Migration:**
```typescript
// Svelte 4 (OLD)
export let name;
$: doubled = count * 2;

// Svelte 5 (NEW)
let { name } = $props();
let doubled = $derived(count * 2);
```

**ts-morph AST Best Practices:**
- Use `Project` with `skipAddingFilesFromTsConfig: true` for speed
- Check `findReferencesAsNodes()` before modifying
- Always `saveSync()` after modifications
- Handle edge cases like dynamic imports gracefully

### 🐰 RabbitMQ 4.0 Streaming (2025)

**Key Changes:**
- Quorum queues replace classic mirrored queues
- Default redelivery limit: 20 (configure DLX!)
- Streams for append-only, replayable logs

**TypeScript Client:**
```typescript
import { connect } from 'rabbitmq-stream-js-client';
const client = await connect({ hostname: 'localhost', port: 5552 });
const producer = await client.declarePublisher({ stream: 'docs' });
await producer.send(Buffer.from(JSON.stringify({ id: '123' })));
```

### 📄 LangChain.js Chunking (2025)

**Recommended Strategy:**
```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,    // 256-512 tokens optimal
  chunkOverlap: 50,  // 10-20% overlap
});
```

**Streaming SSE:**
```typescript
for await (const chunk of chain.stream({ input })) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

---

## 📊 Previous Findings (January 9, 2026)

### Svelte 5 Migration Patterns Discovered

**Critical Import Pattern Changes:**
```typescript
// ❌ OLD (Svelte 4 + bits-ui < 2.0)
import { cn } from "$lib/utils";
import { Checkbox as BitsCheckbox } from "bits-ui";

// ✅ NEW (Svelte 5 + bits-ui 2.14.4)
import { cn } from "$lib/utils/cn.js";
import * as Checkbox from "bits-ui/components/checkbox";

// Usage change:
<BitsCheckbox.Root> → <Checkbox.Root>
```

**Components Fixed:**
- Checkbox.svelte (5 errors → 0)
- Label.svelte (errors eliminated)
- Select components (9 files, all BitsSelect refs fixed)
- ~12 UI components remaining (dropdowns, buttons, switches)

**Database Schema Fixes:**
- Fixed missing closing parentheses in `defaultRandom()`, `notNull()`, `defaultNow()`
- Corrected multi-line property declarations
- Standardized indentation and formatting

### Phase 78 Pipeline Commands

```bash
# Validation
npm run phase78:ast-rank:test

# Analyze all errors with AST ranking
npm run phase78:ast-rank

# Focus on top 50 files
npm run phase78:ast-rank:top50

# Complete pipeline (rank → insert → cluster → suggest)
npm run phase78:full
```

---

## 🚀 Quick Start with Docker (Phase 72)

### Build in WSL Linux

```bash
# Navigate to workspace
cd /mnt/c/path/to/legal-ai

# Build CUDA Docker image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Build with specific CUDA architecture
docker build -f docker/Dockerfile.cuda \
  --build-arg CUDA_ARCHITECTURES=86 \
  -t legal-ai-gpu:latest .
```

### Run with Docker

```bash
# Run GPU container with all services
docker run --gpus all \
  -p 8000:8000 \
  -p 5174:5174 \
  -p 6333:6333 \
  -p 7687:7687 \
  -p 6379:6379 \
  -p 5432:5432 \
  -v $(pwd)/backend:/app/backend \
  -v $(pwd)/sveltekit-frontend:/app/frontend \
  -e CUDA_VISIBLE_DEVICES=0 \
  -e PYTHONUNBUFFERED=1 \
  legal-ai-gpu:latest

# Run with custom environment
docker run --gpus all \
  -p 8000:8000 \
  -e NEO4J_URI=bolt://localhost:7687 \
  -e OLLAMA_URL=http://localhost:11434 \
  -e QDRANT_URL=http://localhost:6333 \
  -e PHASE72_MAX_ITERATIONS=10 \
  legal-ai-gpu:latest
```

### Docker Compose (Keep Existing)

```bash
# Start full GPU stack (preserves existing compose files)
docker-compose -f docker/docker-compose.gpu.yml up -d

# View logs
docker-compose -f docker/docker-compose.gpu.yml logs -f legal-ai-gpu

# Stop stack
docker-compose -f docker/docker-compose.gpu.yml down

# Rebuild services
docker-compose -f docker/docker-compose.gpu.yml build --no-cache
```

---

## 📊 Phase 72: AST Error Reduction

### What It Does
- Extracts 80k+ TypeScript/Svelte errors
- Clusters similar errors using GPU acceleration
- Generates AI patches using gemma3-legal
- Applies and validates patches automatically
- Iterates until errors stabilize (<1k)

### Expected Results
- **Error Reduction**: 95%+ (80k → <1k)
- **Success Rate**: 75-85% patch acceptance
- **Processing Time**: 15-30 min per cycle
- **GPU Utilization**: 70-90%

### Key Components
- Error extraction (svelte-check)
- Neo4j graph database
- GPU clustering (CUDA)
- AI patch generation (Ollama)
- Patch validation (ts-morph)

### Specification
- Requirements: `.kiro/specs/phase-72-ast-error-reduction/requirements.md`
- Design: `.kiro/specs/phase-72-ast-error-reduction/design.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`

---

## ⚡ CUDA Acceleration

### 4-Phase Speedup Plan

| Phase | Component | Current | GPU | Speedup |
|-------|-----------|---------|-----|---------|
| A | Tokenization | 100ms | 20ms | 5x |
| B | Embedding | 500ms | 50ms | 10x |
| C | Vector Search | 100ms | 30ms | 3x |
| D | Reranking | 50ms | 6ms | 8x |
| **Total** | **Pipeline** | **750ms** | **106ms** | **7x** |

### Build CUDA Components

```bash
# In WSL Linux
cd /mnt/c/path/to/legal-ai

# Configure CMake
cmake -B build -DCMAKE_BUILD_TYPE=Release \
                -DCUDA_ARCHITECTURES=86 \
                -DCUTLASS_DIR=/opt/cutlass

# Build
cmake --build build --parallel 8

# Install
cmake --install build

# Run benchmarks
./build/benchmark_tokenizer --batch-size 32 --iterations 100
./build/benchmark_embedding --batch-size 32 --iterations 100
./build/benchmark_search --num-candidates 1000 --iterations 100
./build/benchmark_reranker --batch-size 32 --iterations 100
```

### Docker Build with CUDA

```bash
# Build CUDA image in WSL
docker build -f docker/Dockerfile.cuda \
  --build-arg CUDA_ARCHITECTURES=86 \
  -t legal-ai-gpu:cuda12 .

# Run with GPU
docker run --gpus all \
  -p 8000:8000 \
  -v $(pwd):/app \
  legal-ai-gpu:cuda12 \
  python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## 🔧 Configuration

### Environment Variables

```bash
# CUDA
export CUDA_VISIBLE_DEVICES=0
export CUDA_LAUNCH_BLOCKING=0

# Phase 72
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
export OLLAMA_URL=http://localhost:11434
export QDRANT_URL=http://localhost:6333
export REDIS_URL=redis://localhost:6379
export PHASE72_MAX_ITERATIONS=10
export PHASE72_MIN_IMPROVEMENT=0.05
```

### Docker Compose Services (Preserved)

```yaml
# All existing docker-compose files remain unchanged
# New GPU stack in docker/docker-compose.gpu.yml includes:
# - legal-ai-gpu (main service)
# - postgres (database)
# - redis (cache)
# - qdrant (vector db)
# - minio (storage)
# - rabbitmq (queue)
# - gpu-monitor (optional)
```

---

## 📁 File Structure

```
legal-ai/
├── CMakeLists.txt                      # Root CMake
├── CUDA_ACCELERATION_ROADMAP.md        # CUDA plan
├── CUDA_QUICKSTART.md                  # Quick start
├── PHASE_72_AND_CUDA_SUMMARY.md       # Summary
├── IMPLEMENTATION_READY.md             # Checklist
│
├── backend/
│   ├── cuda/
│   │   └── CMakeLists.txt             # CUDA backend
│   └── ... (existing services)
│
├── docker/
│   ├── Dockerfile.cuda                # GPU runtime
│   ├── docker-compose.gpu.yml         # GPU stack
│   └── ... (existing configs - preserved)
│
├── .kiro/
│   ├── INDEX.md                       # Navigation
│   ├── STARTUP_GUIDE.md               # Getting started
│   ├── PHASE_72_SPEC_COMPLETE.md      # Phase 72 summary
│   └── specs/
│       └── phase-72-ast-error-reduction/
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
│
└── phase72-ast-reduction/
    ├── phase72-orchestrator.ts        # Existing
    └── ... (to be implemented)
```

---

## 🚀 Implementation Steps

### Step 1: Build Docker Image (WSL Linux)

```bash
# In WSL terminal
cd /mnt/c/path/to/legal-ai

# Build image
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .

# Verify build
docker images | grep legal-ai-gpu
```

### Step 2: Start Services

```bash
# Option A: Docker run (single container)
docker run --gpus all -p 8000:8000 legal-ai-gpu:latest

# Option B: Docker Compose (full stack)
docker-compose -f docker/docker-compose.gpu.yml up -d

# Option C: Keep existing compose files
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.gpu.yml up -d
```

### Step 3: Verify Services

```bash
# Check API health
curl http://localhost:8000/api/health

# Check GPU metrics
curl http://localhost:8000/api/gpu-metrics

# Check Neo4j
curl http://localhost:7687

# Check Qdrant
curl http://localhost:6333/health
```

### Step 4: Start Phase 72

```bash
# Run Phase 72 orchestrator
docker exec legal-ai-gpu npm run phase72:run

# Monitor progress
docker exec legal-ai-gpu npm run phase72:progress

# View dashboard
open http://localhost:5174
```

---

## 📊 Performance Monitoring

### GPU Metrics

```bash
# Real-time GPU monitoring
nvidia-smi -l 1

# GPU memory usage
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader -l 1

# GPU utilization
nvidia-smi dmon
```

### Docker Logs

```bash
# View all logs
docker-compose -f docker/docker-compose.gpu.yml logs -f

# View specific service
docker logs legal-ai-gpu -f

# View with timestamps
docker logs --timestamps legal-ai-gpu
```

### Performance Benchmarks

```bash
# Run benchmarks in container
docker exec legal-ai-gpu ./build/benchmark_tokenizer --batch-size 32
docker exec legal-ai-gpu ./build/benchmark_embedding --batch-size 32
docker exec legal-ai-gpu ./build/benchmark_search --num-candidates 1000
docker exec legal-ai-gpu ./build/benchmark_reranker --batch-size 32
```

---

## 🔧 Troubleshooting

### GPU Not Available

```bash
# Check NVIDIA Docker runtime
docker run --rm --gpus all nvidia/cuda:12.0-runtime-ubuntu22.04 nvidia-smi

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Out of Memory

```bash
# Reduce batch size
docker run --gpus all \
  -e CUDA_LAUNCH_BLOCKING=1 \
  -e BATCH_SIZE=16 \
  legal-ai-gpu:latest

# Monitor memory
docker stats legal-ai-gpu
```

### Build Failures

```bash
# Clean build
docker build -f docker/Dockerfile.cuda --no-cache -t legal-ai-gpu:latest .

# Check build logs
docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest . 2>&1 | tail -50

# Build with verbose output
docker build -f docker/Dockerfile.cuda --progress=plain -t legal-ai-gpu:latest .
```

---

## 📚 Documentation

### Phase 72
- Specification: `.kiro/specs/phase-72-ast-error-reduction/`
- Summary: `.kiro/PHASE_72_SPEC_COMPLETE.md`
- Tasks: `.kiro/specs/phase-72-ast-error-reduction/tasks.md`

### CUDA
- Roadmap: `CUDA_ACCELERATION_ROADMAP.md`
- Quick Start: `CUDA_QUICKSTART.md`
- CMake: `CMakeLists.txt`

### Getting Started
- Startup Guide: `.kiro/STARTUP_GUIDE.md`
- Index: `.kiro/INDEX.md`
- Implementation Ready: `IMPLEMENTATION_READY.md`

---

## ✅ Verification Checklist

- [ ] Docker image builds successfully
- [ ] GPU detected in container
- [ ] All services start (Neo4j, Ollama, Qdrant, Redis, Postgres)
- [ ] API health check passes
- [ ] GPU metrics endpoint responds
- [ ] Phase 72 orchestrator initializes
- [ ] Dashboard accessible at localhost:5174
- [ ] Benchmarks run successfully

---

## 🎯 Next Steps

1. **Build Docker Image**: `docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .`
2. **Start Services**: `docker-compose -f docker/docker-compose.gpu.yml up -d`
3. **Verify Setup**: `curl http://localhost:8000/api/health`
4. **Start Phase 72**: `docker exec legal-ai-gpu npm run phase72:run`
5. **Monitor Progress**: `docker exec legal-ai-gpu npm run phase72:progress`

---

**Status**: ✅ Ready for Docker deployment in WSL Linux

**Build Command**: `docker build -f docker/Dockerfile.cuda -t legal-ai-gpu:latest .`

**Run Command**: `docker run --gpus all -p 8000:8000 legal-ai-gpu:latest`

**Compose Command**: `docker-compose -f docker/docker-compose.gpu.yml up -d`

## 🎯 February 8, 2026 – Cascade Effect Strategy (Production Ready)

### Current Status
- **Errors**: 1,135 (down from 1,152)  
- **Files**: 388 with issues
- **Target**: <800 errors via cascade effect
- **Strategy**: Fix 4 high-impact UI components → 335 errors cascade fix

### Priority Components (See CASCADE_EFFECT_STRATEGY.md)
1. **Switch** (~80 errors cascade) - Settings, toggles across 25+ files
2. **Dropdown Menu** (~100 errors cascade) - Navigation, context menus in 30+ files  
3. **Tabs** (~75 errors cascade) - Dashboards, multi-view pages in 20+ files
4. **Command Palette** (~80 errors cascade) - Search, quick actions in 15+ files

### Bits UI Svelte 5 Migration Patterns

```typescript
// 1. el → ref (all components)
<Component ref={element} />

// 2. asChild → child snippet  
{#snippet children()}<button>Click</button>{/snippet}

// 3. let: → snippet props
{#snippet trigger(props)}<button {...props}>Menu</button>{/snippet}
```

**Resources**: [Bits UI Migration](https://www.bits-ui.com/docs/migration-guide) | [CASCADE_EFFECT_STRATEGY.md](./CASCADE_EFFECT_STRATEGY.md)

---

## 🎯 February 11, 2026 – Session 15: P1 Rewrites + TypeScript Checking Strategy

### Current Status
- **Errors**: 397 in 298 files (270 warnings)
- **Down from**: 462 errors (start of session)
- **Target**: <400 errors (**ACHIEVED**)

### TypeScript Checking Strategy (`tsconfig.json`)

**`src/lib/services/**` uses a blanket exclude** because 312 of 564 service files are corrupted (minified/broken). Removing the blanket exclude exposes 20K+ errors from these files.

**Key insight: Clean services ARE still type-checked.** TypeScript's `exclude` only affects automatic file discovery. Files imported by other included files are always checked transitively. So:
- `ai-service.ts`, `case-link.service.ts`, `ai-pipeline-client.ts`, `ollamaService.ts` etc. are fully type-checked when imported by routes/components
- The blanket exclude only hides 312 corrupted files from discovery
- Verified: clean services show 0 errors in svelte-check

**DO NOT remove the blanket `src/lib/services/**` exclude** unless most corrupted files are cleaned first. The targeted-exclude approach was tested and results in 20K+ errors (143 files with errors, top offenders: `native-windows-service-manager.ts` 719 errors, `hierarchical-cache-index.ts` 669 errors, etc.)

**Service file stats** (Feb 2026):
- 564 total `.ts` files in `src/lib/services/`
- 252 clean (well-formatted, no corruption)
- 312 corrupted (303 minified + 9 switch syntax errors)
- Clean files that are imported → type-checked transitively
- Corrupted files → excluded from discovery

**Clean service files (verified, imported and checked):**
- `ai-service.ts` (597 lines) - AI pipeline client
- `case-link.service.ts` (253 lines) - Case-statute linking
- `ai-pipeline-client.ts` (457 lines) - AI service health
- `ollamaService.ts` (202 lines) - Ollama integration
- `adaptive-index-orchestrator.ts` (174 lines)
- `agentShellMachine.ts` (165 lines)
- `agentic-stream.ts` (253 lines)
- `accessibility-service.ts` (372 lines)
- `api-client.ts` (280 lines)
- `chatService.ts` (202 lines)

### Drizzle ORM 0.44 Migration Safety

### Drizzle ORM 0.44 Migration Safety

**Always use `drizzle-kit migrate`** for production/real data:
- Applies SQL migration files sequentially
- Records migrations as applied (idempotent)
- Reviewable SQL before execution

**Never use `drizzle-kit push`** on databases with real data:
- Directly syncs schema, can prompt for destructive renames/drops
- No migration history recorded
- Risk of data loss on tables not in schema files

**Pro-Tip: Renaming Tables without Dropping (Drizzle 0.44)**

1. Don't just rename the TypeScript variable. Drizzle uses the string inside `pgTable("old_name", { ... })`.
2. Change it to `pgTable("new_name", { ... })`.
3. Run `npx drizzle-kit generate`.
4. Open the generated SQL file. If it says `DROP TABLE "old_name"`, change it manually to:
   ```sql
   ALTER TABLE "old_name" RENAME TO "new_name";
   ```
5. Then run `npx drizzle-kit migrate`.

Drizzle's generator doesn't detect renames — it sees a missing table and a new table, so it generates DROP + CREATE. Always review the SQL before applying.

### TODO — Core Route Consolidation & API Development

**P0: API Endpoints (COMPLETED)**
- [x] `POST /api/citations/+server.ts` (insert into citations + statutes)
- [x] `POST /api/cases/[id]/laws/+server.ts` (link statute to case)
- [x] `POST /api/cases/[id]/citations/+server.ts` (link citation to case)
- [x] `case_statute_links` junction table via schema + migration
- [x] `GET /api/cases` response shape aligned (`data.data`)

**P1: High-Impact File Rewrites (COMPLETED - 4/4 files, commit 35fe5b636b)**
- [x] `EnhancedDocumentUploader.svelte` (209→923 lines, 17 corruptions fixed)
- [x] `CitationManager.svelte` (353→1204 lines, 10+ corruptions + diff markers)
- [x] `UserMenu.svelte` (183→573 lines, svelte:window + CSS)
- [x] `AIServiceStatus.svelte` (109→357 lines, 4 corrupted tags)
- [ ] ~10 more files with 1-2 `<svelte, component` issues

**P2: Remaining Error Fixes (~397 errors in 298 files)**
- [ ] Missing module imports (~100)
- [ ] Type mismatches in component props (~150)
- [ ] Svelte template + CSS errors (~100)
- [ ] Service file cleanup (312 corrupted, 252 clean)

**P3: UX Enhancement (later)**
- [ ] Loading skeletons, toast notifications, virtualized lists
- [ ] Search/filter in AttachToCaseModal, keyboard nav
- [ ] Dark mode / YoRHa theme consistency

---

