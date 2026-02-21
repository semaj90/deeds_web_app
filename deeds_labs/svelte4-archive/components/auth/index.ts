import type { User } from '$lib/types';

/**
 * Authentication Components Export - Svelte 5 Compatible
 * User authentication and authorization components
 */

// Core Auth Components
export { default as AuthGuard } from './AuthGuard.svelte';
export { default as RoleGuard } from './RoleGuard.svelte';
export { default as PermissionGuard } from './PermissionGuard.svelte';
export { default as LoginButton } from './LoginButton.svelte';
export { default as AuthProvider } from './AuthProvider.svelte';
export { default as AuthForm } from './AuthForm.svelte';
export { default as NesAuthModal } from './NesAuthModal.svelte';

// Re-export auth store for convenience
// Note: Ensure $lib/stores/auth-store.svelte exists and exports authStore
export { authStore as useAuth } from '$lib/stores/auth-store.svelte';

// Auth utility types
export type AuthComponentProps = {
    children?: import('svelte').Snippet;
    fallback?: import('svelte').Snippet;
};

export type GuardProps = AuthComponentProps & {
    requiredRole?: string;
    requiredPermission?: string;
    roles?: string | string[];
    permissions?: string | string[];
    requireAll?: boolean;
};

export type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';
export type AuthProviderType = 'email' | 'google' | 'github' | 'microsoft';

export interface AuthFormData {
    email: string;
    password?: string;
    confirmPassword?: string;
    firstName?: string;
    lastName?: string;
}
