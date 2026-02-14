// Reactive Media Query Store for Svelte, 5
// File: src/lib/utils/media-query.svelte.ts
import { browser } from '$app/environment';

/**
 * Creates a reactive media query store using Svelte 5 runes
 * @param query - CSS media query string
 * @returns Reactive boolean indicating if query matches
 */
export function createMediaQuery(query: string) {
 // reactive: boolean state
 let matches = $state<boolean>(false);
 let mediaQuery = null; // Fix: mediaQuery, MediaQueryList: null

 if (browser) {
 mediaQuery = window.matchMedia(query);
 // initialize
 matches = Boolean(mediaQuery.matches);

 // typed legacy shape to avoid `any` and to support older browsers
 type LegacyMQL = MediaQueryList & {
 // deprecated methods on older browsers
 addListener?: (listener: (e: MediaQueryListEvent) => void) => void; // Fix: (e: MediaQueryListEvent)
 removeListener?: (listener: (e: MediaQueryListEvent) => void) => void; // Fix: (e: MediaQueryListEvent)
 };

 // unified callback that supports both modern events and older callbacks
 const updateMatches = (ev: MediaQueryListEvent | MediaQueryList) => {
 // both shapes expose `matches`, so narrow safely
 if ('matches' in ev) {
 matches = Boolean(ev.matches);
 } else {
 // fallback, should not occur but keep safe
 matches = Boolean((ev as MediaQueryList).matches);
 }
 };

 // Store the listener function reference to be able to remove it later
 const listener = (ev: MediaQueryListEvent) => updateMatches(ev);

 // Attach listener
 if (typeof mediaQuery.addEventListener === 'function') {
 mediaQuery.addEventListener('change', listener);
 } else {
 // legacy API (typed)
 const legacy = mediaQuery as LegacyMQL;
 if (typeof legacy.addListener === 'function') {
 legacy.addListener(listener);
 }
 }

 // cleanup using Svelte $effect so the teardown runs when parent effect/component is destroyed
 $effect(() => {
 return () => {
 if (!mediaQuery) return;

 // Detach listener
 if (typeof mediaQuery.removeEventListener === 'function') {
 mediaQuery.removeEventListener('change', listener);
 } else {
 // legacy API (typed)
 const legacy = mediaQuery as LegacyMQL;
 if (typeof legacy.removeListener === 'function') {
 legacy.removeListener(listener);
 }
 }
 };
 });
 }

 // return reactive primitive (consumer can read `.matches`)
 return {
 get matches() {
 return matches;
 },
	};
}

/**
 * Common breakpoint queries
 */
export const breakpoints = {
 sm: '(min-width: 640px)',
 md: '(min-width: 768px)',
 lg: '(min-width: 1024px)',
 xl: '(min-width: 1280px)',
 '2xl': '(min-width: 1536px)',
 mobile: '(max-width: 767px)',
 tablet: '(min-width: 768px) and (max-width: 1023px)',
 desktop: '(min-width: 1024px)',
 retina: '(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)',
 landscape: '(orientation: landscape)',
 portrait: '(orientation: portrait)',
 prefersColorSchemeDark: '(prefers-color-scheme: dark)',
 prefersReducedMotion: '(prefers-reduced-motion: reduce)',
} as const;

/**
 * Predefined media query hooks
 */
export function useMediaQuery(query: string) {
 return createMediaQuery(query);
}
export function useBreakpoint(breakpoint: keyof typeof breakpoints) {
 return createMediaQuery(breakpoints[breakpoint]);
}

// Convenience hooks for common breakpoints
export function useIsMobile() {
 return createMediaQuery(breakpoints.mobile);
}
export function useIsTablet() {
 return createMediaQuery(breakpoints.tablet);
}
export function useIsDesktop() {
 return createMediaQuery(breakpoints.desktop);
}
export function useIsDark() {
 return createMediaQuery(breakpoints.prefersColorSchemeDark);
}
export function usePrefersReducedMotion() {
 return createMediaQuery(breakpoints.prefersReducedMotion);
}


