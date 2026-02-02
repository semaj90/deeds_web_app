# Superforms v2 + Zod + SvelteKit 2 + Svelte 5 Runes + Drizzle ORM 0.44 Guide

## 📦 Installation

```bash
npm install sveltekit-superforms@latest zod drizzle-orm@0.44.0 drizzle-zod
```

## 🎯 Complete Example: Evidence Upload Form

### 1. Define Drizzle Schema (Already exists in your project)

```typescript
// drizzle/schema.ts
import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const evidenceStatus = pgEnum("evidence_status", ['pending', 'verified', 'rejected', 'under_review']);
export const evidenceType = pgEnum("evidence_type", ['physical', 'digital', 'testimonial', 'documentary', 'scientific', 'video', 'document', 'photo', 'note', 'audio', 'forensic']);

export const evidenceTable = pgTable("evidence", {
  id: uuid().defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull(),
  title: varchar({ length: 255 }).notNull(),
  description: text(),
  evidenceType: evidenceType("evidence_type").notNull(),
  status: evidenceStatus().default('pending'),
  uploadedBy: uuid("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 2. Create Zod Schema from Drizzle (Auto-generated validation)

```typescript
// src/lib/schemas/evidence-upload.ts
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { evidenceTable } from '$lib/server/db/schema';

// Auto-generate from Drizzle schema
export const insertEvidenceSchema = createInsertSchema(evidenceTable, {
  // Add custom refinements
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  caseId: z.string().uuid('Invalid case ID'),
  evidenceType: z.enum(['physical', 'digital', 'testimonial', 'documentary', 'scientific', 'video', 'document', 'photo', 'note', 'audio', 'forensic']),
});

// For client-side file upload (doesn't exist in DB)
export const evidenceUploadFormSchema = insertEvidenceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: true,
}).extend({
  file: z.instanceof(File, { message: 'Please upload a file' })
    .refine(f => f.size > 0, 'File cannot be empty')
    .refine(f => f.size < 10_000_000, 'File must be less than 10MB'),
  tags: z.string().optional().transform(val => val?.split(',').map(t => t.trim()) || []),
});

export type EvidenceUploadForm = z.infer<typeof evidenceUploadFormSchema>;
```

### 3. Server Load Function (+page.server.ts)

```typescript
// src/routes/(app)/evidence/upload/+page.server.ts
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { fail, redirect } from '@sveltejs/kit';
import { evidenceUploadFormSchema } from '$lib/schemas/evidence-upload';
import { db } from '$lib/server/db';
import { evidenceTable } from '$lib/server/db/schema';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // Initialize empty form with Zod schema
  const form = await superValidate(zod(evidenceUploadFormSchema));

  return {
    form,
    user: locals.user
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    // Validate form data
    const form = await superValidate(request, zod(evidenceUploadFormSchema));

    // Server-side validation check
    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      // Upload file to MinIO/S3
      const fileUrl = await uploadToMinIO(form.data.file);

      // Insert into database using Drizzle
      const [evidence] = await db.insert(evidenceTable).values({
        title: form.data.title,
        description: form.data.description,
        caseId: form.data.caseId,
        evidenceType: form.data.evidenceType,
        status: 'pending',
        uploadedBy: locals.user?.id,
        // Store file URL in metadata
      }).returning();

      // Success message
      return message(form, {
        type: 'success',
        text: `Evidence "${evidence.title}" uploaded successfully!`
      });

    } catch (error) {
      console.error('Evidence upload failed:', error);
      return message(form, {
        type: 'error',
        text: 'Failed to upload evidence. Please try again.'
      }, { status: 500 });
    }
  }
};

async function uploadToMinIO(file: File): Promise<string> {
  // Your MinIO upload logic
  return 'https://minio.example.com/evidence/file.pdf';
}
```

### 4. Client Component with Svelte 5 Runes (+page.svelte)

```svelte
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { evidenceUploadFormSchema } from '$lib/schemas/evidence-upload';
  import type { PageData } from './$types';

  // Svelte 5: Use $props() rune
  const { data }: { data: PageData } = $props();

  // Superform v2 with Svelte 5 runes support
  const { form, errors, enhance, message, delayed, timeout } = superForm(data.form, {
    validators: zodClient(evidenceUploadFormSchema),
    resetForm: true,
    multipleSubmits: 'prevent',
    clearOnSubmit: 'errors-and-message',
    taintedMessage: 'You have unsaved changes. Are you sure you want to leave?',
    onUpdate({ form }) {
      if (form.message) {
        // Show toast notification
        console.log(form.message);
      }
    }
  });

  // Svelte 5: Reactive state with $state rune
  let filePreview = $state<string | null>(null);

  // Svelte 5: Derived with $derived rune
  const isSubmitting = $derived($delayed);

  // Handle file selection
  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      $form.file = file;
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          filePreview = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    }
  }
