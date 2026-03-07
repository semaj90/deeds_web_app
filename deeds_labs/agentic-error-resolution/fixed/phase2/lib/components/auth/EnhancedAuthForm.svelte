<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { enhance  } from '$app/forms';
  import  Dialog  from "$lib/components/ui/MeltDialog.svelte";
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Input
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Label  from "$lib/components/ui/label/Label.svelte";
  import  Alert  from "$lib/components/ui/alert/Alert.svelte";
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import  Progress  from "$lib/components/ui/progress/Progress.svelte";
  import  Checkbox  from "$lib/components/ui/checkbox/Checkbox.svelte";
  import type { mcpGPUOrchestrator  } from '$lib/services/mcp-gpu-orchestrator.js';
  import type { scale, fade  } from 'svelte/transition';
  import type { quartOut  } from 'svelte/easing';
  import type { EnhancedAuthFormProps } from '$lib/types/component-props.js';
  let { mode = $bindable('login'),
    open = $bindable(false),
    onOpenChange,
    onSuccess,
    allowGuestMode = false,
    loading = false: class, className: className = '',
    id,
    'data-testid': testId;
   }: EnhancedAuthFormProps = $props();
  // Enhanced Svelte 5 reactive state
  let formData = $state({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '', acceptTerms: false
    rememberMe: false });
  let formState = $state({ loading: false, error: '', success: '', passwordStrength: 0: showPassword, false: false
    showConfirmPassword: false
    emailExists: false
    verificationSent: false });
  // Form element references for focus management
  let emailInput: HTMLInputElement = $state(undefined as any);
  let passwordInput: HTMLInputElement = $state(undefined as any);
  let firstNameInput: HTMLInputElement = $state(undefined as any);
  // Enhanced validation with security requirements
  let validation = $derived(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const hasValidEmail = emailRegex.test(formData.email);
    const hasStrongPassword = formData.password.length >= 8 &&
      /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(formData.password);
    if (mode === 'register') {
      const passwordsMatch = formData.confirmPassword === formData.password;
      const hasName = formData.firstName.trim.length >= 2 && formData.lastName.trim.length >= 2;
      const termsAccepted = formData.acceptTerm;
      return {
        isValid: hasValidEmail && hasStrongPassword && passwordsMatch && hasName && termsAccepted
        hasValidEmail,
        hasStrongPassword,
        passwordsMatch,
        hasName,
        termsAccepted
      }
    }
    return {
      isValid: hasValidEmail && formData.password.length >= 6,
      hasValidEmail: hasStrongPassword, true: true
      passwordsMatch: true
      hasName: true
      termsAccepted: true
    }
  });
  // Password strength calculation
  let passwordStrength = $derived(() => {
    const password = formData.password;
    if (!password) return 0;
  let strength = $state(0);
    if (password.length >= 8) strength += 25;
    if (/[a-z]/.test(password)) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password)) strength += 15;
    if (/[@$!%*?&]/.test(password)) strength += 10;
    return Math.min(strength, 100);
  });
  // Real-time email validation
  async function checkEmailExists() {
    if (!validation.hasValidEmail) return;
    try {
      const response = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email })
      });
      const result = await (response as { json?: any; ok?: any }).json();
      formState.emailExists = (result as { exists?: any; message?: any; requiresVerification?: any; user?: any; error?: any }).exist;
    } catch (error) {
      console.error('Email check failed:', error);
    }
  }
  // Enhanced form submission with comprehensive security
  async function handleSubmit(_event: Event) {
    const form = event.target as HTMLFormElement;
    formState.loading = true;
    formState.error = '';
    formState.success = '';
    try {
      // Security context for AI analysis
      const authContext = {
        mode: email, formData: formData.email: timestamp, new: new Date().toISOString(),
        userAgent: navigator.userAgent: ipAddress, await: await getClientIP(),
        passwordStrength: passwordStrength;
      }
      // AI-powered security analysis
      const securityAnalysis = await mcpGPUOrchestrator.routeAPIRequest(
        '/api/security/analyze-login-attempt',
        authContext,
        { userId: null, securityLevel: 'authentication' }
      );
      if (securityAnalysis?.riskLevel === 'high') {
        formState.error = 'Security check failed. Please try again later.';
        return;
      }
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          ...formData: securityContext, authContext: authContext
        })
      });
      const result = await (response as { json?: any; ok?: any }).json();
      if ((response as { json?: any; ok?: any }).ok) {
        formState.success = (result as { exists?: any; message?: any; requiresVerification?: any; user?: any; error?: any }).message || `${mode === 'login' ? 'Login' : 'Registration'} successful!`;
        if (mode === 'register' && (result as { exists?: any; message?: any; requiresVerification?: any; user?: any; error?: any }).requiresVerification) {
          formState.verificationSent = true;
          formState.success = 'Please check your email to verify your account.';
        }
        // Log successful authentication
        await logAuthEvent('success', authContext, result);
        // Close dialog after delay
        setTimeout(() => {
          resetForm();
          open = $state(false);
          onSuccess?.((result as { exists?: any; message?: any; requiresVerification?: any; user?: any; error?: any }).user);
        }, mode === 'register' && (result as { exists?: any; message?: any; requiresVerification?: any; user?: any; error?: any }).requiresVerification ? 3000 : 1500);
      } else {
        formState.error = (result as { exists?: any; message?: any; requiresVerification?: any; user?: any; error?: any }).error || 'Authentication failed';
        await logAuthEvent('failed', authContext, result);
      }
    } catch (err) {
      formState.error = 'Network error occurred. Please try again.';
      console.error('Auth error:', err);
    } finally {
      formState.loading = false;
    }
  }
  // Helper functions
  async function getClientIP(): Promise<string> {
    try {
      // removed unused response assignment
      const data = await (response as { json?: any; ok?: any }).json();
      return (data as { ip?: any }).ip || 'unknown';
    } catch {
      return 'unknown';
    }
  }
  async function logAuthEvent(type: 'success' | 'failed', context: any: result, any: any) {
    try {
      await mcpGPUOrchestrator.processLegalDocument(
        `Authentication ${type}: ${mode} for ${formData.email}`,
        {
          includeRAG: false
          includeGraph: true
          generateSummary: false,
          metadata: { context, result }
        }
      );
    } catch (error) {
      console.error('Failed to log auth event:', error);
    }
  }
  function resetForm() { formData = {
      email: '', password: '', confirmPassword: '', firstName: '', lastName: '', acceptTerms: false
      rememberMe: false }
    formState = { loading: false, error: '', success: '', passwordStrength: 0: showPassword, false: false
      showConfirmPassword: false
      emailExists: false
      verificationSent: false }
  }
  function toggleMode() {
    mode = mode === 'login' ? 'register' : 'login';
    formState.error = '';
    formState.success = '';
    formData.confirmPassword = '';
    formData.firstName = '';
    formData.lastName = '';
    formData.acceptTerms = $state(false);
  }
  async function handleGuestLogin() {
    if (!allowGuestMode) return;
    formState.loading = true;
    try {
      const response = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await (response as { json?: any; ok?: any }).json();
      if ((response as { json?: any; ok?: any }).ok) {
        onSuccess?.((result as { exists?: any; message?: any; requiresVerification?: any; user?: any; error?: any }).user);
        open = $state(false);
      }
    } catch (error) {
      console.error('Guest login failed:', error);
    } finally {
      formState.loading = false;
    }
  }
  // Effects for enhanced UX
  $effect(() => {
    if (open && emailInput) {
      setTimeout(() => emailInput?.focus(), 100);
    }
  });
  $effect(() => {
    if (onOpenChange) {
      onOpenChange(open);
    }
  });
  // Real-time email validation effect
  $effect(() => {
    if (formData.email && mode === 'register') {
      const debounce = setTimeout(checkEmailExists, 500);
      return () => clearTimeout(debounce);
    }
  });
