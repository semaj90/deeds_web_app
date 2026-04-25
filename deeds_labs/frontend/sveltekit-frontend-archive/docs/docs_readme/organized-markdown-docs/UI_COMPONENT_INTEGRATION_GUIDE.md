# 🎨 UI Component Integration Guide: Bits UI, Melt UI & Shadcn-Svelte

## 📋 Overview

This guide covers the proper integration and usage of modern UI libraries in our Legal AI system, specifically focusing on:

- **Bits UI**: Headless component library for Svelte
- **Melt UI**: Builder library for advanced component state management
- **Shadcn-Svelte**: Design system components (custom implementation)

## 🧩 Bits UI - Headless Components

### Core Philosophy

Bits UI provides unstyled, accessible components that you can customize with your own CSS or Tailwind classes.

### Proper Usage Patterns

#### ✅ Dialog/Modal Components

```svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';

  let dialogOpen = $state(false);
</script>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Trigger class="btn-primary">
    Open Legal Case Details
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/50" />
    <Dialog.Content class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl">
      <Dialog.Title class="text-xl font-semibold mb-4">
        Case Management
      </Dialog.Title>
      <Dialog.Description class="text-gray-600 mb-6">
        Review and manage your legal case details
      </Dialog.Description>

      <!-- Case content here -->

      <div class="flex justify-end gap-2 mt-6">
        <Dialog.Close class="btn-secondary">
          Cancel
        </Dialog.Close>
        <button class="btn-primary">
          Save Changes
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

#### ✅ Select/Dropdown Components

```svelte
<script lang="ts">
  import { Select } from 'bits-ui';

  let selectedModel = $state('');
  const aiModels = [
    { value: 'gemma3-legal', label: 'Gemma 3 Legal (Specialized)' },
    { value: 'llama3.1:8b', label: 'Llama 3.1 8B (General)' },
    { value: 'mistral:7b', label: 'Mistral 7B (Fast)' },
    { value: 'llama3.1:70b', label: 'Llama 3.1 70B (Advanced)' }
  ];
</script>

