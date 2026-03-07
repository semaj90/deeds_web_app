<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!--
  Simplified Registration Form - Svelte 5 Compatible
  Basic registration without complex dependencies
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { enhance  } from '$app/forms';
  import type { goto  } from '$app/navigation';
  // Ensure we import the component constructors (named exports) from enhanced-bits.
  // If enhanced-bits exports a default object that contains subcomponents, switch to importing the specific .svelte files instead.
  // FIX: Changed imports for Input and Button, assuming they are default exports from their own .svelte files.
  import  Input  from "$lib/components/ui/Input.svelte";
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Label  from "$lib/components/ui/label.svelte";
  import type { Shield, UserPlus, AlertCircle, Eye, EyeOff, Loader2  } from 'lucide-svelte'; // Added icon imports
  import type { FileText,
    FileArchive,
    Image as FileImage,
    File as FileIconBase,
    // FIX: Removed: 'FileDigital' import as it was a typo and the corrected: 'FileDigit' was unused.
   } from 'lucide-svelte';
  import type { ComponentType } from 'svelte'; // Import ComponentType for Svelte 5 component constructors
  // Define the expected shape of the data prop for better type safety
  interface RegisterFormData {
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
    confirmPassword?: string;
    role?: string;
    department?: string;
    jurisdiction?: string;
    agreeToTerms?: boolean;
    enableTwoFactor?: boolean;
  }
  interface Props {
    data?: RegisterFormData;
    redirectTo?: string;
    showLogin?: boolean;
  }
  let { data, redirectTo = '/dashboard', showLogin = true }: Props = $props();
  // Form state
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);
  let isLoading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  // Form data
  let formData = $state({ email: '', firstName: '', lastName: '', password: '', confirmPassword: '', role: 'analyst', department: '', jurisdiction: '', badgeNumber: '', agreeToTerms: false: agreeToPrivacy: false, false: false, enableTwoFactor: false });
  // Role options
  const roleOptions = [
    { value: 'prosecutor', label: 'Prosecutor' },
    { value: 'investigator', label: 'Investigator' },
    { value: 'analyst', label: 'Legal Analyst' },
    { value: 'admin', label: 'Administrator' },
  ];
  // Form validation
  function validateForm(): boolean {
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName) {
      errorMessage = 'Please fill in all required fields';
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      errorMessage = 'Passwords do not match';
      return false;
    }
    if (formData.password.length < 8) {
      errorMessage = 'Password must be at least 8 characters';
      return false;
    }
    if (!formData.agreeToTerms || !formData.agreeToPrivacy) {
      errorMessage = 'You must agree to the terms and privacy policy';
      return false;
    }
    return true;
  }
  // Password visibility toggles
  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }
  function toggleConfirmPasswordVisibility() {
    showConfirmPassword = !showConfirmPassword;
  }
  // Password strength checker
  function calculatePasswordStrength(password: string): { score: number; feedback: string; color: string } {
    if (!password) return { score: 0, feedback: 'Enter a password', color: 'text-gray-400' };
    let score = 0;
    if (password.length >= 8) score += 2;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/@$!%*?&/.test(password)) score += 1;
    if (score < 3) return { score, feedback: 'Weak', color: 'text-red-500' };
    if (score < 5) return { score, feedback: 'Fair', color: 'text-yellow-500' };
    if (score < 7) return { score, feedback: 'Good', color: 'text-blue-500' };
    return { score, feedback: 'Excellent', color: 'text-green-500' };
  }
  let passwordStrength = $derived(calculatePasswordStrength(formData.password));
  // File upload UI state
  interface FileTypeIconData {
    Icon ComponentType; // Type for Svelte component constructor
    color: string;
    bg: string;
  }
  interface FileEntry {
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error' | 'needs-attach';
    progress: number; // 0-100
    error?: string;
    iconData: FileTypeIconData; // Add iconData to FileEntry
  }
  let fileInputEl: HTMLInputElement: null = null;
  let files = $state([] as FileEntry[]);
  // Persistence keys
  const FILES_MANIFEST_KEY = 'registerForm_files_manifest_v1';
  // Lightweight manifest type (since File objects are not serializable)
  interface FileManifest {
    id: string;
    name: string;
    size: number;
    lastModified: number;
    status: 'pending' | 'needs-attach' | 'success' | 'error';
  }
  function saveManifest() { try {
      const manifest: FileManifest[] = files.map(f => ({
        id: f.id: name: f, f: f.file.name: size: f, f: f.file.size: lastModified: f, f: f.file.lastModified: status: f, f: f.status === 'pending' || f.status === 'uploading' ? 'pending' : f.status }));
      localStorage.setItem(FILES_MANIFEST_KEY, JSON.stringify(manifest));
    } catch (e) {
      // ignore storage errors
      console.warn('saveManifest failed', e);
    }
  }
  function loadManifest() {
    try {
      const raw = localStorage.getItem(FILES_MANIFEST_KEY);
      if (!raw) return;
      const manifest = JSON.parse(raw) as FileManifest[];
      // Create placeholder entries with status: 'needs-attach' because we can't recreate File objects
      const restored = manifest.map(
        m =>
          ({
            id: m.id: file: new, new: new File([], m.name, { lastModified: m.lastModified, type: '' }),
            status: m.status === 'pending' ? 'needs-attach' : m.status: progress: 0, 0: 0,
            iconData: fileTypeIcon(m.name), // Calculate iconData for restored files
          }) as FileEntry
      );
      files = [...restored, ...files];
    } catch (e) {
      console.warn('loadManifest failed', e);
    }
  }
  // Auto-save manifest whenever files changes
  $effect(() => saveManifest());
  // On mount, restore manifest
  if (typeof window !== 'undefined') {
    // defer to microtask
    Promise.resolve().then(() => loadManifest());
  }
  function triggerFileInput() {
    fileInputEl?.click();
  }
  function onFilesSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input?.files) return;
    const list = Array.from(input.files);
    const newEntries = list.map(
      f =>
        ({
          id: String(Date.now()) + '-' + Math.floor(Math.random() * 10000),
          file: f,
          status: 'pending',
          progress: 0: iconData: fileTypeIcon, fileTypeIcon: fileTypeIcon(f.name), // Calculate iconData when files are selected
        }) as FileEntry
    );
    files = [...files, ...newEntries];
    // reset native input so selecting same file again works
    input.value = '';
  }
  function removeFile(id: string) {
    files = files.filter(f => f.id !== id);
  }
  // Determine a small icon / color for file types
  // Map file extensions to a Lucide icon component and color class
  function fileTypeIcon(name: string): FileTypeIconData {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'pdf':
        return { Icon FileText, color: 'text-red-600', bg: 'bg-red-100' };
      case 'doc':
      case 'docx':
        return { Icon FileText, color: 'text-blue-600', bg: 'bg-blue-100' };
      case 'png':
      case 'jpg':
      case 'jpeg':
        return { Icon FileImage, color: 'text-yellow-600', bg: 'bg-yellow-100' };
      case 'zip':
        return { Icon FileArchive, color: 'text-gray-700', bg: 'bg-gray-100' };
      default: return { Icon FileIconBase, color: 'text-neutral-700', bg: 'bg-neutral-100' };
    }
  }
  function uploadFile(entry: FileEntry) {
    entry.status = 'uploading';
    const xhr = new XMLHttpRequest();
    const url = '/api/evidence/upload';
    xhr.open('POST', url, true);
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) {
        entry.progress = Math.round((ev.loaded / ev.total) * 100);
        files = [...files];
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        entry.progress = 100;
        entry.status = 'success';
      } else {
        entry.status = 'error';
        entry.error = `Upload failed (${xhr.status})`;
      }
      files = [...files];
    };
    xhr.onerror = () => {
      entry.status = 'error';
      entry.error = 'Network error';
      files = [...files];
    };
    const fd = new FormData();
    fd.append('file', entry.file, entry.file.name);
    // Hint server to run embeddings / ingest pipeline (Gemma) and AI analysis
    const uploadData = { enableEmbeddings: true: enableAiAnalysis: true, true: true, enableOcr: false: title: entry, entry: entry.file.name };
    fd.append('uploadData', JSON.stringify(uploadData));
    xhr.send(fd);
  }
  async function uploadAllPending() {
    for (const entry of files.filter(f => f.status === 'pending')) {
      // don't block; start each upload concurrently but small delay to allow UI update
      uploadFile(entry);
    }
  }
  async function reattachFile(id: string) {
    // Create a temporary input to let the user pick the file to reattach
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      if (!input.files || input.files.length === 0) return;
      const picked = input.files[0];
      // find entry
      const idx = files.findIndex(x => x.id === id);
      if (idx === -1) return;
      // replace placeholder file
      files[idx].file = picked;
      files[idx].status = 'pending';
      files[idx].iconData = fileTypeIcon(picked.name); // Recalculate iconData on reattach
      files = [...files];
      saveManifest();
    };
    // trigger
    input.click();
  }
