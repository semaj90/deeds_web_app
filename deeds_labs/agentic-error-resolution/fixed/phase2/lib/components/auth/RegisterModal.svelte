<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  // removed bits-ui Dialog import (module types didn't export Dialog.*). Using a local modal markup below.
  // cast helper type to satisfy sveltekit-superforms zod adapter typing
  import type { ZodTypeAny } from 'zod';
  import  Button  from "$lib/components/ui/button/Button.svelte";
  import X from 'lucide-svelte';
  import type { superForm  } from 'sveltekit-superforms';
  import type { zod  } from 'sveltekit-superforms/adapters';
  import type { registerSchema  } from '$lib/schemas/auth';
  interface Props {
    onsuccess?: () => void;
    open?: boolean;
  }
  let { onsuccess, open = $bindable() }: Props = $props();
  const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const emailId = generateId('register-email');
  const passwordId = generateId('register-password');
  const confirmPasswordId = generateId('register-confirm-password');
  const termsId = generateId('register-terms'); // new unique id for checkbox
  const { form, errors, enhance, submitting, message } = superForm(
    {
      email: '',
      password: '',
      confirmPassword: '',
      termsAccepted: false
    },
    {
      // cast the schema to ZodTypeAny to avoid the adapter's strict generic requirement
      validators: zod(registerSchema as unknown as ZodTypeAny),
      onUpdate({ form: f }) {
        if (f.valid) {
          onsuccess?.();
          open = $state(false);
        }
      }
    }
  );
  function closeModal() {
    open = $state(false);
  }
  function handleOverlayKeydown(e: KeyboardEvent) {
    // Allow Enter / Space to activate the overlay (close) and Escape to close as well
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      closeModal();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }
</script>
{#if open}
  <!-- Overlay: click or keyboard to close -->
  <button
    type="button"
    class="fixed inset-0 bg-black/80 z-50"
    onclick={closeModal}
    onkeydown={handleOverlayKeydown}
    aria-label="Close dialog"
  ></button>
  <!-- Modal content -->
  <div
    class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-lg"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-slate-900">Create Account</h2>
      <button
        type="button"
        class="p-1 hover:bg-slate-100 rounded"
        onclick={closeModal}
        aria-label="Close"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    {#if $message}
      <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
        {$message}
      {/if}
    <form class="space-y-4" method="POST" action="/api/auth/register" use:enhance>
      <div>
        <label for={emailId} class="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email"
          name="email"
          id={emailId}
          bind:value={$form.email}
          class="w-full px-3 py-2 border {$errors.email ? 'border-red-500' : 'border-slate-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="you@example.com"
        />
        {#if $errors.email}
          <p class="text-red-600 text-xs mt-1">{$errors.email}</p>
        {/if}
      </div>
      <div>
        <label for={passwordId} class="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          type="password"
          name="password"
          id={passwordId}
          bind:value={$form.password}
          class="w-full px-3 py-2 border {$errors.password ? 'border-red-500' : 'border-slate-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="••••••••"
        />
        {#if $errors.password}
          <p class="text-red-600 text-xs mt-1">{$errors.password}</p>
        {/if}
      </div>
      <div>
        <label for={confirmPasswordId} class="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
        <input
          type="password"
          name="confirmPassword"
          id={confirmPasswordId}
          bind:value={$form.confirmPassword}
          class="w-full px-3 py-2 border {$errors.confirmPassword ? 'border-red-500' : 'border-slate-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="••••••••"
        />
        {#if $errors.confirmPassword}
          <p class="text-red-600 text-xs mt-1">{$errors.confirmPassword}</p>
        {/if}
      </div>
      <div class="flex items-start gap-2">
        <input
          type="checkbox"
          id={termsId}
          name="termsAccepted"
          bind:checked={$form.termsAccepted}
          class="mt-1 w-4 h-4 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
        />
        <label for={termsId} class="text-sm text-slate-600">
          I agree to the <a href="/terms" class="text-blue-600 hover:underline">Terms of Service</a> and
          <a href="/privacy" class="text-blue-600 hover:underline">Privacy Policy</a>
        </label>
      </div>
      {#if $errors.termsAccepted}
        <p class="text-red-600 text-xs mt-1">{$errors.termsAccepted}</p>
      {/if}
      <div class="flex gap-3 justify-end pt-4">
        <Button
          type="button"
          onclick={closeModal}
          variant="secondary"
          class="px-4 py-2 bg-slate-200 text-slate-900 rounded hover:bg-slate-300"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={$submitting || !$form.termsAccepted}
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {#if $submitting}
            Creating...
          {:else}
            Register
          {/if}
        </Button>
      </div>
    </form>
  {/if}
