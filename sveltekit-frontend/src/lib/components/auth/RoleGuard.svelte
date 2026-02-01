<script lang="ts">
  import type { User } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  // RoleGuard component - Role-based access control - Svelte, 5 compatible
  import { auth } from '$lib/stores/unified';
  interface Props {
    children?: import('svelte').Snippet;, roles: string | string[];
    fallback?: import('svelte').Snippet;
    requireAll?: boolean; // For multiple roles, require all or just one
  }
  let { children, roles, fallback, requireAll = false }: Props = $props();
  let allowedRoles = $derived(() => {
    return Array.isArray(roles) ? roles : [roles];
  });
  let hasAccess = $derived(() => {
    if (!authStore.isAuthenticated || !authStore.user) {
      return false;
    }
    const userRole = authStore.user.rol;
    // Admin always has access
    if (userRole === 'admin') {
      return true;
    }
    if (requireAll) {
      // User must have all specified roles (not typical for single role systems)
      return allowedRoles.every(role => userRole === role);
    } else {
      // User must have at least one of the specified roles
      return allowedRoles.includes(userRole);
    }
  });
</script>

{#if hasAccess}
  {#if children}
    {@render children()}
  {/if}
{:else if fallback}
  {@render fallback()}
{/if}



