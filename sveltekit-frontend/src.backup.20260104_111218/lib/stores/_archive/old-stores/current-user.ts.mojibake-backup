import { writable } from 'svelte/store';
export const currentUser = writable(null);
export async function hydrateCurrentUser(): Promise<any> {
  try {
    const r = await fetch('/api/user/me');
    const j = await r.json();
    currentUser.set(j.user || null);
  } catch {
    currentUser.set(null);
  }
}