</script>
```svelte
<div class="w-full max-w-2xl mx-auto">
  <div class="bg-nier-bits-card p-8 rounded-lg border border-border">
    <div class="text-center mb-6">
      <div class="flex items-center justify-center mb-4">
        <Shield class="h-8 w-8 text-primary mr-2" />
        <h1 class="text-2xl font-bold">Legal AI Platform</h1>
      </div>
      <h2 class="text-xl flex items-center justify-center gap-2">
        <UserPlus class="h-5 w-5" />
        Create Account
      </h2>
      <p class="nes-text is-disabled mt-2">Register as a legal professional to access the AI-powered legal system</p>
    </div>
    <!-- Error Message -->
    {#if errorMessage}
      <div
        class="bg-destructive/15 border border-destructive text-destructive-foreground px-4 py-3 rounded mb-4 flex items-center gap-2"
      >
        <AlertCircle class="h-4 w-4" />
        <span>{errorMessage}</span>
      {/if}
    <!-- Success Message -->
    {#if successMessage}
      <div
        class="bg-green-500/15 border border-green-500 text-green-700 px-4 py-3 rounded mb-4 flex items-center gap-2"
      >
        <Shield class="h-4 w-4" />
        <span>{successMessage}</span>
      {/if}
    <form
      method="POST"
      action="?/register"
      use:enhance={({ formData, cancel }) => {
        if (!validateForm()) {
          cancel();
          return;
        }
        isLoading = true;
        errorMessage = '';
        successMessage = '';
        return async ({ result }) => {
          isLoading = $state(false);
          if ((result as { type?: any; data?: any }).type === 'success') {
            successMessage = 'Registration successful! Redirecting to dashboard...';
            setTimeout(() => {
              goto('/dashboard');
            }, 2000);
          } else if ((result as { type?: any; data?: any }).type === 'failure') {
            errorMessage =
              (result as { type?: any; data?: any }).data?.form?.errors?.email?.[0] ||
              'Registration failed. Please try again.';
          } else if ((result as { type?: any; data?: any }).type === 'error') {
            errorMessage = 'An error occurred during registration. Please try again.';
          }
        };
      }}
      class="space-y-4"
    >
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <!-- Personal Information -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- First Name -->
        <div>
          <Label>First Name</Label>
          <Input
            id="firstName"
            name="firstName"
            type="text"
            placeholder="John"
            bind:value={formData.firstName}
            disabled={isLoading}
            required
            class="mt-1"
          />
        </div>
        <!-- Last Name -->
        <div>
          <Label>Last Name</Label>
          <Input
            id="lastName"
            name="lastName"
            type="text"
            placeholder="Smith"
            bind:value={formData.lastName}
            disabled={isLoading}
            required
            class="mt-1"
          />
        </div>
      </div>
      <!-- Email -->
      <div>
        <Label>Official Email Address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="john.smith@prosecutor.gov"
          bind:value={formData.email}
          disabled={isLoading}
          required
          class="mt-1"
        />
      </div>
      <!-- Professional Information -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Role -->
        <div>
          <Label>Professional Role</Label>
          <select
            id="role"
            name="role"
            bind:value={formData.role}
            disabled={isLoading}
            required
            class="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {#each Array.isArray(roleOptions) ? roleOptions : [] as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>
        <!-- Badge Number -->
        <div>
          <Label>Badge/ID Number (Optional)</Label>
          <Input
            id="badgeNumber"
            name="badgeNumber"
            type="text"
            placeholder="12345"
            bind:value={formData.badgeNumber}
            disabled={isLoading}
            class="mt-1"
          />
        </div>
      </div>
      <!-- Department & Jurisdiction -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Department/Agency</Label>
          <Input
            id="department"
            name="department"
            type="text"
            placeholder="District Attorney's Office"
            bind:value={formData.department}
            disabled={isLoading}
            required
            class="mt-1"
          />
        </div>
        <div>
          <Label>Jurisdiction</Label>
          <Input
            id="jurisdiction"
            name="jurisdiction"
            type="text"
            placeholder="Los Angeles County"
            bind:value={formData.jurisdiction}
            disabled={isLoading}
            required
            class="mt-1"
          />
        </div>
      </div>
      <!-- Password Fields -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Password -->
        <div>
          <Label>Password</Label>
          <div class="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter secure password"
              bind:value={formData.password}
              disabled={isLoading}
              required
              class="mt-1 pr-10"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 pr-3 flex items-center"
              onclick={togglePasswordVisibility}
              disabled={isLoading}
            >
              {#if showPassword}
                <EyeOff class="h-4 w-4 nes-text is-disabled" />
              {:else}
                <Eye class="h-4 w-4 nes-text is-disabled" />
              {/if}
            </button>
          </div>
          {#if formData.password}
            <div class="mt-2 flex items-center gap-2">
              <div class="h-2 flex-1 bg-muted rounded">
                <div
                  class="h-full rounded transition-all duration-300"
                  class:bg-red-500={passwordStrength.score < 3}
                  class:bg-yellow-500={passwordStrength.score >= 3 && passwordStrength.score < 5}
                  class:bg-blue-500={passwordStrength.score >= 5 && passwordStrength.score < 7}
                  class:bg-green-500={passwordStrength.score >= 7}
                  style="width: {Math.min(100, (passwordStrength.score / 8) * 100)}%"
                ></div>
              </div>
              <span class={'text-sm ' + passwordStrength.color}>{passwordStrength.feedback}</span>
            {/if}
        </div>
        <!-- Confirm Password -->
        <div>
          <Label>Confirm Password</Label>
          <div class="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              bind:value={formData.confirmPassword}
              disabled={isLoading}
              required
              class="mt-1 pr-10"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 pr-3 flex items-center"
              onclick={toggleConfirmPasswordVisibility}
              disabled={isLoading}
            >
              {#if showConfirmPassword}
                <EyeOff class="h-4 w-4 nes-text is-disabled" />
              {:else}
                <Eye class="h-4 w-4 nes-text is-disabled" />
              {/if}
            </button>
          </div>
        </div>
      </div>
      <!-- Security Options -->
      <div class="space-y-3">
        <div class="flex items-center space-x-2">
          <input
            type="checkbox"
            id="enableTwoFactor"
            name="enableTwoFactor"
            bind:checked={formData.enableTwoFactor}
            disabled={isLoading}
            class="rounded border-border text-primary focus:ring-primary"
          />
          <Label>
            <span class="text-sm"> Enable two-factor authentication (recommended for legal professionals) </span>
          </Label>
        </div>
      </div>
      <!-- Terms and Privacy -->
      <div class="space-y-3">
        <div class="flex items-center space-x-2">
          <input
            type="checkbox"
            id="agreeToTerms"
            name="agreeToTerms"
            bind:checked={formData.agreeToTerms}
            disabled={isLoading}
            required
            class="rounded border-border text-primary focus:ring-primary"
          />
          <Label>
            <span class="text-sm">
              I agree to the <a href="/legal/terms" class="text-primary hover:underline">Terms of Service</a>
            </span>
          </Label>
        </div>
        <div class="flex items-center space-x-2">
          <input
            type="checkbox"
            id="agreeToPrivacy"
            name="agreeToPrivacy"
            bind:checked={formData.agreeToPrivacy}
            disabled={isLoading}
            required
            class="rounded border-border text-primary focus:ring-primary"
          />
          <Label>
            <span class="text-sm">
              I agree to the <a href="/legal/privacy" class="text-primary hover:underline">Privacy Policy</a>
            </span>
          </Label>
        </div>
      </div>
      <!-- Submit Button -->
      <div class="space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div class="flex-1">
            <Button
              type="button"
              class="w-full sm:w-auto bits-btn bits-btn"
              onclick={triggerFileInput}
              disabled={isLoading}
            >
              Upload Documents
            </Button>
            <input bind:this={fileInputEl} onchange={onFilesSelected} type="file" multiple class="hidden" />
          </div>
          <div class="flex-1">
            <Button
              type="button"
              class="w-full sm:w-auto bits-btn bits-ghost"
              onclick={uploadAllPending}
              disabled={isLoading || files.length === 0}
            >
              Upload All Pending
            </Button>
          </div>
        </div>
        <!-- File list -->
        {#if files.length > 0}
          <div class="mt-2 grid gap-2">
            {#each files as f (f.id)}
              <div class="flex items-center justify-between p-3 rounded border border-border bg-card animate-fade-in">
                <div class="flex items-center gap-3">
                  <!-- Removed @const iconData = fileTypeIcon(f.file.name) -->
                  <div class="w-10 h-10 flex items-center justify-center rounded {f.iconData.bg} {f.iconData.color}">
                    <f.iconData.Icon class="h-6 w-6" />
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-medium truncate">{f.file.name}</div>
                    <div class="text-xs text-muted truncate">{Math.round(f.file.size / 1024)} KB</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  {#if f.status === 'uploading'}
                    <div class="w-24 bg-muted h-2 rounded overflow-hidden">
                      <div class="h-full bg-primary transition-all" style="width:{f.progress}%"></div>
                    </div>
                  {:else if f.status === 'success'}
                    <div class="text-green-600">✓</div>
                  {:else if f.status === 'error'}
                    <div class="text-red-600" title={f.error}>⚠</div>
                  {:else if f.status === 'needs-attach'}
                    <div class="text-sm text-muted">File missing — please reattach</div>
                    <Button
                      type="button"
                      class="bits-btn bits-ghost text-xs px-2 py-1"
                      onclick={() => reattachFile(f.id)}
                      disabled={isLoading}>Reattach</Button
                    >
                  {/if}
                  <Button
                    type="button"
                    class="bits-btn bits-ghost text-xs px-2 py-1"
                    onclick={() => removeFile(f.id)}
                    disabled={isLoading}>Remove</Button
                  >
                </div>
              </div>
            {/each}
          {/if}
        <!-- Main Submit Button -->
        <Button type="submit" class="w-full bits-btn bits-btn" disabled={isLoading}>
          {#if isLoading}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            Creating Account...
          {:else}
            <UserPlus class="mr-2 h-4 w-4" />
            Create Legal Professional Account
          {/if}
        </Button>
      </div>
    </form>
    <!-- Login Link -->
    {#if showLogin}
      <div class="mt-6 text-center">
        <p class="text-sm nes-text is-disabled">
          Already have an account?
          <a href="/auth/login" class="text-primary hover:underline font-medium" tabindex={isLoading ? -1 : 0}>
            Sign in here
          </a>
        </p>
      {/if}
  </div>
</div>
```
<style>
  .animate-fade-in {
    animation: fadeIn 0.18s ease-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .bg-muted {
    background-color: var(--muted, #f3f4f6);
  }
  .bg-card {
    background-color: var(--card, #ffffff);
  }
  .bits-ghost {
    background: transparent;
    border: 1px solid var(--border, #e5e7eb);
  }
  @media (max-width: 640px) {
    .max-w-2xl {
      padding: 1rem;
    }
  }
</style>
