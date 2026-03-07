<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Alert  from "$lib/components/ui/alert/Alert.svelte";
  import  Label  from "$lib/components/ui/Label.svelte";
  import  Input  from "$lib/components/ui/Input.svelte";
  interface Props {
    mode?: 'login' | 'register';
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: (user: any) => void;
  }
  let { mode = $bindable('login'), open = $bindable(false), onOpenChange, onSuccess }: Props = $props();
  let formData = $state({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '' });
  let loading = $state(false);
  let error = $state('');
  let success = $state('');
  let emailInput: any = $state(null);
  let passwordInput: any = $state(null);
  let isValid = $derived(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const hasValidEmail = emailRegex.test(formData.email);
    const hasPassword = formData.password.length >= 6;
    if (mode === 'register') {
      const hasConfirmPassword = formData.confirmPassword === formData.password;
      const hasName = formData.firstName.trim() && formData.lastName.trim();
      return hasValidEmail && hasPassword && hasConfirmPassword && hasName;
    }
    return hasValidEmail && hasPassword;
  });
  async function handleSubmit(event?: Event) {
    event?.preventDefault?.();
    loading = true;
    error = '';
    success = '';
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (response.ok) {
        success = result.message || `${mode === 'login' ? 'Login' : 'Registration'} successful!`;
        setTimeout(() => {
          formData = { email: '', password: '', confirmPassword: '', firstName: '', lastName: '' };
          open = $state(false);
          onSuccess?.(result.user);
        }, 1000);
      } else {
        error = result.error || 'Authentication failed';
      }
    } catch (err) {
      error = 'Network error occurred. Please try again.';
    } finally {
      loading = false;
    }
  }
  function toggleMode() {
    mode = mode === 'login' ? 'register' : 'login';
    error = '';
    success = '';
  }
  $effect(() => {
    if (open && emailInput) {
      setTimeout(() => {
        try {
          emailInput?.focus?.();
        } catch {
          /* ignore */
        }
      }, 100);
    }
  });
  $effect(() => {
    if (onOpenChange) onOpenChange(open);
  });
</script>
{#if open}
  <div class="fixed inset-0 z-50 bg-black/80"></div>
  <div
    class="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] nes-container is-dark with-title"
  >
    <p class="title">{mode === 'login' ? 'Login' : 'Register'}</p>
    <!--
    NOTE: Using the non-standard 'onsubmit' attribute intentionally for Svelte 5 runes compatibility.
    See: https://github.com/sveltejs/rfcs/blob/main/text/0127-runes.md and Svelte 5 migration docs.
    If migrating to a different event system or reverting to idiomatic Svelte, use: 'onsubmit={handleSubmit}' instead.
    This workaround is required for compatibility with the current runes-based event handling.
    MIGRATION INSTRUCTIon
    - If you are upgrading away from Svelte 5 runes or restoring standard Svelte event handling,
      replace: 'onsubmit={handleSubmit}' with: 'onsubmit={handleSubmit}' below.
  -->
    <form onsubmit={handleSubmit} class="space-y-4 mt-4">
      {#if success}
        <Alert variant="default" class="nes-text is-success">{success}</Alert>
      {/if}
      {#if error}
        <Alert variant="destructive" class="nes-text is-error">{error}</Alert>
      {/if}
      {#if mode === 'register'}
        <div class="grid grid-cols-2 gap-4">
          <div class="nes-field">
            <Label for="firstName">First Name</Label>
            <Input id="firstName" bind:value={formData.firstName} required class="nes-input" />
          </div>
          <div class="nes-field">
            <Label for="lastName">Last Name</Label>
            <Input id="lastName" bind:value={formData.lastName} required class="nes-input" />
          </div>
        {/if}
      <div class="nes-field">
        <Label for="email">Email</Label>
        <Input bind:this={emailInput} id="email" type="email" bind:value={formData.email} required class="nes-input" />
      </div>
      <div class="nes-field">
        <Label for="password">Password</Label>
        <Input
          bind:this={passwordInput}
          id="password"
          type="password"
          bind:value={formData.password}
          required
          class="nes-input"
        />
      </div>
      {#if mode === 'register'}
        <div class="nes-field">
          <Label for="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            bind:value={formData.confirmPassword}
            required
            class="nes-input"
          />
        {/if}
      <Button type="submit" class="w-full nes-btn is-primary" disabled={loading || !isValid}>
        {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
      </Button>
      <!-- replace deprecated onclick with onclick attribute -->
      <button type="button" onclick={toggleMode} class="nes-btn is-dark is-small">
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </form>
    <button type="button" onclick={() => (open = false)} class="absolute right-4 top-4 nes-btn is-error is-small">
      ×
    </button>
  {/if}
<style>
  /* Place to add any component-specific styles */
</style>
