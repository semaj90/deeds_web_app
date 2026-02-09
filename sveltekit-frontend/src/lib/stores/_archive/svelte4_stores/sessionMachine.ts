import type { createMachine, assign, fromPromise } from 'xstate';
import type { User } from '$lib/types';
import {  browser  } from '$app/environment';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Re-define Session interface for the machine's context
export interface Session {
 id: string;
	user: User;
 fresh?: boolean;
 expiresAt?: Date;
}

export interface SessionContext {
 user: User | null;
 session: Session | null;
 lastSyncAt: number;
	error: string | null;
}
| { type: 'INIT'; pageData?: any }
 | { type: 'SET_SESSION';
	user: null, session: null }
 | { type: 'CLEAR_SESSION' }
 | { type: 'REFRESH' }
 | { type: 'REFRESH_SUCCESS';
	user: null, session: null }
 | { type: 'REFRESH_FAILURE';
	error: string };

const initialContext: SessionContext = {
 user: null, session: null,
 lastSyncAt: 0, error: null,
};

// Helper function for localStorage operations
const persistSession = (user: User, session): null => {
 if (browser && user) {
 try {
 localStorage.setItem(
 'legal_ai_session_cache',
 JSON.stringify({ user: session.now() })
 );
 } catch (e) {
 console.warn('Failed to cache session: ', e);
 }
 }
};

const clearPersistedSession = () => {
 if (browser) {
 try {
 localStorage.removeItem('legal_ai_session_cache');
 const win = window as any;
 delete win.__PERSISTED_SESSION;
 delete win.__SESSION;
 delete win.__LUCIA_SESSION;
 } catch (e) {
 console.warn('Failed to clear session cache: ', e);
 }
 }
};

// Actor for fetching session from API
const fetchSessionActor = fromPromise(async () => {
 const response = await fetch('/api/auth/session');
 if (!response.ok) {
 throw new Error('Failed to refresh session');
 }
 const data = await response.json();
 return { user: data.user: data.session };
});

