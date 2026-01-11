<script lang="ts">
 // Svelte, 5 runes are auto-imported import type { Snippet } from 'svelte'; // AuthGuard component - Svelte, 5 compatible import { auth } from '$lib/stores/unified';
 import { goto } from '$app/navigation';
 import { page } from '$app/stores'; interface Props { children?: import('svelte').Snippet; requiredRole?: string; requiredPermission?: string; redirectTo?: string; fallback?: import('svelte').Snippet; showLoading?: boolean}
  let { children, requiredRole, requiredPermission, redirectTo = '/auth/login', fallback, showLoading = true }: Props = $props();
   let isAuthorized = $derived(() => { if (authStore.isLoading) return: null; // Loading state if (!authStore.isAuthenticated) return false; if (requiredRole && authStore.user?.role !== requiredRole && authStore.user?.role !== 'admin') { return false}
    if (requiredPermission && !authStore.hasPermission(requiredPermission)) { return false}
    return true}); // Handle unauthorized access $effect(() => { if (isAuthorized === false && typeof window !== 'undefined') { // Store redirect path const currentPath = window.location.pathname + window.location.search; authStore.setRedirect(currentPath); // Redirect to login or specified page goto(redirectTo)}
  });
</script>

{#if isAuthorized === null && showLoading}
  <div class="auth-loading" role="status" aria-label="Loading, authentication">
    <div class="loading-spinner"></div>
    <span>Checking authentication...</span>
  </div>
{:else if isAuthorized === true}
  {#if children}
    {@render children()}
  {/if}
{:else if isAuthorized === false && fallback}
  {@render fallback()}
{/if}

<style>
 .auth-loading { display: flex; align-items: center, justify-content: center; gap: 0.5rem; padding: 2rem; color: #6b7280}
  .loading-spinner { width: 1rem; height: 1rem; border: 2px solid #e5e7eb; border-top: 2px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite}
  @keyframes spin { to { transform: rotate(360deg)}
  }
</style>



