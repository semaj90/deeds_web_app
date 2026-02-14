<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { mcpGPUOrchestrator } from '$lib/services/mcp-gpu-orchestrator.js';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  // UI Components
  import * as Dialog from "$lib/components/ui/dialog";
  import Button from "$lib/components/ui/button";
  import Input from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Alert from "$lib/components/ui/alert";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Progress } from "$lib/components/ui/progress";
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';

  interface Props {
    mode?: 'login' | 'register';
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: (user: any) => void;
    allowGuestMode?: boolean;
    loading?: boolean;
    class?: string;
    id?: string;
    'data-testid'?: string;
  }

  let {
    mode = $bindable('login'),
    open = $bindable(false),
    onOpenChange,
    onSuccess,
    allowGuestMode = false,
    loading = false,
    class: className = '',
    id,
    'data-testid': testId
  }: Props = $props();

  // Form State
  let formData = $state({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    acceptTerms: false,
    rememberMe: false
  });

  let formState = $state({
    loading: false,
    error: '',
    success: '',
    passwordStrength: 0,
    showPassword: false,
    showConfirmPassword: false,
    emailExists: false,
    verificationSent: false
  });

  // Removed unused ref variables - not needed in Svelte 5

  // Validation
  let validation = $derived.by(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const hasValidEmail = emailRegex.test(formData.email);
    const hasStrongPassword = formData.password.length >= 8;
    // Simplified strength check for UI feedback, detailed check in strength calculation

    if (mode === 'register') {
      const passwordsMatch = formData.confirmPassword === formData.password;
      const hasName = formData.firstName.trim().length >= 2 && formData.lastName.trim().length >= 2;
      const termsAccepted = formData.acceptTerms;
      return {
        isValid: hasValidEmail && hasStrongPassword && passwordsMatch && hasName && termsAccepted,
        hasValidEmail,
        hasStrongPassword,
        passwordsMatch,
        hasName,
        termsAccepted
      };
    }
    return {
      isValid: hasValidEmail && formData.password.length >= 1,
      hasValidEmail,
      hasStrongPassword: true,
      passwordsMatch: true,
      hasName: true,
      termsAccepted: true
    };
  });

  // Strength Calculation
  $effect(() => {
    const password = formData.password;
    if (!password) {
        formState.passwordStrength = 0;
        return;
    }
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[a-z]/.test(password)) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password)) strength += 15;
    if (/[@$!%*?&]/.test(password)) strength += 10;
    formState.passwordStrength = Math.min(strength, 100);
  });

  // Check Email
  async function checkEmailExists() {
    if (!validation.hasValidEmail || mode !== 'register') return;
    try {
      const response = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email })
      });
      const result = await response.json();
      formState.emailExists = result.exists;
    } catch (error) {
      console.error('Email check failed:', error);
    }
  }

  // Effect for email checking
  $effect(() => {
      const timer = setTimeout(() => {
          if (formData.email && mode === 'register') checkEmailExists();
      }, 500);
      return () => clearTimeout(timer);
  });

  // Focus management

  async function getClientIP(): Promise<string> {
      try {
          const res = await fetch('https://api.ipify.org?format=json');
          const data = await res.json();
          return data.ip;
      } catch {
          return 'unknown';
      }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    formState.loading = true;
    formState.error = '';
    formState.success = '';

    try {
      const ipAddress = await getClientIP();
      const authContext = {
        mode,
        email: formData.email,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        ipAddress,
        passwordStrength: formState.passwordStrength
      };

      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ ...formData, securityContext: authContext })
      });

      const result = await response.json();

      if (response.ok) {
        formState.success = result.message || `${mode === 'login' ? 'Login' : 'Registration'} successful!`;
        if (mode === 'register' && result.requiresVerification) {
            formState.verificationSent = true;
            formState.success = 'Please check your email to verify your account.';
        }

        await invalidateAll();

        setTimeout(() => {
            resetForm();
            open = false;
            onSuccess?.(result.user);
        }, mode === 'register' && result.requiresVerification ? 3000 : 1500);
      } else {
        formState.error = result.error || 'Authentication failed';
      }
    } catch (err) {
      formState.error = 'Network error occurred. Please try again.';
      console.error('Auth error:', err);
    } finally {
      formState.loading = false;
    }
  }

  async function handleGuestLogin() {
      if (!allowGuestMode) return;
      formState.loading = true;
      try {
          const response = await fetch('/api/auth/guest', { method: 'POST' });
          const result = await response.json();
          if (response.ok) {
              open = false;
              onSuccess?.(result.user);
              await invalidateAll();
          }
      } catch (e) {
          console.error('Guest login failed', e);
      } finally {
          formState.loading = false;
      }
  }

  function resetForm() {
    formData = { email: '', password: '', confirmPassword: '', firstName: '', lastName: '', acceptTerms: false, rememberMe: false };
    formState = { loading: false, error: '', success: '', passwordStrength: 0, showPassword: false, showConfirmPassword: false, emailExists: false, verificationSent: false };
  }

  function toggleMode() {
      mode = mode === 'login' ? 'register' : 'login';
      formState.error = '';
      formState.success = '';
  }