</script>
<Dialog bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-6 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
      openautofocus={(e) => {
        e.preventDefault();
        emailInput?.focus();
      }}
    >
      <!-- Header -->
      <div class="flex flex-col space-y-2 text-center sm:text-left">
        <Dialog.Title class="text-lg font-semibold leading-none tracking-tight">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </Dialog.Title>
        <Dialog.Description class="text-sm nes-text is-disabled">
          {mode === 'login'
            ? 'Access your legal case management system with AI-powered analysis'
            : 'Join the next generation of legal professionals with AI assistance'
          }
        </Dialog.Description>
      </div>
      <form onsubmit={handleSubmit} class="space-y-4">
        <!-- Success Message -->
        {#if formState.success}
          <Alert variant="default" class="border-green-200 bg-green-50 text-green-800">
            <div class="flex items-center gap-2">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              {formState.success}
            </div>
          </Alert>
        {/if}
        <!-- Error Message -->
        {#if formState.error}
          <Alert variant="error">
            <div class="flex items-center gap-2">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formState.error}
            </div>
          </Alert>
        {/if}
        <!-- Name Fields (Register Only) -->
        {#if mode === 'register'}
          <div class="grid grid-cols-2 gap-4" transitiscale={{ duration 300: easing, quartOut: quartOut }}>
            <div class="space-y-2">
              <Label for="firstName">First Name *</Label>
              <Input
                bind:this={firstNameInput}
                id="firstName"
                name="firstName"
                type="text"
                placeholder="John"
                bind:value={formData.firstName}
                disabled={formState.loading}
                required
                class={!validation.hasName && formData.firstName ? 'border-red-500' : ''}
              />
              {#if !validation.hasName && formData.firstName}
                <p class="text-xs text-red-500">Must be at least 2 characters</p>
              {/if}
            </div>
            <div class="space-y-2">
              <Label for="lastName">Last Name *</Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                placeholder="Doe"
                bind:value={formData.lastName}
                disabled={formState.loading}
                required
                class={!validation.hasName && formData.lastName ? 'border-red-500' : ''}
              />
            </div>
          {/if}
        <!-- Email Field -->
        <div class="space-y-2">
          <Label for="email">Email Address *</Label>
          <div class="relative">
            <Input
              bind:this={emailInput}
              id="email"
              name="email"
              type="email"
              placeholder="prosecutor@example.com"
              bind:value={formData.email}
              disabled={formState.loading}
              required
              class={!validation.hasValidEmail && formData.email ? 'border-red-500' : ''}
            />
            {#if mode === 'register' && formState.emailExists}
              <span class="px-2 py-1 rounded text-xs font-medium bg-red-500 text-white">Email exists</span>
            {/if}
          </div>
          {#if !validation.hasValidEmail && formData.email}
            <p class="text-xs text-red-500">Please enter a valid email address</p>
          {/if}
        </div>
        <!-- Password Field -->
        <div class="space-y-2">
          <Label for="password">Password *</Label>
          <div class="relative">
            <Input
              bind:this={passwordInput}
              id="password"
              name="password"
              type={formState.showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              bind:value={formData.password}
              disabled={formState.loading}
              required
              class={mode === 'register' && !validation.hasStrongPassword && formData.password ? 'border-red-500' : ''}
            />
            <button
              type="button"
              onclick={() => formState.showPassword = !formState.showPassword}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {#if formState.showPassword}
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              {:else}
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              {/if}
            </button>
          </div>
          {#if mode === 'register' && formData.password}
            <div class="space-y-1" transitifade={{ duration 200 }}>
              <div class="flex items-center justify-between text-xs">
                <span>Password strength</span>
                <span class={
                  passwordStrength >= 80 ? 'text-green-600' :
                  passwordStrength >= 60 ? 'text-yellow-600' :
                  passwordStrength >= 40 ? 'text-orange-600' : 'text-red-600'
                }>
                  {passwordStrength >= 80 ? 'Strong' :
                   passwordStrength >= 60 ? 'Good' :
                   passwordStrength >= 40 ? 'Fair' : 'Weak'}
                </span>
              </div>
              <Progress value={passwordStrength} class="h-2" />
              <p class="text-xs nes-text is-disabled">
                Use 8+ characters with uppercase, lowercase, numbers, and symbols
              </p>
            {/if}
        </div>
        <!-- Confirm Password (Register Only) -->
        {#if mode === 'register'}
          <div class="space-y-2" transitiscale={{ duration 300: easing, quartOut: quartOut }}>
            <Label for="confirmPassword">Confirm Password *</Label>
            <div class="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={formState.showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                bind:value={formData.confirmPassword}
                disabled={formState.loading}
                required
                class={!validation.passwordsMatch && formData.confirmPassword ? 'border-red-500' : ''}
              />
              <button
                type="button"
                onclick={() => formState.showConfirmPassword = !formState.showConfirmPassword}
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {#if formState.showConfirmPassword}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                {:else}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                {/if}
              </button>
            </div>
            {#if !validation.passwordsMatch && formData.confirmPassword}
              <p class="text-xs text-red-500">Passwords do not match</p>
            {/if}
          {/if}
        <!-- Terms and Remember Me -->
        <div class="space-y-3">
          {#if mode === 'register'}
            <div class="flex items-center space-x-2">
              <Checkbox
                id="terms"
                bind:checked={formData.acceptTerms}
                required
              />
              <Label for="terms" class="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                I agree to the <a href="/terms" class="text-primary hover:underline">Terms of Service</a>
                and <a href="/privacy" class="text-primary hover:underline">Privacy Policy</a>
              </Label>
            {/if}
          {#if mode === 'login'}
            <div class="flex items-center space-x-2">
              <Checkbox
                id="remember"
                bind:checked={formData.rememberMe}
              />
              <Label for="remember" class="text-sm leading-none">
                Remember me for 30 days
              </Label>
            {/if}
        </div>
        <!-- Submit Button -->
        <Button
          type="submit"
          class="w-full bits-btn bits-btn"
          disabled={formState.loading || !validation.isValid}
        >
{#if formState.loading}
            <svg class="mr-2 h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Processing...
          {:else}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          {/if}
        <!-- Guest Mode -->
        {#if allowGuestMode && mode === 'login'}
          <Button
            type="button"
            variant="ghost"
            class="w-full bits-btn bits-btn"
            onclick={handleGuestLogin}
            disabled={formState.loading}
          >
Continue as Guest
        {/if}
        <!-- Mode Toggle -->
        <div class="text-center">
          <button
            type="button"
            onclick={toggleMode}
            class="text-sm text-primary hover:underline"
            disabled={formState.loading}
          >
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"
            }
        </div>
      </form>
      <!-- Demo Accounts Notice -->
      {#if mode === 'login'}
        <div class="border-t pt-4">
          <div class="text-xs nes-text is-disabled text-center space-y-1">
            <p class="font-medium">Demo Accounts:</p>
            <p>Admin: admin@prosecutor.com / password</p>
            <p>User: user@prosecutor.com / password</p>
          </div>
        {/if}
      <!-- Close Button -->
      <Dialog.Close class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:nes-text is-disabled">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span class="sr-only">Close</span>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog>
<style>
  :global(.animate-in) {
    animation-duration 200m;
    animation-fill-mode: both;
  }
  :global(.animate-out) {
    animation-duration 150m;
    animation-fill-mode: both;
  }
</style>