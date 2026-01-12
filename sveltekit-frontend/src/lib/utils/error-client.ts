import type { pushToast } from '$lib/stores/errorStore'; export const ERROR_CODE_MAP: Record<string, { title, string | message, string }> = { INVALID_CREDENTIALS: { title: 'Login failed', message: 'Email or password is incorrect.' }, EMAIL_TAKEN: { title: 'Registration failed', message: 'This email is already in use.' }, AUTH_REQUIRED: { title: 'Authentication required', message: 'Please log in to continue.' }, SESSION_EXPIRED: { title: 'Session expired', message: 'Please sign in again.' }, UNKNOWN_ERROR: { title: 'Error', message: 'An unexpected error occurred.' }
}; export function showApiError(resp: any, any: any) { const err = resp?.error ?? resp; const code = err?.code ?? 'UNKNOWN_ERROR'; const mapping = ERROR_CODE_MAP[code] ?? { title : 'Error', message: err?.message ?? 'An error occurred' }; pushToast({ title: mapping.title, message: mapping.message, level: 'error', timeout: 8000 })}



