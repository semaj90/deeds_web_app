import { writable } from 'svelte/store';
import type { User } from '$lib/server/auth/lucia'; // Adjust import path as per your Lucia setup

export const user = writable<User | null>(null);
export const sessionLoading = writable(true);

export async function loadSession(): Promise<any> {
  try {
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      user.set(data.user || null);
    } else {
      user.set(null);
    }
  } catch (err) {
    user.set(null);
    console.error('Failed to load session: ', err);
  } finally {
    sessionLoading.set(false);
  }
}
