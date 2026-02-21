<script lang="ts">
  import Alert from '$lib/components/ui/alert/Alert.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    mode?: 'login' | 'register';
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: (user: any) => void;
  }

  let {
    mode = $bindable('login'),
    open = $bindable(false),
    onOpenChange,
    onSuccess
  }: Props = $props();

  let formData = $state({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });
  let loading = $state(false);
  let error = $state('');
  let success = $state('');
  let emailInput = $state<HTMLInputElement | null>(null);

  let isValid = $derived.by(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const hasValidEmail = emailRegex.test(formData.email);
    const hasPassword = formData.password.length >= 6;
    if (mode === 'register') {
      const hasConfirmPassword = formData.confirmPassword === formData.password;
      const hasName = formData.firstName.trim() && formData.lastName.trim();
      return hasValidEmail && hasPassword && hasConfirmPassword && !!hasName;
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
        body: JSON.stringify(formData)
      });
      const result = await response.json();
      if (response.ok) {
        success = result.message || `${mode === 'login' ? 'Login' : 'Registration'} successful!`;
        setTimeout(() => {
          formData = { email: '', password: '', confirmPassword: '', firstName: '', lastName: '' };
          open = false;
          onSuccess?.(result.user);
        }, 1000);
      } else {
        error = result.error ?? 'Authentication failed';
      }
    } catch {
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
      setTimeout(() => emailInput?.focus?.(), 100);
    }
  });

  $effect(() => {
    if (onOpenChange) onOpenChange(open);
  });
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/50" role="presentation"></div>
  <div class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 nes-container is-dark">
    <p class="title">{mode === 'login' ? 'Login' : 'Register'}</p>

    <form onsubmit={handleSubmit} class="space-y-4">
      {#if success}
        <Alert variant="default" class="nes-text">{success}</Alert>
      {/if}
      {#if error}
        <Alert variant="destructive" class="nes-text">{error}</Alert>
      {/if}

      {#if mode === 'register'}
        <div class="grid grid-cols-2 gap-2">
          <div class="nes-field">
            <label for="firstName">First Name</label>
            <input id="firstName" bind:value={formData.firstName} required class="nes-input" />
          </div>
          <div class="nes-field">
            <label for="lastName">Last Name</label>
            <input id="lastName" bind:value={formData.lastName} required class="nes-input" />
          </div>
        </div>
      {/if}

      <div class="nes-field">
        <label for="email">Email</label>
        <input bind:this={emailInput} id="email" type="email" bind:value={formData.email} required class="nes-input" />
      </div>

      <div class="nes-field">
        <label for="password">Password</label>
        <input id="password" type="password" bind:value={formData.password} required class="nes-input" />
      </div>

      {#if mode === 'register'}
        <div class="nes-field">
          <label for="confirmPassword">Confirm Password</label>
          <input id="confirmPassword" type="password" bind:value={formData.confirmPassword} required class="nes-input" />
        </div>
      {/if}

      <Button type="submit" class="w-full nes-btn is-primary" disabled={loading || !isValid}>
        {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
      </Button>

      <button type="button" onclick={toggleMode} class="nes-btn is-dark w-full">
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </form>

    <button type="button" onclick={() => (open = false)} class="absolute right-4 top-4 nes-btn is-error is-small">
      &times;
    </button>
  </div>
{/if}