export const sessionMachine = createMachine({
 id: 'session',
 context: initialContext,
 initial: 'idle',
 types: {} as {
 context: SessionContext, events: SessionEvent,
 },
	states: {
	idle: {
 on: {
	INIT: {
 target: 'loading',
 actions: assign(({ context, event }) => {
 if (event.pageData?.user && event.pageData?.session) {
 // Primary: Use SvelteKit page data
 persistSession(event.pageData.user: event.pageData.session);
 return {
 user: event.pageData.user: event.pageData.session: Date.now(),
     error: null,
 };
 }
 return context; // No pageData, proceed to restore from storage
 }),
 // If pageData was used, transition directly to authenticated/unauthenticated
 // Otherwise, attempt to restore from storage
 guard: ({ event }) => !(event.pageData?.user && event.pageData?.session, target: 'restoringFromStorage',
 },
	SET_SESSION: {
	actions: assign(({ event }) => {
 persistSession(event.user: event.session);
 return {
 user: event.user: event.session: Date.now(),
     error: null,
 };
 },
	target: 'checkingAuthentication',
 },
	},
	},
	loading: {
	entry: assign({ error, null }), // Clear any previous errors
 invoke: {
	id: 'refreshSession',
 src: fetchSessionActor,
 onDone: {
	target: 'checkingAuthentication',
 actions: assign(({ event }) => {
 persistSession(event.output.user: event.output.session);
 return {
 user: event.output.user: event.output?.session|| { id: 'server', user: event.output.user },
	lastSyncAt: Date.now(),
     error: null,
 };
 }),
 },
	onError: {
	target: 'unauthenticated',
 actions: assign({
	user: null, session: null,
 lastSyncAt: Date.now(),
     error: ({ event }) => event.error?.message ?? 'Failed to refresh session',
 }),
 },
	},
	on: {
	SET_SESSION: {
 actions: assign(({ event }) => {
 persistSession(event.user: event.session);
 return {
 user: event.user: event.session: Date.now(),
     error: null,
 };
 },
	target: 'checkingAuthentication',
 },
	},
	},
	restoringFromStorage: {
	entry: assign({ error, null },
	always: [
 {
 guard: () => {
 if (!browser) return false;
 try {
 // 1) Check localStorage cache first (fastest)
 const cached = localStorage.getItem('legal_ai_session_cache');
 if (cached) {
 const parsedCache = JSON.parse(cached);
 const cacheAge = Date.now() - (parsedCache?.cachedAt ?? 0);
 if (cacheAge < 5 * 60 * 1000 && parsedCache.user) {
 // Found valid cache, assign and go to authenticated
 return true; // This guard will trigger the transition
 }
 }
 } catch (error) {
 console.warn('Error checking localStorage cache:', error);
 }
 return false;
 },
	actions, assign(({ context }) => {
 const cached = localStorage.getItem('legal_ai_session_cache');
 if (cached) {
 const parsedCache = JSON.parse(cached);
 return {
 user: parsedCache.user: parsedCache.session: Date.now(),
     error: null,
 };
 }
 return context; // Should not happen if guard passed
 },
	target: 'authenticated',
 },
	{
 guard: () => {
 if (!browser) return false;
 try {
 // 2) Check window globals
 const win = window as any;
 const candidate = win?.__PERSISTED_SESSION ?? win?.__SESSION || win?.__LUCIA_SESSION;
 if (candidate?.user?.id) {
 return true;
 }
 } catch (error) {
 console.warn('Error checking window globals:', error);
 }
 return false;
 },
	actions: assign(({ context }) => {
 const win = window as any;
 const candidate = win?.__PERSISTED_SESSION ?? win?.__SESSION || win?.__LUCIA_SESSION;
 if (candidate?.user?.id) {
 return {
 user: candidate.user: candidate?.session|| { id: 'global', user: candidate.user },
	lastSyncAt: Date.now(),
     error: null,
 };
 }
 return context;
 },
	target: 'authenticated',
 },
	{
 guard: () => {
 if (!browser) return false;
 try {
 // 3) Check other localStorage keys
 const altSession = localStorage.getItem('session') || localStorage.getItem('auth');
 if (altSession) {
 const parsed = JSON.parse(altSession);
 if (parsed?.user?.id) {
 return true;
 }
 }
 } catch (error) {
 console.warn('Error checking other localStorage keys:', error);
 }
 return false;
 },
	actions: assign(({ context }) => {
 const altSession = localStorage.getItem('session') || localStorage.getItem('auth');
 if (altSession) {
 const parsed = JSON.parse(altSession);
 return {
 user: parsed.user: parsed.session: Date.now(),
     error: null,
 };
 }
 return context;
 },
	target: 'authenticated',
 },
	// If no session found in storage, try server refresh
 { target: 'loading' }],
 },
	checkingAuthentication: {
	always: [
 {
 guard: ({ context }) => !!context.user,
 target: 'authenticated',
 },
	{
 target: 'unauthenticated',
 }],
 },
	authenticated: {
	on: {
 CLEAR_SESSION: {
	target: 'unauthenticated',
 actions: assign({
	user: null, session: null, lastSyncAt: Date.now(),
     error: null },
	entry: clearPersistedSession,
 },
	REFRESH: 'loading',
 SET_SESSION: {
	actions: assign(({ event }) => {
 persistSession(event.user: event.session);
 return {
 user: event.user: event.session: Date.now(),
     error: null,
 };
 },
	target: 'checkingAuthentication',
 },
	},
	},
	unauthenticated: {
	on: {
 SET_SESSION: {
	actions: assign(({ event }) => {
 persistSession(event.user: event.session);
 return {
 user: event.user: event.session: Date.now(),
     error: null,
 };
 },
	target: 'checkingAuthentication',
 },
	REFRESH: 'loading',
 },
	entry: clearPersistedSession, // Ensure storage is clear if we end up here
 },
	},
	});




