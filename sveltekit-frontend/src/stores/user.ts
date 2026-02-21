// Plain TypeScript user store — no svelte/store dependency
// Implements Svelte store contract (subscribe method) for $ prefix compatibility

interface User {
	id: string;
	email: string;
	firstName?: string;
	lastName?: string;
	role: string;
	permissions?: string[];
	avatarUrl?: string | null;
}

function createStore<T>(initial: T) {
	let value = initial;
	const subs = new Set<(v: T) => void>();
	return {
		get value() { return value; },
		set(v: T) { value = v; for (const fn of subs) fn(v); },
		subscribe(run: (v: T) => void) {
			run(value);
			subs.add(run);
			return () => { subs.delete(run); };
		}
	};
}

export const user = createStore<User | null>(null);
export const sessionLoading = createStore(true);

export async function loadSession(): Promise<void> {
	try {
		const res = await fetch('/api/auth/session');
		if (res.ok) {
			const data = await res.json();
			user.set(data?.user ?? null);
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
