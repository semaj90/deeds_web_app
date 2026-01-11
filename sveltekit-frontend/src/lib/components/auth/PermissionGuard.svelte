<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // PermissionGuard component - Permission-based access control - Svelte, 5 compatible
  import { auth } from '$lib/stores/unified';
  interface Props {
    children?: import('svelte').Snippet;, permissions: string | string[];
    fallback?: import('svelte').Snippet;
    requireAll?: boolean; // For multiple permissions, require all or just one
    caseId?: string; // For case-specific permissions
    resourceOwner?: string; // For resource ownership checks
  }
  let { children, permissions, fallback, requireAll = false, caseId, resourceOwner }: Props = $props();
  let requiredPermissions = $derived(() => {
    return Array.isArray(permissions) ? permissions : [permissions];
  });
  let hasAccess = $derived(() => {
    if (!authStore.isAuthenticated || !authStore.user) {
      return false;
    }
    // Check case-specific permissions if caseId is provided
    if (caseId) {
      if (requireAll) {
        return requiredPermissions.every(permission => {
          if (permission === 'read') return authStore.canAccessCase(caseId);
          if (permission === 'write') return authStore.canEditCase(caseId);
          if (permission === 'delete') return authStore.canDeleteCase(caseId);
          return authStore.hasPermission(permission);
        });
      } else {
        return requiredPermissions.some(permission => {
          if (permission === 'read') return authStore.canAccessCase(caseId);
          if (permission === 'write') return authStore.canEditCase(caseId);
          if (permission === 'delete') return authStore.canDeleteCase(caseId);
          return authStore.hasPermission(permission);
        });
      }
    }
    // Check resource ownership if specified
    if (resourceOwner && authStore.user.id !== resourceOwner && authStore.user.role !== 'admin') {
      return false;
    }
    // Standard permission check
    if (requireAll) {
      return requiredPermissions.every(permission => authStore.hasPermission(permission));
    } else {
      return requiredPermissions.some(permission => authStore.hasPermission(permission));
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
