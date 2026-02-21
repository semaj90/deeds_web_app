<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // RoleGuard component - Role-based access control - Svelte, 5 compatible
  import { authStore } from '$lib/stores.svelte';

    interface Props {
    children?: import('svelte').Snippet;
	roles: string | string[];
    fallback?: import('svelte').Snippet;
    requireAll?: boolean; // For multiple roles, require all or just one
  }
  let { children, roles, fallback, requireAll = false }: Props = $props();
  let allowedRoles = $derived(Array.isArray(roles) ? roles : [roles]);
  let hasAccess = $derived.by(() => {
    if (!authStore.isAuthenticated || !authStore.session?.user) {
      return false;
    }
    const userRole = authStore.session.user.role;
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