</script>

<Dialog.Root bind:open onOpenChange={onOpenChange}>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</Dialog.Title>
      <Dialog.Description>
        {mode === 'login' ? 'Enter your credentials to access your account.' : 'Fill in the details to get started.'}
      </Dialog.Description>
    </Dialog.Header>

    {#if formState.success}
      <Alert.Root variant="default" class="bg-accent/5 text-accent border-accent/20">
        <CheckCircle class="h-4 w-4" />
        <Alert.Title>Success</Alert.Title>
        <Alert.Description>{formState.success}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if formState.error}
      <Alert.Root variant="destructive">
        <AlertCircle class="h-4 w-4" />
        <Alert.Title>Error</Alert.Title>
        <Alert.Description>{formState.error}</Alert.Description>
      </Alert.Root>
    {/if}

    <form onsubmit={handleSubmit} class="grid gap-4 py-4">
      {#if mode === 'register'}
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label for="firstName">First name</Label>
            <Input id="firstName" bind:value={formData.firstName} required />
          </div>
          <div class="grid gap-2">
            <Label for="lastName">Last name</Label>
            <Input id="lastName" bind:value={formData.lastName} required />
          </div>
        </div>
      {/if}

      <div class="grid gap-2">
        <Label for="email">Email</Label>
        <Input id="email" type="email" bind:value={formData.email} placeholder="name@example.com" required />
        {#if formState.emailExists && mode === 'register'}
            <p class="text-xs text-danger">Email already registered</p>
        {/if}
      </div>

      <div class="grid gap-2">
        <Label for="password">Password</Label>
        <div class="relative">
             <Input id="password" type={formState.showPassword ? 'text' : 'password'} bind:value={formData.password} required />
             <button type="button" class="absolute right-3 top-2.5 text-sand/60 hover:text-sand/80" onclick={() => formState.showPassword = !formState.showPassword}>
                 {#if formState.showPassword}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
             </button>
        </div>
        {#if mode === 'register' && formData.password}
            <Progress value={formState.passwordStrength} class="h-2" />
            <p class="text-xs text-muted-foreground">{formState.passwordStrength}% strength</p>
        {/if}
      </div>

      {#if mode === 'register'}
        <div class="grid gap-2">
            <Label for="confirmPassword">Confirm Password</Label>
            <div class="relative">
                <Input id="confirmPassword" type={formState.showConfirmPassword ? 'text' : 'password'} bind:value={formData.confirmPassword} required />
                <button type="button" class="absolute right-3 top-2.5 text-sand/60 hover:text-sand/80" onclick={() => formState.showConfirmPassword = !formState.showConfirmPassword}>
                    {#if formState.showConfirmPassword}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
                </button>
            </div>
            {#if !validation.passwordsMatch && formData.confirmPassword}
                <p class="text-xs text-danger">Passwords do not match</p>
            {/if}
        </div>

        <div class="flex items-center space-x-2">
            <Checkbox id="terms" name="terms" class="" bind:checked={formData.acceptTerms} />
            <Label for="terms" class="text-sm font-normal">I agree to the terms and service</Label>
        </div>
      {/if}

      {#if mode === 'login'}
        <div class="flex items-center space-x-2">
            <Checkbox id="remember" name="remember" class="" bind:checked={formData.rememberMe} />
            <Label for="remember" class="text-sm font-normal">Remember me</Label>
        </div>
      {/if}

      <div class="flex flex-col gap-2 mt-2">
          <Button type="submit" disabled={formState.loading || !validation.isValid}>
            {#if formState.loading}
                <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                Please wait
            {:else}
                {mode === 'login' ? 'Sign In' : 'Create Account'}
            {/if}
          </Button>

          {#if allowGuestMode && mode === 'login'}
            <Button variant="outline" type="button" onclick={handleGuestLogin} disabled={formState.loading}>
                Continue as Guest
            </Button>
          {/if}
      </div>
    </form>

    <div class="mt-4 text-center text-sm">
        {#if mode === 'login'}
            Don't have an account? <button class="underline hover:text-primary" onclick={toggleMode}>Sign up</button>
        {:else}
            Already have an account? <button class="underline hover:text-primary" onclick={toggleMode}>Sign in</button>
        {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