<Select.Root bind:selected={selectedModel}>
  <Select.Trigger class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500">
    <Select.Value placeholder="Select AI Model" />
  </Select.Trigger>

  <Select.Content class="bg-white border border-gray-300 rounded-md shadow-lg mt-1">
    {#each aiModels as model}
      <Select.Item
        value={model.value}
        class="px-3 py-2 hover:bg-gray-100 cursor-pointer"
      >
        {model.label}
      </Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
```

#### ✅ Button Components

```svelte
<script lang="ts">
  import { Button } from 'bits-ui';

  function handleCaseSubmission() {
    // Handle case submission logic
  }
</script>

<!-- Simple button -->
<Button
  class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
  onclick={handleCaseSubmission}
>
  Submit Case
</Button>

<!-- Button with loading state -->
<Button
  class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
  disabled={isProcessing}
  onclick={handleCaseSubmission}
>
  {#if isProcessing}
    <Loader2 class="w-4 h-4 animate-spin mr-2" />
    Processing...
  {:else}
    Analyze Evidence
  {/if}
</Button>
```

### Common Bits UI Mistakes to Avoid

❌ **Incorrect Import Paths**

```svelte
<!-- Wrong -->
import { Dialog, Button, Select } from '$lib/components/ui/enhanced-bits';

<!-- Correct -->
import { Dialog, Button, Select } from 'bits-ui';
```

❌ **Wrong Component Structure**

```svelte
<!-- Wrong - Using .Root suffix incorrectly -->
<Button.Root class="btn">Click me</Button.Root>

<!-- Correct - Direct component usage -->
<Button class="btn">Click me</Button>
```

❌ **Incorrect Event Handlers**

```svelte
<!-- Wrong - Non-existent event -->
<Dialog.Root onOpenChange={(open) => console.log(open)}>

<!-- Correct - Use bind:open for state management -->
<Dialog.Root bind:open={dialogOpen}>
```

## 🛠️ Melt UI - Advanced Builders

### Core Philosophy

Melt UI provides builder functions that return stores and actions for complex component behavior.

### Toast/Notification System

```svelte
<script lang="ts">
  import { createToaster } from '@melt-ui/svelte';
  import { fly } from 'svelte/transition';

  const {
    elements: { content, title, description, close },
    helpers: { addToast },
    states: { toasts },
    actions: { portal }
  } = createToaster<{
    title: string;
    description: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>();

  function showSuccess() {
    addToast({
      data: {
        title: 'Case Created',
        description: 'Your legal case has been successfully created.',
        type: 'success'
      }
    });
  }

  function showError() {
    addToast({
      data: {
        title: 'Upload Failed',
        description: 'Failed to upload legal document. Please try again.',
        type: 'error'
      }
    });
  }
</script>

<!-- Toast container -->
<div use:portal class="fixed top-4 right-4 z-50 space-y-2">
  {#each $toasts as { id, data } (id)}
    <div
      use:content(id)
      transition:fly={{ duration: 150, x: '100%' }}
      class="toast toast-{data.type}"
    >
      <div use:title(id) class="toast-title">
        {data.title}
      </div>
      <div use:description(id) class="toast-description">
        {data.description}
      </div>
      <button use:close(id) class="toast-close">
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .toast {
    @apply px-4 py-3 rounded-lg shadow-lg border-l-4 bg-white min-w-80;
  }

  .toast-success {
    @apply border-green-500;
  }

  .toast-error {
    @apply border-red-500;
  }

  .toast-warning {
    @apply border-yellow-500;
  }

  .toast-info {
    @apply border-blue-500;
  }

  .toast-title {
    @apply font-semibold text-gray-900;
  }

  .toast-description {
    @apply text-sm text-gray-600 mt-1;
  }

  .toast-close {
    @apply absolute top-2 right-2 text-gray-400 hover:text-gray-600;
  }
</style>
```

## 🎨 Custom Shadcn-Svelte Implementation

Since Shadcn-Svelte isn't available in Context7, here's how to implement similar patterns:

### Card Component

```svelte
<!-- src/lib/components/ui/card/Card.svelte -->
<script lang="ts">
  interface Props {
    class?: string;
    children?: any;
  }

  let { class: className = '', children, ...props }: Props = $props();
</script>

<div class="card {className}" {...props}>
  {@render children?.()}
</div>

<style>
  .card {
    @apply rounded-lg border border-gray-200 bg-white shadow-sm;
  }
</style>
```

### Input Component

```svelte
<!-- src/lib/components/ui/input/Input.svelte -->
<script lang="ts">
  interface Props {
    type?: string;
    value?: string;
    placeholder?: string;
    class?: string;
    disabled?: boolean;
  }

  let {
    type = 'text',
    value = $bindable(''),
    placeholder = '',
    class: className = '',
    disabled = false,
    ...props
  }: Props = $props();
</script>

<input
  {type}
  bind:value
  {placeholder}
  {disabled}
  class="input {className}"
  {...props}
/>

<style>
  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-md
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
           disabled:bg-gray-100 disabled:cursor-not-allowed;
  }
</style>
```

## 🚀 Legal AI Integration Examples

### File Upload Component with Progress

```svelte
<script lang="ts">
  import { Dialog, Button } from 'bits-ui';
  import { createToaster } from '@melt-ui/svelte';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Progress } from '$lib/components/ui/progress';
  import { FileUp, Loader2 } from 'lucide-svelte';

  let files = $state<FileList>();
  let uploadProgress = $state(0);
  let isUploading = $state(false);
  let analysisResult = $state<any>(null);

  const { helpers: { addToast } } = createToaster();

  async function handleUpload() {
    if (!files?.length) {
      addToast({
        data: {
          title: 'No File Selected',
          description: 'Please select a legal document to upload.',
          type: 'warning'
        }
      });
      return;
    }

    isUploading = true;
    uploadProgress = 0;

    try {
      const formData = new FormData();
      formData.append('file', files[0]);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        analysisResult = await response.json();
        uploadProgress = 100;

        addToast({
          data: {
            title: 'Upload Successful',
            description: 'Legal document has been analyzed successfully.',
            type: 'success'
          }
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      addToast({
        data: {
          title: 'Upload Failed',
          description: 'Failed to upload and analyze document.',
          type: 'error'
        }
      });
    } finally {
      isUploading = false;
    }
  }
</script>

<Card class="w-full max-w-2xl mx-auto">
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <FileUp class="w-5 h-5" />
      Legal Document Upload & Analysis
    </CardTitle>
  </CardHeader>

  <CardContent class="space-y-4">
    <div>
      <label for="file-upload" class="block text-sm font-medium mb-2">
        Select Document (PDF, DOCX, TXT)
      </label>
      <Input
        id="file-upload"
        type="file"
        bind:files
        accept=".pdf,.docx,.txt"
        disabled={isUploading}
      />
    </div>

    {#if isUploading}
      <div class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span>Uploading and analyzing...</span>
          <span>{uploadProgress}%</span>
        </div>
        <Progress value={uploadProgress} class="w-full" />
      </div>
    {/if}

    <Button
      onclick={handleUpload}
      disabled={isUploading || !files?.length}
      class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {#if isUploading}
        <Loader2 class="w-4 h-4 animate-spin mr-2" />
        Analyzing...
      {:else}
        <FileUp class="w-4 h-4 mr-2" />
        Upload & Analyze
      {/if}
    </Button>

    {#if analysisResult}
      <Card class="mt-4">
        <CardHeader>
          <CardTitle>Analysis Results</CardTitle>
        </CardHeader>
        <CardContent>
          <pre class="text-sm whitespace-pre-wrap">{JSON.stringify(analysisResult, null, 2)}</pre>
        </CardContent>
      </Card>
    {/if}
  </CardContent>
</Card>
```

## 🐛 Common TypeScript Fixes

### 1. Svelte 5 State Management

```typescript
// ❌ Old Svelte 4 syntax
let dialogOpen = false;
let selectedValue = "";

// ✅ Svelte 5 runes
let dialogOpen = $state(false);
let selectedValue = $state("");
```

### 2. Component Props

```typescript
// ❌ Old syntax
export let className = "";
export let disabled = false;

// ✅ Svelte 5 syntax
interface Props {
  class?: string;
  disabled?: boolean;
}

let { class: className = "", disabled = false }: Props = $props();
```

### 3. Bindable Props

```typescript
// ❌ Old syntax
export let value = "";

// ✅ Svelte 5 bindable
let { value = $bindable("") } = $props();
```

## 📊 Summary & Best Practices

### ✅ Do's

- Use Bits UI for accessible, headless components
- Use Melt UI for complex state management (toasts, tooltips, etc.)
- Implement consistent styling with Tailwind CSS
- Use proper Svelte 5 runes for state management
- Validate props with TypeScript interfaces
- Test components with Playwright

### ❌ Don'ts

- Don't mix old Svelte 4 syntax with Svelte 5
- Don't use incorrect component import paths
- Don't forget to handle loading and error states
- Don't skip accessibility attributes
- Don't ignore TypeScript errors

### 🎯 Legal AI Specific Patterns

- Always include loading states for AI operations
- Provide clear feedback for file uploads
- Use toast notifications for user actions
- Implement proper error handling for API calls
- Include accessibility features for legal professionals

This guide ensures your Legal AI system uses modern, accessible, and maintainable UI components that provide an excellent user experience for legal professionals.