</script>

<div class="max-w-2xl mx-auto p-6">
  <h1 class="text-3xl font-bold mb-6">Upload Evidence</h1>

  <!-- Success/Error Message -->
  {#if $message}
    <div class="mb-4 p-4 rounded {$message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
      {$message.text}
    </div>
  {/if}

  <!-- Form with progressive enhancement -->
  <form method="POST" enctype="multipart/form-data" use:enhance class="space-y-6">

    <!-- Title Field -->
    <div>
      <label for="title" class="block text-sm font-medium mb-2">
        Evidence Title *
      </label>
      <input
        id="title"
        name="title"
        type="text"
        bind:value={$form.title}
        aria-invalid={$errors.title ? 'true' : undefined}
        class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        class:border-red-500={$errors.title}
      />
      {#if $errors.title}
        <p class="mt-1 text-sm text-red-600">{$errors.title}</p>
      {/if}
    </div>

    <!-- Case ID -->
    <div>
      <label for="caseId" class="block text-sm font-medium mb-2">
        Case ID *
      </label>
      <input
        id="caseId"
        name="caseId"
        type="text"
        bind:value={$form.caseId}
        placeholder="UUID format"
        class="w-full px-3 py-2 border rounded-lg"
        class:border-red-500={$errors.caseId}
      />
      {#if $errors.caseId}
        <p class="mt-1 text-sm text-red-600">{$errors.caseId}</p>
      {/if}
    </div>

    <!-- Evidence Type -->
    <div>
      <label for="evidenceType" class="block text-sm font-medium mb-2">
        Evidence Type *
      </label>
      <select
        id="evidenceType"
        name="evidenceType"
        bind:value={$form.evidenceType}
        class="w-full px-3 py-2 border rounded-lg"
        class:border-red-500={$errors.evidenceType}
      >
        <option value="">Select type</option>
        <option value="physical">Physical</option>
        <option value="digital">Digital</option>
        <option value="testimonial">Testimonial</option>
        <option value="documentary">Documentary</option>
        <option value="scientific">Scientific</option>
        <option value="video">Video</option>
        <option value="document">Document</option>
        <option value="photo">Photo</option>
        <option value="audio">Audio</option>
        <option value="forensic">Forensic</option>
      </select>
      {#if $errors.evidenceType}
        <p class="mt-1 text-sm text-red-600">{$errors.evidenceType}</p>
      {/if}
    </div>

    <!-- Description -->
    <div>
      <label for="description" class="block text-sm font-medium mb-2">
        Description *
      </label>
      <textarea
        id="description"
        name="description"
        bind:value={$form.description}
        rows="4"
        class="w-full px-3 py-2 border rounded-lg"
        class:border-red-500={$errors.description}
      ></textarea>
      {#if $errors.description}
        <p class="mt-1 text-sm text-red-600">{$errors.description}</p>
      {/if}
    </div>

    <!-- File Upload -->
    <div>
      <label for="file" class="block text-sm font-medium mb-2">
        Upload File *
      </label>
      <input
        id="file"
        name="file"
        type="file"
        onchange={handleFileChange}
        class="w-full px-3 py-2 border rounded-lg"
        class:border-red-500={$errors.file}
      />
      {#if $errors.file}
        <p class="mt-1 text-sm text-red-600">{$errors.file}</p>
      {/if}

      <!-- File Preview -->
      {#if filePreview}
        <div class="mt-4">
          <img src={filePreview} alt="Preview" class="max-w-xs rounded-lg" />
        </div>
      {/if}
    </div>

    <!-- Tags -->
    <div>
      <label for="tags" class="block text-sm font-medium mb-2">
        Tags (comma-separated)
      </label>
      <input
        id="tags"
        name="tags"
        type="text"
        bind:value={$form.tags}
        placeholder="crime scene, fingerprint, weapon"
        class="w-full px-3 py-2 border rounded-lg"
      />
    </div>

    <!-- Submit Button -->
    <div class="flex gap-4">
      <button
        type="submit"
        disabled={isSubmitting}
        class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {#if isSubmitting}
          <span class="flex items-center gap-2">
            <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Uploading...
          </span>
        {:else}
          Upload Evidence
        {/if}
      </button>

      {#if $timeout}
        <div class="flex items-center text-yellow-600">
          <svg class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Request is taking longer than usual...
        </div>
      {/if}
    </div>
  </form>
</div>
```

## 🔥 Advanced Features

### Multiple Forms on Same Page

```typescript
// +page.server.ts
export const load: PageServerLoad = async () => {
  const evidenceForm = await superValidate(zod(evidenceUploadFormSchema), { id: 'evidence' });
  const caseForm = await superValidate(zod(caseFormSchema), { id: 'case' });

  return { evidenceForm, caseForm };
};

// +page.svelte
const evidenceForm = superForm(data.evidenceForm, {
  id: 'evidence',
  validators: zodClient(evidenceUploadFormSchema)
});

const caseForm = superForm(data.caseForm, {
  id: 'case',
  validators: zodClient(caseFormSchema)
});
```

### Nested Objects & Arrays

```typescript
// Schema with nested data
export const investigationSchema = z.object({
  caseId: z.string().uuid(),
  officers: z.array(z.object({
    name: z.string(),
    badge: z.string(),
    role: z.enum(['lead', 'support', 'forensics'])
  })).min(1, 'At least one officer required'),
  timeline: z.object({
    startDate: z.date(),
    endDate: z.date().optional(),
    events: z.array(z.object({
      timestamp: z.date(),
      description: z.string(),
      evidenceIds: z.array(z.string().uuid())
    }))
  })
});

// In component - access nested errors
{#if $errors.officers?.[0]?.name}
  <p>{$errors.officers[0].name}</p>
{/if}
```

### Custom Validation with Refinements

```typescript
export const caseFormSchema = z.object({
  title: z.string().min(5),
  startDate: z.date(),
  endDate: z.date().optional(),
}).refine(
  (data) => !data.endDate || data.endDate > data.startDate,
  {
    message: "End date must be after start date",
    path: ["endDate"]
  }
).refine(
  async (data) => {
    // Async validation - check if case title is unique
    const existing = await db.select().from(casesTable)
      .where(eq(casesTable.title, data.title))
      .limit(1);
    return existing.length === 0;
  },
  {
    message: "Case title already exists",
    path: ["title"]
  }
);
```

### File Upload with Progress

```svelte
<script lang="ts">
  let uploadProgress = $state(0);

  const { form, enhance } = superForm(data.form, {
    validators: zodClient(evidenceUploadFormSchema),
    onSubmit() {
      uploadProgress = 0;
    },
    onUpdate({ form }) {
      if (form.valid) {
        uploadProgress = 100;
      }
    }
  });

  // Custom fetch with progress
  async function handleSubmitWithProgress(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        uploadProgress = (e.loaded / e.total) * 100;
      }
    });

    xhr.open('POST', '?/uploadEvidence');
    xhr.send(formData);
  }
</script>

{#if uploadProgress > 0 && uploadProgress < 100}
  <div class="w-full bg-gray-200 rounded-full h-2.5">
    <div class="bg-blue-600 h-2.5 rounded-full" style="width: {uploadProgress}%"></div>
  </div>
{/if}
```

## 📋 Key Differences from Superforms v1

| Feature | v1 | v2 |
|---------|----|----|
| Adapter | `superValidate(schema)` | `superValidate(zod(schema))` |
| Import | `sveltekit-superforms/adapters` | `sveltekit-superforms/adapters` |
| Svelte 5 | Partial support | Full runes support |
| Multiple forms | Manual ID | Built-in `{ id }` |

## 🎯 Best Practices

1. **Always use `zodClient()` on client** - enables real-time validation
2. **Use `message()` for feedback** - better UX than redirects
3. **Enable `taintedMessage`** - prevents accidental data loss
4. **Use form IDs** - when multiple forms on same page
5. **Leverage Drizzle-Zod** - auto-generate schemas from DB
6. **Type safety** - use `z.infer<typeof schema>` for TypeScript

## 🚀 Production Tips

```typescript
// src/lib/server/db/index.ts - Drizzle setup
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

This setup gives you:
- ✅ Type-safe forms with Zod
- ✅ Automatic validation
- ✅ Progressive enhancement
- ✅ Svelte 5 runes support
- ✅ Drizzle ORM 0.44 integration
- ✅ Real-time client validation
- ✅ Server-side safety
