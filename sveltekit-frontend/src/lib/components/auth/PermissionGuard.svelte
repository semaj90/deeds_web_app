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

  let requiredPermissions = $derived(Array.isArray(permissions) ? permissions : [permissions]);

  let hasAccess = $derived.by(() => {
    if (!authStore.isAuthenticated || !authStore.user) {
      return false;
    }

    // Check resource ownership if specified
    if (resourceOwner && authStore.user.id !== resourceOwner && (authStore.user as any).role !== 'admin') {
      return false;
    }

    const perms = requiredPermissions;

    // Check case-specific permissions
    if (caseId) {
      if (requireAll) {
        return perms.every((permission: string) => {
          if (permission === 'read') return (authStore as any).canAccessCase?.(caseId) ?? false;
          if (permission === 'write') return (authStore as any).canEditCase?.(caseId) ?? false;
          if (permission === 'delete') return (authStore as any).canDeleteCase?.(caseId) ?? false;
          return (authStore as any).hasPermission?.(permission) ?? false;
        });
      } else {
        return perms.some((permission: string) => {
          if (permission === 'read') return (authStore as any).canAccessCase?.(caseId) ?? false;
          if (permission === 'write') return (authStore as any).canEditCase?.(caseId) ?? false;
          if (permission === 'delete') return (authStore as any).canDeleteCase?.(caseId) ?? false;
          return (authStore as any).hasPermission?.(permission) ?? false;
        });
      }
    }

    // Standard permission check
    if (requireAll) {
      return perms.every((permission: string) => (authStore as any).hasPermission?.(permission) ?? false);
    } else {
      return perms.some((permission: string) => (authStore as any).hasPermission?.(permission) ?? false);
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



