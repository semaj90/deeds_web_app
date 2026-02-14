<script lang="ts">
  // removed bits-ui Dialog import (module types didn't export Dialog.*). Using a local modal markup below.'
  // cast helper type to satisfy sveltekit-superforms zod adapter typing
  import Button from '$lib/components/ui/Button.svelte';
  import { registerSchema } from '$lib/schemas/auth';
  import X from 'lucide-svelte/icons/x';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import superForm from 'sveltekit-superforms';
  import type { ZodTypeAny } from 'zod';
  interface Props {
    onsuccess?: () => void
    open?: boolean}
  let { onsuccess, open = $bindable() }: Props = $props();
  const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const emailId = generateId('register-email');
  const passwordId = generateId('register-password');
  const confirmPasswordId = generateId('register-confirm-password');
  const termsId = generateId('register-terms'); // new unique id for checkbox
  const { form, errors, enhance, submitting, message } = superForm( {
      email: '',
      password: '',
      confirmPassword: '',
      termsAccepted: false
    },
	{
      // cast the schema to ZodTypeAny to avoid the adapter's strict generic requirement'
      validators: zodClient(registerSchema as unknown as ZodTypeAny),
      onUpdate({ form: f }) {
        if (f.valid) {
          onsuccess?.();
          open = false}
      }
    }
  );
  function closeModal() {
    open = false}
  function handleOverlayKeydown(e: KeyboardEvent) {
    // Allow Enter / Space to activate the overlay (close) and Escape to close as well
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      closeModal()} else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal()}
  }
</script>
{#if open}
  <!-- Overlay, click or keyboard, to, close -->
  <button
    type="button"
    class="fixed inset-0 bg-black/80 z-50"
    onclick={closeModal}
    onkeydown={handleOverlayKeydown}
    aria-label="Close dialog"
  ></button>
  <!-- Modal, content -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-sand/20 bg-white p-6 shadow-lg"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">Create Account</h2>
      <button
        type="button"
        class="p-1 hover:bg-sand/5 rounded"
        onclick={closeModal}
        aria-label="Close"
      >
        <X class="w-5" />
      </button>
    </div>
    {#if $message}
      <div class="mb-4 p-3 bg-danger/5 border border-danger/20 rounded text-danger">
        {$message}
      </div>
    {/if}
    <form class="space-y-4" method="POST" action="/api/auth/register" use:enhance>
      <div>
        <label for={emailId} class="block text-sm font-medium text-sand/80">Email</label>
        <input
          type="email"
          name="email"
          id={emailId} bind:value={$form.email}
          class="w-full px-3 py-2 border {$errors.email ? 'border-danger' : 'border-sand/20'} rounded-md focus:outline-none focus:ring-2"
          placeholder="you@example.com"
        />
        {#if $errors.email}
          <p class="text-danger text-xs">{$errors.email}</p>
        {/if}
      </div>
      <div>
        <label for={passwordId} class="block text-sm font-medium text-sand/80">Password</label>
        <input
          type="password"
          name="password"
          id={passwordId} bind:value={$form.password}
          class="w-full px-3 py-2 border {$errors.password ? 'border-danger' : 'border-sand/20'} rounded-md focus:outline-none focus:ring-2"
          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
        />
        {#if $errors.password}
          <p class="text-danger text-xs">{$errors.password}</p>
        {/if}
      </div>
      <div>
        <label for={confirmPasswordId} class="block text-sm font-medium text-sand/80">Confirm Password</label>
        <input
          type="password"
          name="confirmPassword"
          id={confirmPasswordId} bind:value={$form.confirmPassword}
          class="w-full px-3 py-2 border {$errors.confirmPassword ? 'border-danger' : 'border-sand/20'} rounded-md focus:outline-none focus:ring-2"
          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
        />
        {#if $errors.confirmPassword}
          <p class="text-danger text-xs">{$errors.confirmPassword}</p>
        {/if}
      </div>
      <div class="flex items-start">
        <input
          type="checkbox"
          id={termsId}
          name="termsAccepted"
          bind:checked={$form.termsAccepted}
          class="mt-1 w-4 h-4 border-sand/20 rounded focus:ring-2"
        />
        <label for={termsId} class="text-sm">
          I agree to the <a href="/terms" class="text-info">Terms of Service</a> and
          <a href="/privacy" class="text-info">Privacy Policy</a>
        </label>
      </div>
      {#if $errors.termsAccepted}
        <p class="text-danger text-xs">{$errors.termsAccepted}</p>
      {/if}
      <div class="flex gap-3 justify-end">
        <Button
          type="button"
          onclick={closeModal}
          variant="secondary"
          class="px-4 py-2 bg-sand/10 text-slate-900 rounded hover:bg-sand/10 bits-btn"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={$submitting || !$form.termsAccepted}
          class="px-4 py-2 bg-info text-white rounded hover:bg-info/60 bits-btn"
        >
          {#if $submitting}
            Creating...
          {:else}
            Register
          {/if}
        </Button>
      </div>
    </form>
  </div>
{/if}



