<script lang="ts">
  // Svelte 5 runes are auto-imported
  import { authStore } from '$lib/stores';

  interface Props {
    children?: import('svelte').Snippet;
	permissions: string | string[];
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

    // Check resource ownership if specified
    if (resourceOwner && authStore.user.id !== resourceOwner && authStore.user.role !== 'admin') {
      return false;
    }

    const perms = requiredPermissions();

    // Check case-specific permissions
    if (caseId) {
      if (requireAll) {
        return perms.every(permission => {
          if (permission === 'read') return authStore.canAccessCase?.(caseId) ?? false;
          if (permission === 'write') return authStore.canEditCase?.(caseId) ?? false;
          if (permission === 'delete') return authStore.canDeleteCase?.(caseId) ?? false;
          return authStore.hasPermission?.(permission) ?? false;
        });
      } else {
        return perms.some(permission => {
          if (permission === 'read') return authStore.canAccessCase?.(caseId) ?? false;
          if (permission === 'write') return authStore.canEditCase?.(caseId) ?? false;
          if (permission === 'delete') return authStore.canDeleteCase?.(caseId) ?? false;
          return authStore.hasPermission?.(permission) ?? false;
        });
      }
    }

    // Standard permission check
    if (requireAll) {
      return perms.every((permission) => authStore.hasPermission?.(permission) ?? false);
    } else {
      return perms.some((permission) => authStore.hasPermission?.(permission) ?? false);
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



